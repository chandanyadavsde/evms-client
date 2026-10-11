import { type Box, centreInside, type TextPiece, toLines } from './lib/geometry';
import { dragBox, visible } from './lib/overlay';

/**
 * Smart copy, injected when the manager starts a snip: they drag a box, then the page's own text
 * inside it is read (exact — no OCR) and the box goes to the background worker, which takes the
 * screenshot. Passwords are never read.
 */

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg']);

/** Text nodes and form values whose centre is inside the box, in reading order. */
export function textInside(box: Box, root: Element = document.body): string {
  const pieces: TextPiece[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || !node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
    if (centreInside(rect, box) && node.parentElement && visible(node.parentElement)) {
      pieces.push({ text: node.textContent ?? '', x: rect.x, y: rect.y, height: rect.height });
    }
  }
  // Values typed or shown in form fields are not text nodes (portals show data in read-only inputs).
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (el instanceof HTMLInputElement && ['password', 'hidden', 'file'].includes(el.type))
      continue;
    const r = el.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
    if (!r.width || !centreInside(rect, box) || !visible(el)) continue;
    let value = '';
    if (el instanceof HTMLSelectElement) value = el.selectedOptions[0]?.text ?? '';
    else if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      value = el.checked ? `[x] ${el.labels?.[0]?.textContent ?? el.value}` : '';
    } else value = (el as HTMLInputElement | HTMLTextAreaElement).value;
    if (value.trim()) pieces.push({ text: value, x: rect.x, y: rect.y, height: rect.height });
  }
  return toLines(pieces);
}

void dragBox('VMS: drag around what you want to copy · Esc to cancel').then((box) => {
  if (!box) {
    chrome.runtime.sendMessage({ type: 'vms:snip-cancelled' });
    return;
  }
  const text = textInside(box);
  // Wait two frames so the overlay is gone from the screenshot.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      chrome.runtime.sendMessage({
        type: 'vms:snipped',
        box,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        text,
        url: location.href,
        title: document.title,
      }),
    ),
  );
});
