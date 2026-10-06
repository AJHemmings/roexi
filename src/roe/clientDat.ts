// Reads the FFXI client's Records of Eminence table (English client: ROM/307/16.DAT). Spec 2026-10-06 §2.1.
// Pure (no Node imports) so Vitest runs it and scripts/extract-client.mjs imports it directly.
//
// Layout: every byte is rotated left by 5 bits. The file is 5,120-byte records and the record index is
// the objective id. Little-endian u32s: 8 repeat flag, 12 goal, 16 sparks, 20 exp, 28 accolades;
// 32 field count (always 6), then 6 × (offset, type) with offsets relative to byte 32. A text field
// (type 0) is a 28-byte header followed by NUL-terminated Shift-JIS. Field 2 = full name, 4 = description.

export type ClientEntry = { id: number; n: string; repeat: boolean; goal: number; sparks: number; exp: number; acc: number; text?: string };

export const RECORD_SIZE = 5120;
const FIELD_TABLE = 32;
const FIELD_COUNT = 6;
const TEXT_HEADER = 28;
const FULL_NAME = 2;
const DESCRIPTION = 4;

/** Rotating each byte right by 5 restores the plain record bytes. */
export function decodeRoeDat(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = ((raw[i] >> 5) | (raw[i] << 3)) & 0xff;
  return out;
}

const sjis = new TextDecoder('shift_jis');

function textField(rec: Uint8Array, v: DataView, field: number): string {
  const start = FIELD_TABLE + v.getUint32(FIELD_TABLE + 4 + field * 8, true) + TEXT_HEADER;
  let end = start;
  while (end < rec.length && rec[end] !== 0) end++;
  return sjis.decode(rec.subarray(Math.min(start, rec.length), end)).trim();
}

export function parseRoeDat(raw: Uint8Array): ClientEntry[] {
  if (raw.length === 0 || raw.length % RECORD_SIZE !== 0) {
    throw new Error(`not an RoE table: ${raw.length} bytes is not a whole number of ${RECORD_SIZE}-byte records`);
  }
  const data = decodeRoeDat(raw);
  const out: ClientEntry[] = [];
  for (let id = 0; id * RECORD_SIZE < data.length; id++) {
    const rec = data.subarray(id * RECORD_SIZE, (id + 1) * RECORD_SIZE);
    const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const count = v.getUint32(FIELD_TABLE, true);
    if (count !== FIELD_COUNT) throw new Error(`record ${id}: expected ${FIELD_COUNT} fields, found ${count}; the file format has changed`);
    // The record index is the id. The first u32 (0xE000 | id) is not trusted: record 4073 carries 4079's.
    const n = textField(rec, v, FULL_NAME);
    if (!n) continue;
    const text = textField(rec, v, DESCRIPTION);
    out.push({
      id, n,
      repeat: v.getUint32(8, true) !== 0,
      goal: v.getUint32(12, true),
      sparks: v.getUint32(16, true),
      exp: v.getUint32(20, true),
      acc: v.getUint32(28, true),
      ...(text ? { text } : {}),
    });
  }
  return out;
}
