import { describe, it, expect } from 'vitest';
import { parseRoeMenu, menuIds } from '../roe/clientMenu';
import { RECORD_SIZE } from '../roe/clientDat';

const NODE = (k: number) => 0xf200 + k;
const OBJ = (id: number) => 0xe000 | id;
const rotl5 = (b: number) => ((b << 5) | (b >> 3)) & 0xff;

/** One plain (decoded) menu node record laid out like the client's: children, then a name in field 0. */
function node(k: number, name: string, children: number[]): Uint8Array {
  const buf = new Uint8Array(RECORD_SIZE);
  const v = new DataView(buf.buffer);
  v.setUint32(0, NODE(k), true);
  v.setUint32(4, children.length, true);
  children.forEach((ref, i) => v.setUint32(8 + i * 20, ref, true));
  v.setUint32(568, 5, true);   // field count
  v.setUint32(572, 44, true);  // field 0 offset, relative to byte 568
  buf.set(new TextEncoder().encode(name), 568 + 44 + 28);
  return buf;
}
/** Records at index 0, 1, 2, … encoded the way the client stores them. */
function menu(...recs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(recs.length * RECORD_SIZE);
  recs.forEach((r, i) => out.set(r, i * RECORD_SIZE));
  return out.map(rotl5);
}

describe('parseRoeMenu', () => {
  it('reads categories, sections and their objectives in menu order, with the game\'s names', () => {
    const raw = menu(
      node(0, '', [NODE(2), NODE(1)]),
      node(1, 'Unity', [NODE(4)]),
      node(2, 'Tutorial', [NODE(3), NODE(5)]),
      node(3, 'Basics', [OBJ(1), OBJ(2)]),
      node(4, 'Unity (Wanted 1)', [OBJ(817)]),
      node(5, 'Intermediate 2', [OBJ(1069), OBJ(1070)]),
    );
    expect(parseRoeMenu(raw)).toEqual([
      { cat: 'Tutorial', sub: 'Basics', ids: [1, 2] },
      { cat: 'Tutorial', sub: 'Intermediate 2', ids: [1069, 1070] },
      { cat: 'Unity', sub: 'Unity (Wanted 1)', ids: [817] },
    ]);
  });

  it('never reaches a node that is not linked, or one the game blanked out with "."', () => {
    const raw = menu(
      node(0, '', [NODE(1), NODE(3)]),
      node(1, 'Tutorial', [NODE(2)]),
      node(2, 'Basics', [OBJ(1)]),
      node(3, '.', [NODE(4)]),                        // a linked category the game has switched off
      node(4, "Vana'bout Round", [OBJ(2999)]),
      node(5, 'Special Events', [NODE(6)]),            // not linked from the root at all
      node(6, "Vana'bout Daily", [OBJ(3072)]),
    );
    const sections = parseRoeMenu(raw);
    expect(sections).toEqual([{ cat: 'Tutorial', sub: 'Basics', ids: [1] }]);
    expect(menuIds(sections).has(2999)).toBe(false);
    expect(menuIds(sections).has(3072)).toBe(false);
  });

  it('files objectives listed straight under a category in a section named after it', () => {
    const raw = menu(node(0, '', [NODE(1)]), node(1, 'Other', [OBJ(3780), NODE(2)]), node(2, 'Monthly Objectives', [OBJ(3783)]));
    expect(parseRoeMenu(raw)).toEqual([
      { cat: 'Other', sub: 'Other', ids: [3780] },
      { cat: 'Other', sub: 'Monthly Objectives', ids: [3783] },
    ]);
  });

  it('does not loop forever on a cycle', () => {
    const raw = menu(node(0, '', [NODE(1)]), node(1, 'Tutorial', [NODE(2)]), node(2, 'Basics', [OBJ(1), NODE(1), NODE(2)]));
    expect(parseRoeMenu(raw)).toEqual([{ cat: 'Tutorial', sub: 'Basics', ids: [1] }]);
  });

  it('refuses a file that is not whole records', () => {
    expect(() => parseRoeMenu(new Uint8Array(0))).toThrow();
    expect(() => parseRoeMenu(new Uint8Array(RECORD_SIZE + 3))).toThrow(/whole number/);
  });
});

describe('menuIds', () => {
  it('is every objective the menu lists', () => {
    expect([...menuIds([{ cat: 'a', sub: 'b', ids: [1, 2] }, { cat: 'a', sub: 'c', ids: [3] }])].sort()).toEqual([1, 2, 3]);
  });
});
