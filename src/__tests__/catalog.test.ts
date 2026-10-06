import { describe, it, expect } from 'vitest';
import { buildCatalog, relist } from '../roe/catalog';
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

  it("isAddable is false for an objective the game's menu doesn't list right now", () => {
    const withEvent = buildCatalog([...ENTRIES, { id: 2999, n: 'Echoes of Creation (VB)', cat: 'Special Events', sub: "Vana'bout Round", unlisted: true }]);
    expect(withEvent.isAddable(2999)).toBe(false);
    expect(withEvent.isAddable(1)).toBe(true);
  });
});

describe('relist', () => {
  const entries: CatalogEntry[] = [
    { id: 1, n: 'First Step Forward' },
    { id: 2999, n: 'Echoes of Creation (VB)', unlisted: true },
    { id: 4013, n: 'Gain Experience', auto: true, unlisted: true },
  ];

  it("marks exactly what the game's live menu doesn't list", () => {
    const live = relist(entries, new Set([1, 2999]));
    expect(live.map((e) => [e.id, e.unlisted ?? false])).toEqual([[1, false], [2999, false], [4013, true]]);
    expect('unlisted' in live[1]).toBe(false);
    expect(relist(entries, new Set([2999]))[0]).toMatchObject({ id: 1, unlisted: true });
  });

  it('keeps the same object for an entry whose status did not change', () => {
    const live = relist(entries, new Set([1]));
    expect(live[0]).toBe(entries[0]);
    expect(live[1]).toBe(entries[1]);
  });

  it('feeds isAddable once rebuilt: an event the game lists again becomes addable', () => {
    expect(buildCatalog(entries).isAddable(2999)).toBe(false);
    expect(buildCatalog(relist(entries, new Set([1, 2999]))).isAddable(2999)).toBe(true);
  });
});
