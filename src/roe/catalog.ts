// Runtime catalog loader. buildCatalog, relist and composeCatalog are pure and tested directly;
// loadCatalog/useCatalog are the thin fetch+hook wrapper (the same useSyncExternalStore pattern as
// bridge/index.ts), and applyLiveClient merges in what liveClient.ts read from the player's own game.
import { useEffect, useSyncExternalStore } from 'react';
import { isAutoId, catOf, subOf } from './types';
import type { CatalogEntry } from './types';
import type { ClientEntry } from './clientDat';
import { menuIds, type MenuSection } from './clientMenu';
import { mergeLiveCatalog } from './liveMerge';

export type CategoryNode = { name: string; subs: Map<string, number[]> };
export type Catalog = {
  entries: CatalogEntry[];
  byId: Map<number, CatalogEntry>;
  tree: CategoryNode[];
  search(q: string): CatalogEntry[];
  isAddable(id: number): boolean;
};

/** `nameOnly`: objectives the game no longer has, kept so ids still resolve to names (spec 2026-10-13 §6). They
 * are left out of entries, the tree and search; being unlisted, they aren't addable either. */
export function buildCatalog(entries: CatalogEntry[], nameOnly: CatalogEntry[] = []): Catalog {
  const byId = new Map([...entries, ...nameOnly].map((e) => [e.id, e]));

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
      const e = entries.find((x) => x.id === Number(idMatch[1]));
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

/** What liveClient.ts read: the objective table (null when only the menu could be read) and the menu. */
export type LiveClient = { entries: ClientEntry[] | null; menu: MenuSection[] };

/** Pure: the published catalog for a built-in list plus whatever has been read live (spec 2026-10-13 §6). */
export function composeCatalog(builtIn: CatalogEntry[], live: LiveClient | null): Catalog {
  if (!live) return buildCatalog(builtIn);
  if (!live.entries) return buildCatalog(relist(builtIn, menuIds(live.menu)));
  const { entries, nameOnly } = mergeLiveCatalog(builtIn, live.entries, live.menu);
  return buildCatalog(entries, nameOnly);
}

let cached: Catalog | null = null;
/** /roe_catalog.json as shipped. Every live read is merged over this, never over a previous merge. */
let builtIn: CatalogEntry[] | null = null;
/** The latest live read, kept so it applies when the built-in list finishes loading after it. */
let live: LiveClient | null = null;
const subs = new Set<() => void>();
const publish = (c: Catalog) => { cached = c; subs.forEach((f) => f()); };

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const res = await fetch('/roe_catalog.json');
  const data = (await res.json()) as { entries: CatalogEntry[] };
  builtIn ??= data.entries;
  if (!cached) publish(composeCatalog(builtIn, live));
  return cached!;
}

/** Called by liveClient.ts with what it read from the player's own game. */
export function applyLiveClient(entries: ClientEntry[] | null, menu: MenuSection[]): void {
  live = { entries, menu };
  if (builtIn) publish(composeCatalog(builtIn, live));
}

/** null while loading; loads once and is shared by every caller. Re-renders when a live read arrives. */
export function useCatalog(): Catalog | null {
  const catalog = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => cached, () => cached);
  useEffect(() => {
    if (!cached) loadCatalog().catch((e: unknown) => console.warn('[roexi] catalog load failed', e));
  }, []);
  return catalog;
}
