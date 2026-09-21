import { useState } from 'react';
import { Modal } from '../overlay';
import { useSets, createSet, updateSet, validateSetName, mergeIds } from '../roe/sets';

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
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">Create new set</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Set name"
            className="w-full px-3 py-2 text-[13px] rounded-md bg-field border border-line text-fg placeholder:text-fg-4 focus:outline-none focus:border-accent" />
          {error && <div className="text-[11px] text-red-300/90">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button disabled={!name || !!validateSetName(sets, name)}
              onClick={() => { createSet(name, ids); onSaved(); close(); }}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
          </div>
        </div>
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
