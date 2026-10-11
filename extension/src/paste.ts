import { centreInside } from './lib/geometry';
import { dragBox, visible } from './lib/overlay';

/**
 * Smart paste, injected when the manager starts a fill: they drag a box over a form, the fields
 * inside it are listed (with their labels) for VMS to match against a job, a preview appears next
 * to each field, and only "Fill" writes them. Submit buttons are never pressed; passwords, files
 * and read-only fields are never touched.
 */

declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: chrome message payloads are untyped
    __vmsPasteHandler?: (msg: any) => void;
  }
}

type Kind = 'text' | 'number' | 'select' | 'date' | 'textarea' | 'radio' | 'checkbox';
interface Found {
  key: string;
  label: string;
  kind: Kind;
  options?: string[];
  maxLength?: number;
  els: HTMLElement[];
}
interface FillValue {
  key: string;
  dataKey: string;
  value: string;
  status: 'fill' | 'unknown';
  note?: string;
}

const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[*:]+\s*$/, '')
    .trim();

/** The text a person would read as this field's label. */
export function labelOf(el: HTMLElement): string {
  const input = el as HTMLInputElement;
  const fromLabel = input.labels?.[0]?.textContent;
  if (clean(fromLabel)) return clean(fromLabel);
  const aria = el.getAttribute('aria-label');
  if (clean(aria)) return clean(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (clean(t)) return clean(t);
  }
  // Table layouts (most portals): the label is in an earlier cell of the same row.
  const cell = el.closest('td, th');
  if (cell) {
    let prev = cell.previousElementSibling;
    while (prev) {
      const t = clean(prev.textContent);
      if (t) return t.slice(0, 80);
      prev = prev.previousElementSibling;
    }
  }
  // Otherwise: the nearest text just before the field.
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    let prev = node.previousElementSibling;
    while (prev) {
      const t = clean(prev.textContent);
      if (t && !prev.querySelector('input, select, textarea')) return t.slice(0, 80);
      prev = prev.previousElementSibling;
    }
  }
  return clean(input.placeholder) || clean(input.name) || clean(el.id) || 'Field';
}

const SKIP_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image']);

/** Fillable fields whose centre is inside the box; radios of one group become one field. */
export function fieldsInside(box: { x: number; y: number; width: number; height: number }) {
  const out: Found[] = [];
  const seen = new Map<string, Found>();
  const all = document.querySelectorAll<HTMLElement>('input, select, textarea');
  all.forEach((el, i) => {
    const input = el as HTMLInputElement;
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(input.type)) return;
    if (input.disabled || input.readOnly) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !visible(el)) return;
    if (!centreInside({ x: r.left, y: r.top, width: r.width, height: r.height }, box)) return;

    if (el instanceof HTMLInputElement && input.type === 'radio') {
      const key = `radio:${input.name || i}`;
      const label = clean(input.labels?.[0]?.textContent) || input.value;
      const group = seen.get(key);
      if (group) {
        group.options?.push(label);
        group.els.push(el);
      } else {
        const f: Found = {
          key,
          label: labelOf(el.closest('td, div, span') as HTMLElement) || 'Choice',
          kind: 'radio',
          options: [label],
          els: [el],
        };
        seen.set(key, f);
        out.push(f);
      }
      return;
    }
    const label = labelOf(el);
    const kind: Kind =
      el instanceof HTMLSelectElement
        ? 'select'
        : el instanceof HTMLTextAreaElement
          ? 'textarea'
          : input.type === 'number'
            ? 'number'
            : input.type === 'date'
              ? 'date'
              : input.type === 'checkbox'
                ? 'checkbox'
                : 'text';
    out.push({
      key: input.name || el.id || `${label}#${i}`,
      label,
      kind,
      ...(el instanceof HTMLSelectElement
        ? { options: [...el.options].map((o) => o.text.trim()).filter(Boolean) }
        : {}),
      ...(input.maxLength > 0 ? { maxLength: input.maxLength } : {}),
      els: [el],
    });
  });
  return out;
}

/** Sets a value the way typing would, so the page's own scripts notice it. */
function setValue(f: Found, value: string): string | null {
  const el = f.els[0];
  if (!el) return null;
  if (f.kind === 'radio') {
    const idx = (f.options ?? []).indexOf(value);
    const radio = f.els[idx] as HTMLInputElement | undefined;
    if (!radio) return null;
    radio.click();
    return null;
  }
  if (el instanceof HTMLSelectElement) {
    const opt = [...el.options].find((o) => o.text.trim() === value);
    if (!opt) return null;
    el.value = opt.value;
    // An ASP.NET auto-postback dropdown would reload the page mid-fill: set it without the event.
    if (/__doPostBack/.test(el.getAttribute('onchange') ?? '')) {
      return 'Dropdown set without reloading the page';
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return null;
  }
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return null;
}

// ─── Preview on the page ───────────────────────────────────────────────────

const marks: HTMLElement[] = [];
/** Undo steps for the preview (outlines, placeholders) — the page is left as it was on Cancel. */
const restores: (() => void)[] = [];
function clearMarks() {
  for (const m of marks.splice(0)) m.remove();
  for (const r of restores.splice(0)) r();
}

/**
 * Preview one field without changing it: the value shows as hint text inside an empty box (dashed
 * green); dropdowns and radios get a small tag; fields VMS cannot fill get a dashed orange border.
 */
function hint(f: Found, value: string | null) {
  for (const el of f.els) {
    const outline = el.style.outline;
    el.style.outline = `2px dashed ${value ? '#1b6b4a' : '#ef6b1f'}`;
    restores.push(() => {
      el.style.outline = outline;
    });
  }
  const el = f.els[0];
  if (!el || !value) return;
  const typed =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !['radio', 'checkbox'].includes(el.type));
  if (typed && !(el as HTMLInputElement).value) {
    const input = el as HTMLInputElement;
    const placeholder = input.placeholder;
    input.placeholder = `→ ${value}`;
    restores.push(() => {
      input.placeholder = placeholder;
    });
  } else {
    badge(el, `→ ${value}`, true);
  }
}

