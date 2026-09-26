import { useState } from 'react';
import { useCatalog } from '../roe/catalog';
import { toggleId } from '../roe/selection';
import { runAdd, runRemove } from '../roe/batch';
import { resolveTargets } from '../roe/targets';
import { useCharScope, CharScopeSelect } from '../components/CharScope';
import { ActionBar } from '../components/ActionBar';
import { ResultCards } from '../components/ResultCard';
import { SearchInput, SectionTabs, Chip, HelpTip } from '../ui';
import { useSticky } from '../sticky';
import ActiveTab from './ActiveTab';
import LibraryTab from './LibraryTab';

type Tab = 'active' | 'library';

export default function RecordsView() {
  const catalog = useCatalog();
  const { known, scope, charSelected, setCharSelected } = useCharScope();
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [activeSel, setActiveSel] = useState<number[]>([]);
  const [librarySel, setLibrarySel] = useState<number[]>([]);
  const [remaining, setRemaining] = useSticky<boolean>('records.library.remaining', false);

  const selected = tab === 'active' ? activeSel : librarySel;
  const setSelected = tab === 'active' ? setActiveSel : setLibrarySel;
  const toggle = (id: number) => setSelected((prev) => toggleId(prev, id));
  const clear = () => setSelected([]);

  if (known.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-[15px] font-bold text-fg mb-1">No Characters Connected</div>
          <div className="text-[12px] text-fg-4 leading-relaxed">Load the roexi addon in-game with <span className="text-fg-3">//lua load roexi</span>. Each character's records appear here as soon as it connects.</div>
        </div>
      </div>
    );
  }
  if (!catalog) {
    return <div className="p-6 text-center text-[12px] text-fg-4">Loading objective catalog…</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter objectives…"
            className="bg-field border border-line rounded-md px-3 py-1.5 text-xs text-fg-2 placeholder-fg-4 outline-none focus:border-accent/50 transition-colors" />
          {tab === 'library' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Chip on={remaining} onChange={setRemaining}>Remaining</Chip>
              <HelpTip align="end" text="Remaining: only show objectives this character could still add. Hides ones that are completed, already active, or that the game refused (locked?). In All mode, shows anything at least one character could still add." />
            </div>
          )}
        </div>
        <CharScopeSelect known={known} charSelected={charSelected} setCharSelected={setCharSelected} />
        <SectionTabs value={tab} onChange={setTab} tabs={[{ id: 'active', label: 'Active' }, { id: 'library', label: 'Library' }]} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <ResultCards byId={catalog.byId} />
        {tab === 'active'
          ? <ActiveTab known={known} scope={scope} charSelected={charSelected} byId={catalog.byId} query={query}
              selected={activeSel} onToggle={toggle} clearSelected={() => setActiveSel([])} />
          : <LibraryTab catalog={catalog} scope={scope} query={query} selected={librarySel} onToggle={toggle} remaining={remaining} />}
      </div>
      <ActionBar known={scope} selectedIds={selected} byId={catalog.byId} showRemove={tab === 'active'}
        onAdd={(targets) => { void runAdd(resolveTargets(scope, targets), selected, catalog.byId); clear(); }}
        onRemove={(targets) => { void runRemove(resolveTargets(scope, targets), selected); clear(); }}
        onClear={clear} />
    </div>
  );
}
