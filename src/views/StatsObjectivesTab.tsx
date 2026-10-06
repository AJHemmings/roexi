// Stats → Objectives: pick a character (and optionally a category) to list its objectives.
// The Completion matrix jumps here with a cell already picked.
import { useMemo } from 'react';
import { Segmented, Select, HelpTip } from '../ui';
import { categoriesFor, cellEntries } from '../roe/completion';
import { EVENT_HELP } from '../roe/copy';
import { Explorer } from '../stats/Explorer';
import type { Cell } from '../stats/Matrix';
import type { CompletionKind } from '../stats/prefs';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const KIND_OPTIONS: { v: CompletionKind; label: string }[] = [
  { v: 'one-time', label: 'One-time' },
  { v: 'repeatable', label: 'Repeatables' },
  { v: 'event', label: 'Events' },
];
const OVERALL = 'Overall';

export default function StatsObjectivesTab({ scope, catalog, kind, setKind, cell, setCell }: {
  scope: KnownChar[];
  catalog: Catalog;
  kind: CompletionKind;
  setKind: (k: CompletionKind) => void;
  cell: Cell | null;
  setCell: (c: Cell | null) => void;
}) {
  const cats = useMemo(() => categoriesFor(catalog.entries, [kind]), [catalog, kind]);
  // Fall back to the first in-scope character's Overall when nothing (or a character no longer in scope) is picked.
  const active: Cell | null = cell && scope.some((c) => c.name === cell.char) ? cell : scope[0] ? { char: scope[0].name, cat: null, sub: null } : null;
  const activeChar = active ? scope.find((c) => c.name === active.char) : undefined;
  const entries = active ? cellEntries(catalog.entries, [kind], active.cat, active.sub) : [];

  return (
    <div className="flex-1 min-h-0 px-3 pb-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<CompletionKind> value={kind} onChange={(k) => { setKind(k); setCell(active ? { char: active.char, cat: null, sub: null } : null); }} options={KIND_OPTIONS} />
        {kind === 'event' && <HelpTip text={EVENT_HELP} />}
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
      <Explorer key={active ? `${kind}|${active.char}|${active.cat ?? ''}|${active.sub ?? ''}` : 'none'}
        char={activeChar} entries={entries} title={active?.sub ?? active?.cat ?? OVERALL} />
    </div>
  );
}
