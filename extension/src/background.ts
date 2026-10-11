import {
  ApiError,
  type FormField,
  formFilled,
  mapForm,
  type PasteSource,
  readIntake,
  uploadImage,
} from './lib/api';
import { type Box, cropInImage } from './lib/geometry';
import { getSettings, putSnip, type Snip, updateSnip } from './lib/store';

/**
 * Background worker: starts a snip in the active tab, takes the screenshot when the box is drawn,
 * crops it, and sends image + page text to VMS smart intake. The result lands in the plugin
 * clipboard (chrome.storage), which the side panel shows.
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

/** Pages Chrome does not let extensions touch. */
const blocked = (url = '') =>
  !/^https?:|^file:/.test(url) || /^https:\/\/chromewebstore\.google\.com/.test(url);

async function setStatus(status: string | null) {
  await chrome.storage.session.set({ 'vms.status': status });
}

async function startSnip(tab?: chrome.tabs.Tab) {
  const target = tab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!target?.id || blocked(target.url)) {
    await setStatus('This page cannot be copied (Chrome pages and the Web Store are protected).');
    return;
  }
  if (!(await getSettings()).token) {
    await setStatus('Sign in to VMS in the side panel first.');
    return;
  }
  await setStatus('selecting');
  try {
    await chrome.scripting.executeScript({ target: { tabId: target.id }, files: ['content.js'] });
  } catch (err) {
    await setStatus(`Cannot copy on this page: ${(err as Error).message}`);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'snip') void startSnip(tab);
  if (command === 'paste') void startPaste(tab);
});

// ─── Smart paste ───────────────────────────────────────────────────────────

/** The job (or snip) chosen in the side panel to fill forms from. */
async function pasteSource(): Promise<PasteSource | null> {
  const s = await chrome.storage.session.get('vms.pasteSource');
  return (s['vms.pasteSource'] as PasteSource | undefined) ?? null;
}

async function startPaste(tab?: chrome.tabs.Tab) {
  const target = tab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!target?.id || blocked(target.url)) {
    await setStatus('This page cannot be filled (Chrome pages and the Web Store are protected).');
    return;
  }
  if (!(await getSettings()).token) {
    await setStatus('Sign in to VMS in the side panel first.');
    return;
  }
  if (!(await pasteSource())) {
    await setStatus('Choose a job to fill from in the side panel first.');
    return;
  }
  await setStatus('selecting');
  try {
    await chrome.scripting.executeScript({ target: { tabId: target.id }, files: ['paste.js'] });
  } catch (err) {
    await setStatus(`Cannot fill on this page: ${(err as Error).message}`);
  }
}

async function onPasteFields(tabId: number, url: string, fields: FormField[]) {
  await setStatus('reading');
  const source = await pasteSource();
  try {
    if (!source) throw new Error('No job chosen');
    const res = await mapForm(url, fields, source.data);
    await chrome.tabs.sendMessage(tabId, {
      type: 'vms:paste-values',
      ...res,
      sourceLabel: source.label,
    });
  } catch (err) {
    await chrome.tabs.sendMessage(tabId, {
      type: 'vms:paste-error',
      error: err instanceof Error ? err.message : 'Could not match the form',
    });
  } finally {
    await setStatus(null);
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Visible tab → cropped PNG of the dragged box. */
async function capture(
  windowId: number,
  box: Box,
  viewport: { width: number; height: number },
): Promise<Blob> {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  const c = cropInImage(box, viewport, { width: bitmap.width, height: bitmap.height });
  const canvas = new OffscreenCanvas(c.sw, c.sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

interface Snipped {
  type: 'vms:snipped';
  box: Box;
  viewport: { width: number; height: number };
  text: string;
  url: string;
  title: string;
}

async function onSnipped(msg: Snipped, windowId: number) {
  await setStatus('reading');
  const png = await capture(windowId, msg.box, msg.viewport);
  const snip: Snip = {
    id: crypto.randomUUID(),
    at: Date.now(),
    url: msg.url,
    title: msg.title,
    text: msg.text,
    image: `data:image/png;base64,${toBase64(await png.arrayBuffer())}`,
    status: 'reading',
  };
  await putSnip(snip);
  try {
    const fileKey = await uploadImage(png);
    const res = await readIntake({
      text: msg.text ? `Text on the page inside the copied area:\n${msg.text}` : '',
      fileKeys: [fileKey],
      source: { kind: 'plugin', url: msg.url, title: msg.title },
    });
    await updateSnip(snip.id, {
      status: 'done',
      intakeId: res.id,
      provider: res.provider,
      draft: res.draft,
    });
  } catch (err) {
    await updateSnip(snip.id, {
      status: 'failed',
      error: err instanceof ApiError || err instanceof Error ? err.message : 'Could not read',
    });
  } finally {
    await setStatus(null);
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'vms:start-snip') void startSnip();
  if (msg?.type === 'vms:snip-cancelled') void setStatus(null);
  if (msg?.type === 'vms:snipped' && sender.tab?.windowId !== undefined) {
    void onSnipped(msg as Snipped, sender.tab.windowId).catch(async (err) => {
      await setStatus(`Could not copy: ${(err as Error).message}`);
    });
  }
  if (msg?.type === 'vms:start-paste') void startPaste();
  if (msg?.type === 'vms:paste-cancelled') void setStatus(null);
  if (msg?.type === 'vms:paste-fields' && sender.tab?.id !== undefined) {
    void onPasteFields(sender.tab.id, msg.url, msg.fields);
  }
  if (msg?.type === 'vms:pasted') {
    // The manager pressed Fill: VMS remembers this page so the next fill needs no AI.
    void pasteSource().then((source) =>
      formFilled({
        url: msg.url,
        title: msg.title,
        fields: msg.fields,
        ...(source?.legId ? { legId: source.legId } : {}),
      }).catch(() => {}),
    );
  }
});
