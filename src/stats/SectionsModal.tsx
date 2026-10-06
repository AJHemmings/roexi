// Stats → Completion → Sections: choose which categories and sections are counted (spec 2026-10-06 §3.2).
// Changes apply as they're made; the hidden list lives in the Stats chart prefs.
import { useState } from 'react';
import { Modal } from '../overlay';
import { subKey } from '../roe/completion';
import { categoryState, setCategoryShown, setSectionShown, hideAll } from './sections';

const BTN = 'le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors';

export function SectionsModal({ cats, subsOf, hidden, onChange, onClose }: {
  /** Every category of the selected kinds, hidden ones included. */
  cats: string[];
  subsOf: (cat: string) => string[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleOpen = (cat: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  return (
    <Modal onClose={onClose}>
      {(close) => (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-1">
            <h2 className="mr-auto text-[14px] font-bold text-fg">Sections</h2>
            <button type="button" onClick={() => onChange([])} className={BTN}>Show all</button>
            <button type="button" onClick={() => onChange(hideAll(hidden, cats))} className={BTN}>Hide all</button>
          </div>
          <p className="px-4 pb-2 text-[11px] text-fg-4">Hidden sections are left out of the chart, the matrix, Overall and the Objectives tab.</p>
          <ul className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
            {cats.map((cat) => {
              const st = categoryState(hidden, cat);
              const isOpen = open.has(cat);
              return (
                <li key={cat}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <input type="checkbox" aria-label={cat} checked={st !== 'off'}
                      ref={(el) => { if (el) el.indeterminate = st === 'partial'; }}
                      onChange={(e) => onChange(setCategoryShown(hidden, cat, e.target.checked))}
                      className="w-4 h-4 shrink-0 accent-[var(--color-slider)]" />
                    <button type="button" onClick={() => toggleOpen(cat)} aria-expanded={isOpen}
                      className="le-tap flex-1 min-w-0 flex items-center gap-1.5 text-left text-[12px] font-semibold text-fg-2">
                      <svg viewBox="0 0 24 24" className={`shrink-0 w-3 h-3 text-fg-4 ${isOpen ? 'rotate-90' : ''}`} style={{ transition: 'transform var(--dur-fast) var(--ease-out)' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                      <span className="truncate">{cat}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="pl-8 pb-1">
                      {subsOf(cat).map((sub) => (
                        <li key={sub}>
                          <label className={`flex items-center gap-2 px-2 py-1 text-[12px] ${st === 'off' ? 'text-fg-4' : 'text-fg-3'}`}>
                            <input type="checkbox" disabled={st === 'off'} checked={st !== 'off' && !hidden.includes(subKey(cat, sub))}
                              onChange={(e) => onChange(setSectionShown(hidden, cat, sub, e.target.checked))}
                              className="w-4 h-4 shrink-0 accent-[var(--color-slider)] disabled:opacity-40" />
                            <span className="truncate">{sub}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end px-4 py-3 border-t border-line">
            <button type="button" onClick={close} className={BTN}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
