// Browser-only stand-in for six addons. Imported by main.tsx only when the app is not inside Tauri.
// Four characters are "online" with a few active records; two are "offline" from a persisted snapshot.
// roeadd/roecancel are answered like the game would: every 7th id is treated as locked (not accepted).
import { ingestLine, seedPersisted, setCommandSink } from '../bridge';

const NAMES = ['Aldric', 'Brienne', 'Cassius', 'Delphine', 'Evander', 'Fiora'];
const SEED_ACTIVE = [1, 12, 77, 215, 3002, 4013, 1200];
// Long enough to see the in-flight guard (disabled buttons + spinners) in the browser; the real addon
// answers in roughly a second.
const REPLY_DELAY_MS = 1500;

type MockChar = { conn: number; name: string; id: number; active: Map<number, number> };

const roeLine = (m: MockChar) => JSON.stringify({ t: 'roe', items: [...m.active].map(([id, p]) => ({ id, p })) });

export function startMockFeed() {
  const chars: MockChar[] = NAMES.slice(0, 4).map((name, i) => ({
    conn: i + 1, name, id: 1000 + i,
    active: new Map(SEED_ACTIVE.slice(0, 2 + i).map((id, k) => [id, k * 3])),
  }));
  for (const m of chars) {
    ingestLine(m.conn, JSON.stringify({ t: 'hello', id: m.id, name: m.name, main: 'WAR', main_lvl: 99, sub: 'SAM', sub_lvl: 49, zone: 230, zone_name: "Southern San d'Oria", server: 'Asura', av: 'mock' }));
    ingestLine(m.conn, roeLine(m));
    ingestLine(m.conn, JSON.stringify({ t: 'roedone', page: 0, ids: [1, 2, 3, 4, 5, 11] }));
    if (m.conn === 1) ingestLine(m.conn, JSON.stringify({ t: 'roedone', page: 2, ids: [3002] }));
  }
  for (const name of NAMES.slice(4)) {
    seedPersisted({ name, main: 'RDM', sub: 'BLM', zoneName: 'Bastok Markets', active: [{ id: 12, p: 40 }], activeAt: Date.now() - 3_600_000, donePages: { 0: [1, 2] }, savedAt: Date.now() - 3_600_000 });
  }
  setCommandSink((conn, line) => {
    const m = chars.find((c) => c.conn === conn);
    if (!m) return;
    const msg = JSON.parse(line) as { cmd: string; ids?: number[]; seq?: number };
    if (msg.cmd === 'roeadd') for (const id of msg.ids ?? []) if (id % 7 !== 0 && m.active.size < 30) m.active.set(id, 0);
    if (msg.cmd === 'roecancel') for (const id of msg.ids ?? []) m.active.delete(id);
    window.setTimeout(() => {
      if (msg.seq != null) ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
      if (msg.cmd !== 'sync') ingestLine(conn, roeLine(m));
    }, REPLY_DELAY_MS);
  });
}
