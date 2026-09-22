import { useState, useEffect, useLayoutEffect, useCallback, type ReactNode, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function Modal({ onClose, children, panelClass = 'w-[min(94vw,460px)] max-h-[88vh]', backdropClose = true }: { onClose: () => void; children: ReactNode | ((close: () => void) => ReactNode); panelClass?: string; backdropClose?: boolean }) {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  // A modal should only ever cover the app's content area (#main-content in App.tsx), never the
  // custom title bar (drag region, min/max/close) or the nav rail. Positioning is done by a plain,
  // non-animated wrapper div (measured via JS, same technique Dropdown/Popover already use
  // elsewhere in this codebase) around the animate/exit motion.div, which is otherwise untouched —
  // still portaled to document.body exactly as before. An earlier attempt portaled straight into
  // #main-content instead; it measured correctly but broke interaction in the real built app, so
  // this keeps document.body as the portal target and only repositions via the wrapper.
  const measureMain = () => {
    const el = document.getElementById('main-content');
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  };
  const [bounds, setBounds] = useState(measureMain);
  useEffect(() => {
    const onResize = () => setBounds(measureMain());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <div className="fixed z-50" style={{ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }}>
      <AnimatePresence onExitComplete={onClose}>
        {open && (
          <motion.div className="absolute inset-0 grid place-items-center bg-black/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onClick={backdropClose ? close : undefined}>
            <motion.div className={`rounded-xl border border-line bg-surface-raised shadow-xl flex flex-col ${panelClass}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.2, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
              {typeof children === 'function' ? children(close) : children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// Animated height/opacity expand-collapse for disclosure rows.
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div className={className} style={{ overflow: 'hidden' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Popover({ open, children, style, className = '', up = false, anchor }: { open: boolean; children: ReactNode; style?: CSSProperties; className?: string; up?: boolean; anchor?: RefObject<HTMLElement | null> }) {
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !open) return;
    const measure = () => {
      const el = anchor.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const flip = below < 248 && r.top > below;
      setPos({ left: r.left, width: r.width, top: flip ? undefined : r.bottom + 4, bottom: flip ? window.innerHeight - r.top + 4 : undefined });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [anchor, open]);

  if (anchor) {
    const flipUp = pos != null && pos.bottom != null;
    return createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div className={className} style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: 1000, ...style }} initial={{ opacity: 0, y: flipUp ? 4 : -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: flipUp ? 4 : -4, scale: 0.97 }} transition={{ duration: 0.14, ease: EASE_OUT }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    );
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className={className} style={style} initial={{ opacity: 0, y: up ? 4 : -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: up ? 4 : -4, scale: 0.97 }} transition={{ duration: 0.14, ease: EASE_OUT }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
