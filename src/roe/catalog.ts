// Runtime catalog loader. buildCatalog is pure and tested directly; loadCatalog/useCatalog
// are the thin fetch+hook wrapper that bridge/index.ts also uses this pattern for.
import { useEffect, useState } from 'react';
import { isAutoId } from './types';
import type { CatalogEntry } from './types';

const UNCATEGORIZED = 'Uncategorized';

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
    const cat = e.cat ?? UNCATEGORIZED;
    const sub = e.sub ?? UNCATEGORIZED;
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

  const isAddable = (id: number): boolean => !isAutoId(id);

  return { entries, byId, tree, search, isAddable };
}

let cached: Catalog | null = null;
export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const res = await fetch('/roe_catalog.json');
  const data = (await res.json()) as { entries: CatalogEntry[] };
  cached = buildCatalog(data.entries);
  return cached;
}

/** null while loading; loads once and is shared by every caller. */
export function useCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    loadCatalog().then((c) => { if (alive) setCatalog(c); }).catch((e: unknown) => console.warn('[roexi] catalog load failed', e));
    return () => { alive = false; };
  }, []);
  return catalog;
}
