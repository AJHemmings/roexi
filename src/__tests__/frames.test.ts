import { describe, it, expect } from 'vitest';
import { parseFrame, applyFrame, sanitizeLocked } from '../bridge/frames';
import type { StateFrame } from '../bridge/frames';
import type { Box } from '../roe/types';

const hello = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ t: 'hello', id: 1001, name: 'Aldric', main: 'WAR', main_lvl: 99, sub: 'SAM', sub_lvl: 49, zone: 230, zone_name: 'Southern San d\'Oria', server: 'Asura', av: '0.1.0', ...over });

describe('parseFrame', () => {
  it('rejects junk and unknown frame types', () => {
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame('{"t":"nope"}')).toBeNull();
    expect(parseFrame('{"t":"hello","id":1}')).toBeNull(); // no name
  });
  it('parses roe items and drops malformed entries', () => {
    expect(parseFrame('{"t":"roe","items":[{"id":77,"p":3},{"id":0,"p":0},{"bad":1}]}')).toEqual({ t: 'roe', items: [{ id: 77, p: 3 }] });
  });
  it('parses roedone pages and seqacks (ok defaults to true)', () => {
    expect(parseFrame('{"t":"roedone","page":1,"ids":[1030,"x",1040]}')).toEqual({ t: 'roedone', page: 1, ids: [1030, 1040] });
    expect(parseFrame('{"t":"seqack","seq":41}')).toEqual({ t: 'seqack', seq: 41, ok: true });
    expect(parseFrame('{"t":"seqack","seq":41,"ok":false}')).toEqual({ t: 'seqack', seq: 41, ok: false });
  });
  it('rejects non-integer or non-positive ids and pages', () => {
    expect(parseFrame('{"t":"roe","items":[{"id":77.5,"p":3},{"id":-1,"p":0},{"id":5,"p":-2}]}')).toEqual({ t: 'roe', items: [] });
    expect(parseFrame('{"t":"roedone","page":-1,"ids":[5]}')).toBeNull();
    expect(parseFrame('{"t":"roedone","page":0,"ids":[0,-5,7]}')).toEqual({ t: 'roedone', page: 0, ids: [7] });
    expect(parseFrame('{"t":"hello","id":1.5,"name":"X"}')).toBeNull();
  });
  it('dedupes roe items keeping the last progress', () => {
    expect(parseFrame('{"t":"roe","items":[{"id":77,"p":1},{"id":12,"p":0},{"id":77,"p":4}]}')).toEqual({
      t: 'roe',
      items: [{ id: 77, p: 4 }, { id: 12, p: 0 }],
    });
  });
  it('rejects oversized frames', () => {
    const items = Array.from({ length: 31 }, (_, i) => ({ id: i + 1, p: 0 }));
    expect(parseFrame(JSON.stringify({ t: 'roe', items }))).toBeNull();
    const ids = Array.from({ length: 1025 }, (_, i) => i + 1);
    expect(parseFrame(JSON.stringify({ t: 'roedone', page: 0, ids }))).toBeNull();
  });
});

