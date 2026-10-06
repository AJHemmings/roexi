import { describe, it, expect } from 'vitest';
import { decodeRoeDat, parseRoeDat, RECORD_SIZE } from '../roe/clientDat';

type Text = string | number[];
type Rec = {
  id: number; head?: number; fieldCount?: number;
  repeat?: number; goal?: number; sparks?: number; exp?: number; acc?: number;
  short?: Text; full?: Text; text?: Text;
};
const bytes = (t: Text): Uint8Array => (typeof t === 'string' ? new TextEncoder().encode(t) : Uint8Array.from(t));
const rotl5 = (b: number) => ((b << 5) | (b >> 3)) & 0xff;

/** One plain (decoded) record laid out exactly like the client's. */
function record(r: Rec): Uint8Array {
  const buf = new Uint8Array(RECORD_SIZE);
  const v = new DataView(buf.buffer);
  v.setUint32(0, r.head ?? (0xe000 | r.id), true);
  v.setUint32(4, 20260511, true);
  v.setUint32(8, r.repeat ?? 0, true);
  v.setUint32(12, r.goal ?? 1, true);
  v.setUint32(16, r.sparks ?? 100, true);
  v.setUint32(20, r.exp ?? 300, true);
  v.setUint32(28, r.acc ?? 0, true);
  v.setUint32(32, r.fieldCount ?? 6, true);
  const fields: (Uint8Array | null)[] = [bytes(r.short ?? ''), null, bytes(r.full ?? ''), bytes(''), bytes(r.text ?? ''), bytes('')];
  let off = 4 + 6 * 8; // relative to byte 32: past the count and the table
  fields.forEach((f, i) => {
    v.setUint32(36 + i * 8, off, true);
    v.setUint32(40 + i * 8, f ? 0 : 1, true);
    if (f) { buf.set(f, 32 + off + 28); off = (off + 28 + f.length + 1 + 3) & ~3; } else off += 4;
  });
  return buf;
}
/** Records at index 0, 1, 2, … encoded the way the client stores them. */
function dat(...recs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(recs.length * RECORD_SIZE);
  recs.forEach((r, i) => out.set(r, i * RECORD_SIZE));
  return out.map(rotl5);
}

describe('decodeRoeDat', () => {
  it('undoes the client byte rotation for every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...decodeRoeDat(all.map(rotl5))]).toEqual([...all]);
  });
});

describe('parseRoeDat', () => {
  it('reads id, flags, numbers, full name and description', () => {
    const raw = dat(record({ id: 0 }), record({ id: 1, repeat: 1, goal: 200, sparks: 1000, exp: 5000, acc: 100, short: 'Van. Mult. Enemies', full: 'Vanquish Multiple Enemies I', text: 'Defeat enemies.' }));
    expect(parseRoeDat(raw)).toEqual([
      { id: 1, n: 'Vanquish Multiple Enemies I', repeat: true, goal: 200, sparks: 1000, exp: 5000, acc: 100, text: 'Defeat enemies.' },
    ]);
  });

  it('uses the full name, never the short one', () => {
    const [e] = parseRoeDat(dat(record({ id: 0, short: 'U. Communique A (UC)', full: 'Unity Communique A (UC)' })));
    expect(e.n).toBe('Unity Communique A (UC)');
  });

  it('decodes Shift-JIS (the client spells a star as 0x81 0x9A) and keeps line breaks', () => {
    const [e] = parseRoeDat(dat(record({ id: 0, full: [0x81, 0x9a, 0x20, 0x28, 0x57, 0x29], text: 'Line one.\nLine two.' })));
    expect(e.n).toBe('★ (W)');
    expect(e.text).toBe('Line one.\nLine two.');
  });

  it('skips records with no name and trusts the record index over the header', () => {
    const raw = dat(record({ id: 0 }), record({ id: 1, head: 0xe000 | 9, full: 'Scenarios 20' }));
    expect(parseRoeDat(raw).map((e) => [e.id, e.n])).toEqual([[1, 'Scenarios 20']]);
  });

  it('omits text when the description is empty and keeps zero figures', () => {
    const [e] = parseRoeDat(dat(record({ id: 0, full: 'Obtaining Ambuscade Armor', exp: 0 })));
    expect(e).toEqual({ id: 0, n: 'Obtaining Ambuscade Armor', repeat: false, goal: 1, sparks: 100, exp: 0, acc: 0 });
  });

  it('refuses a file that is not whole records', () => {
    expect(() => parseRoeDat(new Uint8Array(0))).toThrow();
    expect(() => parseRoeDat(new Uint8Array(RECORD_SIZE + 1))).toThrow(/whole number/);
  });

  it('refuses a record with an unexpected field count', () => {
    expect(() => parseRoeDat(dat(record({ id: 0, full: 'x', fieldCount: 7 })))).toThrow(/format has changed/);
  });
});
