import { useEffect, useMemo, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Group, Row, RowStacked, Segmented, Select, Slider, Toggle } from '../ui';
import { useTheme, THEMES } from '../theme';
import { useMode, setMode } from '../windowSize';
import { useSettings, setSettings } from '../settings';
import { useIpcBound, useKnownCharacters, useBoxes, removeChar, useAddonInfo, getManualAddonDir, setManualAddonDir } from '../bridge';
import { relTime, useNowTick } from '../reltime';
import { checkForUpdate, installUpdate, checkAddonUpdate, installAddonUpdate, readInstalledAddonVersion, type Update, type ManifestAddon, type AddonInstallResult } from '../updater';
import { reloadAddonInGame, reloadSummary, type ReloadResult } from '../addonReload';
import { getStartupCheck, setStartupCheck } from '../UpdateBanner';

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

function UpdatesSection() {
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'error'>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');
  const [startupChk, setStartupChk] = useState(getStartupCheck());
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  const check = async () => {
    setStatus('checking'); setMsg('');
    try { const u = await checkForUpdate(); if (u) { setUpdate(u); setStatus('available'); } else setStatus('none'); }
    catch (e) { setMsg(String(e)); setStatus('error'); }
  };
  const install = async () => {
    if (!update) return;
    setStatus('downloading'); setPct(0);
    try { await installUpdate(update, setPct); } catch (e) { setMsg(String(e)); setStatus('error'); }
  };

  const note =
    status === 'none' ? "You're on the latest version."
      : status === 'available' ? `Update available: v${update?.version}`
        : status === 'error' ? (msg || 'Update check failed.')
          : status === 'downloading' ? `Downloading… ${pct}%`
            : version ? `v${version}` : '';

  if (import.meta.env.DEV) return null;

  return (
    <Group title="Updates">
      <Row label="App Version" desc={note}>
        {status === 'available' ? (
          <button onClick={install} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-accent text-on-accent hover:bg-accent-hover transition-colors">Install</button>
        ) : (
          <button onClick={check} disabled={status === 'checking' || status === 'downloading'} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-surface-raised border border-line text-fg-2 hover:bg-surface-hover disabled:opacity-50 transition-colors">
            {status === 'checking' ? 'Checking…' : status === 'downloading' ? `${pct}%` : 'Check for Updates'}
          </button>
        )}
      </Row>
      <AddonUpdateRow />
      <Row label="Check On Startup" desc="Automatically check for app + addon updates when roexi launches">
        <Toggle on={startupChk} onChange={(v) => { setStartupChk(v); setStartupCheck(v); }} />
      </Row>
    </Group>
  );
}

function AddonUpdateRow() {
  const addon = useAddonInfo();
  const [status, setStatus] = useState<'idle' | 'checking' | 'none' | 'available' | 'installing' | 'installed' | 'error'>('idle');
  const [manifest, setManifest] = useState<ManifestAddon | null>(null);
  const [result, setResult] = useState<AddonInstallResult | null>(null);
  const [reloadResult, setReloadResult] = useState<ReloadResult | null>(null);
  const [msg, setMsg] = useState('');
  const manual = getManualAddonDir();

  const installed = addon?.version ?? null;

  const check = async () => {
    setStatus('checking'); setMsg('');
    const r = await checkAddonUpdate(addon?.dir ?? null, addon?.version ?? null);
    if (r.kind === 'available') { setManifest(r.manifest); setStatus('available'); }
    else if (r.kind === 'none') setStatus('none');
    else { setMsg(r.message); setStatus('error'); }
  };
  const install = async () => {
    if (!addon?.dir || !manifest) return;
    setStatus('installing'); setMsg('');
    try {
      const res = await installAddonUpdate(addon.dir, manifest); setResult(res);
      setReloadResult(await reloadAddonInGame());
      setStatus('installed');
    } catch (e) { setMsg(String(e)); setStatus('error'); }
  };
  const pickFolder = async () => {
    setMsg(''); setStatus('idle');
    const picked = await openDialog({ directory: true, multiple: false, title: 'Select the roexi addon folder' });
    if (typeof picked !== 'string') return;
    const ver = await readInstalledAddonVersion(picked);
    if (ver == null) { setManualAddonDir(null); setMsg('That folder has no roexi.lua. Pick your Windower addons/roexi folder.'); setStatus('error'); return; }
    setManualAddonDir(picked);
  };

  const note =
    status === 'installed' ? `Installed v${result?.installed_version} — ${reloadResult ? reloadSummary(reloadResult) : 'no characters connected; it loads next time you start roexi in-game.'}`
      : status === 'error' ? (msg || 'Addon update check failed.')
        : status === 'installing' ? 'Installing addon…'
          : status === 'available' ? `Addon update available: v${manifest?.version}`
            : status === 'none' ? `Addon is up to date${installed ? ` (v${installed})` : ''}.`
              : !addon ? 'Set your Windower addons/roexi folder, or connect a character in-game.'
                : `${addon.dir}${installed ? ` (v${installed})` : ''}`;

  return (
    <Row label="Addon Version" desc={note}>
      <div className="flex items-center gap-2">
        {addon && (
          <button onClick={() => manual ? setManualAddonDir(null) : void pickFolder()} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-surface-raised border border-line text-fg-3 hover:text-fg hover:bg-surface-hover transition-colors">
            {manual ? 'Auto' : 'Change Folder'}
          </button>
        )}
        {status === 'available' ? (
          <button onClick={install} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-accent text-on-accent hover:bg-accent-hover transition-colors">Install</button>
        ) : !addon ? (
          <button onClick={pickFolder} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-surface-raised border border-line text-fg-2 hover:bg-surface-hover transition-colors">Set Folder</button>
        ) : (
          <button onClick={check} disabled={status === 'checking' || status === 'installing'} className="le-tap px-3 py-1.5 text-[12px] font-semibold rounded-md bg-surface-raised border border-line text-fg-2 hover:bg-surface-hover disabled:opacity-50 transition-colors">
            {status === 'checking' ? 'Checking…' : status === 'installing' ? 'Installing…' : 'Check for Updates'}
          </button>
        )}
      </div>
    </Row>
  );
}

export default function SettingsView() {
  const [theme, setTheme] = useTheme();
  const winMode = useMode();
  const settings = useSettings();
  const bound = useIpcBound();
  const boxes = useBoxes();
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
      <UpdatesSection />
      <Group title="About">
        <Row label="Objective data" desc="Ids and names from the commandobill/roe mapping (MIT). Categories and rewards from BG-Wiki. See data/LICENSES.md." />
      </Group>
    </div>
  );
}
