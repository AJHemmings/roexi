import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { computeRemoveDefault, resolveTargets } from '../roe/targets';
import { runRemove } from '../roe/batch';
import type { KnownChar } from '../roe/types';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Per-row overflow menu for Active tab rows (redesign §5): "Remove from this character" (single-
 * character mode only), "Remove from multiple" (opens the row's TargetPickerModal via onOpenPicker),
 * "Remove from all" (removes directly, no modal). Built as an extensible item list so a future
 * "Add to Set" item slots in without restructuring — not built now, since Sets doesn't exist.
 *
 * Follows Select's self-contained portal + flip-positioning pattern (ui.tsx) rather than the
 * overlay.tsx Popover primitive: Popover has no real call sites in this codebase yet, so building
 * on it would be its first real integration rather than a proven pattern.
 *
 * "Remove from multiple"/"Remove from all" act against every character who has the objective
 * active — not just the current dropdown scope — so they need the full `known` roster, not `scope`. */
export function RowMenu({ id, known, charSelected, onOpenPicker }: {
  id: number;
  known: KnownChar[];
  charSelected: string | null;
  onOpenPicker: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number; up: boolean } | null>(null);

  const removeNames = computeRemoveDefault(known, [id]);
  const removeTargets = resolveTargets(known, removeNames);
  const canRemoveAll = removeTargets.length > 0;
  const theChar = charSelected === null ? null : known.find((c) => c.name === charSelected) ?? null;
  const canRemoveThisChar = !!theChar && theChar.active.some((a) => a.id === id);

  const items: { key: string; label: string; disabled: boolean; onClick: () => void }[] = [];
  if (charSelected !== null) {
    items.push({ key: 'this', label: 'Remove from this character', disabled: !canRemoveThisChar, onClick: () => { if (theChar) void runRemove([theChar], [id]); } });
  }
  items.push({ key: 'multi', label: 'Remove from multiple', disabled: !canRemoveAll, onClick: onOpenPicker });
  items.push({ key: 'all', label: 'Remove from all', disabled: !canRemoveAll, onClick: () => void runRemove(removeTargets, [id]) });

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const menuH = items.length * 28 + 8;
      const up = r.bottom + menuH > window.innerHeight && r.top > menuH;
      setPos({ right: window.innerWidth - r.right, top: up ? r.top : r.bottom, up });
    }
    const onScroll = (e: Event) => { if (menu.current?.contains(e.target as Node)) return; setOpen(false); };
    const onResize = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [open, items.length]);

  const menuStyle: CSSProperties = pos ? { right: pos.right, top: pos.up ? undefined : pos.top + 4, bottom: pos.up ? window.innerHeight - pos.top + 4 : undefined } : {};

  return (
    <>
      <button ref={btn} type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label="Row actions" className="le-tap text-fg-4 hover:text-fg-2">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {pos && createPortal(
        <>
          {open && <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />}
          <AnimatePresence>
            {open && (
              <motion.div ref={menu} className="fixed z-[61] w-48 rounded-md bg-[var(--color-bg)] border border-line-2 shadow-2xl py-1" style={menuStyle}
                initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.97 }} transition={{ duration: 0.14, ease: EASE_OUT }}>
                {items.map((it) => (
                  <button key={it.key} type="button" disabled={it.disabled} onMouseDown={(e) => { e.preventDefault(); if (it.disabled) return; it.onClick(); setOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-fg-2 hover:bg-accent hover:text-on-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-fg-2 transition-colors">
                    {it.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
