import { useKnownCharacters } from '../bridge';
import { relTime, useNowTick } from '../reltime';
import { MAX_ACTIVE } from '../roe/types';

export default function RecordsView() {
  const chars = useKnownCharacters();
  useNowTick();
  if (chars.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-[15px] font-bold text-fg mb-1">No Characters Connected</div>
          <div className="text-[12px] text-fg-4 leading-relaxed">Load the roexi addon in-game with <span className="text-fg-3">//lua load roexi</span>. Each character's records appear here as soon as it connects.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-2">
      {chars.map((c) => (
        <div key={c.name} className="rounded-xl bg-surface border border-line px-3.5 py-2.5 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.online ? 'bg-emerald-400' : 'bg-fg-4'}`} />
          <span className="text-[13px] font-semibold text-fg-2 truncate">{c.name}</span>
          {c.main && <span className="text-[11px] text-fg-4">{[c.main, c.sub].filter(Boolean).join('/')}</span>}
          <span className="ml-auto text-[11px] tabular-nums text-fg-3">{c.active.length}/{MAX_ACTIVE} active</span>
          {!c.online && c.activeAt && <span className="text-[10px] text-fg-4">· {relTime(c.activeAt)}</span>}
        </div>
      ))}
    </div>
  );
}
