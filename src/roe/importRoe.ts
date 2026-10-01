// Import of the Windower roe addon's saved profiles (addons\roe\data\settings.xml) as roexi Sets.
// Everything here is pure so the whole decision flow is unit-tested; ImportRoeModal is just a view
// over planImport → validateImport → buildImportedSets.
import type { RoeSet } from './types';

export type RoeProfile = { name: string; ids: number[] };

// Regex, not an XML parser, on purpose: the file has one writer (Windower's config lib, called by
// roe.lua as settings:save('global')) and it always produces a flat
// <profiles><name>id,id,…</name>…</profiles> block. Returns null when there's no profiles block at
// all, which the caller reports as "not a roe settings.xml".
export function parseRoeProfiles(xml: string): RoeProfile[] | null {
  const block = xml.match(/<profiles>([\s\S]*?)<\/profiles>/i);
  if (!block) return null;
  const out: RoeProfile[] = [];
  for (const m of block[1].matchAll(/<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g)) {
    const ids = [...new Set(m[2].split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number).filter((n) => n > 0))];
    if (ids.length) out.push({ name: m[1], ids });
  }
  return out;
}

// One existing set that shares at least one id with an imported profile, with the ids split the
// way the Compare panel shows them.
export type IdMatch = { set: RoeSet; shared: number[]; onlyImport: number[]; onlyExisting: number[] };

// Order-insensitive: roe stores a profile as an unordered set, so [1,2] and [2,1] are the same.
// Assumes no duplicates, which parseRoeProfiles and roexi's own sets both guarantee.
export function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// A match is any shared id (the user's choice), not a shared name: names are labels, ids define a set.
export function findMatches(sets: RoeSet[], ids: number[]): IdMatch[] {
  const mine = new Set(ids);
  return sets
    .map((s) => {
      const theirs = new Set(s.ids);
      return { set: s, shared: ids.filter((i) => theirs.has(i)), onlyImport: ids.filter((i) => !theirs.has(i)), onlyExisting: s.ids.filter((i) => !mine.has(i)) };
    })
    .filter((m) => m.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);
}

// Case-insensitive like validateSetName: "monthly" → "monthly (2)" → "monthly (3)" …
export function uniqueName(base: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
