import { describe, it, expect } from 'vitest';
import { buildAddPlan, buildRemovePlan, buildSetPlan } from '../roe/plan';
import type { KnownChar, CatalogEntry } from '../roe/types';

const char = (over: Partial<KnownChar>): KnownChar => ({
  name: 'Aldric', online: true, active: [], doneIds: new Set(), donePagesKnown: new Set(), ...over,
});

const entry = (id: number, over: Partial<CatalogEntry> = {}): [number, CatalogEntry] => [id, { id, n: `Obj ${id}`, ...over }];
const byId = new Map<number, CatalogEntry>([
  entry(1, { repeat: false }),
  entry(2, { repeat: true }),
  entry(3, { repeat: false }),
]);

describe('buildAddPlan', () => {
  it('sends ids that are not auto, not active, and not done-and-non-repeatable', () => {
    const [plan] = buildAddPlan([char({ active: [] })], [1, 2], byId);
    expect(plan.status).toBe('ok');
    expect(plan.send).toEqual([1, 2]);
  });

  it('skips ids in the auto range (4008-4021) regardless of catalog data', () => {
    const [plan] = buildAddPlan([char({})], [4013], new Map());
    expect(plan.skipAuto).toEqual([4013]);
    expect(plan.send).toEqual([]);
  });

  it("skips ids the game's menu doesn't list right now", () => {
    const withEvent = new Map(byId).set(5, { id: 5, n: 'Echoes of Creation (VB)', unlisted: true });
    const [plan] = buildAddPlan([char({})], [5, 1], withEvent);
    expect(plan.skipUnlisted).toEqual([5]);
    expect(plan.send).toEqual([1]);
  });

  it('reports an auto daily as auto, not unlisted, even though the menu never lists it', () => {
    const [plan] = buildAddPlan([char({})], [4013], new Map([[4013, { id: 4013, n: 'Gain Experience', auto: true, unlisted: true }]]));
    expect(plan.skipAuto).toEqual([4013]);
    expect(plan.skipUnlisted).toEqual([]);
  });

  it('skips ids already active for that character', () => {
    const [plan] = buildAddPlan([char({ active: [{ id: 1, p: 0 }] })], [1, 2], byId);
    expect(plan.skipActive).toEqual([1]);
    expect(plan.send).toEqual([2]);
  });

  it('skips a non-repeatable id whose completion page says done', () => {
    const c = char({ doneIds: new Set([1]), donePagesKnown: new Set([0]) });
    const [plan] = buildAddPlan([c], [1, 2], byId);
    expect(plan.skipDone).toEqual([1]);
    expect(plan.send).toEqual([2]);
  });

  it('does NOT skip a repeatable id even when marked done (id 2, repeat: true)', () => {
    const c = char({ doneIds: new Set([2]), donePagesKnown: new Set([0]) });
    const [plan] = buildAddPlan([c], [2], byId);
    expect(plan.skipDone).toEqual([]);
    expect(plan.send).toEqual([2]);
  });

  it('never skips for "done" when the id\'s completion page was never received (unknown, not not-done)', () => {
    const c = char({ doneIds: new Set(), donePagesKnown: new Set() }); // page 0 never received
    const [plan] = buildAddPlan([c], [1], byId);
    expect(plan.skipDone).toEqual([]);
    expect(plan.send).toEqual([1]);
  });

  it('refuses the whole batch for a character when it would exceed 30 active (status "full", send empty)', () => {
    const active = Array.from({ length: 29 }, (_, i) => ({ id: 100 + i, p: 0 }));
    const [plan] = buildAddPlan([char({ active })], [1, 2], byId); // free = 1, candidate = 2
    expect(plan.status).toBe('full');
    expect(plan.send).toEqual([]);
    expect(plan.free).toBe(1);
  });

  it('marks an offline character "offline" and sends nothing, independent of other targets', () => {
    const [onlinePlan, offlinePlan] = buildAddPlan(
      [char({ name: 'Aldric', online: true }), char({ name: 'Brienne', online: false })],
      [1],
      byId,
    );
    expect(onlinePlan.status).toBe('ok');
    expect(onlinePlan.send).toEqual([1]);
    expect(offlinePlan.status).toBe('offline');
    expect(offlinePlan.send).toEqual([]);
  });
});

describe('buildRemovePlan', () => {
  it('sends only ids the character actually has active; the rest are skipNotActive', () => {
    const [plan] = buildRemovePlan([char({ active: [{ id: 1, p: 0 }] })], [1, 2]);
    expect(plan.status).toBe('ok');
    expect(plan.send).toEqual([1]);
    expect(plan.skipNotActive).toEqual([2]);
  });

  it('marks an offline character offline and puts every id in skipNotActive', () => {
    const [plan] = buildRemovePlan([char({ online: false })], [1, 2]);
    expect(plan.status).toBe('offline');
    expect(plan.send).toEqual([]);
    expect(plan.skipNotActive).toEqual([1, 2]);
  });
});

const fill = (n: number, p = 0, from = 100) => Array.from({ length: n }, (_, i) => ({ id: from + i, p }));

describe('buildSetPlan', () => {
  it('cancels nothing when the set fits', () => {
    const plan = buildSetPlan(char({ active: fill(10) }), [1, 2], byId);
    expect(plan).toMatchObject({ status: 'ok', send: [1, 2], cancel: [], needed: 0 });
  });

  it('cancels exactly the shortfall, first slot first', () => {
    const plan = buildSetPlan(char({ active: fill(29) }), [1, 2, 3], byId); // 1 free, 3 to add
    expect(plan).toMatchObject({ status: 'ok', send: [1, 2, 3], cancel: [100, 101], needed: 2, freeable: 29 });
  });

  it('never cancels an objective with progress, a set member, a daily, or an unlisted one', () => {
    const withEvent = new Map(byId).set(103, { id: 103, n: 'Event', unlisted: true });
    const active = [
      { id: 100, p: 5 },   // has progress
      { id: 2, p: 0 },     // in the set
      { id: 4013, p: 0 },  // daily
      { id: 103, p: 0 },   // unlisted: couldn't be taken back
      ...fill(25, 0, 200), // cancellable: 200..224
    ]; // 29 active, 1 free
    const plan = buildSetPlan(char({ active }), [1, 2, 3], withEvent);
    expect(plan).toMatchObject({ status: 'ok', send: [1, 3], cancel: [200], skipActive: [2], needed: 1, freeable: 25 });
  });

  it('plans nothing at all when too few can be cancelled', () => {
    const active = [...fill(28, 7), { id: 300, p: 0 }]; // 29 active, only one without progress
    const plan = buildSetPlan(char({ active }), [1, 2, 3], byId); // 2 slots short
    expect(plan).toMatchObject({ status: 'noroom', send: [], cancel: [], needed: 2, freeable: 1 });
  });

  it('skips exactly what Apply skips', () => {
    const c = char({ active: [{ id: 2, p: 0 }], doneIds: new Set([1]), donePagesKnown: new Set([0]) });
    const ids = [1, 2, 3, 4013];
    const [add] = buildAddPlan([c], ids, byId);
    expect(buildSetPlan(c, ids, byId)).toMatchObject({
      skipAuto: add.skipAuto, skipUnlisted: add.skipUnlisted, skipActive: add.skipActive, skipDone: add.skipDone, send: add.send,
    });
  });

  it('is offline for a disconnected character', () => {
    expect(buildSetPlan(char({ online: false, active: fill(30) }), [1], byId)).toMatchObject({ status: 'offline', send: [], cancel: [] });
  });
});
