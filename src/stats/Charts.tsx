// Hand-written SVG charts for the Stats page (spec 2026-09-28 §4.2). All maths is in geometry.ts;
// these only render. viewBox-based, so they stay sharp under the UI Scale CSS zoom.
import { TAU, fraction, barSlots, radarPoint, radarPolygon, donutArcs, arcPath } from './geometry';
import { catColor } from './palette';
import { ZERO, type Tally } from '../roe/completion';
import type { ChartType, ChartValue } from './prefs';

export type Series = { name: string; color: string; tallies: Map<string, Tally> };

const pctText = (t: Tally) => `${Math.round(fraction(t.done, t.total) * 100)}%`;
const tip = (name: string, cat: string, t: Tally) => `${name} · ${cat}: ${t.done}/${t.total} (${pctText(t)})`;

function Hint({ text }: { text: string }) {
  return <div className="py-8 text-center text-[12px] text-fg-4">{text}</div>;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-fg-3">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />{it.label}
        </span>
      ))}
    </div>
  );
}

function BarChart({ series, cats, value }: { series: Series[]; cats: string[]; value: ChartValue }) {
  const W = 640, H = 240, L = 36, R = 8, T = 8, B = 64;
  const plotW = W - L - R, plotH = H - T - B;
  const max = value === 'pct' ? 1 : Math.max(1, ...series.flatMap((s) => cats.map((c) => s.tallies.get(c)?.total ?? 0)));
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const slots = barSlots(cats.length, series.length, plotW);
  const groupW = plotW / cats.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Completion by category">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} stroke="var(--color-line)" />
          <text x={L - 4} y={y(f * max) + 3} textAnchor="end" className="fill-fg-4 text-[9px]">{value === 'pct' ? `${f * 100}%` : Math.round(f * max)}</text>
        </g>
      ))}
      {cats.map((cat, g) => {
        const lx = L + (g + 0.5) * groupW, ly = T + plotH + 10;
        return (
          <g key={cat}>
            {series.map((s, i) => {
              const t = s.tallies.get(cat) ?? ZERO;
              const { x, w } = slots[g][i];
              const v = value === 'pct' ? fraction(t.done, t.total) : t.done;
              return (
                <g key={s.name}>
                  {value === 'count' && <rect x={L + x} y={y(t.total)} width={w} height={T + plotH - y(t.total)} fill={s.color} opacity={0.15} />}
                  <rect x={L + x} y={y(v)} width={w} height={T + plotH - y(v)} fill={s.color} rx={1.5}><title>{tip(s.name, cat, t)}</title></rect>
                </g>
              );
            })}
            <text x={lx} y={ly} textAnchor="end" transform={`rotate(-35 ${lx} ${ly})`} className="fill-fg-3 text-[9px]">{cat}</text>
          </g>
        );
      })}
    </svg>
  );
}

function RadarChart({ series, cats }: { series: Series[]; cats: string[] }) {
  if (cats.length < 3) return <Hint text="Radar needs at least 3 categories. Turn more on above." />;
  const S = 320, C = S / 2, Rr = 100;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[420px] h-auto mx-auto" role="img" aria-label="Completion shape by category">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={radarPolygon(cats.map(() => f), Rr, C, C)} fill="none" stroke="var(--color-line)" />
      ))}
      {cats.map((cat, i) => {
        const [ax, ay] = radarPoint(i, cats.length, Rr, C, C);
        const [lx, ly] = radarPoint(i, cats.length, Rr + 14, C, C);
        const anchor = lx > C + 4 ? 'start' : lx < C - 4 ? 'end' : 'middle';
        return (
          <g key={cat}>
            <line x1={C} y1={C} x2={ax} y2={ay} stroke="var(--color-line)" />
            <text x={lx} y={ly + 3} textAnchor={anchor} className="fill-fg-3 text-[9px]">{cat}</text>
          </g>
        );
      })}
      {series.map((s) => (
        <polygon key={s.name} points={radarPolygon(cats.map((c) => { const t = s.tallies.get(c) ?? ZERO; return fraction(t.done, t.total); }), Rr, C, C)}
          fill={s.color} fillOpacity={0.15} stroke={s.color} strokeWidth={1.5}>
          <title>{`${s.name}: ${cats.map((c) => `${c} ${pctText(s.tallies.get(c) ?? ZERO)}`).join(', ')}`}</title>
        </polygon>
      ))}
    </svg>
  );
}

function Donut({ s, cats, value, colorOfCat }: { s: Series; cats: string[]; value: ChartValue; colorOfCat: (cat: string) => string }) {
  const S = 140, C = S / 2, R = 60, IN = 40;
  const ts = cats.map((c) => s.tallies.get(c) ?? ZERO);
  const sum = ts.reduce((a, t) => ({ done: a.done + t.done, total: a.total + t.total, unknown: a.unknown + t.unknown }), ZERO);
  const arcs = donutArcs(ts.map((t) => t.done));
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-[140px] h-auto" role="img" aria-label={`${s.name} completion`}>
        {arcs.length === 0 && <path d={arcPath(C, C, R, IN, 0, TAU)} fill="var(--color-field)" stroke="var(--color-line)" />}
        {arcs.map((a) => (
          <path key={cats[a.index]} d={arcPath(C, C, R, IN, a.start, a.end)} fill={colorOfCat(cats[a.index])}>
            <title>{tip(s.name, cats[a.index], ts[a.index])}</title>
          </path>
        ))}
        <text x={C} y={C + 5} textAnchor="middle" className="fill-fg text-[15px] font-bold">{value === 'pct' ? pctText(sum) : sum.done}</text>
      </svg>
      <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.name}</span>
    </div>
  );
}

export function OverviewChart({ series, cats, allCats, type, value }: {
  series: Series[];
  /** The categories switched on, in display order. */
  cats: string[];
  /** Every category for the current measure, so each category keeps one colour whatever is switched off. */
  allCats: string[];
  type: ChartType;
  value: ChartValue;
}) {
  if (series.length === 0) return <Hint text="No characters in scope." />;
  if (cats.length === 0) return <Hint text="No categories selected. Turn some on above." />;
  const colorOfCat = (cat: string) => catColor(allCats.indexOf(cat), allCats.length);
  if (type === 'donut') {
    return (
      <div>
        <div className="flex flex-wrap justify-center gap-4">
          {series.map((s) => <Donut key={s.name} s={s} cats={cats} value={value} colorOfCat={colorOfCat} />)}
        </div>
        <Legend items={cats.map((c) => ({ label: c, color: colorOfCat(c) }))} />
      </div>
    );
  }
  return (
    <div>
      {type === 'bar' ? <BarChart series={series} cats={cats} value={value} /> : <RadarChart series={series} cats={cats} />}
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
    </div>
  );
}
