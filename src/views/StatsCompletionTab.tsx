// Stats → Completion: overview chart on top, category matrix below (spec 2026-09-28 §4.2).
// Clicking a matrix cell opens it in the Objectives tab.
import { useMemo } from 'react';
import { useStickyPersisted } from '../sticky';
import { Segmented, Chip, HelpTip } from '../ui';
import { completionFor, categoriesFor, subsFor, unclassifiedCount } from '../roe/completion';
import { EVENT_HELP, UNCLASSIFIED_HELP } from '../roe/copy';
import { parseChartPrefs, valueFor, DEFAULT_CHART, type ChartPrefs, type ChartType, type ChartValue, type CompletionKind } from '../stats/prefs';
import { KindChips, COMPLETION_KIND_OPTIONS } from '../stats/KindChips';
import { OverviewChart, CompactBars } from '../stats/Charts';
import { useMode } from '../windowSize';
import { Matrix, type Cell } from '../stats/Matrix';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const COMPACT_HELP = 'Switch view mode to regular for best experience.';

export default function StatsCompletionTab({ scope, catalog, colorOf, kinds, setKinds, selected, onSelect }: {
  scope: KnownChar[];
  catalog: Catalog;
  colorOf: (name: string) => string;
  kinds: CompletionKind[];
  setKinds: (k: CompletionKind[]) => void;
  /** The cell last opened in the Objectives tab, highlighted here. */
  selected: Cell | null;
  /** Clicking a cell opens it in the Objectives tab. */
  onSelect: (c: Cell) => void;
}) {
  const [rawChart, setRawChart] = useStickyPersisted<unknown>('stats.chart', DEFAULT_CHART);
  const chart = useMemo(() => parseChartPrefs(rawChart), [rawChart]);
  const setChart = (patch: Partial<ChartPrefs>) => setRawChart((prev: unknown) => ({ ...parseChartPrefs(prev), ...patch }));

  const comps = useMemo(() => scope.map((c) => ({ c, comp: completionFor(c, catalog.entries, kinds) })), [scope, catalog, kinds]);
  const cats = useMemo(() => categoriesFor(catalog.entries, kinds), [catalog, kinds]);
  const shownCats = cats.filter((c) => !chart.hidden.includes(c));
  const series = comps.map(({ c, comp }) => ({ name: c.name, color: colorOf(c.name), tallies: comp.byCat }));
  const compact = useMode() === 'compact';
  const unclassified = useMemo(() => unclassifiedCount(catalog.entries), [catalog]);

  const toggleCat = (cat: string, on: boolean) =>
    setChart({ hidden: on ? chart.hidden.filter((c) => c !== cat) : [...chart.hidden, cat] });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindChips<CompletionKind> value={kinds} onChange={setKinds} options={COMPLETION_KIND_OPTIONS} />
        {kinds.includes('event') && <HelpTip text={EVENT_HELP} />}
        {unclassified > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-4">{unclassified} unclassified, not counted <HelpTip align="end" text={UNCLASSIFIED_HELP} /></span>
        )}
      </div>

      <section className="rounded-xl bg-surface border border-line p-3 flex flex-col gap-2.5">
        {compact ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-fg-4">Compact view <HelpTip text={COMPACT_HELP} /></span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<ChartType> value={chart.type} onChange={(type) => setChart({ type })}
              options={[{ v: 'bar', label: 'Bar' }, { v: 'radar', label: 'Radar' }, { v: 'donut', label: 'Donut' }]} />
            {chart.type === 'radar' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-4">% only <HelpTip text="Radar always shows %: categories differ in size, so counts can't share one scale." /></span>
            ) : (
              <Segmented<ChartValue> value={chart.value} onChange={(value) => setChart({ value })} options={[{ v: 'pct', label: '%' }, { v: 'count', label: 'Counts' }]} />
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {cats.map((cat) => <Chip key={cat} on={!chart.hidden.includes(cat)} onChange={(on) => toggleCat(cat, on)}>{cat}</Chip>)}
        </div>
        {compact ? (
          <CompactBars series={series} cats={shownCats} />
        ) : (
          <OverviewChart series={series} cats={shownCats} allCats={cats} type={chart.type} value={valueFor(chart)} />
        )}
      </section>

      <section className="min-w-0 rounded-xl bg-surface border border-line p-2">
        <Matrix
          cols={comps.map(({ c, comp }) => ({ name: c.name, online: c.online, color: colorOf(c.name), comp }))}
          cats={cats} subsOf={(cat) => subsFor(catalog.entries, kinds, cat)}
          selected={selected} onSelect={onSelect} />
      </section>
    </div>
  );
}
