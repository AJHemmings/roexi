// Stats → Objectives: pick a character (and optionally a category) to list its objectives.
// The Completion matrix jumps here with a cell already picked.
import { useMemo } from 'react';
import { Select, HelpTip } from '../ui';
import { categoriesFor, cellEntries, subsFor } from '../roe/completion';
import { EVENT_HELP } from '../roe/copy';
import { Explorer } from '../stats/Explorer';
import { KindChips, COMPLETION_KIND_OPTIONS } from '../stats/KindChips';
import { shownEntries } from '../stats/sections';
import type { Cell } from '../stats/Matrix';
import type { CompletionKind } from '../stats/prefs';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const OVERALL = 'Overall';

export default function StatsObjectivesTab({ scope, catalog, hidden, kinds, setKinds, cell, setCell }: {
  scope: KnownChar[];
  catalog: Catalog;
  /** Category and section keys hidden in Completion; left out here too. */
  hidden: string[];
  kinds: CompletionKind[];
  setKinds: (k: CompletionKind[]) => void;
  cell: Cell | null;
  setCell: (c: Cell | null) => void;
}) {
  const shown = useMemo(() => shownEntries(catalog.entries, hidden), [catalog, hidden]);
  const cats = useMemo(() => categoriesFor(shown, kinds), [shown, kinds]);
  // No pick (or a character no longer in scope) → the first in-scope character's Overall. A picked
  // category or section that is hidden or outside the selected kinds → that character's Overall.
  const active: Cell | null = (() => {
    if (!cell || !scope.some((c) => c.name === cell.char)) return scope[0] ? { char: scope[0].name, cat: null, sub: null } : null;
    const visible = cell.cat === null || (cats.includes(cell.cat) && (cell.sub === null || subsFor(shown, kinds, cell.cat).includes(cell.sub)));
    return visible ? cell : { char: cell.char, cat: null, sub: null };
  })();
  const activeChar = active ? scope.find((c) => c.name === active.char) : undefined;
  const entries = active ? cellEntries(shown, kinds, active.cat, active.sub) : [];

  return (
    <div className="flex-1 min-h-0 px-3 pb-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindChips<CompletionKind> value={kinds} options={COMPLETION_KIND_OPTIONS}
          onChange={(k) => { setKinds(k); setCell(active ? { char: active.char, cat: null, sub: null } : null); }} />
        {kinds.includes('event') && <HelpTip text={EVENT_HELP} />}
      </div>
      {active && (
        <div className="flex flex-wrap items-center gap-2">
          {scope.length > 1 && (
            <Select value={active.char} options={scope.map((c) => c.name)}
              onChange={(char) => setCell({ ...active, char })} />
          )}
          <Select value={active.cat ?? OVERALL} options={[OVERALL, ...cats]}
            onChange={(cat) => setCell({ char: active.char, cat: cat === OVERALL ? null : cat, sub: null })} />
        </div>
      )}
      <Explorer key={active ? `${kinds.join(',')}|${active.char}|${active.cat ?? ''}|${active.sub ?? ''}` : 'none'}
        char={activeChar} entries={entries} title={active?.sub ?? active?.cat ?? OVERALL} />
    </div>
  );
}
