import { describe, it, expect } from 'vitest';
import { TAU, fraction, barSlots, radarPoint, radarPolygon, donutArcs, arcPath } from '../stats/geometry';

describe('fraction', () => {
  it('is done/total, clamped to 0..1, and 0 when total is 0', () => {
    expect(fraction(1, 4)).toBe(0.25);
    expect(fraction(5, 4)).toBe(1);
    expect(fraction(3, 0)).toBe(0);
  });
});

describe('barSlots', () => {
  it('lays out groups side by side with equal bars, all inside the width', () => {
    const s = barSlots(2, 3, 200);
    expect(s).toHaveLength(2);
    expect(s[0]).toHaveLength(3);
    const all = s.flat();
    expect(new Set(all.map((b) => b.w.toFixed(6))).size).toBe(1);
    for (const b of all) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(200); }
    expect(s[1][0].x).toBeGreaterThan(s[0][2].x);
  });
  it('returns nothing for empty input', () => {
    expect(barSlots(0, 3, 200)).toEqual([]);
    expect(barSlots(2, 0, 200)).toEqual([]);
  });
});

describe('radar', () => {
  it('the first axis points straight up, then goes clockwise', () => {
    const [x0, y0] = radarPoint(0, 4, 10, 50, 50);
    expect(x0).toBeCloseTo(50); expect(y0).toBeCloseTo(40);
    const [x1, y1] = radarPoint(1, 4, 10, 50, 50);
    expect(x1).toBeCloseTo(60); expect(y1).toBeCloseTo(50);
  });
  it('a polygon has one clamped point per value', () => {
    expect(radarPolygon([1, 0, 2], 10, 0, 0).split(' ')).toHaveLength(3);
    expect(radarPolygon([2], 10, 0, 0)).toBe(radarPolygon([1], 10, 0, 0));
  });
});

describe('donutArcs', () => {
  it('slices positive values in order and sums to a full turn', () => {
    const arcs = donutArcs([1, 0, 3]);
    expect(arcs.map((a) => a.index)).toEqual([0, 2]);
    expect(arcs[0].start).toBe(0);
    expect(arcs[arcs.length - 1].end).toBe(TAU);
    expect(arcs[0].end).toBeCloseTo(TAU / 4);
  });
  it('is empty when there is nothing done (no NaN)', () => {
    expect(donutArcs([0, 0])).toEqual([]);
    expect(donutArcs([])).toEqual([]);
  });
  it('a single slice is a full turn', () => {
    expect(donutArcs([5])).toEqual([{ start: 0, end: TAU, index: 0 }]);
  });
});

describe('arcPath', () => {
  it('draws a partial ring segment as one closed path', () => {
    const d = arcPath(50, 50, 40, 25, 0, Math.PI / 2);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d).not.toContain('NaN');
  });
  it('draws a full ring as two halves', () => {
    const d = arcPath(50, 50, 40, 25, 0, TAU);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain('NaN');
  });
});