function badge(el: HTMLElement, text: string, ok: boolean) {
  const r = el.getBoundingClientRect();
  const b = document.createElement('div');
  b.setAttribute('data-vms-mark', '');
  b.textContent = text;
  Object.assign(b.style, {
    position: 'absolute',
    left: `${r.right + window.scrollX + 6}px`,
    top: `${r.top + window.scrollY + r.height / 2 - 10}px`,
    zIndex: '2147483646',
    background: ok ? '#1b6b4a' : '#9a6412',
    color: '#fff',
    font: '600 11px system-ui, sans-serif',
    padding: '3px 7px',
    borderRadius: '6px',
    maxWidth: '220px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
  });
  document.body.append(b);
  marks.push(b);
}

function bar(html: string, buttons: [string, () => void, boolean?][]) {
  const el = document.createElement('div');
  el.setAttribute('data-vms-mark', '');
  Object.assign(el.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    background: '#1f2a24',
    color: '#fff',
    font: '13px system-ui, sans-serif',
    padding: '12px 14px',
    borderRadius: '12px',
    maxWidth: '360px',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
  });
  const text = document.createElement('div');
  text.innerHTML = html;
  el.append(text);
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '10px' });
  for (const [label, onClick, primary] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      border: '0',
      borderRadius: '8px',
      padding: '7px 12px',
      font: '600 13px system-ui, sans-serif',
      cursor: 'pointer',
      background: primary ? '#ef6b1f' : '#fff',
      color: primary ? '#fff' : '#1f2a24',
    });
    b.addEventListener('click', onClick);
    row.append(b);
  }
  if (buttons.length) el.append(row);
  document.body.append(el);
  marks.push(el);
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

let current: Found[] = [];

function preview(msg: { values: FillValue[]; by: string; learned: boolean; sourceLabel: string }) {
  clearMarks();
  const byKey = new Map(msg.values.map((v) => [v.key, v]));
  let ready = 0;
  for (const f of current) {
    const v = byKey.get(f.key);
    const el = f.els[0];
    if (!el) continue;
    if (v?.status === 'fill') {
      ready++;
      hint(f, v.value);
    } else hint(f, null);
  }
  const unknown = current.length - ready;
  bar(
    `<b>VMS: ${ready} of ${current.length} fields ready</b><br>` +
      `<span style="opacity:.8">${esc(msg.sourceLabel)} · ${msg.learned ? 'learned page, no AI' : esc(msg.by)}</span>` +
      `<br><span style="color:#9fd3b9">Green dashed</span> = VMS fills it` +
      (unknown
        ? ` · <span style="color:#f3b48d">orange dashed = ${unknown} field(s) for you</span>`
        : ''),
    [
      [
        'Fill',
        () => {
          clearMarks();
          const notes: string[] = [];
          for (const f of current) {
            const v = byKey.get(f.key);
            if (v?.status !== 'fill') continue;
            const note = setValue(f, v.value);
            if (note) notes.push(`${f.label}: ${note}`);
            for (const el of f.els) el.style.outline = '2px solid #1b6b4a';
          }
          chrome.runtime.sendMessage({
            type: 'vms:pasted',
            url: location.href,
            title: document.title,
            fields: current.map((f) => ({
              key: f.key,
              label: f.label,
              dataKey: byKey.get(f.key)?.dataKey ?? '',
            })),
          });
          bar(
            `<b>Filled ${ready} field(s).</b><br>Check them, fill the rest, then press the portal's own button.` +
              (notes.length ? `<br><span style="opacity:.8">${esc(notes.join('; '))}</span>` : ''),
            [['OK', clearMarks]],
          );
        },
        true,
      ],
      ['Cancel', clearMarks],
    ],
  );
}

// Each fill injects this script again: replace the previous run's listener so answers reach
// this run's fields.
if (window.__vmsPasteHandler) chrome.runtime.onMessage.removeListener(window.__vmsPasteHandler);
window.__vmsPasteHandler = (msg) => {
  if (msg?.type === 'vms:paste-values') preview(msg);
  if (msg?.type === 'vms:paste-error') {
    clearMarks();
    bar(`<b>VMS could not fill this form</b><br>${esc(String(msg.error))}`, [['OK', clearMarks]]);
  }
};
chrome.runtime.onMessage.addListener(window.__vmsPasteHandler);

clearMarks();
void dragBox('VMS: drag around the form to fill · Esc to cancel').then((box) => {
  if (!box) {
    chrome.runtime.sendMessage({ type: 'vms:paste-cancelled' });
    return;
  }
  current = fieldsInside(box);
  if (!current.length) {
    bar('<b>No fillable fields in that area.</b><br>Drag around the input boxes of the form.', [
      ['OK', clearMarks],
    ]);
    chrome.runtime.sendMessage({ type: 'vms:paste-cancelled' });
    return;
  }
  chrome.runtime.sendMessage({
    type: 'vms:paste-fields',
    url: location.href,
    fields: current.map(({ els: _els, ...f }) => f),
  });
  bar(`<b>VMS: matching ${current.length} fields…</b>`, []);
});
