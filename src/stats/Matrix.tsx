// Category × character completion matrix (spec 2026-09-28 §4.2). Click a cell to explore it.
import { useState, type ReactNode } from 'react';
import { fraction } from './geometry';
import { ZERO, subKey, type CharCompletion, type Tally } from '../roe/completion';
import { UNKNOWN_HELP } from '../roe/copy';

export type Cell = { char: string; cat: string | null; sub: string | null };
export type MatrixCol = { name: string; online: boolean; color: string; comp: CharCompletion };

function MiniCell({ t, color, selected, onClick, label }: { t: Tally; color: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={selected}
      className={`le-tap w-full flex flex-col gap-1 px-2 py-1.5 rounded-md border text-left transition-colors ${selected ? 'border-accent/70 bg-surface-hover' : 'border-transparent hover:border-line'}`}>
      <div className="h-1.5 w-full rounded-full bg-field border border-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${fraction(t.done, t.total) * 100}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums text-fg-3 whitespace-nowrap">
        {t.done}/{t.total}
        {t.unknown > 0 && <span title={UNKNOWN_HELP} className="ml-1 text-fg-4">?</span>}
      </span>
    </button>
  );
}

export function Matrix({ cols, cats, subsOf, selected, onSelect }: {
  cols: MatrixCol[];
  cats: string[];
  subsOf: (cat: string) => string[];
  selected: Cell | null;
  onSelect: (c: Cell) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (cat: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const isSel = (col: string, cat: string | null, sub: string | null) => selected?.char === col && selected.cat === cat && selected.sub === sub;
  const row = (label: ReactNode, key: string, cat: string | null, sub: string | null, pick: (c: CharCompletion) => Tally) => (
    <tr key={key} className="border-t border-line">
      <th scope="row" className="text-left font-normal align-middle pr-2 py-0.5">{label}</th>
      {cols.map((col) => (
        <td key={col.name} className="px-0.5 py-0.5 min-w-[84px]">
          <MiniCell t={pick(col.comp)} color={col.color} selected={isSel(col.name, cat, sub)}
            label={`${col.name}, ${sub ?? cat ?? 'Overall'}`} onClick={() => onSelect({ char: col.name, cat, sub })} />
        </td>
      ))}
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-bold uppercase tracking-wide text-fg-4 pb-1">Category</th>
            {cols.map((col) => (
              <th key={col.name} className="text-left text-[11px] font-semibold text-fg-2 pb-1 px-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${col.online ? 'bg-emerald-400' : 'bg-fg-4'}`} />{col.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(<span className="font-bold text-fg-2">Overall</span>, '__overall', null, null, (c) => c.overall)}
          {cats.flatMap((cat) => {
            const isOpen = open.has(cat);
            const head = row(
              <button type="button" onClick={() => toggle(cat)} className="le-tap inline-flex items-center gap-1.5 text-fg-2 font-semibold">
                <svg viewBox="0 0 24 24" className={`w-3 h-3 text-fg-4 ${isOpen ? 'rotate-90' : ''}`} style={{ transition: 'transform var(--dur-fast) var(--ease-out)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                {cat}
              </button>,
              cat, cat, null, (c) => c.byCat.get(cat) ?? ZERO,
            );
            if (!isOpen) return [head];
            return [head, ...subsOf(cat).map((sub) =>
              row(<span className="pl-5 text-fg-3">{sub}</span>, subKey(cat, sub), cat, sub, (c) => c.bySub.get(subKey(cat, sub)) ?? ZERO))];
          })}
        </tbody>
      </table>
    </div>
  );
}
