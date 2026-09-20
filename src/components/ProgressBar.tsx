import { progressParts } from '../roe/format';
import type { CatalogEntry } from '../roe/types';

/** A filled bar for an active objective with a known goal, or just the bare progress number when
 * the catalog has no goal for this entry (the ~11% wiki-matching gap tracked in the design's §7 —
 * there's no real max to draw a bar against). Used inside the Active tab's expanded per-character
 * detail panel; offline characters render dimmed, matching the app's existing offline convention. */
export function ProgressBar({ p, online, entry }: { p: number; online: boolean; entry?: CatalogEntry }) {
  const { label, fraction } = progressParts(p, entry);
  return (
    <div className={`flex items-center gap-1.5 ${online ? '' : 'opacity-50'}`}>
      {fraction === null ? (
        <span className="text-[11px] tabular-nums text-fg-4">{label}</span>
      ) : (
        <>
          <div className="relative h-1.5 w-20 rounded-full bg-field border border-line overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${fraction * 100}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-fg-4 whitespace-nowrap">{label}</span>
        </>
      )}
    </div>
  );
}
