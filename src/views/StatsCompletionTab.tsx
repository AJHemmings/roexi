// Stats → Completion: overview chart on top, category matrix below (spec 2026-09-28 §4.2).
// Kind chips and section toggles: spec 2026-10-06 §3. Clicking a matrix cell opens it in the Objectives tab.
import { useMemo, useState } from 'react';
import { Segmented, Chip, HelpTip } from '../ui';
import { completionFor, categoriesFor, subsFor, unclassifiedCount } from '../roe/completion';
import { EVENT_HELP, UNCLASSIFIED_HELP } from '../roe/copy';
import { valueFor, type ChartPrefs, type ChartType, type ChartValue, type CompletionKind } from '../stats/prefs';
import { shownEntries, categoryState, setCategoryShown, hiddenCount, sectionKeys } from '../stats/sections';
import { KindChips, COMPLETION_KIND_OPTIONS } from '../stats/KindChips';
import { SectionsModal } from '../stats/SectionsModal';
import { OverviewChart, CompactBars } from '../stats/Charts';
import { useMode } from '../windowSize';
import { Matrix, type Cell } from '../stats/Matrix';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const COMPACT_HELP = 'Switch view mode to regular for best experience.';

export default function StatsCompletionTab({ scope, catalog, colorOf, kinds, setKinds, chart, setChart, selected, onSelect }: {
  scope: KnownChar[];
  catalog: Catalog;
  colorOf: (name: string) => string;
  kinds: CompletionKind[];
  setKinds: (k: CompletionKind[]) => void;
  chart: ChartPrefs;
  setChart: (patch: Partial<ChartPrefs>) => void;
  /** The cell last opened in the Objectives tab, highlighted here. */
  selected: Cell | null;
  /** Clicking a cell opens it in the Objectives tab. */
  onSelect: (c: Cell) => void;
}) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const shown = useMemo(() => shownEntries(catalog.entries, chart.hidden), [catalog, chart.hidden]);
  const comps = useMemo(() => scope.map((c) => ({ c, comp: completionFor(c, shown, kinds) })), [scope, shown, kinds]);
  /** Every category of the selected kinds, hidden ones included, so their chips can be turned back on. */
  const allCats = useMemo(() => categoriesFor(catalog.entries, kinds), [catalog, kinds]);
  const cats = useMemo(() => categoriesFor(shown, kinds), [shown, kinds]);
  const series = comps.map(({ c, comp }) => ({ name: c.name, color: colorOf(c.name), tallies: comp.byCat }));
  const compact = useMode() === 'compact';
  const unclassified = useMemo(() => unclassifiedCount(catalog.entries), [catalog]);
  const setHidden = (hidden: string[]) => setChart({ hidden });
  const known = useMemo(() => sectionKeys(catalog.entries), [catalog]);
  const nHidden = hiddenCount(chart.hidden, known);

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
        <div className="flex flex-wrap items-center gap-2">
          {compact ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-4">Compact view <HelpTip text={COMPACT_HELP} /></span>
          ) : (
            <>
              <Segmented<ChartType> value={chart.type} onChange={(type) => setChart({ type })}
                options={[{ v: 'bar', label: 'Bar' }, { v: 'radar', label: 'Radar' }, { v: 'donut', label: 'Donut' }]} />
              {chart.type === 'radar' ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-fg-4">% only <HelpTip text="Radar always shows %: categories differ in size, so counts can't share one scale." /></span>
              ) : (
                <Segmented<ChartValue> value={chart.value} onChange={(value) => setChart({ value })} options={[{ v: 'pct', label: '%' }, { v: 'count', label: 'Counts' }]} />
              )}
            </>
          )}
          {/* Styled as a one-option Segmented so it sits evenly beside the chart controls. */}
          <div className="inline-flex rounded-lg bg-field border border-line p-0.5">
            <button type="button" onClick={() => setSectionsOpen(true)}
              className="le-tap px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-fg-3 hover:text-fg-2 transition-colors">Sections</button>
          </div>
          {nHidden > 0 && <span className="text-[11px] text-fg-4">{nHidden} hidden</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allCats.map((cat) => (
            <Chip key={cat} on={categoryState(chart.hidden, cat) !== 'off'} onChange={(on) => setHidden(setCategoryShown(chart.hidden, cat, on))}>{cat}</Chip>
          ))}
        </div>
        {compact ? (
          <CompactBars series={series} cats={cats} />
        ) : (
          <OverviewChart series={series} cats={cats} allCats={allCats} type={chart.type} value={valueFor(chart)} />
        )}
      </section>

      <section className="min-w-0 rounded-xl bg-surface border border-line p-2">
        <Matrix
          cols={comps.map(({ c, comp }) => ({ name: c.name, online: c.online, color: colorOf(c.name), comp }))}
          cats={cats} subsOf={(cat) => subsFor(shown, kinds, cat)}
          selected={selected} onSelect={onSelect} />
      </section>

      {sectionsOpen && (
        <SectionsModal cats={allCats} subsOf={(cat) => subsFor(catalog.entries, kinds, cat)}
          hidden={chart.hidden} onChange={setHidden} onClose={() => setSectionsOpen(false)} />
      )}
    </div>
  );
}
