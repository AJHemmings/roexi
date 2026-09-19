import { describe, it, expect } from 'vitest';
import { buildAddPlan, buildRemovePlan } from '../roe/plan';
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
