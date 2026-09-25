import { useState, useRef, useEffect, useId, type ReactNode, type CSSProperties, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

// Text/search input with a built-in clear (×) button once there's text.
export function SearchInput({ value, onChange, className = '', wrap = 'flex-1 min-w-0', ...rest }:
  { value: string; onChange: (v: string) => void; className?: string; wrap?: string }
  & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  return (
    <div className={`relative ${wrap}`}>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className={`w-full ${className}${value ? ' pr-8' : ''}`} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded text-fg-4 hover:text-fg-2 hover:bg-line transition-colors">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
        </button>
      )}
    </div>
  );
}

export const inputClass = 'bg-field border border-line rounded-md px-3 py-1.5 text-xs text-fg-2 placeholder-fg-4 outline-none focus:border-accent/50 transition-colors';

export function Group({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      {(title || right != null) && (
        <h2 className="flex items-center gap-2 px-1 mb-2">
          {title && <span className="w-[3px] h-3.5 rounded-sm bg-accent" />}
          {title && <span className="text-[11px] font-bold tracking-[0.12em] text-fg uppercase">{title}</span>}
          {right != null && <span className="ml-auto min-w-0">{right}</span>}
        </h2>
      )}
      <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">{children}</div>
    </section>
  );
}

// Section sub-tabs: bold uppercase, full-width, accent-filled when active.
export function SectionTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode; dot?: boolean | string }[] }) {
  const gid = useId();
  return (
    <div className="flex items-stretch gap-2">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} className={`le-tap relative flex-1 px-3 py-2 text-[12px] font-bold uppercase tracking-wide rounded-md border transition-colors ${active ? 'text-on-accent border-transparent' : 'bg-field text-fg-2 border-line hover:text-fg'}`}>
            {active && <motion.div layoutId={`sectiontab-${gid}`} className="absolute inset-0 rounded-md bg-accent" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative z-[1]">
              {t.label}
              {t.dot && <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${typeof t.dot === 'string' ? t.dot : 'bg-red-400'}`} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Row({ label, desc, children }: { label: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-fg-2 leading-tight">{label}</div>
        {desc && <div className="text-[11px] text-fg-4 mt-0.5 leading-snug">{desc}</div>}
      </div>
      {children && <div className="ml-auto shrink-0">{children}</div>}
    </div>
  );
}

export function RowStacked({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-2.5">
      <div className="text-[13px] text-fg-2 leading-tight">{label}</div>
      {desc && <div className="text-[11px] text-fg-4 mt-0.5 leading-snug">{desc}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ filter: on && !disabled ? undefined : 'saturate(0.3)' }}
      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-[var(--color-nav-active)]' : 'bg-[var(--color-track)]'}`}>
      <span style={{ background: on ? '#fff' : 'var(--color-knob)', transition: 'transform var(--dur-base) var(--ease-spring)' }} className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, full = false }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`${full ? 'flex w-full' : 'inline-flex'} rounded-lg bg-field border border-line p-0.5`}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`le-tap ${full ? 'flex-1 ' : ''}px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${value === o.v ? 'nav-active' : 'text-fg-3 hover:text-fg-2'}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function Slider({ value, min = 0, max = 100, step, suffix = '', format, onChange }: { value: number; min?: number; max?: number; step?: number; suffix?: string; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 h-1.5 accent-[var(--color-slider)] cursor-pointer" />
      <span className={`text-[11px] tabular-nums text-fg-2 shrink-0 text-right ${format ? 'w-16' : 'w-10'}`}>{format ? format(value) : `${value}${suffix}`}</span>
    </div>
  );
}

// Themed dropdown replacing native <select>; portals the menu so it escapes scroll clipping and flips up near the bottom.
export function Select({ value, onChange, options, full = false, renderOption, renderValue, menuMaxH = 232 }: { value: string; onChange: (v: string) => void; options: string[]; full?: boolean; renderOption?: (v: string) => ReactNode; renderValue?: (v: string) => ReactNode; menuMaxH?: number }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const menuH = Math.min(options.length * 30 + 8, menuMaxH);
      const up = r.bottom + menuH > window.innerHeight && r.top > menuH;
      setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
    }
    const onScroll = (e: Event) => { if (menu.current?.contains(e.target as Node)) return; setOpen(false); };
    const onResize = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [open, options.length, menuMaxH]);

  const menuStyle: CSSProperties = pos ? (pos.up ? { left: pos.left, width: pos.width, bottom: window.innerHeight - pos.top + 4 } : { left: pos.left, width: pos.width, top: pos.top + 4 }) : {};

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} className={`le-tap ${full ? 'w-full ' : ''}flex items-center justify-between gap-2 bg-surface border border-line rounded-md px-2.5 py-1.5 text-xs text-fg-2 outline-none transition-colors hover:border-accent/50`}>
        {renderValue || renderOption ? <span className="flex-1 min-w-0 text-left">{(renderValue ?? renderOption)!(value)}</span> : <span className="truncate">{value}</span>}
        <svg viewBox="0 0 24 24" style={{ transition: 'transform var(--dur-fast) var(--ease-out)' }} className={`w-3.5 h-3.5 shrink-0 text-fg-4 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {pos && createPortal(
        <>
          {open && <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />}
          <AnimatePresence>
            {open && (
              <motion.div ref={menu} className={`fixed z-[61] overflow-y-auto rounded-md bg-[var(--color-bg)] border border-line-2 shadow-2xl py-1 ${pos.up ? 'origin-bottom' : 'origin-top'}`} style={{ ...menuStyle, maxHeight: menuMaxH }}
                initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.97 }} transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}>
                {options.map((o) => (
                  <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }} className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${o === value ? 'bg-accent/20 text-accent font-semibold' : 'text-fg-2 hover:bg-accent hover:text-on-accent'}`}>
                    {renderOption ? renderOption(o) : o}
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

// Clickable on/off pill.
export function Chip({ on, onChange, children, full = false, disabled = false, title }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; full?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button aria-pressed={on} disabled={disabled} title={title} onClick={() => onChange(!on)}
      className={`${full ? 'flex-1 ' : ''}px-3 py-1.5 text-[11px] font-bold rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-accent text-on-accent border-transparent' : 'bg-field text-fg-3 border-line hover:text-fg-2'}`}>
      {children}
    </button>
  );
}

