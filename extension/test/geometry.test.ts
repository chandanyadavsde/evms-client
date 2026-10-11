import { describe, expect, it } from 'vitest';
import { boxFrom, centreInside, cropInImage, toLines } from '../src/lib/geometry';

describe('snip geometry', () => {
  it('scales the dragged box to device pixels and clamps it to the image', () => {
    const c = cropInImage(
      { x: 100, y: 50, width: 200, height: 100 },
      { width: 1000, height: 500 },
      { width: 2000, height: 1000 }, // 2x screen
    );
    expect(c).toEqual({ sx: 200, sy: 100, sw: 400, sh: 200 });
    const edge = cropInImage(
      { x: 900, y: 450, width: 300, height: 300 },
      { width: 1000, height: 500 },
      { width: 1000, height: 500 },
    );
    expect(edge).toEqual({ sx: 900, sy: 450, sw: 100, sh: 50 });
  });

  it('accepts a box dragged in any direction', () => {
    expect(boxFrom({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 60,
    });
  });

  it('keeps text whose centre is inside the box', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(centreInside({ x: 80, y: 10, width: 30, height: 10 }, box)).toBe(true);
    expect(centreInside({ x: 90, y: 10, width: 30, height: 10 }, box)).toBe(false);
  });

  it('puts table cells back into rows in reading order', () => {
    // A pendency box: labels and values in separate cells, found out of order.
    const text = toLines([
      { text: '0', x: 300, y: 40, height: 16 },
      { text: 'Total Allocated Moves:', x: 10, y: 41, height: 16 },
      { text: '1', x: 200, y: 40, height: 16 },
      { text: '20', x: 200, y: 10, height: 16 },
      { text: 'Scan', x: 10, y: 10, height: 16 },
      { text: 'Balance:', x: 10, y: 70, height: 16 },
      { text: '  0  ', x: 200, y: 70, height: 16 },
    ]);
    expect(text).toBe('Scan | 20\nTotal Allocated Moves: | 1 | 0\nBalance: | 0');
  });
});
