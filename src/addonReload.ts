import { getBoxes, sendBoxCommand } from './bridge';
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

/** True iff `av` is a plain major.minor.patch (an optional "-suffix" is ignored) at or above 0.2.0,
 * the first addon release that understands `{"cmd":"reload"}`. Older addons, `undefined` (never
 * reported a version) and non-semver strings like the dev mock's 'mock' all report false. */
export function supportsReload(av: string | undefined): boolean {
  if (!av) return false;
  const parts = av.split('-')[0].split('.');
  if (parts.length !== 3) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return false;
  const [major, minor, patch] = nums;
  return major * 1_000_000 + minor * 1_000 + patch >= 2_000; // >= 0.2.0
}

export type ReloadResult = { reloaded: number; manual: number };

/** Asks every connected addon that understands it to reload itself (`//lua reload roexi`), so a freshly
 * installed addon update takes effect without typing in each game window. Waits for in-flight batches
 * first — reloading mid-batch would drop its ack. A batch that starts during this wait can stretch it
 * up to the cap; if it never settles, its own ack times out on its own ("no response"), so this never
 * blocks forever. `reloaded` counts connections sent the command; `manual` counts connected clients
 * whose addon predates 0.2.0 and silently ignores it — those still need one `//lua reload roexi` by hand. */
export async function reloadAddonInGame(): Promise<ReloadResult> {
  await waitForNoPending(IDLE_CAP_MS);
  let reloaded = 0;
  let manual = 0;
  for (const b of getBoxes()) {
    if (supportsReload(b.av)) { sendBoxCommand(b.conn, JSON.stringify({ cmd: 'reload' })); reloaded++; }
    else manual++;
  }
  return { reloaded, manual };
}

/** One shared phrasing for both SettingsView and UpdateBanner, so the two surfaces can't drift apart. */
export function reloadSummary(r: ReloadResult): string {
  const clients = (n: number) => `${n} client${n === 1 ? '' : 's'}`;
  if (r.reloaded > 0 && r.manual === 0) return `reloaded on ${clients(r.reloaded)}.`;
  if (r.reloaded > 0) return `reloaded on ${clients(r.reloaded)}; run //lua reload roexi in-game on the other ${r.manual}.`;
  if (r.manual > 0) return 'run //lua reload roexi in-game to apply.';
  return 'no characters connected; it loads next time you start roexi in-game.';
}

// Dev builds only (tauri:dev / vite dev): lets the reload be exercised in-game from DevTools before a
// newer addon release exists to install. Never present in the shipped exe.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __roexiReloadAddon?: () => Promise<ReloadResult> }).__roexiReloadAddon = reloadAddonInGame;
}
