import { describe, it, expect } from 'vitest';
import { computeRemoveDefault, resolveTargets, addBlockReason, computeAddDefault } from '../roe/targets';
import type { KnownChar, CatalogEntry } from '../roe/types';

const char = (name: string, over: Partial<KnownChar> = {}): KnownChar => ({
  name, online: true, active: [], doneIds: new Set(), donePagesKnown: new Set(), ...over,
});

describe('computeRemoveDefault', () => {
  it('includes an online character with a matching active id', () => {
    const known = [char('Aldric', { active: [{ id: 10, p: 0 }] })];
    expect(computeRemoveDefault(known, [10])).toEqual(['Aldric']);
  });

  it('excludes an online character with none of the selected ids active', () => {
    const known = [char('Aldric', { active: [{ id: 10, p: 0 }] })];
    expect(computeRemoveDefault(known, [20])).toEqual([]);
  });

  it('excludes an offline character even with a matching active id', () => {
    const known = [char('Aldric', { online: false, active: [{ id: 10, p: 0 }] })];
    expect(computeRemoveDefault(known, [10])).toEqual([]);
  });

  it('includes a character when only one of several selected ids matches', () => {
    const known = [char('Aldric', { active: [{ id: 30, p: 0 }] })];
    expect(computeRemoveDefault(known, [10, 20, 30])).toEqual(['Aldric']);
  });
});

describe('resolveTargets', () => {
  it('resolves names to the matching KnownChar objects, in known order', () => {
    const known = [char('Aldric'), char('Brienne'), char('Cassius')];
    expect(resolveTargets(known, ['Cassius', 'Aldric'])).toEqual([char('Aldric'), char('Cassius')]);
  });

  it('ignores a name no longer present in known', () => {
    const known = [char('Aldric')];
    expect(resolveTargets(known, ['Aldric', 'Ghost'])).toEqual([char('Aldric')]);
  });

  it('returns an empty array for an empty name list', () => {
    const known = [char('Aldric')];
    expect(resolveTargets(known, [])).toEqual([]);
  });
});

const byId = new Map<number, CatalogEntry>([
  [10, { id: 10, n: 'One-time', repeat: false }],
  [20, { id: 20, n: 'Repeatable', repeat: true }],
]);
const thirty = Array.from({ length: 30 }, (_, i) => ({ id: 500 + i, p: 0 }));

describe('addBlockReason', () => {
  it('returns null for an online character with room who lacks the objective', () => {
    expect(addBlockReason(char('Aldric'), 10, byId)).toBeNull();
  });
  it("returns 'offline' for an offline character", () => {
    expect(addBlockReason(char('Aldric', { online: false }), 10, byId)).toBe('offline');
  });
  it("returns 'full' at 30 active", () => {
    expect(addBlockReason(char('Aldric', { active: thirty }), 10, byId)).toBe('full');
  });
  it("returns 'completed' for a confirmed-done non-repeatable", () => {
    const c = char('Aldric', { doneIds: new Set([10]), donePagesKnown: new Set([0]) });
    expect(addBlockReason(c, 10, byId)).toBe('completed');
  });
  it('returns null for a done repeatable', () => {
    const c = char('Aldric', { doneIds: new Set([20]), donePagesKnown: new Set([0]) });
    expect(addBlockReason(c, 20, byId)).toBeNull();
  });
  it("returns null when the completion page was never received (unknown isn't done)", () => {
    const c = char('Aldric', { doneIds: new Set([10]), donePagesKnown: new Set() });
    expect(addBlockReason(c, 10, byId)).toBeNull();
  });
  it("returns 'auto' for a daily auto-objective id", () => {
    expect(addBlockReason(char('Aldric'), 4010, byId)).toBe('auto');
  });
  it("returns 'active' when the character already has it", () => {
    expect(addBlockReason(char('Aldric', { active: [{ id: 10, p: 0 }] }), 10, byId)).toBe('active');
  });
  it("prefers 'completed' over 'offline' (logging in won't help)", () => {
    const c = char('Aldric', { online: false, doneIds: new Set([10]), donePagesKnown: new Set([0]) });
    expect(addBlockReason(c, 10, byId)).toBe('completed');
  });
  it("prefers 'auto' over everything", () => {
    expect(addBlockReason(char('Aldric', { online: false, active: thirty }), 4010, byId)).toBe('auto');
  });
});

describe('computeAddDefault', () => {
  it('includes only characters who could take at least one id, in known order', () => {
    const known = [char('Aldric', { online: false }), char('Brienne'), char('Cassius', { active: [{ id: 10, p: 0 }] })];
    expect(computeAddDefault(known, [10], byId)).toEqual(['Brienne']);
  });
  it('returns an empty list when nobody is eligible', () => {
    expect(computeAddDefault([char('Aldric', { online: false })], [10], byId)).toEqual([]);
  });
});
