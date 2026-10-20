// Reads the game's RoE objective table and menu from the player's own client (spec 2026-10-13 §4), so a
// version update (this month's monthlies, new text, an event coming back) shows up without a roexi release.
// The addon reports the game folder (fpath, addon 0.6.0+). Whatever can't be read leaves the catalog as it
// is: no menu means nothing changes; no table means the menu alone is applied, as before 0.8.0.
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from '../bridge';
import { parseRoeMenu, menuIds } from './clientMenu';
import { parseRoeDat, type ClientEntry } from './clientDat';
import { applyLiveClient } from './catalog';

// Far fewer than today's ~1,500 listed / ~1,580 objectives means the file isn't what we expect.
// Same thresholds as scripts/extract-client.mjs.
const MIN_LISTED = 1000;
const MIN_ENTRIES = 1500;

let inFlight: Promise<void> | null = null;
/** The files' stamp at the last full read, so reconnects don't re-read 20 MB that hasn't changed. */
let appliedStamp: string | null = null;

/** Test-only: forget the last read between specs. */
export function resetLiveClient(): void { inFlight = null; appliedStamp = null; }

async function readTable(ffxiPath: string): Promise<ClientEntry[] | null> {
  try {
    const entries = parseRoeDat(new Uint8Array(await invoke<ArrayBuffer>('read_roe_table', { ffxiPath })));
    if (entries.length >= MIN_ENTRIES) return entries;
    console.warn(`[roexi] the game's RoE table has only ${entries.length} objectives; keeping the built-in list`);
  } catch (e) {
    console.warn("[roexi] couldn't read the game's RoE table; keeping the built-in list", e);
  }
  return null;
}

/** Read and apply both files. Concurrent calls share one read; call again to re-check (e.g. after a reconnect). */
export function loadLiveClient(ffxiPath: string): Promise<void> {
  if (!inTauri || !ffxiPath) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const stamp = await invoke<string>('roe_files_stamp', { ffxiPath });
      if (stamp === appliedStamp) return;
      const menu = parseRoeMenu(new Uint8Array(await invoke<ArrayBuffer>('read_roe_menu', { ffxiPath })));
      const listed = menuIds(menu);
      if (listed.size < MIN_LISTED) {
        console.warn(`[roexi] the game's RoE menu lists only ${listed.size} objectives; keeping the current list`);
        return;
      }
      const entries = await readTable(ffxiPath);
      applyLiveClient(entries, menu);
      // Only a full read counts: after a menu-only fallback the table is tried again next time.
      if (entries) appliedStamp = stamp;
    } catch (e) {
      console.warn("[roexi] couldn't read the game's RoE files; keeping the current list", e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
