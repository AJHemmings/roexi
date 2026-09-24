import { useMemo, useState } from 'react';
import { ObjectiveRow } from '../components/ObjectiveRow';
import { ProgressBar } from '../components/ProgressBar';
import { RowMenu } from '../components/RowMenu';
import { runAdd, runRemove } from '../roe/batch';
import { addBlockReason, computeAddDefault, computeRemoveDefault, resolveTargets, type AddBlockReason } from '../roe/targets';
import { Spinner } from '../components/Spinner';
import { usePending, isCharBusy, isIdPending, pendingFor } from '../roe/pending';
import { TargetPickerModal } from '../components/TargetPicker';
import { ActiveCountHeader } from '../components/ActiveCountHeader';
import { MAX_ACTIVE } from '../roe/types';
import type { KnownChar, CatalogEntry } from '../roe/types';

const ADD_BLOCK_LABEL: Record<AddBlockReason, string> = {
  auto: 'auto daily', active: 'active', completed: 'completed', offline: 'offline', full: `full (${MAX_ACTIVE}/${MAX_ACTIVE})`,
};

/** Every character in scope for this objective: those who have it get their progress bar and a quick
 * Remove; those who don't get Add, or a disabled Add plus the reason (addBlockReason) when the game
 * wouldn't accept it. Deliberately NOT consolidated with RowMenu's Add/Remove actions: this is the
 * per-character detail surface, RowMenu handles roster-wide actions. Keep both — don't "clean up" this
 * duplication. In single-character mode scope is one character who always has the objective, so Add
 * only ever appears here in All mode — that's expected. */
function ExpandedActive({ id, scope, entry, byId }: { id: number; scope: KnownChar[]; entry?: CatalogEntry; byId: Map<number, CatalogEntry> }) {
  const pending = usePending();
  return (
    <div className="flex flex-col gap-1.5">
      {scope.map((c) => {
        const busy = isCharBusy(pending, c.name);
        const spinning = pendingFor(pending, c.name, id);
        const act = c.active.find((a) => a.id === id);
        if (act) {
          return (
            <div key={c.name} className="flex items-center gap-2 text-[11px] text-fg-3">
              <span className="font-semibold">{c.name}</span>
              <ProgressBar p={act.p} online={c.online} entry={entry} />
              <button disabled={busy} onClick={() => void runRemove([c], [id])}
                className="le-tap inline-flex items-center gap-1 text-red-300/80 hover:text-red-300 font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-red-300/80">
                {spinning === 'remove' ? <><Spinner />Removing…</> : 'Remove'}
              </button>
            </div>
          );
        }
        const reason = addBlockReason(c, id, byId);
        return (
          <div key={c.name} className="flex items-center gap-2 text-[11px] text-fg-3">
            <span className="font-semibold">{c.name}</span>
            <span className="text-fg-4">{reason ? ADD_BLOCK_LABEL[reason] : 'not active'}</span>
            <button disabled={reason !== null || busy} onClick={() => void runAdd([c], [id], byId)}
              className="le-tap inline-flex items-center gap-1 text-accent/90 hover:text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-accent/90">
              {spinning === 'add' ? <><Spinner />Adding…</> : 'Add'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function ActiveTab({ known, scope, charSelected, byId, query, selected, onToggle, clearSelected }: {
  known: KnownChar[];
  scope: KnownChar[];
  charSelected: string | null;
  byId: Map<number, CatalogEntry>;
  query: string;
  selected: number[];
  onToggle: (id: number) => void;
  clearSelected: () => void;
}) {
  const [rowRemoveId, setRowRemoveId] = useState<number | null>(null);
  const [rowAddId, setRowAddId] = useState<number | null>(null);
  const pending = usePending();
  const rows = useMemo(() => {
    const ids = new Set<number>();
    for (const c of scope) for (const a of c.active) ids.add(a.id);
    const q = query.trim().toLowerCase();
    return [...ids]
      .filter((id) => !q || (byId.get(id)?.n ?? `unknown #${id}`).toLowerCase().includes(q))
      .sort((a, b) => (byId.get(a)?.n ?? `Unknown #${a}`).localeCompare(byId.get(b)?.n ?? `Unknown #${b}`));
  }, [scope, byId, query]);

  const header = <ActiveCountHeader scope={scope} single={charSelected !== null} />;

  if (scope.length === 0) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Select at least one character above to see their active objectives.</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="p-6 text-center text-[12px] text-fg-4">No active objectives{query ? ' match your search' : ' for this scope'}.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">
        {rows.map((id) => {
          const entry = byId.get(id);
          const count = scope.filter((c) => c.active.some((a) => a.id === id)).length;
          return (
            <ObjectiveRow key={id} id={id} entry={entry} checkbox checked={selected.includes(id)} onToggle={() => onToggle(id)}
              countLabel={`${count}/${scope.length}`}
              partial={scope.length > 1 && count < scope.length}
              chips={isIdPending(pending, id) ? <Spinner className="w-3 h-3 text-fg-4" /> : undefined}
              actions={<RowMenu id={id} known={known} charSelected={charSelected} selectedIds={selected} byId={byId}
                onOpenRemovePicker={() => setRowRemoveId(id)} onOpenAddPicker={() => setRowAddId(id)} onClearSelected={clearSelected} />}
              expanded={<ExpandedActive id={id} scope={scope} entry={entry} byId={byId} />} />
          );
        })}
        {rowRemoveId != null && (
          <TargetPickerModal known={known} defaultSelected={computeRemoveDefault(known, [rowRemoveId])}
            confirmLabel="Remove" onClose={() => setRowRemoveId(null)}
            onConfirm={(targets) => void runRemove(resolveTargets(known, targets), [rowRemoveId])} />
        )}
        {rowAddId != null && (
          <TargetPickerModal known={known} defaultSelected={computeAddDefault(known, [rowAddId], byId)}
            confirmLabel="Add" onClose={() => setRowAddId(null)}
            onConfirm={(targets) => void runAdd(resolveTargets(known, targets), [rowAddId], byId)} />
        )}
      </div>
    </div>
  );
}
