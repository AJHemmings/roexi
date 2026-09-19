import { useMemo, useState } from 'react';
import { ObjectiveRow } from '../components/ObjectiveRow';
import { runRemove } from '../roe/batch';
import { formatProgress } from '../roe/format';
import { TargetPickerModal } from '../components/TargetPicker';
import type { KnownChar, CatalogEntry } from '../roe/types';

function ExpandedActive({ id, scope, entry }: { id: number; scope: KnownChar[]; entry?: CatalogEntry }) {
  const withIt = scope.filter((c) => c.active.some((a) => a.id === id));
  return (
    <div className="flex flex-col gap-1.5">
      {withIt.map((c) => {
        const p = c.active.find((a) => a.id === id)!.p;
        return (
          <div key={c.name} className="flex items-center gap-2 text-[11px] text-fg-3">
            <span className="font-semibold">{c.name}</span>
            <span className="tabular-nums text-fg-4">{formatProgress(p, entry)}</span>
            <button onClick={() => void runRemove([c], [id])} className="le-tap ml-auto text-red-300/80 hover:text-red-300 font-semibold">Remove</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ActiveTab({ scope, byId, query, selected, onToggle }: {
  scope: KnownChar[];
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

  if (scope.length === 0) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Select at least one character above to see their active objectives.</div>;
  }
  if (rows.length === 0) {
    return <div className="p-6 text-center text-[12px] text-fg-4">No active objectives{query ? ' match your search' : ' for this scope'}.</div>;
  }

  return (
    <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">
      {rows.map((id) => {
        const entry = byId.get(id);
        const count = scope.filter((c) => c.active.some((a) => a.id === id)).length;
        return (
          <ObjectiveRow key={id} id={id} entry={entry} scope={scope} checkbox checked={selected.includes(id)} onToggle={() => onToggle(id)}
            countLabel={`${count}/${scope.length}`}
            badges={
              <button onClick={(e) => { e.stopPropagation(); setRowRemoveId(id); }} aria-label="Remove from characters" className="le-tap text-fg-4 hover:text-red-300">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /></svg>
              </button>
            }
            expanded={<ExpandedActive id={id} scope={scope} entry={entry} />} />
        );
      })}
      {rowRemoveId != null && (
        <TargetPickerModal known={scope} defaultSelected={scope.filter((c) => c.online && c.active.some((a) => a.id === rowRemoveId)).map((c) => c.name)}
          confirmLabel="Remove" onClose={() => setRowRemoveId(null)}
          onConfirm={(targets) => void runRemove(scope.filter((c) => targets.includes(c.name)), [rowRemoveId])} />
      )}
    </div>
  );
}
