import { progressParts } from '../roe/format';
import type { KnownChar, CatalogEntry } from '../roe/types';

/** A filled bar for an active objective with a known goal, or just the bare progress number when
 * the catalog has no goal for this entry (the ~11% wiki-matching gap tracked in the design's §7 —
 * there's no real max to draw a bar against). */
function Bar({ p, online, big, entry }: { p: number; online: boolean; big: boolean; entry?: CatalogEntry }) {
  const { label, fraction } = progressParts(p, entry);
  const w = big ? 'w-16' : 'w-10';
  return (
    <div className={`flex items-center gap-1 ${online ? '' : 'opacity-50'}`}>
      {fraction === null ? (
        <span className="text-[10px] tabular-nums text-fg-4">{label}</span>
      ) : (
        <>
          <div className={`relative h-1.5 ${w} rounded-full bg-field border border-line overflow-hidden`}>
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${fraction * 100}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-fg-4 whitespace-nowrap">{label}</span>
        </>
      )}
    </div>
  );
}

/** Not active: an empty/outline bar, no numbers. Offline: the same shape, dimmed. */
function EmptyBar({ online, big }: { online: boolean; big: boolean }) {
  return <div className={`h-1.5 ${big ? 'w-16' : 'w-10'} rounded-full bg-field border border-line ${online ? '' : 'opacity-50'}`} />;
}

/** Replaces CharChips's text pills for the Active tab only (redesign §4) — CharChips.tsx itself is
 * untouched and still used by Library. One bar per scoped character; a single-character scope gets
 * one larger bar (`big`) instead of the small multi-character size. */
export function ActiveProgress({ id, scope, entry }: { id: number; scope: KnownChar[]; entry?: CatalogEntry }) {
  const big = scope.length === 1;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {scope.map((c) => {
        const a = c.active.find((x) => x.id === id);
        return (
          <span key={c.name} title={c.name}>
            {a ? <Bar p={a.p} online={c.online} big={big} entry={entry} /> : <EmptyBar online={c.online} big={big} />}
          </span>
        );
      })}
    </div>
  );
}
