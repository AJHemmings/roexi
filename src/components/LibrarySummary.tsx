// Per-character done/open/locked counts above the Library list. Spec §4.2.
import { useEffect, useId, useMemo, useState } from 'react';
import { summarize, type Summary } from '../roe/locks';
import { clearLocks } from '../bridge';
import { HelpTip } from '../ui';
import { Modal } from '../overlay';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const LOCKED_HELP = "The game refused this when you last tried to add it. It's probably not unlocked yet. You can still retry.";
const UNKNOWN_HELP = "Completion data hasn't loaded for this character yet. Zone once in-game to load it.";

const breakdown = (s: Summary) =>
  [`${s.done} done`, `${s.open} open`, s.locked ? `${s.locked} locked?` : '', s.unknown ? `${s.unknown} unknown` : ''].filter(Boolean).join(' · ');

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-4">{label}</span>
      <span className="text-2xl font-bold text-fg tabular-nums">{value}</span>
    </div>
  );
}

function StatsModal({ c, s, onClose }: { c: KnownChar; s: Summary; onClose: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (s.locked === 0) setArmed(false); }, [s.locked]);
  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-fg">{c.name} stats</div>
          <div className="flex items-center justify-center gap-8 py-2">
            <Figure label="Completed" value={s.done} />
            <Figure label="Open" value={s.open} />
          </div>
          {(s.locked > 0 || s.unknown > 0) && (
            <div className="flex flex-col gap-1 text-[11px] text-fg-3">
              {s.locked > 0 && <span className="inline-flex items-center gap-1">Locked? {s.locked} <HelpTip text={LOCKED_HELP} /></span>}
              {s.unknown > 0 && <span className="inline-flex items-center gap-1">Unknown {s.unknown} <HelpTip text={UNKNOWN_HELP} /></span>}
            </div>
          )}
          {s.locked > 0 && (armed ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setArmed(false)} className="le-tap text-fg-4 hover:text-fg-2 font-semibold text-[12px]">Cancel</button>
              <button onClick={() => { clearLocks(c.name); setArmed(false); }} className="le-tap text-red-300/80 hover:text-red-300 font-semibold text-[12px]">Forget {s.locked} marks</button>
            </div>
          ) : (
            <button onClick={() => setArmed(true)} className="le-tap self-start text-fg-4 hover:text-fg-2 font-semibold text-[12px]">Forget locked marks</button>
          ))}
          <div className="flex justify-end pt-1">
            <button type="button" onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ScopeChip({ c, s, onOpen }: { c: KnownChar; s: Summary; onOpen: () => void }) {
  const id = useId();
  return (
    <button type="button" aria-describedby={id} onClick={onOpen} className="group relative px-2 py-0.5 rounded-md bg-field border border-line text-[11px] text-fg-3 outline-none hover:border-accent/50 transition-colors">
      <span className="font-semibold text-fg-2">{c.name}</span> {s.open} open
      <span id={id} role="tooltip" className="pointer-events-none absolute z-50 left-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-surface-raised border border-line px-2 py-1 text-[11px] font-semibold text-fg-2 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">{breakdown(s)}</span>
    </button>
  );
}

export function LibrarySummary({ scope, catalog }: { scope: KnownChar[]; catalog: Catalog }) {
  const rows = useMemo(() => scope.map((c) => ({ c, s: summarize(c, catalog.entries, catalog.byId) })), [scope, catalog]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  if (rows.length === 0) return null;
  // Looked up fresh each render (not captured at click time) so Forget/live updates show immediately,
  // and so the modal disappears on its own if the character drops out of scope.
  const selectedRow = selectedName == null ? null : rows.find((r) => r.c.name === selectedName) ?? null;
  return (
    <div className="mb-2 px-1 flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-fg-4">Stats</span>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(({ c, s }) => <ScopeChip key={c.name} c={c} s={s} onOpen={() => setSelectedName(c.name)} />)}
      </div>
      {selectedRow && <StatsModal c={selectedRow.c} s={selectedRow.s} onClose={() => setSelectedName(null)} />}
    </div>
  );
}
