// The Stats page: an RoE completion log (spec 2026-09-28).
import { useMemo, useState } from 'react';
import { useCatalog } from '../roe/catalog';
import { useCharScope, CharScopeSelect, SCOPE_KEYS } from '../components/CharScope';
import { useStickyPersisted } from '../sticky';
import { SectionTabs } from '../ui';
import { parseViewPrefs, DEFAULT_VIEW, type ViewPrefs, type StatsTab } from '../stats/prefs';
import { colorByName } from '../stats/palette';
import StatsCompletionTab from './StatsCompletionTab';
import StatsLeftTab from './StatsLeftTab';
import StatsObjectivesTab from './StatsObjectivesTab';
import type { Cell } from '../stats/Matrix';

export default function StatsView() {
  const catalog = useCatalog();
  const { known, scope, charSelected, setCharSelected } = useCharScope(SCOPE_KEYS.stats);
  const [rawView, setRawView] = useStickyPersisted<unknown>('stats.view', DEFAULT_VIEW);
  const view = useMemo(() => parseViewPrefs(rawView), [rawView]);
  const setView = (patch: Partial<ViewPrefs>) => setRawView((prev: unknown) => ({ ...parseViewPrefs(prev), ...patch }));
  const colorOf = useMemo(() => colorByName(known.map((c) => c.name)), [known]);
  // Shared by Completion (highlight + click) and Objectives (what's listed). Not persisted.
  const [cell, setCell] = useState<Cell | null>(null);
  const setCompletionKind = (completionKind: ViewPrefs['completionKind']) => { setView({ completionKind }); setCell(null); };

  if (known.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-[15px] font-bold text-fg mb-1">No Characters Connected</div>
          <div className="text-[12px] text-fg-4 leading-relaxed">Load the roexi addon in-game with <span className="text-fg-3">//lua load roexi</span>. Each character's stats appear here as soon as it connects.</div>
        </div>
      </div>
    );
  }
  if (!catalog) return <div className="p-6 text-center text-[12px] text-fg-4">Loading objective catalog…</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 flex flex-col gap-2.5 shrink-0">
        <CharScopeSelect known={known} charSelected={charSelected} setCharSelected={setCharSelected} />
        <SectionTabs<StatsTab> value={view.tab} onChange={(tab) => setView({ tab })}
          tabs={[{ id: 'completion', label: 'Completion' }, { id: 'left', label: 'Left to do' }, { id: 'objectives', label: 'Objectives' }]} />
      </div>
      {view.tab === 'completion' ? (
        <StatsCompletionTab scope={scope} catalog={catalog} colorOf={colorOf}
          kind={view.completionKind} setKind={setCompletionKind}
          selected={cell} onSelect={(c) => { setCell(c); setView({ tab: 'objectives' }); }} />
      ) : view.tab === 'objectives' ? (
        <StatsObjectivesTab scope={scope} catalog={catalog}
          kind={view.completionKind} setKind={setCompletionKind} cell={cell} setCell={setCell} />
      ) : (
        <StatsLeftTab scope={scope} catalog={catalog} colorOf={colorOf}
          kind={view.leftKind} setKind={(leftKind) => setView({ leftKind })}
          sort={view.leftSort} setSort={(leftSort) => setView({ leftSort })}
          hiddenCats={view.leftHiddenCats} setHiddenCats={(leftHiddenCats) => setView({ leftHiddenCats })} />
      )}
    </div>
  );
}
