// Reads the game's RoE menu from the player's own client (spec 2026-10-06 §8), so an event objective becomes
// addable the moment the patched game lists it, without waiting for a roexi release. The addon reports the
// game folder (fpath, addon 0.6.0+). Until this succeeds (old addon, browser mock, unreadable file) the
// catalog's build-time snapshot stays in effect.
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from '../bridge';
import { parseRoeMenu, menuIds } from './clientMenu';
import { applyLiveMenu } from './catalog';

// Today's menu lists about 1,500 objectives. Far fewer means the file isn't what we expect: keep the snapshot.
const MIN_LISTED = 1000;

let inFlight: Promise<void> | null = null;

/** Read and apply the live menu. Concurrent calls share one read; call again to re-read (e.g. after a reconnect). */
export function loadLiveMenu(ffxiPath: string): Promise<void> {
  if (!inTauri || !ffxiPath) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const buf = await invoke<ArrayBuffer>('read_roe_menu', { ffxiPath });
      const listed = menuIds(parseRoeMenu(new Uint8Array(buf)));
      if (listed.size < MIN_LISTED) {
        console.warn(`[roexi] the game's RoE menu lists only ${listed.size} objectives; keeping the built-in list`);
        return;
      }
      applyLiveMenu(listed);
    } catch (e) {
      console.warn("[roexi] couldn't read the game's RoE menu; keeping the built-in list", e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
