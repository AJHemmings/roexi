import { describe, it, expect } from 'vitest';
import { validateSetName, mergeIds } from '../roe/sets';
import type { RoeSet } from '../roe/types';

const set = (name: string, over: Partial<RoeSet> = {}): RoeSet => ({
  id: name.toLowerCase(), name, ids: [], createdAt: 0, updatedAt: 0, ...over,
});

describe('validateSetName', () => {
  it('rejects an empty name', () => {
    expect(validateSetName([], '')).toBe('Name is required');
  });

  it('rejects a whitespace-only name', () => {
    expect(validateSetName([], '   ')).toBe('Name is required');
  });

  it('accepts a unique trimmed name', () => {
    expect(validateSetName([], '  Weekly Grind  ')).toBeNull();
  });

  it('rejects a case-insensitive duplicate', () => {
    const sets = [set('Weekly Grind')];
    expect(validateSetName(sets, 'weekly grind')).toBe('A set with this name already exists');
  });

  it('allows a rename that keeps its own name, when excluded by id', () => {
    const sets = [set('Weekly Grind')];
    expect(validateSetName(sets, 'Weekly Grind', 'weekly grind')).toBeNull();
  });

  it('still rejects colliding with a different set when excluding self', () => {
    const sets = [set('Weekly Grind'), set('Daily Logins')];
    expect(validateSetName(sets, 'Daily Logins', 'weekly grind')).toBe('A set with this name already exists');
  });
});

describe('mergeIds', () => {
  it('unions two id lists', () => {
    expect(mergeIds([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it('returns the original list when nothing new is added', () => {
    expect(mergeIds([1, 2], [])).toEqual([1, 2]);
  });

  it('dedupes ids already present multiple times in the input', () => {
    expect(mergeIds([1], [1, 1, 2])).toEqual([1, 2]);
  });
});
