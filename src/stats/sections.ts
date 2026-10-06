// Which categories and sections Stats → Completion / Objectives count (spec 2026-10-06 §3.2).
// `hidden` holds category keys ("Unity") and section keys (subKey: "Unity::Unity (Wanted II)").
import { catOf, subOf, subKey } from '../roe/completion';
import type { CatalogEntry } from '../roe/types';

export type CatState = 'on' | 'partial' | 'off';
const sectionPrefix = (cat: string): string => subKey(cat, '');
const isSectionKey = (k: string): boolean => k.includes('::');

/** The catalog minus every hidden category and section. The same array when nothing is hidden. */
export function shownEntries(entries: CatalogEntry[], hidden: readonly string[]): CatalogEntry[] {
  if (hidden.length === 0) return entries;
  const h = new Set(hidden);
  return entries.filter((e) => !h.has(catOf(e)) && !h.has(subKey(catOf(e), subOf(e))));
}

export function categoryState(hidden: readonly string[], cat: string): CatState {
  if (hidden.includes(cat)) return 'off';
  return hidden.some((k) => k.startsWith(sectionPrefix(cat))) ? 'partial' : 'on';
}

/** Showing a category shows all of it (its section keys go too); hiding it adds just the category key. */
export function setCategoryShown(hidden: readonly string[], cat: string, shown: boolean): string[] {
  if (shown) return hidden.filter((k) => k !== cat && !k.startsWith(sectionPrefix(cat)));
  return hidden.includes(cat) ? [...hidden] : [...hidden, cat];
}

export function setSectionShown(hidden: readonly string[], cat: string, sub: string, shown: boolean): string[] {
  const key = subKey(cat, sub);
  if (shown) return hidden.filter((k) => k !== key);
  return hidden.includes(key) ? [...hidden] : [...hidden, key];
}

/** Hide every listed category. Keys for categories not listed (other kinds) are kept. */
export const hideAll = (hidden: readonly string[], cats: readonly string[]): string[] => [...new Set([...hidden, ...cats])];

/** The "N hidden" note: hidden categories, plus hidden sections whose category is still shown. */
export function hiddenCount(hidden: readonly string[]): number {
  const cats = new Set(hidden.filter((k) => !isSectionKey(k)));
  return hidden.filter((k) => !isSectionKey(k) || !cats.has(k.slice(0, k.indexOf('::')))).length;
}
