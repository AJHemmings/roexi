// Stats → Left to do: what's still takeable, ranked by reward, with Add (spec 2026-09-28 §4.3).
import { useMemo, useState } from 'react';
import { Chip, HelpTip, Select } from '../ui';
import { ObjectiveRow } from '../components/ObjectiveRow';
import { ActionBar } from '../components/ActionBar';
import { ResultCards } from '../components/ResultCard';
import { toggleId } from '../roe/selection';
import { runAdd } from '../roe/batch';
import { resolveTargets } from '../roe/targets';
import { leftToDo, neededBy, sortLeft, categoriesFor, unclassifiedCount, catOf, subOf, LEFT_SORTS, type Kind, type LeftSort } from '../roe/completion';
import { EVENT_HELP, UNCLASSIFIED_HELP } from '../roe/copy';
import { KindChips, COMPLETION_KIND_OPTIONS, type KindOption } from '../stats/KindChips';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const SORT_LABEL: Record<LeftSort, string> = { sparks: 'Sort: Sparks', exp: 'Sort: Exp', category: 'Sort: Category', name: 'Sort: Name' };

export default function StatsLeftTab({ scope, catalog, colorOf, kinds, setKinds, sort, setSort, hiddenCats, setHiddenCats }: {
  scope: KnownChar[];
  catalog: Catalog;
  colorOf: (name: string) => string;
  kinds: Kind[];
  setKinds: (k: Kind[]) => void;
  sort: LeftSort;
  setSort: (s: LeftSort) => void;
  hiddenCats: string[];
  setHiddenCats: (c: string[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const cats = useMemo(() => categoriesFor(catalog.entries, kinds), [catalog, kinds]);
  const list = useMemo(
    () => sortLeft(leftToDo(scope, catalog.entries, catalog.byId, kinds).filter((e) => !hiddenCats.includes(catOf(e))), sort),
    [scope, catalog, kinds, sort, hiddenCats],
  );
  const many = scope.length > 1;
  const clear = () => setSelected([]);
  const visibleIds = useMemo(() => new Set(list.map((e) => e.id)), [list]);
  const effective = selected.filter((id) => visibleIds.has(id));
  const who = useMemo(() => new Map(list.map((e) => [e.id, neededBy(scope, e.id, catalog.byId)])), [list, scope, catalog]);
  const unclassified = useMemo(() => unclassifiedCount(catalog.entries), [catalog]);
  // Unclassified is only offered while the catalog has any (none since the client table, spec 2026-10-06 §3.1).
  const kindOptions: readonly KindOption<Kind>[] = unclassified > 0
    ? [...COMPLETION_KIND_OPTIONS, { v: 'unclassified', label: 'Unclassified' }]
    : COMPLETION_KIND_OPTIONS;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-2.5">
        <ResultCards byId={catalog.byId} />
        <div className="flex flex-wrap items-center gap-2">
          <KindChips<Kind> value={kinds} onChange={(k) => { setKinds(k); clear(); }} options={kindOptions} />
          {kinds.includes('event') && <HelpTip text={EVENT_HELP} />}
          {unclassified > 0 && kinds.includes('unclassified') && <HelpTip text={UNCLASSIFIED_HELP} />}
          <div className="ml-auto w-[150px]">
            <Select full value={sort} onChange={(v) => setSort(v as LeftSort)} options={[...LEFT_SORTS]}
              renderOption={(v) => SORT_LABEL[v as LeftSort]} renderValue={(v) => SORT_LABEL[v as LeftSort]} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cats.map((cat) => (
            <Chip key={cat} on={!hiddenCats.includes(cat)} onChange={(on) => setHiddenCats(on ? hiddenCats.filter((c) => c !== cat) : [...hiddenCats, cat])}>{cat}</Chip>
          ))}
        </div>
        <span className="text-[11px] text-fg-4">{list.length} left</span>
        {list.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-fg-4">Nothing left here.</div>
        ) : (
          <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">
            {list.map((e) => {
              const rowWho = who.get(e.id) ?? [];
              const locked = scope.some((c) => rowWho.includes(c.name) && c.gameLocked?.has(e.id));
              return (
                <ObjectiveRow key={e.id} id={e.id} entry={e} checkbox checked={effective.includes(e.id)} onToggle={() => setSelected((p) => toggleId(p, e.id))}
                  countLabel={`${e.sparks ?? '–'} sparks · ${e.exp ?? '–'} exp`}
                  badges={(
                    <>
                      <span className="text-[10px] text-fg-4 truncate max-w-[40%]">{catOf(e)} ▸ {subOf(e)}</span>
                      {locked && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-field text-fg-4">Locked</span>}
                    </>
                  )}
                  chips={many ? (
                    <span className="flex gap-1 shrink-0">
                      {rowWho.map((n) => <span key={n} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-field" style={{ color: colorOf(n) }}>{n.slice(0, 3)}</span>)}
                    </span>
                  ) : undefined}
                  expanded={(
                    <div className="flex flex-col gap-1 text-[11px] text-fg-3">
                      {e.text && <p className="leading-relaxed whitespace-pre-line">{e.text}</p>}
                      {many && <span className="text-fg-4">Still left for: {rowWho.join(', ')}</span>}
                    </div>
                  )} />
              );
            })}
          </div>
        )}
      </div>
      {/* Rendered unconditionally: ActionBar returns null itself when nothing is selected (see ActionBar.tsx). */}
      <ActionBar known={scope} selectedIds={effective} byId={catalog.byId} showRemove={false}
        onAdd={(targets) => { void runAdd(resolveTargets(scope, targets), effective, catalog.byId); clear(); }}
        onRemove={() => {}}
        onClear={clear} />
    </div>
  );
}
