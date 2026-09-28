// Completion counting for the Stats page and Library Quick stats. Spec 2026-09-28 §3.
// "How much is complete?" is answered only here. "Can this character still take it?" is answered
// only by locks.ts (objectiveState / isRemaining); leftToDo/neededBy below delegate to it.
import type { KnownChar, CatalogEntry } from './types';
import { isAutoId } from './types';
import { doneState } from './bitmap';
import { isRemaining, objectiveState, showInRemaining } from './locks';

export type Kind = 'one-time' | 'repeatable' | 'event' | 'unclassified';
export const KINDS: readonly Kind[] = ['one-time', 'repeatable', 'event', 'unclassified'];

/** Same fallback label catalog.ts uses for entries with no category. */
export const UNCATEGORIZED = 'Uncategorized';
export const catOf = (e: CatalogEntry): string => e.cat ?? UNCATEGORIZED;
export const subOf = (e: CatalogEntry): string => e.sub ?? UNCATEGORIZED;
export const subKey = (cat: string, sub: string): string => `${cat}::${sub}`;

/** null = never counted anywhere (the game's own rotating dailies, 4008-4021). */
export function kindOf(e: CatalogEntry): Kind | null {
  if (e.auto || isAutoId(e.id)) return null;
  // Event objectives can only be done during Vana'Bout / Vana'versary and their ids are reused per
  // round, so they never count toward one-time or repeatable completion.
  if (e.sub === "Vana'bout Round" || e.sub === "Vana'bout Daily" || e.cat === "Vana'versary") return 'event';
  if (e.repeat === false) return 'one-time';
  if (e.repeat === true) return 'repeatable';
  return 'unclassified';
}

/** The completion bit is set. For repeatables and events: completed at least once. */
export const isCompleted = (c: KnownChar, id: number): boolean => doneState(c, id) === 'done';

export type Tally = { done: number; total: number; unknown: number };
export const ZERO: Tally = { done: 0, total: 0, unknown: 0 };
/** Unknown counts as left, never done. */
export const left = (t: Tally): number => t.total - t.done;

export type CharCompletion = { name: string; overall: Tally; byCat: Map<string, Tally>; bySub: Map<string, Tally> };

function add(t: Tally, done: boolean, unknown: boolean): void {
  t.total++;
  if (done) t.done++;
  if (unknown) t.unknown++;
}
function addTo(m: Map<string, Tally>, key: string, done: boolean, unknown: boolean): void {
  let t = m.get(key);
  if (!t) { t = { done: 0, total: 0, unknown: 0 }; m.set(key, t); }
  add(t, done, unknown);
}

export function completionFor(c: KnownChar, entries: CatalogEntry[], kind: Kind): CharCompletion {
  const out: CharCompletion = { name: c.name, overall: { done: 0, total: 0, unknown: 0 }, byCat: new Map(), bySub: new Map() };
  for (const e of entries) {
    if (kindOf(e) !== kind) continue;
    const st = doneState(c, e.id);
    const done = st === 'done';
    const unknown = st === 'unknown';
    add(out.overall, done, unknown);
    addTo(out.byCat, catOf(e), done, unknown);
    addTo(out.bySub, subKey(catOf(e), subOf(e)), done, unknown);
  }
  return out;
}

/** Library Quick stats: by definition the Stats page's One-time Overall figure. */
export const quickStats = (c: KnownChar, entries: CatalogEntry[]): Tally => completionFor(c, entries, 'one-time').overall;

export const unclassifiedCount = (entries: CatalogEntry[]): number => entries.filter((e) => kindOf(e) === 'unclassified').length;

export function categoriesFor(entries: CatalogEntry[], kind: Kind): string[] {
  return [...new Set(entries.filter((e) => kindOf(e) === kind).map(catOf))].sort((a, b) => a.localeCompare(b));
}

export function subsFor(entries: CatalogEntry[], kind: Kind, cat: string): string[] {
  return [...new Set(entries.filter((e) => kindOf(e) === kind && catOf(e) === cat).map(subOf))].sort((a, b) => a.localeCompare(b));
}

/** The explorer's rows for a matrix cell. cat null = Overall; sub null = the whole category. */
export function cellEntries(entries: CatalogEntry[], kind: Kind, cat: string | null, sub: string | null): CatalogEntry[] {
  return entries.filter((e) => kindOf(e) === kind && (cat === null || catOf(e) === cat) && (sub === null || subOf(e) === sub));
}

/** Objectives of `kind` that at least one character in scope can still take: the Library Remaining rule. */
export function leftToDo(scope: KnownChar[], entries: CatalogEntry[], byId: Map<number, CatalogEntry>, kind: Kind): CatalogEntry[] {
  return entries.filter((e) => kindOf(e) === kind && showInRemaining(scope, e.id, byId));
}

export function neededBy(scope: KnownChar[], id: number, byId: Map<number, CatalogEntry>): string[] {
  return scope.filter((c) => isRemaining(objectiveState(c, id, byId))).map((c) => c.name);
}

export type LeftSort = 'sparks' | 'exp' | 'category' | 'name';
export const LEFT_SORTS: readonly LeftSort[] = ['sparks', 'exp', 'category', 'name'];

export function sortLeft(list: CatalogEntry[], by: LeftSort): CatalogEntry[] {
  const byName = (a: CatalogEntry, b: CatalogEntry) => a.n.localeCompare(b.n);
  const cmp: Record<LeftSort, (a: CatalogEntry, b: CatalogEntry) => number> = {
    sparks: (a, b) => (b.sparks ?? -1) - (a.sparks ?? -1) || byName(a, b),
    exp: (a, b) => (b.exp ?? -1) - (a.exp ?? -1) || byName(a, b),
    category: (a, b) => catOf(a).localeCompare(catOf(b)) || subOf(a).localeCompare(subOf(b)) || byName(a, b),
    name: byName,
  };
  return [...list].sort(cmp[by]);
}
