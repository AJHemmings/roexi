import { describe, it, expect } from 'vitest';
import { shownEntries, categoryState, setCategoryShown, setSectionShown, hideAll, hiddenCount } from '../stats/sections';
import type { CatalogEntry } from '../roe/types';

const entries: CatalogEntry[] = [
  { id: 1, n: 'a', cat: 'Unity', sub: 'Unity (Wanted I)' },
  { id: 2, n: 'b', cat: 'Unity', sub: 'Unity (Wanted II)' },
  { id: 3, n: 'c', cat: 'Tutorial', sub: 'Basics' },
  { id: 4, n: 'd' },
];

describe('shownEntries', () => {
  it('returns the same array when nothing is hidden', () => expect(shownEntries(entries, [])).toBe(entries));
  it('drops a hidden section', () => expect(shownEntries(entries, ['Unity::Unity (Wanted II)']).map((e) => e.id)).toEqual([1, 3, 4]));
  it('a hidden category hides all its sections', () => expect(shownEntries(entries, ['Unity']).map((e) => e.id)).toEqual([3, 4]));
  it('handles entries with no category', () => expect(shownEntries(entries, ['Uncategorized']).map((e) => e.id)).toEqual([1, 2, 3]));
});

describe('categoryState', () => {
  it('on, partial and off', () => {
    expect(categoryState([], 'Unity')).toBe('on');
    expect(categoryState(['Unity::Unity (Wanted I)'], 'Unity')).toBe('partial');
    expect(categoryState(['Unity'], 'Unity')).toBe('off');
  });
  it('does not confuse a category with one whose name starts the same', () => {
    expect(categoryState(['Combat (Region)::X'], 'Combat')).toBe('on');
  });
});

describe('setCategoryShown / setSectionShown', () => {
  it('showing a category clears its own section keys too', () => {
    expect(setCategoryShown(['Unity', 'Unity::Unity (Wanted I)', 'Tutorial::Basics'], 'Unity', true)).toEqual(['Tutorial::Basics']);
  });
  it('hiding a category adds only its key, once', () => {
    expect(setCategoryShown(['Unity::Unity (Wanted I)'], 'Unity', false)).toEqual(['Unity::Unity (Wanted I)', 'Unity']);
    expect(setCategoryShown(['Unity'], 'Unity', false)).toEqual(['Unity']);
  });
  it('toggles one section key', () => {
    expect(setSectionShown([], 'Unity', 'Unity (Wanted I)', false)).toEqual(['Unity::Unity (Wanted I)']);
    expect(setSectionShown(['Unity::Unity (Wanted I)'], 'Unity', 'Unity (Wanted I)', true)).toEqual([]);
  });
});

describe('hideAll / hiddenCount', () => {
  it('hideAll hides every listed category and keeps other keys', () => {
    expect(hideAll(['Events::X'], ['Tutorial', 'Unity'])).toEqual(['Events::X', 'Tutorial', 'Unity']);
  });
  it('counts hidden categories plus hidden sections of shown categories', () => {
    expect(hiddenCount([])).toBe(0);
    expect(hiddenCount(['Unity', 'Unity::Unity (Wanted I)', 'Tutorial::Basics'])).toBe(2);
  });
  it('ignores saved keys for sections that no longer exist (e.g. renamed by a catalog update)', () => {
    const known = new Set(['Unity', 'Unity::Unity (Wanted 2)', 'Tutorial', 'Tutorial::Basics']);
    expect(hiddenCount(['Unity::Unity (Wanted II)', 'Tutorial::Basics'], known)).toBe(1);
  });
});
