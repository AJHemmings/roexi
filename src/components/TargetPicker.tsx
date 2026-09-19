import { useState } from 'react';
import { Chip } from '../ui';
import { Modal } from '../overlay';
import type { KnownChar } from '../roe/types';

export function TargetPicker({ known, selected, onChange }: { known: KnownChar[]; selected: string[]; onChange: (names: string[]) => void }) {
  const online = known.filter((c) => c.online);
  const allSelected = online.length > 0 && online.every((c) => selected.includes(c.name));
  const toggleAll = () => onChange(allSelected ? [] : online.map((c) => c.name));
  const toggleOne = (name: string) => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip on={allSelected} onChange={toggleAll} disabled={online.length === 0}>All</Chip>
      {known.map((c) => (
        <Chip key={c.name} on={selected.includes(c.name)} disabled={!c.online} title={c.online ? undefined : 'Offline'} onChange={() => toggleOne(c.name)}>{c.name}</Chip>
      ))}
    </div>
  );
}

/** A TargetPicker inside a Modal with its own Cancel/Confirm, used wherever a single click
 * (a row's Remove button, or the bulk Remove(N) button) needs a smart-preselected target list
 * instead of reusing whatever the inline ActionBar picker currently has selected. */
export function TargetPickerModal({ known, defaultSelected, confirmLabel, onConfirm, onClose }: {
  known: KnownChar[];
  defaultSelected: string[];
  confirmLabel: string;
  onConfirm: (targets: string[]) => void;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState(defaultSelected);
  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">Choose characters</div>
          <TargetPicker known={known} selected={targets} onChange={setTargets} />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button disabled={targets.length === 0} onClick={() => { onConfirm(targets); close(); }}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{confirmLabel}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