describe('applyFrame', () => {
  const now = 1000;
  const helloFrame = parseFrame(hello())!;
  const roeFrame = parseFrame('{"t":"roe","items":[{"id":77,"p":3}]}')!;
  const doneFrame = parseFrame('{"t":"roedone","page":0,"ids":[1,2,3]}')!;

  it('hello creates a box with identity fields', () => {
    const r = applyFrame(undefined, 7, helloFrame as StateFrame, now)!;
    expect(r.persist).toBe(false);
    expect(r.box).toMatchObject({ conn: 7, id: 1001, name: 'Aldric', main: 'WAR', mainLvl: 99, sub: 'SAM', subLvl: 49, zone: 230, zoneName: "Southern San d'Oria", server: 'Asura', av: '0.1.0', lastSeen: now });
  });

  it('roe and roedone are ignored before hello', () => {
    expect(applyFrame(undefined, 7, roeFrame as StateFrame, now)).toBeNull();
    expect(applyFrame(undefined, 7, doneFrame as StateFrame, now)).toBeNull();
  });

  it('roe replaces the active list and asks to persist', () => {
    const box = applyFrame(undefined, 7, helloFrame as StateFrame, now)!.box;
    const r = applyFrame(box, 7, roeFrame as StateFrame, now + 1)!;
    expect(r.persist).toBe(true);
    expect(r.box.active).toEqual([{ id: 77, p: 3 }]);
    expect(r.box.activeAt).toBe(now + 1);
  });

  it('roedone replaces only that page', () => {
    let box = applyFrame(undefined, 7, helloFrame as StateFrame, now)!.box;
    box = applyFrame(box, 7, doneFrame as StateFrame, now)!.box;
    box = applyFrame(box, 7, parseFrame('{"t":"roedone","page":1,"ids":[1030]}') as StateFrame, now)!.box;
    box = applyFrame(box, 7, parseFrame('{"t":"roedone","page":0,"ids":[5]}') as StateFrame, now)!.box;
    expect(box.donePages).toEqual({ 0: [5], 1: [1030] });
  });

  it('self with the same player id keeps state; a different id starts clean and takes the seed', () => {
    let box: Box = applyFrame(undefined, 7, helloFrame as StateFrame, now)!.box;
    box = applyFrame(box, 7, roeFrame as StateFrame, now)!.box;
    const same = applyFrame(box, 7, parseFrame(hello({ t: 'self' })) as StateFrame, now + 5)!.box;
    expect(same.active).toEqual([{ id: 77, p: 3 }]);
    const seed = { active: [{ id: 1, p: 0 }], activeAt: 5, donePages: { 0: [1] }, doneAt: 5 };
    const swapped = applyFrame(box, 7, parseFrame(hello({ t: 'self', id: 2002, name: 'Brienne' })) as StateFrame, now + 6, seed)!.box;
    expect(swapped.name).toBe('Brienne');
    expect(swapped.active).toEqual([{ id: 1, p: 0 }]);
    expect(swapped.donePages).toEqual({ 0: [1] });
  });

  it('seeds a fresh box from a persisted snapshot on the very first hello', () => {
    const seed = { active: [{ id: 1, p: 0 }], activeAt: 5, donePages: { 0: [1] }, doneAt: 5 };
    const r = applyFrame(undefined, 7, helloFrame as StateFrame, now, seed)!;
    expect(r.box.active).toEqual([{ id: 1, p: 0 }]);
    expect(r.box.donePages).toEqual({ 0: [1] });
    expect(r.box.activeAt).toBe(5);
  });

  it('self with the same id but a new name renames and keeps state', () => {
    let box: Box = applyFrame(undefined, 7, helloFrame as StateFrame, now)!.box;
    box = applyFrame(box, 7, roeFrame as StateFrame, now)!.box;
    const renamed = applyFrame(box, 7, parseFrame(hello({ t: 'self', name: 'Aldric2' })) as StateFrame, now + 5)!.box;
    expect(renamed.name).toBe('Aldric2');
    expect(renamed.active).toEqual([{ id: 77, p: 3 }]);
  });
});

describe('locked marks', () => {
  const now = 1000;
  const helloF = parseFrame(JSON.stringify({ t: 'hello', id: 9, name: 'Lockie' }))! as StateFrame;
  const base = applyFrame(undefined, 9, helloF, now)!.box;

  it('hello seeds locked from the persisted snapshot', () => {
    const r = applyFrame(undefined, 9, helloF, now, { locked: { 5: 1 } })!;
    expect(r.box.locked).toEqual({ 5: 1 });
  });
  it('a same-character hello keeps its marks', () => {
    const r = applyFrame({ ...base, locked: { 5: 1 } }, 9, helloF, now)!;
    expect(r.box.locked).toEqual({ 5: 1 });
  });
  it('roe clears a mark whose id is now active, keeps the rest, and persists', () => {
    const f = parseFrame('{"t":"roe","items":[{"id":5,"p":0}]}')! as StateFrame;
    const r = applyFrame({ ...base, locked: { 5: 1, 6: 1 } }, 9, f, now)!;
    expect(r.box.locked).toEqual({ 6: 1 });
    expect(r.persist).toBe(true);
  });
  it('roedone clears a mark whose id is now completed', () => {
    const f = parseFrame('{"t":"roedone","page":0,"ids":[6]}')! as StateFrame;
    const r = applyFrame({ ...base, locked: { 5: 1, 6: 1 } }, 9, f, now)!;
    expect(r.box.locked).toEqual({ 5: 1 });
  });
  it('keeps the same object when nothing was cleared', () => {
    const locked = { 5: 1 };
    const f = parseFrame('{"t":"roe","items":[{"id":7,"p":0}]}')! as StateFrame;
    expect(applyFrame({ ...base, locked }, 9, f, now)!.box.locked).toBe(locked);
  });
});

describe('sanitizeLocked', () => {
  it('keeps integer ids 1..4095 with finite timestamps and drops the rest', () => {
    expect(sanitizeLocked({ 5: 100, 0: 1, 4096: 1, abc: 1, 7: 'x', 8: Infinity })).toEqual({ 5: 100 });
  });
  it('returns undefined for non-objects', () => {
    expect(sanitizeLocked(null)).toBeUndefined();
    expect(sanitizeLocked([1, 2])).toBeUndefined();
    expect(sanitizeLocked('x')).toBeUndefined();
  });
});
