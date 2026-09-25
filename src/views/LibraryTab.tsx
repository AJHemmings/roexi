import { useMemo } from 'react';
import { useSticky } from '../sticky';
import { Collapse } from '../overlay';
import { ObjectiveRow } from '../components/ObjectiveRow';
import { CharChips } from '../components/CharChips';
import { doneState } from '../roe/bitmap';
import { formatProgress } from '../roe/format';
import { showInRemaining } from '../roe/locks';
import { relTime } from '../reltime';
import type { Catalog } from '../roe/catalog';
import type { KnownChar, CatalogEntry } from '../roe/types';

function GroupHeader({ name, count, open, onToggle }: { name: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="le-tap w-full flex items-center gap-2 px-3.5 py-2 text-left">
      <svg viewBox="0 0 24 24" style={{ transition: 'transform var(--dur-fast) var(--ease-out)' }} className={`w-3.5 h-3.5 shrink-0 text-fg-4 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
      <span className="text-[12px] font-bold text-fg-2">{name}</span>
      <span className="ml-auto text-[10px] tabular-nums text-fg-4">{count}</span>
    </button>
  );
}

function Badges({ entry }: { entry?: CatalogEntry }) {
  if (!entry) return null;
  return (
    <>
      {entry.auto && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-field text-fg-4">Daily</span>}
      {entry.repeat && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-field text-fg-4">Repeat</span>}
    </>
  );
}

// Spec §8.8: expanding a Library row shows the objective text plus each scoped character's
// active/done state (the collapsed row's CharChips only shows active status, not completion).
function ExpandedLibrary({ id, entry, scope }: { id: number; entry?: CatalogEntry; scope: KnownChar[] }) {
  return (
    <div className="flex flex-col gap-1.5 text-[11px] text-fg-3">
      {entry?.text && <p className="leading-relaxed">{entry.text}</p>}
      {scope.map((c) => {
        const active = c.active.find((a) => a.id === id);
        const done = doneState(c, id);
        const refusedAt = c.locked?.get(id);
        const doneLabel = done === 'done' ? 'completed'
          : refusedAt != null ? `locked? · refused ${relTime(refusedAt)}`
          : done === 'unknown' ? 'completion unknown' : 'not completed';
        return (
          <div key={c.name} className="flex items-center gap-2">
            <span className="font-semibold shrink-0">{c.name}</span>
            <span className="text-fg-4">{active ? `active ${formatProgress(active.p, entry)}` : 'not active'}</span>
            <span className="text-fg-4">· {doneLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function LibraryTab({ catalog, scope, query, selected, onToggle, remaining }: {
  catalog: Catalog;
  scope: KnownChar[];
  query: string;
  selected: number[];
  onToggle: (id: number) => void;
  remaining: boolean;
}) {
  const [openGroups, setOpenGroups] = useSticky<Record<string, boolean>>('records.library.groups', {});
  const q = query.trim();
  const matchIds = useMemo(() => new Set(catalog.search(q).map((e) => e.id)), [catalog, q]);
  const visible = (id: number) => (!q || matchIds.has(id)) && (!remaining || showInRemaining(scope, id, catalog.byId));

  const toggleGroup = (key: string) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col gap-3">
      {catalog.tree.map((cat) => {
        const catIds = [...cat.subs.values()].flat();
        const catMatches = catIds.filter(visible);
        if (catMatches.length === 0) return null;
        const catKey = cat.name;
        const catOpen = q ? true : (openGroups[catKey] ?? false);
        return (
          <div key={catKey} className="rounded-xl bg-surface border border-line overflow-hidden">
            <GroupHeader name={cat.name} count={catMatches.length} open={catOpen} onToggle={() => toggleGroup(catKey)} />
            <Collapse open={catOpen}>
              <div className="divide-y divide-line border-t border-line">
                {[...cat.subs.entries()].map(([subName, ids]) => {
                  const subMatches = ids.filter(visible).sort((a, b) => (catalog.byId.get(a)?.n ?? '').localeCompare(catalog.byId.get(b)?.n ?? ''));
                  if (subMatches.length === 0) return null;
                  const subKey = `${catKey}::${subName}`;
                  const subOpen = q ? true : (openGroups[subKey] ?? false);
                  return (
                    <div key={subKey}>
                      <GroupHeader name={subName} count={subMatches.length} open={subOpen} onToggle={() => toggleGroup(subKey)} />
                      <Collapse open={subOpen}>
                        <div className="divide-y divide-line border-t border-line">
                          {subMatches.map((id) => {
                            const entry = catalog.byId.get(id);
                            const eligible = scope.filter((c) => doneState(c, id) !== 'unknown');
                            const doneCount = eligible.filter((c) => doneState(c, id) === 'done').length;
                            const activeCount = scope.filter((c) => c.active.some((a) => a.id === id)).length;
                            const dim = entry?.repeat === false && scope.length > 0 && scope.every((c) => doneState(c, id) === 'done');
                            return (
                              <div key={id} className={dim ? 'opacity-50' : undefined}>
                                <ObjectiveRow id={id} entry={entry} checkbox={!entry?.auto}
                                  checked={selected.includes(id)} onToggle={() => onToggle(id)}
                                  countLabel={`active ${activeCount}/${scope.length} · done ${doneCount}/${eligible.length}`}
                                  badges={<Badges entry={entry} />}
                                  chips={<CharChips id={id} scope={scope} entry={entry} />}
                                  expanded={<ExpandedLibrary id={id} entry={entry} scope={scope} />} />
                              </div>
                            );
                          })}
                        </div>
                      </Collapse>
                    </div>
                  );
                })}
              </div>
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}
