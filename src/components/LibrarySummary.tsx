// Per-character done/open/locked counts above the Library list. Spec §4.2.
import { useEffect, useId, useMemo, useState } from 'react';
import { summarize, type Summary } from '../roe/locks';
import { clearLocks } from '../bridge';
import { HelpTip } from '../ui';
import type { Catalog } from '../roe/catalog';
import type { KnownChar } from '../roe/types';

const LOCKED_HELP = "The game refused this when you last tried to add it. It's probably not unlocked yet. You can still retry.";
const UNKNOWN_HELP = "Completion data hasn't loaded for this character yet. Zone once in-game to load it.";

const breakdown = (s: Summary) =>
  [`${s.done} done`, `${s.open} open`, s.locked ? `${s.locked} locked?` : '', s.unknown ? `${s.unknown} unknown` : ''].filter(Boolean).join(' · ');

function Single({ c, s }: { c: KnownChar; s: Summary }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (s.locked === 0) setArmed(false); }, [s.locked]);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-3">
      <span className="font-semibold text-fg-2">{c.name}</span>
      <span>— {s.done} done · {s.open} open</span>
      {s.locked > 0 && <span className="inline-flex items-center gap-1">· {s.locked} locked? <HelpTip text={LOCKED_HELP} /></span>}
      {s.unknown > 0 && <span className="inline-flex items-center gap-1">· {s.unknown} unknown <HelpTip text={UNKNOWN_HELP} /></span>}
      {s.locked > 0 && (armed ? (
        <span className="ml-auto inline-flex items-center gap-2">
          <button onClick={() => setArmed(false)} className="le-tap text-fg-4 hover:text-fg-2 font-semibold">Cancel</button>
          <button onClick={() => { clearLocks(c.name); setArmed(false); }} className="le-tap text-red-300/80 hover:text-red-300 font-semibold">Forget {s.locked} marks</button>
        </span>
      ) : (
        <button onClick={() => setArmed(true)} className="le-tap ml-auto text-fg-4 hover:text-fg-2 font-semibold">Forget locked marks</button>
      ))}
    </div>
  );
}

function ScopeChip({ c, s }: { c: KnownChar; s: Summary }) {
  const id = useId();
  return (
    <span tabIndex={0} aria-describedby={id} className="group relative px-2 py-0.5 rounded-md bg-field border border-line text-[11px] text-fg-3 outline-none">
      <span className="font-semibold text-fg-2">{c.name}</span> {s.open} open
      <span id={id} role="tooltip" className="pointer-events-none absolute z-50 left-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-surface-raised border border-line px-2 py-1 text-[11px] font-semibold text-fg-2 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">{breakdown(s)}</span>
    </span>
  );
}

export function LibrarySummary({ scope, catalog }: { scope: KnownChar[]; catalog: Catalog }) {
  const rows = useMemo(() => scope.map((c) => ({ c, s: summarize(c, catalog.entries, catalog.byId) })), [scope, catalog]);
  if (rows.length === 0) return null;
  if (rows.length === 1) return <div className="mb-2 px-1"><Single key={rows[0].c.name} c={rows[0].c} s={rows[0].s} /></div>;
  return (
    <div className="mb-2 px-1 flex flex-wrap gap-1.5">
      {rows.map(({ c, s }) => <ScopeChip key={c.name} c={c} s={s} />)}
    </div>
  );
}
