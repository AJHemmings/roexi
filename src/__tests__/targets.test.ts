import { describe, it, expect } from 'vitest';
import { computeRemoveDefault, resolveTargets } from '../roe/targets';
import type { KnownChar } from '../roe/types';

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
