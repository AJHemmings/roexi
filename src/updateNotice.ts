// Tells each connected addon, in game chat, that an update is waiting. Spec §5.3.
// Game chat is not UTF-8: keep every string plain ASCII.
import { sendBoxCommand } from './bridge';

export function updateNoticeText(appVersion: string | null, addonVersion: string | null): string | null {
  const parts = [appVersion ? `app v${appVersion}` : '', addonVersion ? `addon v${addonVersion}` : ''].filter(Boolean);
  if (parts.length === 0) return null;
  return `update available - ${parts.join(', ')}. Open roexi and click ${parts.length > 1 ? 'Update all' : 'Install'}.`;
}

// conn → last text sent to it. A conn missing from the live list is forgotten, so a reconnect is told again.
const sent = new Map<number, string>();

export function sendUpdateNotices(targets: { conn: number; text: string | null }[], send: (conn: number, line: string) => void = sendBoxCommand): void {
  const live = new Set(targets.map((t) => t.conn));
  for (const c of [...sent.keys()]) if (!live.has(c)) sent.delete(c);
  for (const { conn, text } of targets) {
    if (!text) continue;
    if (sent.get(conn) === text) continue;
    sent.set(conn, text);
    send(conn, JSON.stringify({ cmd: 'notice', msg: text }));
  }
}

/** Test-only. */
export function resetUpdateNotices(): void { sent.clear(); }
