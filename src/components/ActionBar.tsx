import { useState } from 'react';
import { TargetPicker, TargetPickerModal } from './TargetPicker';
import { Dropdown, type DropdownItem } from './Dropdown';
import { CreateSetModal, SaveToExistingSetModal } from './SetModals';
import { computeRemoveDefault } from '../roe/targets';
import { useSets } from '../roe/sets';
import type { KnownChar, CatalogEntry } from '../roe/types';

export function ActionBar({ known, selectedIds, byId, showRemove, onAdd, onRemove, onClear }: {
  known: KnownChar[];
  selectedIds: number[];
  byId: Map<number, CatalogEntry>;
  showRemove: boolean;
  onAdd: (targets: string[]) => void;
  onRemove: (targets: string[]) => void;
  onClear: () => void;
}) {
  const [targets, setTargets] = useState<string[]>(() => known.filter((c) => c.online).map((c) => c.name));
  const [removeModal, setRemoveModal] = useState(false);
  const [setModal, setSetModal] = useState<'create' | 'existing' | null>(null);
  const sets = useSets();
  // The caller (RecordsView) must always render this component unconditionally, never behind
  // `{selectedIds.length > 0 && <ActionBar ... />}`. Returning null here (rather than the caller
  // unmounting us) is what keeps this component at a stable position in the tree across selection
  // round-trips through zero, so `targets` survives instead of resetting to "every online character".
  if (selectedIds.length === 0) return null;

  const removeDefault = computeRemoveDefault(known, selectedIds);

  return (
    <div className="sticky bottom-0 z-10 bg-surface-raised border-t border-line px-3.5 py-3 flex flex-col gap-2">
      <TargetPicker known={known} selected={targets} onChange={setTargets} />
      <div className="flex items-center gap-2">
        <button disabled={targets.length === 0} onClick={() => onAdd(targets)}
          className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Add ({selectedIds.length})</button>
        {showRemove && (
          <button onClick={() => setRemoveModal(true)}
            className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-field border border-line text-fg-2 hover:text-fg transition-colors">Remove ({selectedIds.length})</button>
        )}
        <Dropdown menuWidth="w-44" items={[
          { key: 'create', label: 'Create new set', onClick: () => setSetModal('create') },
          { key: 'existing', label: 'Save to existing set', disabled: sets.length === 0, onClick: () => setSetModal('existing') },
        ] satisfies DropdownItem[]} trigger={({ onClick, ref }) => (
          <button ref={ref} type="button" onClick={onClick}
            className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-field border border-line text-fg-2 hover:text-fg transition-colors">Save to set</button>
        )} />
        <button onClick={onClear} className="le-tap ml-auto px-3 py-1.5 text-[12px] font-semibold rounded-md text-fg-3 hover:text-fg-2 transition-colors">Clear</button>
      </div>
      {removeModal && (
        <TargetPickerModal known={known} defaultSelected={removeDefault} confirmLabel="Remove"
          onConfirm={onRemove} onClose={() => setRemoveModal(false)} />
      )}
      {setModal === 'create' && <CreateSetModal ids={selectedIds} byId={byId} onSaved={onClear} onClose={() => setSetModal(null)} />}
      {setModal === 'existing' && <SaveToExistingSetModal ids={selectedIds} byId={byId} onSaved={onClear} onClose={() => setSetModal(null)} />}
    </div>
  );
}
