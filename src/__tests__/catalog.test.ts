import { describe, it, expect } from 'vitest';
import { buildCatalog } from '../roe/catalog';
import type { CatalogEntry } from '../roe/types';

const ENTRIES: CatalogEntry[] = [
  { id: 1, n: 'First Step Forward', cat: 'Tutorial', sub: 'Basics' },
  { id: 2, n: 'Vanquish One Enemy', cat: 'Tutorial', sub: 'Basics' },
  { id: 77, n: 'Conflict: La Theine Plateau', cat: 'Combat (Region)', sub: 'Combat (Region)' },
  { id: 99, n: 'Uncategorized Objective' },
  { id: 4013, n: 'Daily Objective (D)', cat: 'Other', sub: 'Daily Objectives', auto: true },
];

describe('buildCatalog', () => {
  const catalog = buildCatalog(ENTRIES);

  it('indexes every entry by id', () => {
    expect(catalog.byId.get(1)?.n).toBe('First Step Forward');
    expect(catalog.byId.get(4013)?.auto).toBe(true);
    expect(catalog.byId.get(12345)).toBeUndefined();
  });

  it('groups into a category -> subcategory -> ids tree, alphabetical by category', () => {
    const names = catalog.tree.map((c) => c.name);
    expect(names).toEqual(['Combat (Region)', 'Other', 'Tutorial', 'Uncategorized']);
    expect(catalog.tree.find((c) => c.name === 'Tutorial')!.subs.get('Basics')).toEqual([1, 2]);
  });

  it('falls back to Uncategorized/Uncategorized when cat or sub is missing', () => {
    const uncat = catalog.tree.find((c) => c.name === 'Uncategorized')!;
    expect(uncat.subs.get('Uncategorized')).toEqual([99]);
  });

  it('search matches by case-insensitive substring of the name', () => {
    expect(catalog.search('vanquish').map((e) => e.id)).toEqual([2]);
    expect(catalog.search('VANQUISH').map((e) => e.id)).toEqual([2]);
  });

  it('search matches #id exactly and returns nothing for an unknown id', () => {
    expect(catalog.search('#77').map((e) => e.id)).toEqual([77]);
    expect(catalog.search('#999999')).toEqual([]);
  });

  it('search with an empty/whitespace query returns everything', () => {
    expect(catalog.search('  ')).toHaveLength(ENTRIES.length);
  });

  it('isAddable is false only for ids in the auto range', () => {
    expect(catalog.isAddable(1)).toBe(true);
    expect(catalog.isAddable(4013)).toBe(false);
  });

  it('isAddable is true for an id not in the catalog at all, since it only checks the auto range', () => {
    expect(catalog.isAddable(99999)).toBe(true);
  });
});
