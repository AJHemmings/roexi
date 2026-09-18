// Pure wire-frame handling. No Tauri, no React: bridge/index.ts wires this to events.
import type { Box, PersistedChar, RoeActive } from '../roe/types';

export type IdentityFrame = {
  t: 'hello' | 'self';
  id: number;
  name: string;
  main?: string;
  main_lvl?: number;
  sub?: string;
  sub_lvl?: number;
  zone?: number;
  zone_name?: string;
  server?: string;
  av?: string;
};
export type RoeFrame = { t: 'roe'; items: RoeActive[] };
export type RoeDoneFrame = { t: 'roedone'; page: number; ids: number[] };
export type SeqAckFrame = { t: 'seqack'; seq: number; ok: boolean };
export type Frame = IdentityFrame | RoeFrame | RoeDoneFrame | SeqAckFrame;
export type StateFrame = Exclude<Frame, SeqAckFrame>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const optNum = (v: unknown): number | undefined => (isNum(v) ? v : undefined);

/** One newline-delimited line from the addon → a typed frame, or null when it is not one we understand. */
export function parseFrame(line: string): Frame | null {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  switch (o.t) {
    case 'hello':
    case 'self': {
      if (!isNum(o.id) || typeof o.name !== 'string' || !o.name) return null;
      return {
        t: o.t, id: o.id, name: o.name,
        main: optStr(o.main), main_lvl: optNum(o.main_lvl), sub: optStr(o.sub), sub_lvl: optNum(o.sub_lvl),
        zone: optNum(o.zone), zone_name: optStr(o.zone_name), server: optStr(o.server), av: optStr(o.av),
      };
    }
    case 'roe': {
      if (!Array.isArray(o.items)) return null;
      const items: RoeActive[] = [];
      for (const it of o.items as unknown[]) {
        if (it && typeof it === 'object') {
          const { id, p } = it as Record<string, unknown>;
          if (isNum(id) && id > 0 && isNum(p)) items.push({ id, p });
        }
      }
      return { t: 'roe', items };
    }
    case 'roedone': {
      if (!isNum(o.page) || !Array.isArray(o.ids)) return null;
      return { t: 'roedone', page: o.page, ids: (o.ids as unknown[]).filter(isNum) };
    }
    case 'seqack': {
      if (!isNum(o.seq)) return null;
      return { t: 'seqack', seq: o.seq, ok: o.ok !== false };
    }
    default:
      return null;
  }
}

export type Applied = { box: Box; persist: boolean };
export type Seed = Pick<PersistedChar, 'active' | 'activeAt' | 'donePages' | 'doneAt'> | undefined;

/**
 * Fold one state frame into a connection's box.
 * - hello/self: same player id keeps RoE state; a different id (shared-client swap) starts clean
 *   and takes `seed` (that character's own persisted snapshot) so offline history survives.
 * - roe: replaces the active list.  - roedone: replaces one completion page.
 * Returns null when the frame does not apply (state frames before any identity).
 */
export function applyFrame(prev: Box | undefined, conn: number, f: StateFrame, now: number, seed?: Seed): Applied | null {
  if (f.t === 'hello' || f.t === 'self') {
    const same = !!prev && prev.id === f.id;
    const carry = same ? prev : undefined;
    const base = same ? carry : seed;
    return {
      persist: false,
      box: {
        conn, id: f.id, name: f.name,
        main: f.main ?? carry?.main, mainLvl: f.main_lvl ?? carry?.mainLvl,
        sub: f.sub ?? carry?.sub, subLvl: f.sub_lvl ?? carry?.subLvl,
        zone: f.zone ?? carry?.zone, zoneName: f.zone_name ?? carry?.zoneName,
        server: f.server ?? carry?.server, av: f.av ?? carry?.av,
        active: base?.active, activeAt: base?.activeAt, donePages: base?.donePages, doneAt: base?.doneAt,
        lastSeen: now,
      },
    };
  }
  if (!prev) return null;
  if (f.t === 'roe') return { persist: true, box: { ...prev, active: f.items, activeAt: now, lastSeen: now } };
  if (f.t === 'roedone') return { persist: true, box: { ...prev, donePages: { ...(prev.donePages ?? {}), [f.page]: f.ids }, doneAt: now, lastSeen: now } };
  return null;
}
