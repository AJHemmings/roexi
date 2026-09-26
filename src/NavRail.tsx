import type { ReactElement } from 'react';
import { motion } from 'motion/react';
import { Tip } from './ui';

export type Section = 'records' | 'sets' | 'settings';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ICONS: Record<Section, ReactElement> = {
  records:  (<svg viewBox="0 0 24 24" {...S}><path d="M4 4h12l4 4v12H4z" /><path d="M16 4v4h4" /><path d="M8 13h8" /><path d="M8 17h5" /><path d="m8 9 1.5 1.5L12 8" /></svg>),
  sets:     (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7" /><path d="M14 17.5h7" /></svg>),
  settings: (<svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>),
};

const STATS_ICON = (<svg viewBox="0 0 24 24" {...S}><path d="M4 20V10" /><path d="M12 20V4" /><path d="M20 20v-6" /></svg>);

const LABELS: Record<Section, string> = { records: 'Records', sets: 'Sets', settings: 'Settings' };

const railBtn = 'le-tap group relative w-[60px] h-[58px] @max-[460px]:w-11 @max-[460px]:h-11 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors';

function RailButton({ id, active, onSelect }: { id: Section; active: boolean; onSelect: (s: Section) => void }) {
  return (
    <button onClick={() => onSelect(id)} aria-label={LABELS[id]} className={`${railBtn} ${active ? 'text-on-accent' : 'text-fg-3 hover:bg-line hover:text-fg'}`}>
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-[var(--color-nav-active)]" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />}
      <span className="relative z-[1] w-5 h-5">{ICONS[id]}</span>
      <span className="relative z-[1] text-[10px] font-semibold tracking-wide @max-[460px]:hidden">{LABELS[id]}</span>
      <Tip label={LABELS[id]} compactOnly />
    </button>
  );
}

// Placeholder: not wired to any Section yet, so it's disabled rather than routed. Tip shows at all
// widths (not just compactOnly like RailButton) since there's no label text to fall back on either way.
function StatsPlaceholderButton() {
  return (
    <button disabled aria-disabled="true" aria-label="Stats" className={`${railBtn} group text-fg-3 opacity-40 cursor-not-allowed`}>
      <span className="relative z-[1] w-5 h-5">{STATS_ICON}</span>
      <span className="relative z-[1] text-[10px] font-semibold tracking-wide @max-[460px]:hidden">Stats</span>
      <Tip label="Stats - coming soon" />
    </button>
  );
}

export default function NavRail({ active, onSelect }: { active: Section; onSelect: (s: Section) => void }) {
  return (
    <nav className="bg-nav relative z-40 w-[76px] @max-[460px]:w-14 shrink-0 h-full flex flex-col items-center gap-1 py-3 border-r border-line">
      <RailButton id="records" active={active === 'records'} onSelect={onSelect} />
      <RailButton id="sets" active={active === 'sets'} onSelect={onSelect} />
      <StatsPlaceholderButton />
      <div className="mt-auto w-full flex flex-col items-center gap-1 pt-1 border-t border-line">
        <RailButton id="settings" active={active === 'settings'} onSelect={onSelect} />
      </div>
    </nav>
  );
}
