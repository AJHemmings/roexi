import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CatalogEntry } from '../roe/types';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('catalog store', () => {
  it('applies live data that arrived before the built-in catalog finished loading', async () => {
    const builtIn: CatalogEntry[] = [{ id: 3780, n: 'Grow and Harvest (M)', cat: 'Other', sub: 'Monthly Objectives' }];
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ entries: builtIn }) }));
    const { applyLiveClient, loadCatalog } = await import('../roe/catalog');
    applyLiveClient([{ id: 3781, n: 'Mog Garden Items (M)', repeat: false, goal: 3, sparks: 50, exp: 500, acc: 0 }], [{ cat: 'Other', sub: 'Monthly Objectives', ids: [3781] }]);
    const c = await loadCatalog();
    expect(c.entries.map((e) => e.id)).toEqual([3781]);
    expect(c.byId.get(3780)?.unlisted).toBe(true);
  });

  it('re-merges over the built-in list each time, never over a previous merge', async () => {
    const builtIn: CatalogEntry[] = [{ id: 3780, n: 'Grow and Harvest (M)', cat: 'Other', sub: 'Monthly Objectives' }];
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ entries: builtIn }) }));
    const { applyLiveClient, loadCatalog } = await import('../roe/catalog');
    await loadCatalog();
    applyLiveClient([{ id: 3781, n: 'Mog Garden Items (M)', repeat: false, goal: 3, sparks: 50, exp: 500, acc: 0 }], [{ cat: 'Other', sub: 'Monthly Objectives', ids: [3781] }]);
    applyLiveClient(null, [{ cat: 'Other', sub: 'Monthly Objectives', ids: [3780] }]);
    const c = await loadCatalog();
    expect(c.entries.map((e) => [e.id, e.unlisted ?? false])).toEqual([[3780, false]]);
    expect(c.byId.has(3781)).toBe(false);
  });
});
