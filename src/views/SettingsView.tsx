import { useEffect, useMemo, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { Group, Row, RowStacked, Segmented, Select, Slider } from '../ui';
import { useTheme, THEMES } from '../theme';
import { useMode, setMode } from '../windowSize';
import { useSettings, setSettings } from '../settings';
import { inTauri, useIpcBound, useKnownCharacters, useBoxes, removeChar } from '../bridge';
import { relTime, useNowTick } from '../reltime';

function CharactersSettings() {
  const known = useKnownCharacters();
  const [confirm, setConfirm] = useState<string | null>(null);
  useNowTick();
  const chars = useMemo(() => [...known].sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1)), [known]);
  if (chars.length === 0) return null;
  return (
    <Group title="Characters" right={<span className="text-[10px] text-fg-4 tabular-nums">{chars.length}</span>}>
      {chars.map((c) => (
        <Row key={c.name}
          label={<span className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.online ? 'bg-emerald-400' : 'bg-fg-4'}`} />{c.name}</span>}
          desc={[c.main, c.sub].filter(Boolean).join('/') + (!c.online && c.savedAt ? ` · last seen ${relTime(c.savedAt)}` : '') || undefined}>
          {c.online ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Connected</span>
          ) : confirm === c.name ? (
            <span className="flex items-center gap-1.5">
              <button onClick={() => setConfirm(null)} className="px-2 py-1 text-[11px] font-semibold rounded-md border border-line bg-field text-fg-3 hover:text-fg-2 transition-colors">Cancel</button>
              <button onClick={() => { void removeChar(c.name); setConfirm(null); }} className="px-2 py-1 text-[11px] font-semibold rounded-md border border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors">Remove</button>
            </span>
          ) : (
            <button onClick={() => setConfirm(c.name)} aria-label={`Remove ${c.name}`} className="le-tap grid place-items-center w-7 h-7 rounded-md text-fg-4 hover:text-red-300 hover:bg-red-500/10 transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /><path d="M10 11v6M14 11v6" /></svg>
            </button>
          )}
        </Row>
      ))}
    </Group>
  );
}

export default function SettingsView() {
  const [theme, setTheme] = useTheme();
  const winMode = useMode();
  const settings = useSettings();
  const bound = useIpcBound();
  const boxes = useBoxes();
  const [version, setVersion] = useState('');
  useEffect(() => { if (inTauri) getVersion().then(setVersion).catch(() => {}); }, []);
  return (
    <div className="max-w-xl mx-auto p-5">
      <Group title="Appearance">
        <Row label="Theme" desc="Eminence is the default. Pick a palette to recolor the whole app.">
          <Select value={theme} onChange={(v) => setTheme(v as typeof theme)} options={THEMES.map((t) => t.id)} renderOption={(v) => THEMES.find((t) => t.id === v)?.label ?? 'Eminence'} />
        </Row>
        <RowStacked label="Text Size" desc="Scales the text size of the entire app.">
          <Slider value={Math.round(settings.uiScale * 100)} min={80} max={175} step={5} format={(v) => `${v}%`} onChange={(v) => setSettings({ ...settings, uiScale: v / 100 })} />
        </RowStacked>
      </Group>
      <Group title="Window">
        <Row label="Size" desc="Changes form factor of the app.">
          <Segmented value={winMode} onChange={(v) => setMode(v)} options={[{ v: 'compact', label: 'Compact' }, { v: 'regular', label: 'Regular' }]} />
        </Row>
      </Group>
      <CharactersSettings />
      <Group title="Connection">
        <Row label="Addon listener" desc={bound ? 'Listening on 127.0.0.1:24244' : 'Port 24244 is in use by another program; roexi retries every few seconds.'}>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${bound ? 'text-emerald-400/80' : 'text-red-300'}`}>{bound ? 'Bound' : 'Not bound'}</span>
        </Row>
        <Row label="Connected addons" desc="One per game client with the roexi addon loaded.">
          <span className="text-[12px] tabular-nums text-fg-2">{boxes.length}</span>
        </Row>
      </Group>
      <Group title="About">
        <Row label="roexi" desc={version ? `v${version}` : 'browser preview'} />
        <Row label="Objective data" desc="Ids and names from the commandobill/roe mapping (MIT). Categories and rewards from BG-Wiki. See data/LICENSES.md." />
      </Group>
    </div>
  );
}
