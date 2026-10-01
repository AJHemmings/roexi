import { useState } from 'react';
import { Modal, Collapse } from '../overlay';
import { Select } from '../ui';
import { useSets, replaceAllSets } from '../roe/sets';
import { planImport, validateImport, buildImportedSets, type RoeProfile, type ImportRow, type ImportChoice, type ExistingEdits, type IdMatch } from '../roe/importRoe';
import type { RoeSet, CatalogEntry } from '../roe/types';
import { RemovableIdList } from './SetModals';

const LABEL: Record<ImportChoice, string> = { import: 'Import', skip: 'Skip', keepBoth: 'Keep both', keepImported: 'Keep imported', keepExisting: 'Keep existing' };
const MATCHED: ImportChoice[] = ['keepBoth', 'keepImported', 'keepExisting'];
const UNMATCHED: ImportChoice[] = ['import', 'skip'];
const inputCls = 'w-full px-3 py-1.5 text-[12px] rounded-md bg-field border border-line text-fg focus:outline-none focus:border-accent';
const errCls = 'text-[11px] text-red-300/90';

type Edit = { name: string; ids: number[] };

/** Name field + removable objectives for one set that survives the import. */
function SetEditor({ label, value, onName, onRemove, byId, error }: { label: string; value: Edit; onName: (v: string) => void; onRemove: (id: number) => void; byId: Map<number, CatalogEntry>; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold text-fg-3">{label}</div>
      <input value={value.name} onChange={(e) => onName(e.target.value)} aria-label={`${label} name`} className={inputCls} />
      {error && <div className={errCls}>{error}</div>}
      <RemovableIdList ids={value.ids} byId={byId} onRemove={onRemove} maxH="max-h-40" />
    </div>
  );
}

/** Read-only list of objective names under a heading with a count. */
function IdGroup({ title, ids, byId }: { title: string; ids: number[]; byId: Map<number, CatalogEntry> }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[11px] font-semibold text-fg-3">{title} <span className="tabular-nums text-fg-4">({ids.length})</span></div>
      <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
        {/* shrink-0: without it, flex squeezes every row shorter to fit max-h instead of scrolling,
            and truncate's overflow:hidden lets the rows overlap. */}
        {ids.map((id) => <div key={id} className="shrink-0 text-[11px] text-fg-2 truncate" title={byId.get(id)?.n}>{byId.get(id)?.n ?? `Unknown #${id}`}</div>)}
        {ids.length === 0 && <div className="text-[11px] text-fg-4">None</div>}
      </div>
    </div>
  );
}

/** Preview of a roe settings.xml import. Nothing is written until Import; Cancel discards every
 * choice, rename and trim, including those made to existing sets. All decisions are made by the
 * pure functions in roe/importRoe.ts — this component only holds rows + edits and renders them. */
