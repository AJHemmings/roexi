// Lists the objectives behind the selected matrix cell (spec 2026-09-28 §4.2). Read-only.
import { useState } from 'react';
import { Segmented } from '../ui';
import { doneState } from '../roe/bitmap';
import { isCompleted } from '../roe/completion';
import type { KnownChar, CatalogEntry } from '../roe/types';

type Filter = 'all' | 'done' | 'left';

export function Explorer({ char, title, entries }: { char: KnownChar | undefined; title: string; entries: CatalogEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  if (!char) return <div className="p-4 text-[12px] text-fg-4">Pick a cell in the matrix to see its objectives.</div>;
  const rows = [...entries].sort((a, b) => a.n.localeCompare(b.n)).filter((e) => {
    const done = isCompleted(char, e.id);
    return filter === 'all' || (filter === 'done' ? done : !done);
  });
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-fg-2 truncate">{char.name} · {title}</span>
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ v: 'all', label: 'All' }, { v: 'done', label: 'Done' }, { v: 'left', label: 'Left' }]} />
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-fg-4">Nothing here.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((e) => {
            const st = isCompleted(char, e.id) ? 'done' : doneState(char, e.id) === 'unknown' ? 'unknown' : 'left';
            return (
              <li key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <span className={`w-4 text-center ${st === 'done' ? 'text-emerald-400' : 'text-fg-4'}`} aria-label={st}>{st === 'done' ? '✓' : st === 'unknown' ? '?' : '○'}</span>
                <span className={`truncate ${st === 'done' ? 'text-fg-3' : 'text-fg-2'}`}>{e.n}</span>
                {char.gameLocked?.has(e.id) && <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-field text-fg-4">Locked</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
