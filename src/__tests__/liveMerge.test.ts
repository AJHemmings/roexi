import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeLiveCatalog } from '../roe/liveMerge';
import type { ClientEntry } from '../roe/clientDat';
import type { MenuSection } from '../roe/clientMenu';
import type { CatalogEntry } from '../roe/types';

const live = (id: number, n: string, over: Partial<ClientEntry> = {}): ClientEntry => ({ id, n, repeat: false, goal: 1, sparks: 10, exp: 100, acc: 0, ...over });

describe('mergeLiveCatalog', () => {
  it("takes names, numbers and text from the live table", () => {
    const builtIn: CatalogEntry[] = [{ id: 3788, n: 'High-Tier (M)', goal: 1, sparks: 1000, text: 'Ark Angels 3', cat: 'Other', sub: 'Monthly Objectives' }];
    const { entries } = mergeLiveCatalog(builtIn, [live(3788, 'High-Tier (M)', { goal: 2, sparks: 1000, text: 'Ark Angels 4' })], [{ cat: 'Other', sub: 'Monthly Objectives', ids: [3788] }]);
    expect(entries).toEqual([{ id: 3788, n: 'High-Tier (M)', repeat: false, goal: 2, sparks: 1000, exp: 100, acc: 0, text: 'Ark Angels 4', cat: 'Other', sub: 'Monthly Objectives' }]);
  });

  it('files by the live menu first, then the built-in section, then the name rules, then nothing', () => {
    const builtIn: CatalogEntry[] = [
      { id: 1, n: 'Moved', cat: 'Old', sub: 'Old' },
      { id: 2, n: 'Echoes of Creation (VB)', cat: 'Special Events', sub: "Vana'bout Round" },
    ];
    const menu: MenuSection[] = [{ cat: 'Tutorial', sub: 'Basics', ids: [1] }];
    const { entries } = mergeLiveCatalog(builtIn, [live(1, 'Moved'), live(2, 'Echoes of Creation (VB)'), live(3781, 'Mog Garden Items (M)'), live(5000, 'Brand New')], menu);
    expect(entries.map((e) => [e.id, e.cat, e.sub])).toEqual([
      [1, 'Tutorial', 'Basics'],
      [2, 'Special Events', "Vana'bout Round"],
      [3781, 'Other', 'Monthly Objectives'],
      [5000, undefined, undefined],
    ]);
    expect('cat' in entries[3]).toBe(false);
  });

  it('marks what the menu does not list, and only that', () => {
    const { entries } = mergeLiveCatalog([], [live(1, 'A'), live(2, 'B')], [{ cat: 'X', sub: 'Y', ids: [1] }]);
    expect('unlisted' in entries[0]).toBe(false);
    expect(entries[1].unlisted).toBe(true);
  });

  it('files the auto dailies as Other / Daily Objectives', () => {
    const { entries } = mergeLiveCatalog([], [live(4013, 'Gain Experience')], [{ cat: 'X', sub: 'Y', ids: [1] }]);
    expect(entries[0]).toMatchObject({ id: 4013, auto: true, cat: 'Other', sub: 'Daily Objectives', unlisted: true });
  });

  it('leaves out retired ids and internal goal-0 flags', () => {
    const { entries, nameOnly } = mergeLiveCatalog([], [live(772, 'Limbus thing'), live(900, 'Scenarios 3', { goal: 0 }), live(1, 'Real')], []);
    expect(entries.map((e) => e.id)).toEqual([1]);
    expect(nameOnly).toEqual([]);
  });

  it('keeps objectives the game has blanked as name-only, unlisted', () => {
    const builtIn: CatalogEntry[] = [{ id: 3780, n: 'Grow and Harvest (M)', cat: 'Other', sub: 'Monthly Objectives' }, { id: 1, n: 'A' }];
    const { entries, nameOnly } = mergeLiveCatalog(builtIn, [live(1, 'A')], [{ cat: 'X', sub: 'Y', ids: [1] }]);
    expect(entries.map((e) => e.id)).toEqual([1]);
    expect(nameOnly).toEqual([{ id: 3780, n: 'Grow and Harvest (M)', cat: 'Other', sub: 'Monthly Objectives', unlisted: true }]);
  });

  it("omits text when the live entry has none", () => {
    const { entries } = mergeLiveCatalog([{ id: 1, n: 'A', text: 'old' }], [live(1, 'A')], []);
    expect('text' in entries[0]).toBe(false);
  });

  it("gives back today's built-in catalog unchanged from today's client data", () => {
    const client = JSON.parse(readFileSync('data/roe_client.json', 'utf8')) as { entries: ClientEntry[]; menu: MenuSection[] };
    const builtIn = (JSON.parse(readFileSync('public/roe_catalog.json', 'utf8')) as { entries: CatalogEntry[] }).entries;
    const { entries, nameOnly } = mergeLiveCatalog(builtIn, client.entries, client.menu);
    expect(nameOnly).toEqual([]);
    expect(entries).toEqual(builtIn);
  });
});