// Themed tooltip chip. Render inside a `group relative` trigger.
export function Tip({ label, side = 'right', compactOnly = false }: { label: string; side?: 'right' | 'bottom' | 'top'; compactOnly?: boolean }) {
  const pos = side === 'right' ? 'left-full ml-2 top-1/2 -translate-y-1/2' : side === 'top' ? 'bottom-full mb-1.5 right-0' : 'top-full mt-1.5 right-0';
  const gate = compactOnly ? 'hidden @max-[460px]:block' : '';
  return (
    <span role="tooltip" className={`pointer-events-none absolute z-50 ${pos} ${gate} whitespace-nowrap rounded-md bg-surface-raised border border-line px-2 py-1 text-[11px] font-semibold text-fg-2 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100`}>{label}</span>
  );
}

// A "?" that explains something in a sentence or two. Unlike Tip it wraps, and it also opens on keyboard focus.
export function HelpTip({ text, side = 'bottom' }: { text: string; side?: 'bottom' | 'top' }) {
  const id = useId();
  const pos = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label="Help" aria-describedby={id}
        className="w-3.5 h-3.5 rounded-full border border-line grid place-items-center text-[9px] font-bold leading-none text-fg-4 hover:text-fg-2 focus-visible:text-fg-2 focus-visible:border-accent/60 outline-none">?</button>
      <span id={id} role="tooltip"
        className={`pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 ${pos} w-max max-w-[240px] whitespace-normal rounded-md bg-surface-raised border border-line px-2 py-1 text-[11px] font-medium leading-snug text-fg-2 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}>{text}</span>
    </span>
  );
}
