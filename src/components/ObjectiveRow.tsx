import { useState, type ReactNode } from 'react';
import { Collapse } from '../overlay';
import { CharChips } from './CharChips';
import type { CatalogEntry, KnownChar } from '../roe/types';

export function ObjectiveRow({ id, entry, scope, checkbox, checked, onToggle, countLabel, badges, expanded }: {
  id: number;
  entry?: CatalogEntry;
  scope: KnownChar[];
  checkbox: boolean;
  checked: boolean;
  onToggle: () => void;
  countLabel?: string;
  badges?: ReactNode;
  expanded?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {checkbox && (
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={entry?.n ?? `Unknown #${id}`}
            className="w-4 h-4 shrink-0 accent-[var(--color-slider)]" />
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="le-tap flex-1 min-w-0 flex items-center gap-2 text-left">
          <span className="text-[13px] text-fg-2 truncate">{entry?.n ?? `Unknown #${id}`}</span>
          <span className="text-[10px] text-fg-4 shrink-0">#{id}</span>
          <svg viewBox="0 0 24 24" style={{ transition: 'transform var(--dur-fast) var(--ease-out)' }} className={`w-3.5 h-3.5 shrink-0 text-fg-4 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {badges}
        <CharChips id={id} scope={scope} entry={entry} />
        {countLabel && <span className="text-[11px] tabular-nums text-fg-4 shrink-0">{countLabel}</span>}
      </div>
      {expanded && <Collapse open={open} className="px-3.5 pb-2.5">{expanded}</Collapse>}
    </div>
  );
}