export function ImportRoeModal({ profiles, byId, onClose }: { profiles: RoeProfile[]; byId: Map<number, CatalogEntry>; onClose: () => void }) {
  const sets = useSets();
  const [rows, setRows] = useState<ImportRow[]>(() => planImport(sets, profiles));
  const [edits, setEdits] = useState<ExistingEdits>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const v = validateImport(sets, rows, edits);

  const patchRow = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const editOf = (s: RoeSet): Edit => edits[s.id] ?? { name: s.name, ids: s.ids };
  const patchEdit = (s: RoeSet, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [s.id]: { ...(e[s.id] ?? { name: s.name, ids: s.ids }), ...patch } }));
  const claimedByOther = (setId: string, key: string) => rows.some((r) => r.key !== key && r.choice === 'keepImported' && r.targetId === setId);

  return (
    // Height is capped against the window (vh), not the parent (%): Modal's backdrop is a grid whose
    // row grows with its content, so a % max-height never binds and the body would never scroll.
    // 2rem = the backdrop's p-4 padding, top + bottom.
    <Modal onClose={onClose} panelClass="w-full max-w-[580px] max-h-[calc(100vh-2rem)]">
      {(close) => (
        <>
          <div className="p-4 pb-2 text-[13px] font-bold text-fg">Import roe profiles</div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 flex flex-col gap-2">
            {rows.map((r) => {
              // undefined exactly when the row has no matches; the JSX below gates on `target`, not
              // on matches.length, so TypeScript knows it's set inside those blocks.
              const target: IdMatch | undefined = r.matches.find((m) => m.set.id === r.targetId) ?? r.matches[0];
              const identical = !!target && target.onlyImport.length === 0 && target.onlyExisting.length === 0;
              const unknown = r.profile.ids.filter((id) => !byId.has(id)).length;
              const options = (target ? MATCHED : UNMATCHED).filter((c) => c !== 'keepImported' || !target || !claimedByOther(target.set.id, r.key));
              const usesExisting = r.choice === 'keepBoth' || r.choice === 'keepImported' || r.choice === 'keepExisting';
              const rowErr = v.rowErrors[r.key] ?? (usesExisting && r.targetId ? v.existingErrors[r.targetId] : undefined);
              const open = openKey === r.key;
              return (
                <div key={r.key} className="rounded-lg bg-surface border border-line p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-fg truncate">{r.profile.name}</span>
                    <span className="text-[11px] tabular-nums text-fg-4 whitespace-nowrap">{r.profile.ids.length} objectives{unknown > 0 && ` · ${unknown} not in catalog`}</span>
                    <div className="ml-auto shrink-0 w-[132px]">
                      <Select full value={LABEL[r.choice]} options={options.map((c) => LABEL[c])}
                        onChange={(label) => patchRow(r.key, { choice: options.find((c) => LABEL[c] === label)! })} />
                    </div>
                  </div>
                  {target && (
                    <div className="flex items-center gap-2 text-[11px]">
                      {identical
                        ? <span className="text-fg-3">Already in roexi as '{target.set.name}'</span>
                        : <span className="text-amber-300/90">⚠ Matching records found ({r.matches.map((m) => m.set.name).join(', ')})</span>}
                      <button type="button" onClick={() => setOpenKey(open ? null : r.key)} className="le-tap ml-auto font-semibold text-fg-3 hover:text-fg">{open ? 'Hide ▾' : 'Compare ▸'}</button>
                    </div>
                  )}
                  {r.choice === 'import' && (
                    <input value={r.name} onChange={(e) => patchRow(r.key, { name: e.target.value })} aria-label={`${r.profile.name} name`} className={inputCls} />
                  )}
                  {rowErr && !open && <div className={errCls}>{rowErr}</div>}
                  {target && (
                    <Collapse open={open}>
                      <div className="pt-1.5 flex flex-col gap-2.5">
                        {r.matches.length > 1 && (
                          <div className="flex flex-wrap gap-1">
                            {r.matches.map((m) => (
                              <button key={m.set.id} type="button" onClick={() => patchRow(r.key, { targetId: m.set.id })}
                                className={`le-tap px-2 py-1 text-[11px] font-semibold rounded-md border transition-colors ${m.set.id === target.set.id ? 'bg-accent text-on-accent border-transparent' : 'bg-field text-fg-3 border-line hover:text-fg-2'}`}>
                                {m.set.name} · {m.shared.length}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <IdGroup title="In both" ids={target.shared} byId={byId} />
                          <IdGroup title="Only in import" ids={target.onlyImport} byId={byId} />
                          <IdGroup title={`Only in '${target.set.name}'`} ids={target.onlyExisting} byId={byId} />
                        </div>
                        {r.choice === 'keepBoth' && (
                          <>
                            <SetEditor label="New set" value={{ name: r.name, ids: r.ids }} byId={byId} error={v.rowErrors[r.key]}
                              onName={(name) => patchRow(r.key, { name })} onRemove={(id) => patchRow(r.key, { ids: r.ids.filter((x) => x !== id) })} />
                            <SetEditor label={`Existing set '${target.set.name}'`} value={editOf(target.set)} byId={byId} error={v.existingErrors[target.set.id]}
                              onName={(name) => patchEdit(target.set, { name })} onRemove={(id) => patchEdit(target.set, { ids: editOf(target.set).ids.filter((x) => x !== id) })} />
                          </>
                        )}
                        {r.choice === 'keepImported' && (
                          <SetEditor label={`Replaces '${target.set.name}'`} value={{ name: editOf(target.set).name, ids: r.ids }} byId={byId}
                            error={v.existingErrors[target.set.id] ?? v.rowErrors[r.key]}
                            onName={(name) => patchEdit(target.set, { name })} onRemove={(id) => patchRow(r.key, { ids: r.ids.filter((x) => x !== id) })} />
                        )}
                        {r.choice === 'keepExisting' && (
                          <SetEditor label={`Existing set '${target.set.name}'`} value={editOf(target.set)} byId={byId} error={v.existingErrors[target.set.id]}
                            onName={(name) => patchEdit(target.set, { name })} onRemove={(id) => patchEdit(target.set, { ids: editOf(target.set).ids.filter((x) => x !== id) })} />
                        )}
                      </div>
                    </Collapse>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-4 pt-3 flex justify-end gap-2">
            <button type="button" onClick={close} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
            <button type="button" disabled={!v.ok || v.count === 0}
              onClick={() => { replaceAllSets(buildImportedSets(sets, rows, edits, Date.now(), () => crypto.randomUUID())); close(); }}
              className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Import {v.count} set{v.count === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
