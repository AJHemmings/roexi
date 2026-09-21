import { useState } from 'react';
import { Modal } from '../overlay';
import { useSets, createSet, updateSet, validateSetName, mergeIds } from '../roe/sets';
import type { RoeSet, CatalogEntry } from '../roe/types';

/** Autofocused name + inline validation, used by both the ActionBar's "Save to set" and RowMenu's
 * copy of the same action. `ids` is the objective-id selection being saved; `onSaved` lets each
 * caller wire its own selection-clearing behavior (ActionBar already has `onClear` in scope,
 * RowMenu's caller uses a `clearSelected` prop — see ActiveTab). */
export function CreateSetModal({ ids, onSaved, onClose }: { ids: number[]; onSaved: () => void; onClose: () => void }) {
  const sets = useSets();
  const [name, setName] = useState('');
  const error = name.length > 0 ? validateSetName(sets, name) : null;

  return (
    <Modal onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => { e.preventDefault(); if (!name || validateSetName(sets, name)) return; createSet(name, ids); onSaved(); close(); }}
          className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">Create new set</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name"
            className="w-full px-3 py-2 text-[13px] rounded-md bg-field border border-line text-fg placeholder:text-fg-4 focus:outline-none focus:border-accent" />
          {error && <div className="text-[11px] text-red-300/90">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button type="submit" disabled={!name || !!validateSetName(sets, name)}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Lists existing sets, single-select, merges `ids` into the chosen one. Caller (ActionBar/
 * RowMenu) should disable the menu item that opens this when useSets() is empty, rather than
 * ever mounting it with nothing to pick. */
export function SaveToExistingSetModal({ ids, onSaved, onClose }: { ids: number[]; onSaved: () => void; onClose: () => void }) {
  const sets = useSets();
  const [target, setTarget] = useState<string | null>(sets[0]?.id ?? null);

  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">Save to existing set</div>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {sets.map((s) => (
              <button key={s.id} onClick={() => setTarget(s.id)}
                className={`le-tap flex items-center justify-between px-3 py-2 text-[12px] rounded-md border transition-colors ${target === s.id ? 'bg-accent text-on-accent border-transparent' : 'bg-field text-fg-2 border-line hover:text-fg'}`}>
                <span className="font-semibold truncate">{s.name}</span>
                <span className="tabular-nums opacity-80">{s.ids.length}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button disabled={!target} onClick={() => {
              if (!target) return;
              const set = sets.find((s) => s.id === target)!;
              updateSet(target, { ids: mergeIds(set.ids, ids) });
              onSaved(); close();
            }} className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Edit is deliberately remove-only for objectives — adding happens from Records via "Save to
 * existing set". Here you can rename the set and prune objectives out with the × buttons; there's
 * no way to add one back from this modal. */
export function EditSetModal({ set, byId, onClose }: { set: RoeSet; byId: Map<number, CatalogEntry>; onClose: () => void }) {
  const sets = useSets();
  const [name, setName] = useState(set.name);
  const [ids, setIds] = useState<number[]>(set.ids);
  const error = name !== set.name && name.length > 0 ? validateSetName(sets, name, set.id) : null;

  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">Edit set</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-[13px] rounded-md bg-field border border-line text-fg focus:outline-none focus:border-accent" />
          {error && <div className="text-[11px] text-red-300/90">{error}</div>}
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {ids.map((id) => (
              <div key={id} className="flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-md bg-field border border-line">
                <span className="flex-1 truncate text-fg-2">{byId.get(id)?.n ?? `Unknown #${id}`}</span>
                <button onClick={() => setIds((prev) => prev.filter((x) => x !== id))} aria-label="Remove from set" className="le-tap text-fg-4 hover:text-red-300">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
                </button>
              </div>
            ))}
            {ids.length === 0 && <div className="text-[11px] text-fg-4 text-center py-2">No objectives left in this set.</div>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button disabled={!name || !!error}
              onClick={() => { updateSet(set.id, { name, ids }); close(); }}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
