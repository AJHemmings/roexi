// Stats → Completion: overview chart on top, matrix + explorer below (spec 2026-09-28 §4.2).
import { useMemo, useState } from 'react';
import { useStickyPersisted } from '../sticky';
import { Segmented, Chip, HelpTip } from '../ui';
import { completionFor, categoriesFor, subsFor, cellEntries, unclassifiedCount } from '../roe/completion';
import { EVENT_HELP, UNCLASSIFIED_HELP } from '../roe/copy';
import { parseChartPrefs, valueFor, DEFAULT_CHART, type ChartPrefs, type ChartType, type ChartValue, type CompletionKind } from '../stats/prefs';
import { OverviewChart } from '../stats/Charts';
import { Matrix, type Cell } from '../stats/Matrix';
import { Explorer } from '../stats/Explorer';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const KIND_OPTIONS: { v: CompletionKind; label: string }[] = [
  { v: 'one-time', label: 'One-time' },
  { v: 'repeatable', label: 'Repeatables' },
  { v: 'event', label: 'Events' },
];

export default function StatsCompletionTab({ scope, catalog, colorOf, kind, setKind }: {
  scope: KnownChar[];
  catalog: Catalog;
  colorOf: (name: string) => string;
  kind: CompletionKind;
  setKind: (k: CompletionKind) => void;
}) {
  const [rawChart, setRawChart] = useStickyPersisted<unknown>('stats.chart', DEFAULT_CHART);
  const chart = useMemo(() => parseChartPrefs(rawChart), [rawChart]);
  const setChart = (patch: Partial<ChartPrefs>) => setRawChart((prev: unknown) => ({ ...parseChartPrefs(prev), ...patch }));

  const comps = useMemo(() => scope.map((c) => ({ c, comp: completionFor(c, catalog.entries, kind) })), [scope, catalog, kind]);
  const cats = useMemo(() => categoriesFor(catalog.entries, kind), [catalog, kind]);
  const shownCats = cats.filter((c) => !chart.hiddenCats.includes(c));
  const unclassified = useMemo(() => unclassifiedCount(catalog.entries), [catalog]);

  const [cell, setCell] = useState<Cell | null>(null);
  // Fall back to the first character's Overall when nothing (or a character no longer in scope) is picked.
  const active: Cell | null = cell && scope.some((c) => c.name === cell.char) ? cell : scope[0] ? { char: scope[0].name, cat: null, sub: null } : null;
  const activeChar = active ? scope.find((c) => c.name === active.char) : undefined;
  const explorerEntries = active ? cellEntries(catalog.entries, kind, active.cat, active.sub) : [];

  const toggleCat = (cat: string, on: boolean) =>
    setChart({ hiddenCats: on ? chart.hiddenCats.filter((c) => c !== cat) : [...chart.hiddenCats, cat] });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<CompletionKind> value={kind} onChange={(k) => { setKind(k); setCell(null); }} options={KIND_OPTIONS} />
        {kind === 'event' && <HelpTip text={EVENT_HELP} />}
        {unclassified > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-4">{unclassified} unclassified, not counted <HelpTip align="end" text={UNCLASSIFIED_HELP} /></span>
        )}
      </div>

      <section className="rounded-xl bg-surface border border-line p-3 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<ChartType> value={chart.type} onChange={(type) => setChart({ type })}
            options={[{ v: 'bar', label: 'Bar' }, { v: 'radar', label: 'Radar' }, { v: 'donut', label: 'Donut' }]} />
          {chart.type === 'radar' ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-4">% only <HelpTip text="Radar always shows %: categories differ in size, so counts can't share one scale." /></span>
          ) : (
            <Segmented<ChartValue> value={chart.value} onChange={(value) => setChart({ value })} options={[{ v: 'pct', label: '%' }, { v: 'count', label: 'Counts' }]} />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cats.map((cat) => <Chip key={cat} on={!chart.hiddenCats.includes(cat)} onChange={(on) => toggleCat(cat, on)}>{cat}</Chip>)}
        </div>
        <OverviewChart
          series={comps.map(({ c, comp }) => ({ name: c.name, color: colorOf(c.name), tallies: comp.byCat }))}
          cats={shownCats} allCats={cats} type={chart.type} value={valueFor(chart)} />
      </section>

      <section className="@container">
        <div className="flex flex-col @min-[720px]:flex-row gap-3">
          <div className="@min-[720px]:w-[58%] min-w-0 rounded-xl bg-surface border border-line p-2">
            <Matrix
              cols={comps.map(({ c, comp }) => ({ name: c.name, online: c.online, color: colorOf(c.name), comp }))}
              cats={cats} subsOf={(cat) => subsFor(catalog.entries, kind, cat)}
              selected={active} onSelect={setCell} />
          </div>
          <div className="flex-1 min-w-0">
            <Explorer key={active ? `${kind}|${active.char}|${active.cat ?? ''}|${active.sub ?? ''}` : 'none'} char={activeChar} entries={explorerEntries} title={active?.sub ?? active?.cat ?? 'Overall'} />
          </div>
        </div>
      </section>
    </div>
  );
}
