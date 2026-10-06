// Reads the FFXI client's Records of Eminence menu tree (English client: ROM/307/24.DAT). Spec 2026-10-06 §8.
// Pure (no Node imports), like clientDat.ts: the catalog build and the app (live, from the player's own
// client) share it.
//
// Same encoding and record size as the objective table. Record k is menu node 0xF200 | k: u32@4 is its child
// count, and each child is 20 bytes from byte 8 (u32 ref, u32 unlock condition, three unused words). A ref of
// 0xF200 | k is another node and 0xE000 | id is an objective. A node's name is text field 0 of the field table
// at byte 568 (offsets relative to it, 28-byte text header, "." = empty). The root (record 0) lists the
// categories, each category its sections, each section its objectives. A node that isn't linked (Special
// Events between events) or that the game blanked out with "." is simply never reached.
import { decodeRoeDat, RECORD_SIZE } from './clientDat.ts';

export type MenuSection = { cat: string; sub: string; ids: number[] };

const NODE = 0xf200;
const OBJECTIVE = 0xe000;
const OBJECTIVE_END = 0xf000;
const CHILD_SIZE = 20;
const FIELD_TABLE = 568;
const MAX_CHILDREN = Math.floor((FIELD_TABLE - 8) / CHILD_SIZE);
const TEXT_HEADER = 28;
const EMPTY_MARKER = '.';

const sjis = new TextDecoder('shift_jis');

export function parseRoeMenu(raw: Uint8Array): MenuSection[] {
  if (raw.length === 0 || raw.length % RECORD_SIZE !== 0) {
    throw new Error(`not an RoE menu: ${raw.length} bytes is not a whole number of ${RECORD_SIZE}-byte records`);
  }
  const data = decodeRoeDat(raw);
  const count = data.length / RECORD_SIZE;
  const record = (k: number) => {
    const r = data.subarray(k * RECORD_SIZE, (k + 1) * RECORD_SIZE);
    return { r, v: new DataView(r.buffer, r.byteOffset, r.byteLength) };
  };
  const children = (k: number): number[] => {
    const { v } = record(k);
    const n = Math.min(v.getUint32(4, true), MAX_CHILDREN);
    return Array.from({ length: n }, (_, i) => v.getUint32(8 + i * CHILD_SIZE, true));
  };
  const name = (k: number): string => {
    const { r, v } = record(k);
    const start = FIELD_TABLE + v.getUint32(FIELD_TABLE + 4, true) + TEXT_HEADER;
    let end = start;
    while (end < r.length && r[end] !== 0) end++;
    const s = sjis.decode(r.subarray(Math.min(start, r.length), end)).trim();
    return s === EMPTY_MARKER ? '' : s;
  };
  const nodeOf = (ref: number): number | null => (ref >= NODE && ref < NODE + count ? ref - NODE : null);
  const objectiveOf = (ref: number): number | null => (ref >= OBJECTIVE && ref < OBJECTIVE_END ? ref - OBJECTIVE : null);

  const seen = new Set<number>([0]);
  // A section's objectives, plus those of any node nested inside it (none in today's menu).
  const collect = (k: number, ids: number[]): void => {
    for (const ref of children(k)) {
      const id = objectiveOf(ref);
      if (id !== null) { ids.push(id); continue; }
      const n = nodeOf(ref);
      if (n !== null && !seen.has(n)) { seen.add(n); collect(n, ids); }
    }
  };

  const out: MenuSection[] = [];
  for (const catRef of children(0)) {
    const c = nodeOf(catRef);
    if (c === null || seen.has(c)) continue;
    seen.add(c);
    const cat = name(c);
    if (!cat) continue;
    const loose: number[] = [];
    const sections: MenuSection[] = [];
    for (const ref of children(c)) {
      const id = objectiveOf(ref);
      if (id !== null) { loose.push(id); continue; }
      const s = nodeOf(ref);
      if (s === null || seen.has(s)) continue;
      seen.add(s);
      const sub = name(s);
      if (!sub) continue;
      const ids: number[] = [];
      collect(s, ids);
      sections.push({ cat, sub, ids });
    }
    if (loose.length) out.push({ cat, sub: cat, ids: loose });
    out.push(...sections);
  }
  return out;
}

/** Every objective the menu lists. */
export const menuIds = (menu: readonly MenuSection[]): Set<number> => new Set(menu.flatMap((s) => s.ids));
