import { useState } from 'react';
import { useSets, markApplied } from '../roe/sets';
import { useKnownCharacters } from '../bridge';
import { useCatalog } from '../roe/catalog';
import { resolveTargets } from '../roe/targets';
import { runAdd } from '../roe/batch';
import { TargetPickerModal } from '../components/TargetPicker';
import { ResultCards } from '../components/ResultCard';
import { relTime, useNowTick } from '../reltime';

export default function SetsView() {
  const sets = useSets();
  const known = useKnownCharacters();
  const catalog = useCatalog();
  const [applyId, setApplyId] = useState<string | null>(null);
  useNowTick();

  if (sets.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-[15px] font-bold text-fg mb-1">No Sets Yet</div>
          <div className="text-[12px] text-fg-4 leading-relaxed">Select objectives in Records and choose Save to set → Create new set.</div>
        </div>
      </div>
    );
  }
  if (!catalog) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Loading objective catalog…</div>;
  }

  const onlineKnown = known.filter((c) => c.online);

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">
      <ResultCards byId={catalog.byId} />
      {sets.map((s) => (
        <div key={s.id} className="rounded-xl bg-surface border border-line p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-fg truncate">{s.name}</span>
            <span className="text-[11px] tabular-nums text-fg-4">{s.ids.length} objectives</span>
            <span className="ml-auto text-[11px] text-fg-4">{relTime(s.lastAppliedAt) ?? 'Never applied'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={onlineKnown.length === 0} onClick={() => setApplyId(s.id)}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Apply</button>
          </div>
        </div>
      ))}
      {applyId && (() => {
        const s = sets.find((x) => x.id === applyId)!;
        return (
          <TargetPickerModal known={known} defaultSelected={onlineKnown.map((c) => c.name)} confirmLabel="Apply"
            onClose={() => setApplyId(null)}
            onConfirm={(targets) => { void runAdd(resolveTargets(known, targets), s.ids, catalog.byId); markApplied(s.id); }} />
        );
      })()}
    </div>
  );
}
