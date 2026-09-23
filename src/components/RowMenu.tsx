import { useState } from 'react';
import { addBlockReason, computeRemoveDefault, resolveTargets } from '../roe/targets';
import { runAdd, runRemove } from '../roe/batch';
import { usePending, isCharBusy, anyBusy } from '../roe/pending';
import { Dropdown, type DropdownItem } from './Dropdown';
import { CreateSetModal, SaveToExistingSetModal } from './SetModals';
import { useSets } from '../roe/sets';
import type { KnownChar, CatalogEntry } from '../roe/types';

/** Per-row overflow menu for Active tab rows, in three groups:
 * - Remove: "…from this character" (single-character mode only), "…from multiple" (opens ActiveTab's
 *   lifted Remove picker), "…from all" (direct).
 * - Add: "Add to multiple" (opens ActiveTab's lifted Add picker), "Add to all" (direct, to every
 *   character addBlockReason says can take it). There's no "Add to this character": in single mode
 *   this tab only lists objectives that character already has, so it would always be disabled.
 * - Sets (Plan 3): "Create new set"/"Save to existing set", shown on every row once anything is
 *   checked, acting on the whole checkbox selection rather than this row's id.
 *
 * Remove and Add both act on the full `known` roster, not the dropdown `scope`. "…this"/"…all" items
 * are disabled while any of their targets has a batch in flight (spec §4.7); "…multiple" items aren't,
 * because the picker they open enforces that itself. */
export function RowMenu({ id, known, charSelected, selectedIds, byId, onOpenRemovePicker, onOpenAddPicker, onClearSelected }: {
  id: number;
  known: KnownChar[];
  charSelected: string | null;
  selectedIds: number[];
  byId: Map<number, CatalogEntry>;
  onOpenRemovePicker: () => void;
  onOpenAddPicker: () => void;
  onClearSelected: () => void;
}) {
  const [setModal, setSetModal] = useState<'create' | 'existing' | null>(null);
  const sets = useSets();
  const pending = usePending();
  const removeNames = computeRemoveDefault(known, [id]);
  const removeTargets = resolveTargets(known, removeNames);
  const canRemoveAll = removeTargets.length > 0;
  const theChar = charSelected === null ? null : known.find((c) => c.name === charSelected) ?? null;
  const canRemoveThisChar = !!theChar && theChar.active.some((a) => a.id === id);
  const addTargets = known.filter((c) => addBlockReason(c, id, byId) === null);
  const canAdd = addTargets.length > 0;

  const items: DropdownItem[] = [];
  if (charSelected !== null) {
    items.push({ key: 'this', label: 'Remove from this character', disabled: !canRemoveThisChar || (!!theChar && isCharBusy(pending, theChar.name)), onClick: () => { if (theChar) void runRemove([theChar], [id]); } });
  }
  items.push({ key: 'multi', label: 'Remove from multiple', disabled: !canRemoveAll, onClick: onOpenRemovePicker });
  items.push({ key: 'all', label: 'Remove from all', disabled: !canRemoveAll || anyBusy(pending, removeNames), onClick: () => void runRemove(removeTargets, [id]) });
  items.push({ key: 'add-multi', label: 'Add to multiple', separatorBefore: true, disabled: !canAdd, onClick: onOpenAddPicker });
  items.push({ key: 'add-all', label: 'Add to all', disabled: !canAdd || anyBusy(pending, addTargets.map((c) => c.name)), onClick: () => void runAdd(addTargets, [id], byId) });
  if (selectedIds.length > 0) {
    items.push({ key: 'set-create', label: 'Create new set', separatorBefore: true, onClick: () => setSetModal('create') });
    items.push({ key: 'set-existing', label: 'Save to existing set', disabled: sets.length === 0, onClick: () => setSetModal('existing') });
  }

  return (
    <>
      <Dropdown items={items} trigger={({ onClick, ref }) => (
        <button ref={ref} type="button" onClick={onClick} aria-label="Row actions" className="le-tap text-fg-4 hover:text-fg-2">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
        </button>
      )} />
      {setModal === 'create' && <CreateSetModal ids={selectedIds} byId={byId} onSaved={onClearSelected} onClose={() => setSetModal(null)} />}
      {setModal === 'existing' && <SaveToExistingSetModal ids={selectedIds} byId={byId} onSaved={onClearSelected} onClose={() => setSetModal(null)} />}
    </>
  );
}
