import { Spinner } from './Spinner';
import { usePending, isCharBusy } from '../roe/pending';
import { MAX_ACTIVE } from '../roe/types';
import type { KnownChar } from '../roe/types';

/** Pinned to the top of the Records scroll area (RecordsView's overflow-y-auto div) so each character's
 * slot usage stays visible while the list scrolls. Single-character mode keeps the original
 * "Name — X/30 active" line; All mode shows one compact chip per character. Offline characters are
 * dimmed because their count is the last one they reported, not live. The -mx-3/px-4 cancels the
 * scroll area's px-3 so rows can't show through at the edges; the solid background is what hides
 * rows scrolling underneath. Spec §4.6. */
export function ActiveCountHeader({ scope, single }: { scope: KnownChar[]; single: boolean }) {
  const pending = usePending();
  const countCls = (c: KnownChar) => (c.active.length >= MAX_ACTIVE ? 'text-amber-300' : '');
  return (
    <div className="sticky top-0 z-10 -mx-3 px-4 py-1.5 bg-[var(--color-bg)] border-b border-line">
      {single ? (
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-fg-2">
          <span>{scope[0].name} — <span className={`tabular-nums ${countCls(scope[0])}`}>{scope[0].active.length}/{MAX_ACTIVE}</span> active</span>
          {isCharBusy(pending, scope[0].name) && <Spinner />}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {scope.map((c) => (
            <span key={c.name} title={`${c.name}: ${c.active.length}/${MAX_ACTIVE} active${c.active.length >= MAX_ACTIVE ? ' (full)' : ''}${c.online ? '' : ' (offline, last known)'}`} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-2 ${c.online ? '' : 'opacity-50'}`}>
              {isCharBusy(pending, c.name)
                ? <Spinner className="w-2 h-2" />
                : <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${c.online ? 'bg-emerald-400' : 'bg-fg-4'}`} />}
              {c.name}
              <span className={`tabular-nums ${countCls(c) || 'text-fg-4'}`}>{c.active.length}/{MAX_ACTIVE}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
