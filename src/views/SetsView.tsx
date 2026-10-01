import { useState } from 'react';
import { useSets, useSetsLoaded, markApplied, deleteSet } from '../roe/sets';
import { useKnownCharacters } from '../bridge';
import { useCatalog } from '../roe/catalog';
import { resolveTargets, computeRemoveDefault } from '../roe/targets';
import { runAdd, runRemove } from '../roe/batch';
import { TargetPickerModal } from '../components/TargetPicker';
import { ResultCards } from '../components/ResultCard';
import { EditSetModal } from '../components/SetModals';
import { relTime, useNowTick } from '../reltime';
import { Spinner } from '../components/Spinner';
import { ImportRoeButton } from '../components/ImportRoeButton';

// At most one set action is open at a time: a picker, the edit modal, or the inline delete confirm.
// One state value makes "two open at once" unrepresentable rather than something each click undoes.
type SetAction = { kind: 'apply' | 'remove' | 'edit' | 'delete'; setId: string };

export default function SetsView() {
  const sets = useSets();
  const loaded = useSetsLoaded();
  const known = useKnownCharacters();
  const catalog = useCatalog();
  const [action, setAction] = useState<SetAction | null>(null);
  const close = () => setAction(null);
  // Looked up rather than asserted, so a set deleted while its action is open just closes it.
  const actionSet = action ? sets.find((x) => x.id === action.setId) : undefined;
  // Which set's Apply/Remove batch is running, for that set's own button spinner. Local state is safe
  // here because Sets rows stay mounted; *disabling* is the pickers' job (via the pending store).
  const [running, setRunning] = useState<Record<string, 'apply' | 'remove'>>({});
  const track = (setId: string, kind: 'apply' | 'remove', p: Promise<void>) => {
    setRunning((r) => ({ ...r, [setId]: kind }));
    void p.finally(() => setRunning((r) => { const next = { ...r }; delete next[setId]; return next; }));
  };
  useNowTick();

  if (!loaded) return null;
  if (sets.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-[15px] font-bold text-fg mb-1">No Sets Yet</div>
          <div className="text-[12px] text-fg-4 leading-relaxed">Select objectives in Records and choose Save to set → Create new set, or import your profiles from the roe addon.</div>
          <div className="mt-3"><ImportRoeButton /></div>
        </div>
      </div>
    );
  }
  if (!catalog) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Loading objective catalog…</div>;
  }

  const onlineKnown = known.filter((c) => c.online);

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-[11px] tabular-nums text-fg-4">{sets.length} set{sets.length === 1 ? '' : 's'}</span>
        <div className="ml-auto"><ImportRoeButton /></div>
      </div>
      <ResultCards byId={catalog.byId} />
      {sets.map((s) => (
        <div key={s.id} className="rounded-xl bg-surface border border-line p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-fg truncate">{s.name}</span>
            <span className="text-[11px] tabular-nums text-fg-4">{s.ids.length} objectives</span>
            <span className="ml-auto text-[11px] text-fg-4">{relTime(s.lastAppliedAt) ?? 'Never applied'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={onlineKnown.length === 0} onClick={() => setAction({ kind: 'apply', setId: s.id })}
              className="le-tap inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{running[s.id] === 'apply' && <Spinner />}Apply</button>
            <button disabled={computeRemoveDefault(known, s.ids).length === 0} onClick={() => setAction({ kind: 'remove', setId: s.id })}
              className="le-tap inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-md bg-field border border-line text-fg-2 hover:text-fg transition-colors">{running[s.id] === 'remove' && <Spinner />}Remove</button>
            <button onClick={() => setAction({ kind: 'edit', setId: s.id })}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-field border border-line text-fg-2 hover:text-fg transition-colors">Edit</button>
            <div className="ml-auto flex items-center gap-2">
              {action?.kind === 'delete' && action.setId === s.id ? (
                <>
                  <button onClick={close} className="px-2 py-1 text-[11px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
                  <button onClick={() => { deleteSet(s.id); close(); }} className="px-2 py-1 text-[11px] font-semibold rounded-md border border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors">Delete</button>
                </>
              ) : (
                <button onClick={() => setAction({ kind: 'delete', setId: s.id })} aria-label={`Delete ${s.name}`} className="le-tap grid place-items-center w-7 h-7 rounded-md text-fg-4 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {action?.kind === 'apply' && actionSet && (
        <TargetPickerModal known={known} defaultSelected={onlineKnown.map((c) => c.name)} confirmLabel="Apply"
          onClose={close}
          onConfirm={(targets) => { track(actionSet.id, 'apply', runAdd(resolveTargets(known, targets), actionSet.ids, catalog.byId)); markApplied(actionSet.id); }} />
      )}
      {action?.kind === 'remove' && actionSet && (
        <TargetPickerModal known={known} defaultSelected={computeRemoveDefault(known, actionSet.ids)} confirmLabel="Remove"
          onClose={close}
          onConfirm={(targets) => track(actionSet.id, 'remove', runRemove(resolveTargets(known, targets), actionSet.ids, catalog.byId))} />
      )}
      {action?.kind === 'edit' && actionSet && <EditSetModal set={actionSet} byId={catalog.byId} onClose={close} />}
    </div>
  );
}
