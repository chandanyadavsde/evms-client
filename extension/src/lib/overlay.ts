import { type Box, boxFrom } from './geometry';

/**
 * Crosshair overlay used by both copy and paste: the manager drags a box, Esc cancels.
 * Resolves with the box (viewport CSS pixels) or null; the overlay is gone when it resolves.
 */

declare global {
  interface Window {
    __vmsOverlayActive?: boolean;
  }
}

export function visible(el: Element): boolean {
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
}

export function dragBox(hintText: string): Promise<Box | null> {
  return new Promise((resolve) => {
    if (window.__vmsOverlayActive) {
      resolve(null);
      return;
    }
    window.__vmsOverlayActive = true;

    const overlay = document.createElement('div');
    overlay.setAttribute('data-vms-snip', '');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: 'rgba(15, 30, 24, 0.25)',
    });
    const hint = document.createElement('div');
    hint.textContent = hintText;
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1f2a24',
      color: '#fff',
      font: '600 13px system-ui, sans-serif',
      padding: '8px 14px',
      borderRadius: '999px',
      pointerEvents: 'none',
    });
    const frame = document.createElement('div');
    Object.assign(frame.style, {
      position: 'fixed',
      border: '2px solid #ef6b1f',
      background: 'rgba(239, 107, 31, 0.08)',
      display: 'none',
      pointerEvents: 'none',
    });
    overlay.append(hint, frame);
    document.documentElement.append(overlay);

    let start: { x: number; y: number } | null = null;
    const finish = (box: Box | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      window.__vmsOverlayActive = false;
      resolve(box);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      }
    };
    window.addEventListener('keydown', onKey, true);

    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      hint.style.display = 'none';
    });
    overlay.addEventListener('mousemove', (e) => {
      if (!start) return;
      const b = boxFrom(start, { x: e.clientX, y: e.clientY });
      Object.assign(frame.style, {
        display: 'block',
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
      });
    });
    overlay.addEventListener('mouseup', (e) => {
      if (!start) return;
      const b = boxFrom(start, { x: e.clientX, y: e.clientY });
      start = null;
      // A click without a drag is not a selection.
      finish(b.width < 8 || b.height < 8 ? null : b);
    });
  });
}
