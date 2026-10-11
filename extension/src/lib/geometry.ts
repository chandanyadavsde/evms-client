/** Pure helpers for the snip: cropping maths and putting page text back in reading order. */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The dragged box is in CSS pixels of the viewport; the captured image is in device pixels.
 * Returns the crop in image pixels, clamped to the image.
 */
export function cropInImage(
  box: Box,
  viewport: { width: number; height: number },
  image: { width: number; height: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = image.width / viewport.width;
  const sy = image.height / viewport.height;
  const left = Math.max(0, Math.floor(box.x * sx));
  const top = Math.max(0, Math.floor(box.y * sy));
  const right = Math.min(image.width, Math.ceil((box.x + box.width) * sx));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.height) * sy));
  return { sx: left, sy: top, sw: Math.max(1, right - left), sh: Math.max(1, bottom - top) };
}

/** True when the centre of `inner` lies inside `outer`. */
export function centreInside(inner: Box, outer: Box): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
  );
}

export interface TextPiece {
  text: string;
  x: number;
  y: number;
  height: number;
}

/**
 * Pieces of text found on the page → lines in reading order: pieces whose vertical centres are
 * close share a line (sorted left to right, joined with " | " so table cells stay apart).
 */
export function toLines(pieces: TextPiece[], maxChars = 6000): string {
  const items = pieces
    .map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ').trim(), cy: p.y + p.height / 2 }))
    .filter((p) => p.text)
    .sort((a, b) => a.cy - b.cy || a.x - b.x);
  const lines: (typeof items)[] = [];
  for (const it of items) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    if (
      line &&
      ref &&
      Math.abs(it.cy - ref.cy) <= Math.max(4, Math.min(it.height, ref.height) / 2)
    ) {
      line.push(it);
    } else {
      lines.push([it]);
    }
  }
  const out = lines
    .map((l) =>
      l
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(' | '),
    )
    .join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

/** Normalises a dragged rectangle (any drag direction) to a positive box. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
