import { broadcastBoxCommand } from './bridge';
import { getPending, subscribePending } from './roe/pending';

// Longer than the worst-case batch (15s ack + 1.5s settle), so a stuck batch can't block a reload forever.
const IDLE_CAP_MS = 20_000;

// Resolves once no add/remove batch is in flight (true), or after the cap (false).
function waitForNoPending(timeoutMs: number): Promise<boolean> {
  if (getPending().length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (idle: boolean) => { clearTimeout(timer); unsubscribe(); resolve(idle); };
    const unsubscribe = subscribePending(() => { if (getPending().length === 0) finish(true); });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/** Asks every connected addon to reload itself (`//lua reload roexi`), so a freshly installed addon
 * update takes effect without typing in each game window. Waits for in-flight batches first — reloading
 * mid-batch would drop its ack. Returns how many clients were asked. Addons older than 0.2.0-beta
 * ignore the command, so the upgrade *to* 0.2.0-beta still needs one manual reload. Spec §4.8. */
export async function reloadAddonInGame(): Promise<number> {
  await waitForNoPending(IDLE_CAP_MS);
  return broadcastBoxCommand(JSON.stringify({ cmd: 'reload' }));
}

// Dev builds only (tauri:dev / vite dev): lets the reload be exercised in-game from DevTools before a
// newer addon release exists to install. Never present in the shipped exe.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __roexiReloadAddon?: () => Promise<number> }).__roexiReloadAddon = reloadAddonInGame;
}
