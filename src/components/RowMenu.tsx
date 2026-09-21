import { useState } from 'react';
import { computeRemoveDefault, resolveTargets } from '../roe/targets';
import { runRemove } from '../roe/batch';
import { Dropdown, type DropdownItem } from './Dropdown';
import { CreateSetModal, SaveToExistingSetModal } from './SetModals';
import { useSets } from '../roe/sets';
import type { KnownChar } from '../roe/types';

/** Per-row overflow menu for Active tab rows (redesign §5): "Remove from this character" (single-
 * character mode only), "Remove from multiple" (opens the row's TargetPickerModal via onOpenPicker),
 * "Remove from all" (removes directly, no modal). Built as an extensible item list — Plan 3 added
 * "Create new set"/"Save to existing set" on top, gated on `selectedIds.length > 0`: once any
 * objectives are checked, every row's three-dot menu (not just checked rows) gains these two
 * items, and they act on the whole current checkbox selection, not just this row's own id.
 *
 * "Remove from multiple"/"Remove from all" act against every character who has the objective
 * active — not just the current dropdown scope — so they need the full `known` roster, not `scope`. */
export function RowMenu({ id, known, charSelected, selectedIds, onOpenPicker, onClearSelected }: {
  id: number;
  known: KnownChar[];
  charSelected: string | null;
  selectedIds: number[];
  onOpenPicker: () => void;
  onClearSelected: () => void;
}) {
  const [setModal, setSetModal] = useState<'create' | 'existing' | null>(null);
  const sets = useSets();
  const removeNames = computeRemoveDefault(known, [id]);
  const removeTargets = resolveTargets(known, removeNames);
  const canRemoveAll = removeTargets.length > 0;
  const theChar = charSelected === null ? null : known.find((c) => c.name === charSelected) ?? null;
  const canRemoveThisChar = !!theChar && theChar.active.some((a) => a.id === id);

  const items: DropdownItem[] = [];
  if (charSelected !== null) {
    items.push({ key: 'this', label: 'Remove from this character', disabled: !canRemoveThisChar, onClick: () => { if (theChar) void runRemove([theChar], [id]); } });
  }
  items.push({ key: 'multi', label: 'Remove from multiple', disabled: !canRemoveAll, onClick: onOpenPicker });
  items.push({ key: 'all', label: 'Remove from all', disabled: !canRemoveAll, onClick: () => void runRemove(removeTargets, [id]) });
  if (selectedIds.length > 0) {
    items.push({ key: 'set-create', label: 'Create new set', onClick: () => setSetModal('create') });
    items.push({ key: 'set-existing', label: 'Save to existing set', disabled: sets.length === 0, onClick: () => setSetModal('existing') });
  }

  return (
    <>
      <Dropdown items={items} trigger={({ onClick, ref }) => (
        <button ref={ref} type="button" onClick={onClick} aria-label="Row actions" className="le-tap text-fg-4 hover:text-fg-2">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
        </button>
      )} />
      {setModal === 'create' && <CreateSetModal ids={selectedIds} onSaved={onClearSelected} onClose={() => setSetModal(null)} />}
      {setModal === 'existing' && <SaveToExistingSetModal ids={selectedIds} onSaved={onClearSelected} onClose={() => setSetModal(null)} />}
    </>
  );
}
