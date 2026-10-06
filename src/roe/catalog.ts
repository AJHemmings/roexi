// Runtime catalog loader. buildCatalog and relist are pure and tested directly; loadCatalog/useCatalog
// are the thin fetch+hook wrapper (the same useSyncExternalStore pattern as bridge/index.ts), and
// applyLiveMenu swaps in the game's live menu once liveMenu.ts has read it.
import { useEffect, useSyncExternalStore } from 'react';
import { isAutoId, catOf, subOf } from './types';
import type { CatalogEntry } from './types';

export type CategoryNode = { name: string; subs: Map<string, number[]> };
export type Catalog = {
  entries: CatalogEntry[];
  byId: Map<number, CatalogEntry>;
  tree: CategoryNode[];
  search(q: string): CatalogEntry[];
  isAddable(id: number): boolean;
};

export function buildCatalog(entries: CatalogEntry[]): Catalog {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const catOrder: string[] = [];
  const byCat = new Map<string, Map<string, number[]>>();
  for (const e of entries) {
    const cat = catOf(e);
    const sub = subOf(e);
    let subs = byCat.get(cat);
    if (!subs) { subs = new Map(); byCat.set(cat, subs); catOrder.push(cat); }
    let ids = subs.get(sub);
    if (!ids) { ids = []; subs.set(sub, ids); }
    ids.push(e.id);
  }
  const tree: CategoryNode[] = [...catOrder].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, subs: byCat.get(name)! }));

  function search(q: string): CatalogEntry[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    const idMatch = needle.match(/^#(\d+)$/);
    if (idMatch) {
      const e = byId.get(Number(idMatch[1]));
      return e ? [e] : [];
    }
    return entries.filter((e) => e.n.toLowerCase().includes(needle));
  }

  // Auto dailies are assigned by the game; unlisted ones aren't in its RoE menu right now (spec 2026-10-06 §8).
  const isAddable = (id: number): boolean => !isAutoId(id) && !byId.get(id)?.unlisted;

  return { entries, byId, tree, search, isAddable };
}

/**
 * Pure: entries with `unlisted` recomputed from the ids the game's live RoE menu lists (spec 2026-10-06 §8).
 * Entries whose status doesn't change keep their identity.
 */
export function relist(entries: CatalogEntry[], listed: ReadonlySet<number>): CatalogEntry[] {
  return entries.map((e) => {
    const unlisted = !listed.has(e.id);
    if ((e.unlisted === true) === unlisted) return e;
    if (unlisted) return { ...e, unlisted: true };
    const copy = { ...e };
    delete copy.unlisted;
    return copy;
  });
}

let cached: Catalog | null = null;
/** The game's live menu, once read; applied to the catalog whenever it (re)loads. */
let liveListed: ReadonlySet<number> | null = null;
const subs = new Set<() => void>();
const publish = (c: Catalog) => { cached = c; subs.forEach((f) => f()); };

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const res = await fetch('/roe_catalog.json');
  const data = (await res.json()) as { entries: CatalogEntry[] };
  if (!cached) publish(buildCatalog(liveListed ? relist(data.entries, liveListed) : data.entries));
  return cached!;
}

/** Replace the build-time snapshot with the game's live menu (liveMenu.ts). */
export function applyLiveMenu(listed: ReadonlySet<number>): void {
  liveListed = listed;
  if (cached) publish(buildCatalog(relist(cached.entries, listed)));
}

/** null while loading; loads once and is shared by every caller. Re-renders when the live menu arrives. */
export function useCatalog(): Catalog | null {
  const catalog = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => cached, () => cached);
  useEffect(() => {
    if (!cached) loadCatalog().catch((e: unknown) => console.warn('[roexi] catalog load failed', e));
  }, []);
  return catalog;
}
