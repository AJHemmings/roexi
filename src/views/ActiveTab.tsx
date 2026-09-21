import { useMemo, useState } from 'react';
import { ObjectiveRow } from '../components/ObjectiveRow';
import { ProgressBar } from '../components/ProgressBar';
import { RowMenu } from '../components/RowMenu';
import { runRemove } from '../roe/batch';
import { computeRemoveDefault, resolveTargets } from '../roe/targets';
import { TargetPickerModal } from '../components/TargetPicker';
import { MAX_ACTIVE } from '../roe/types';
import type { KnownChar, CatalogEntry } from '../roe/types';

/** Deliberately NOT consolidated with RowMenu's Remove actions: this is a separate surface for
 * viewing per-character detail (including the actual progress bar) with a quick inline remove,
 * while RowMenu handles global remove actions across the roster. Keep both — don't "clean up"
 * this duplication. */
function ExpandedActive({ id, scope, entry }: { id: number; scope: KnownChar[]; entry?: CatalogEntry }) {
  const withIt = scope.filter((c) => c.active.some((a) => a.id === id));
  return (
    <div className="flex flex-col gap-1.5">
      {withIt.map((c) => {
        const p = c.active.find((a) => a.id === id)!.p;
        return (
          <div key={c.name} className="flex items-center gap-2 text-[11px] text-fg-3">
            <span className="font-semibold">{c.name}</span>
            <ProgressBar p={p} online={c.online} entry={entry} />
            <button onClick={() => void runRemove([c], [id])} className="le-tap ml-auto text-red-300/80 hover:text-red-300 font-semibold">Remove</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ActiveTab({ known, scope, charSelected, byId, query, selected, onToggle }: {
  known: KnownChar[];
  scope: KnownChar[];
  charSelected: string | null;
  byId: Map<number, CatalogEntry>;
  query: string;
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [rowRemoveId, setRowRemoveId] = useState<number | null>(null);
  const rows = useMemo(() => {
    const ids = new Set<number>();
    for (const c of scope) for (const a of c.active) ids.add(a.id);
    const q = query.trim().toLowerCase();
    return [...ids]
      .filter((id) => !q || (byId.get(id)?.n ?? `unknown #${id}`).toLowerCase().includes(q))
      .sort((a, b) => (byId.get(a)?.n ?? `Unknown #${a}`).localeCompare(byId.get(b)?.n ?? `Unknown #${b}`));
  }, [scope, byId, query]);

  // Only meaningful in single-character mode: the 30-active cap (MAX_ACTIVE) is per character,
  // so "All" mode has no one count to show here.
  const activeCount = charSelected !== null && scope.length > 0 && (
    <div className="px-1 text-[12px] font-bold text-fg-2">{scope[0].name} — {scope[0].active.length}/{MAX_ACTIVE} active</div>
  );

  if (scope.length === 0) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Select at least one character above to see their active objectives.</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {activeCount}
        <div className="p-6 text-center text-[12px] text-fg-4">No active objectives{query ? ' match your search' : ' for this scope'}.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {activeCount}
      <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">
        {rows.map((id) => {
          const entry = byId.get(id);
          const count = scope.filter((c) => c.active.some((a) => a.id === id)).length;
          return (
            <ObjectiveRow key={id} id={id} entry={entry} checkbox checked={selected.includes(id)} onToggle={() => onToggle(id)}
              countLabel={`${count}/${scope.length}`}
              actions={<RowMenu id={id} known={known} charSelected={charSelected} onOpenPicker={() => setRowRemoveId(id)} />}
              expanded={<ExpandedActive id={id} scope={scope} entry={entry} />} />
          );
        })}
        {rowRemoveId != null && (
          <TargetPickerModal known={known} defaultSelected={computeRemoveDefault(known, [rowRemoveId])}
            confirmLabel="Remove" onClose={() => setRowRemoveId(null)}
            onConfirm={(targets) => void runRemove(resolveTargets(known, targets), [rowRemoveId])} />
        )}
      </div>
    </div>
  );
}
