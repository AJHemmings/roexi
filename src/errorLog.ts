// Shared crash log so every source of error — window-level (main.tsx) and React render errors
// (ErrorBoundary) — lands in the same file. This app ships without DevTools access for end users,
// so error.log is the only forensic trail; nothing that can throw should bypass it.
import { invoke } from '@tauri-apps/api/core';
import { inTauri, appDataPath } from './bridge';

let buffer = '';

export async function logErr(kind: string, msg: string): Promise<void> {
  if (!inTauri || buffer.length > 8000) return;
  buffer += `[${kind}] ${msg}\n\n`;
  try { await invoke('write_text_file', { path: await appDataPath('error.log'), contents: buffer }); } catch { /* ignore */ }
}
