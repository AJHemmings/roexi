// Merges the objective table read live from the player's own client over the built-in catalog
// (spec 2026-10-13 §5). Pure. The filing rules mirror joinSources in catalogBuild.ts, so a build and a
// live read of the same client files give the same catalog (tested on the committed data).
import type { ClientEntry } from './clientDat';
import type { MenuSection } from './clientMenu';
import { isAutoId, type CatalogEntry } from './types';
import { FALLBACK, RETIRED, isInternalFlag } from './catalogBuild';

function fallbackSection(name: string): { cat: string; sub: string } | null {
  for (const [re, cat, sub] of FALLBACK) {
    const m = name.match(re);
    if (m) return { cat, sub: typeof sub === 'function' ? sub(m) : sub };
  }
  return null;
}

/** `entries`: what the game has now. `nameOnly`: built-in objectives the game has blanked (kept so a
 * character that still has one active sees its name), always unlisted. */
export function mergeLiveCatalog(builtIn: CatalogEntry[], live: ClientEntry[], menu: readonly MenuSection[]): { entries: CatalogEntry[]; nameOnly: CatalogEntry[] } {
  const known = new Map(builtIn.map((e) => [e.id, e]));
  const placed = new Map<number, MenuSection>();
  for (const s of menu) for (const id of s.ids) if (!placed.has(id)) placed.set(id, s);
  const seen = new Set<number>();
  const entries: CatalogEntry[] = [];
  for (const c of live) {
    if (RETIRED.includes(c.id) || isInternalFlag(c)) continue;
    seen.add(c.id);
    const e: CatalogEntry = { id: c.id, n: c.n, repeat: c.repeat, goal: c.goal, sparks: c.sparks, exp: c.exp, acc: c.acc, ...(c.text ? { text: c.text } : {}) };
    // Built-in filing first (the build's wiki join, field by field like decorate()), else the name rules.
    const base = known.get(c.id);
    if (base && (base.cat !== undefined || base.sub !== undefined)) {
      if (base.cat !== undefined) e.cat = base.cat;
      if (base.sub !== undefined) e.sub = base.sub;
    } else {
      const section = fallbackSection(c.n);
      if (section) { e.cat = section.cat; e.sub = section.sub; }
    }
    if (isAutoId(c.id)) { e.auto = true; e.cat = 'Other'; e.sub = 'Daily Objectives'; }
    const s = placed.get(c.id);
    if (s) { e.cat = s.cat; e.sub = s.sub; } else e.unlisted = true;
    entries.push(e);
  }
  const nameOnly = builtIn.filter((e) => !seen.has(e.id) && !RETIRED.includes(e.id)).map((e) => ({ ...e, unlisted: true }));
  return { entries, nameOnly };
}
