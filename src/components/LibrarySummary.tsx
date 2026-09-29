// Per-character One-time completion chips above the Library list. Figures are identical to
// Stats -> Completion -> One-time -> Overall (spec 2026-09-28 §4.4).
import { useId, useMemo, useState } from 'react';
import { quickStats, left, type Tally } from '../roe/completion';
import { UNKNOWN_HELP } from '../roe/copy';
import { HelpTip } from '../ui';
import { Modal } from '../overlay';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const breakdown = (t: Tally) =>
  [`${t.done} done`, `${left(t)} left`, t.unknown ? `${t.unknown} unknown` : ''].filter(Boolean).join(' · ');

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-4">{label}</span>
      <span className="text-2xl font-bold text-fg tabular-nums">{value}</span>
    </div>
  );
}

function StatsModal({ c, t, onClose }: { c: KnownChar; t: Tally; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-fg">{c.name} stats</span>
            <span className="text-[11px] text-fg-4">One-time objectives</span>
          </div>
          <div className="flex items-center justify-center gap-8 py-2">
            <Figure label="Completed" value={t.done} />
            <Figure label="Left" value={left(t)} />
          </div>
          {t.unknown > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">Unknown {t.unknown} <HelpTip text={UNKNOWN_HELP} /></span>
          )}
          <div className="flex justify-end pt-1">
            <button type="button" onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ScopeChip({ c, t, onOpen }: { c: KnownChar; t: Tally; onOpen: () => void }) {
  const id = useId();
  return (
    <button type="button" aria-describedby={id} onClick={onOpen} className="group relative px-2 py-0.5 rounded-md bg-field border border-line text-[11px] text-fg-3 outline-none hover:border-accent/50 transition-colors">
      <span className="font-semibold text-fg-2">{c.name}</span>
      <span id={id} role="tooltip" className="pointer-events-none absolute z-50 left-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-surface-raised border border-line px-2 py-1 text-[11px] font-semibold text-fg-2 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">{breakdown(t)}</span>
    </button>
  );
}

export function LibrarySummary({ scope, catalog }: { scope: KnownChar[]; catalog: Catalog }) {
  const rows = useMemo(() => scope.map((c) => ({ c, t: quickStats(c, catalog.entries) })), [scope, catalog]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  if (rows.length === 0) return null;
  // Looked up fresh each render (not captured at click time) so live updates show immediately,
  // and so the modal disappears on its own if the character drops out of scope.
  const selectedRow = selectedName == null ? null : rows.find((r) => r.c.name === selectedName) ?? null;
  return (
    <div className="mb-2 px-1 flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-fg-4">Quick stats</span>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(({ c, t }) => <ScopeChip key={c.name} c={c} t={t} onOpen={() => setSelectedName(c.name)} />)}
      </div>
      {selectedRow && <StatsModal c={selectedRow.c} t={selectedRow.t} onClose={() => setSelectedName(null)} />}
    </div>
  );
}
