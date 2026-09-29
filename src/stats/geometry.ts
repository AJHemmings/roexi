// Pure chart geometry for the Stats page (spec 2026-09-28 §4.2). SVG user units, no DOM, no React.
export const TAU = Math.PI * 2;

export const fraction = (done: number, total: number): number => (total > 0 ? Math.min(1, Math.max(0, done / total)) : 0);

export type BarSlot = { x: number; w: number };

/** Grouped bars: `groups` categories across `width`, `series` equal bars per group, centred in each group. */
export function barSlots(groups: number, series: number, width: number, groupGap = 0.25, barGap = 2): BarSlot[][] {
  if (groups <= 0 || series <= 0 || width <= 0) return [];
  const groupW = width / groups;
  const inner = groupW * (1 - groupGap);
  const w = Math.max(1, (inner - barGap * (series - 1)) / series);
  return Array.from({ length: groups }, (_, g) => {
    const start = g * groupW + (groupW - inner) / 2;
    return Array.from({ length: series }, (_, s) => ({ x: start + s * (w + barGap), w }));
  });
}

/** Axis i of n, at radius r: axis 0 points up, the rest go clockwise. */
export function radarPoint(i: number, n: number, r: number, cx: number, cy: number): [number, number] {
  const a = -Math.PI / 2 + (TAU * i) / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG `points` for values in 0..1 (clamped), one per axis. */
export function radarPolygon(values: number[], r: number, cx: number, cy: number): string {
  return values
    .map((v, i) => radarPoint(i, values.length, r * Math.min(1, Math.max(0, v)), cx, cy).map((n) => n.toFixed(2)).join(','))
    .join(' ');
}

export type Arc = { start: number; end: number; index: number };

/** One slice per positive value, from 12 o'clock clockwise, summing to a full turn. [] when nothing is positive. */
export function donutArcs(values: number[]): Arc[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(total > 0)) return [];
  const out: Arc[] = [];
  let a = 0;
  values.forEach((v, index) => {
    if (v <= 0) return;
    const end = a + (TAU * v) / total;
    out.push({ start: a, end, index });
    a = end;
  });
  out[out.length - 1].end = TAU; // absorb floating-point drift so the ring always closes
  return out;
}

/** Ring segment path between radii `inner` and `r`. Angles are from 12 o'clock, clockwise. A full
 * turn is drawn as two halves, because one SVG arc can't start and end on the same point. */
export function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
  if (end - start >= TAU - 1e-9) {
    return `${arcPath(cx, cy, r, inner, start, start + Math.PI)} ${arcPath(cx, cy, r, inner, start + Math.PI, start + TAU)}`;
  }
  const p = (rad: number, ang: number) => {
    const a = ang - Math.PI / 2;
    return `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  };
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${p(r, start)} A ${r} ${r} 0 ${large} 1 ${p(r, end)} L ${p(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${p(inner, start)} Z`;
}
