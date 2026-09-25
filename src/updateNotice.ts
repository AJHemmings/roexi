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

export function sendUpdateNotices(conns: number[], text: string | null, send: (conn: number, line: string) => void = sendBoxCommand): void {
  for (const c of [...sent.keys()]) if (!conns.includes(c)) sent.delete(c);
  if (!text) return;
  for (const c of conns) {
    if (sent.get(c) === text) continue;
    sent.set(c, text);
    send(c, JSON.stringify({ cmd: 'notice', msg: text }));
  }
}

/** Test-only. */
export function resetUpdateNotices(): void { sent.clear(); }
