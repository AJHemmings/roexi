import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type DropdownItem = { key: string; label: string; disabled?: boolean; onClick: () => void };

/** Self-contained portal + flip-positioning dropdown: a trigger button that opens a small item
 * list, flipping upward when there isn't room below. Extracted from RowMenu (Active tab's
 * per-row three-dot menu), which was the first thing in this codebase to need this chrome —
 * ActionBar's "Save to set" button is the second, hence the extraction. Deliberately not built on
 * overlay.tsx's Popover: Popover positions/animates a panel against an anchor but has no built-in
 * trigger wiring, click-away dismissal, or item-list rendering, so building this on top of it
 * would mean re-adding most of what Dropdown provides anyway. */
export function Dropdown({ trigger, items, menuWidth = 'w-48' }: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  items: DropdownItem[];
  menuWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number; up: boolean } | null>(null);

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
      {trigger({ onClick: (e) => { e.stopPropagation(); setOpen((o) => !o); }, ref: btn })}
      {pos && createPortal(
        <>
          {open && <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />}
          <AnimatePresence>
            {open && (
              <motion.div ref={menu} className={`fixed z-[61] ${menuWidth} rounded-md bg-[var(--color-bg)] border border-line-2 shadow-2xl py-1`} style={menuStyle}
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
