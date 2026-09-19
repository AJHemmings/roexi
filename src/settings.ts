import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { appDataPath, inTauri } from './bridge';

export type AppSettings = { uiScale: number };
const DEFAULTS: AppSettings = { uiScale: 1 };

let cfg: AppSettings = { ...DEFAULTS };
let started = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

async function load() {
  if (started) return;
  started = true;
  if (!inTauri) return;
  try {
    const p = JSON.parse(await invoke<string>('read_text_file', { path: await appDataPath('app_settings.json') }));
    cfg = { uiScale: typeof p?.uiScale === 'number' && p.uiScale >= 0.5 && p.uiScale <= 3 ? p.uiScale : DEFAULTS.uiScale };
  } catch { /* none saved */ }
  cfg = { ...cfg };
  notify();
}
void load();

async function save() {
  if (!inTauri) return;
  try { await invoke('write_text_file', { path: await appDataPath('app_settings.json'), contents: JSON.stringify(cfg) }); } catch { /* ignore */ }
}

export function getSettings() { return cfg; }
export function setSettings(next: AppSettings) { cfg = next; notify(); void save(); }
export function useSettings(): AppSettings {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => cfg, () => cfg);
}
