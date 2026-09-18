import { describe, it, expect } from 'vitest';
import { parseFrame, applyFrame } from '../bridge/frames';
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
});

describe('applyFrame', () => {
  const now = 1000;
  const helloFrame = parseFrame(hello())!;
  const roeFrame = parseFrame('{"t":"roe","items":[{"id":77,"p":3}]}')!;
  const doneFrame = parseFrame('{"t":"roedone","page":0,"ids":[1,2,3]}')!;

  it('hello creates a box with identity fields', () => {
    const r = applyFrame(undefined, 7, helloFrame as never, now)!;
    expect(r.persist).toBe(false);
    expect(r.box).toMatchObject({ conn: 7, id: 1001, name: 'Aldric', main: 'WAR', mainLvl: 99, sub: 'SAM', subLvl: 49, zone: 230, zoneName: "Southern San d'Oria", server: 'Asura', av: '0.1.0', lastSeen: now });
  });

  it('roe and roedone are ignored before hello', () => {
    expect(applyFrame(undefined, 7, roeFrame as never, now)).toBeNull();
    expect(applyFrame(undefined, 7, doneFrame as never, now)).toBeNull();
  });

  it('roe replaces the active list and asks to persist', () => {
    const box = applyFrame(undefined, 7, helloFrame as never, now)!.box;
    const r = applyFrame(box, 7, roeFrame as never, now + 1)!;
    expect(r.persist).toBe(true);
    expect(r.box.active).toEqual([{ id: 77, p: 3 }]);
    expect(r.box.activeAt).toBe(now + 1);
  });

  it('roedone replaces only that page', () => {
    let box = applyFrame(undefined, 7, helloFrame as never, now)!.box;
    box = applyFrame(box, 7, doneFrame as never, now)!.box;
    box = applyFrame(box, 7, parseFrame('{"t":"roedone","page":1,"ids":[1030]}') as never, now)!.box;
    box = applyFrame(box, 7, parseFrame('{"t":"roedone","page":0,"ids":[5]}') as never, now)!.box;
    expect(box.donePages).toEqual({ 0: [5], 1: [1030] });
  });

  it('self with the same player id keeps state; a different id starts clean and takes the seed', () => {
    let box: Box = applyFrame(undefined, 7, helloFrame as never, now)!.box;
    box = applyFrame(box, 7, roeFrame as never, now)!.box;
    const same = applyFrame(box, 7, parseFrame(hello({ t: 'self' })) as never, now + 5)!.box;
    expect(same.active).toEqual([{ id: 77, p: 3 }]);
    const seed = { active: [{ id: 1, p: 0 }], activeAt: 5, donePages: { 0: [1] }, doneAt: 5 };
    const swapped = applyFrame(box, 7, parseFrame(hello({ t: 'self', id: 2002, name: 'Brienne' })) as never, now + 6, seed)!.box;
    expect(swapped.name).toBe('Brienne');
    expect(swapped.active).toEqual([{ id: 1, p: 0 }]);
    expect(swapped.donePages).toEqual({ 0: [1] });
  });
});
