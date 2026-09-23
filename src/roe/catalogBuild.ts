// Pure logic behind scripts/build-catalog.mjs: parse the id list and the BG-Wiki page, then join
// them by normalised name. No Node imports, so it runs unchanged under Vitest.
//
// Sources (see data/LICENSES.md):
//   data/roe_mapping.lua  -> the authority for ids and names (retail-derived)
//   BG-Wiki               -> categories, goal, repeat flag and rewards, joined by normalised name
// Nothing here may add or rename an id. The wiki only decorates ids that exist in the mapping.

import { normalizeName, editDistance } from './normalize.ts';

export type MappingEntry = { id: number; n: string };
export type WikiRow = {
  cat: string | null;
  sub: string | null;
  name: string;
  text: string;
  goal?: number;
  repeat?: boolean;
  sparks?: number;
  exp?: number;
  acc?: number;
};
export type CatalogEntry = {
  id: number;
  n: string;
  cat?: string;
  sub?: string;
  repeat?: boolean;
  goal?: number;
  sparks?: number;
  exp?: number;
  acc?: number;
  text?: string;
  auto?: boolean;
};
export type JoinReport = {
  exact: number;
  fuzzy: number;
  fallback: number;
  none: number;
  unmatchedIds: string[];
  unmatchedWiki: string[];
};
export type FallbackRule = [RegExp, string, string | ((m: RegExpMatchArray) => string)];

// Same value as AUTO_RANGE in src/roe/types.ts (the canonical constant; created in a later task). Keep them equal.
export const AUTO_RANGE: readonly [number, number] = [4008, 4021];

// Wiki spellings that differ from the client name for a reason other than a typo.
// Key: normalised wiki name, value: normalised client name.
const ALIAS_PAIRS: [string, string][] = [
  ['windurst rank 4 1', 'windurst rank 4'],
  ['signet brb w', 'signet'],
  ['level sync to vanquish enemies', 'level sync to vanquish enemies i'],
  ['the arciela directive 1', 'the arciela directive'],
  ['obtain seals', 'spoils seals'],
  ['region selbina mhuara ferry', 'selbina mhaura ferry'],
  ['clear ambuscades vbd', 'clear an ambuscade vbd'],
  ['heal 300 hp vbd', 'heal 300 damage vbd'],
  ['asquire hallmarks vb', 'obtain hallmarks vb'],
  ['receive damage vb', 'damage received vb'],
];
export const ALIASES: Map<string, string> = new Map(
  ALIAS_PAIRS.map(([w, c]): [string, string] => [normalizeName(w), normalizeName(c)]),
);

// Category guesses for ids the wiki does not list, keyed on the client name.
export const FALLBACK: FallbackRule[] = [
  [/^(san d'oria|bastok|windurst) rank/i, 'Tutorial', (m) => `Missions (${m[1]})`],
  [/^rise of the zilart/i, 'Tutorial', 'Missions (Zilart)'],
  [/^chains of promathia/i, 'Tutorial', 'Missions (Promathia)'],
  [/^treasures of aht urhgan/i, 'Tutorial', 'Missions (Aht Urhgan)'],
  [/^wings of the goddess/i, 'Tutorial', 'Missions (Altana)'],
  [/^seekers of adoulin/i, 'Tutorial', 'Missions (Adoulin)'],
  [/\(uc\)$/i, 'Unity', 'Unity'],
  [/\(vbd\)$/i, 'Special Events', "Vana'bout Daily"],
  [/\(vb\)$/i, 'Special Events', "Vana'bout Round"],
  [/\(m\)$/i, 'Other', 'Monthly Objectives'],
  [/\(d\)$/i, 'Other', 'Daily Objectives'],
  [/\(w\)$/i, 'Other', 'Weekly Objectives'],
  [/^conflict:/i, 'Combat (Region)', 'Combat (Region)'],
  [/^subj(ugation|\.):/i, 'Combat (Region)', 'Subjugation'],
  [/^spoils/i, 'Combat (Wide Area)', 'Combat (Spoils)'],
  [/^harvesting:/i, 'Harvesting', 'Harvesting'],
  [/scenarios/i, 'Other', 'Scenarios'],
  [/^escutcheon:/i, 'Crafting', 'Escutcheons'],
  [/^fame:/i, 'Achievements', 'Fame'],
  [/^region:/i, 'Fishing', 'Fishing: Tenacity'],
];

/** Parse `[id] = "name"` lines out of roe_mapping.lua; sorted by id. Throws when nothing parses. */
export function parseMapping(luaText: string): MappingEntry[] {
  const out: MappingEntry[] = [];
  const re = /^\s*\[(\d+)\]\s*=\s*"((?:[^"\\]|\\.)*)"/gm;
  for (const m of luaText.matchAll(re)) {
    out.push({ id: Number(m[1]), n: m[2].replace(/\\"/g, '"').replace(/\\'/g, "'") });
  }
  if (out.length === 0) throw new Error('no entries parsed from the mapping text');
  return out.sort((a, b) => a.id - b.id);
}

/** Strip tags, decode the entities the wiki uses, collapse whitespace. */
export function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cells = (tr: string): string[] => [...tr.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map((m) => decode(m[1]));
const num = (s: string): number | undefined => {
  const v = Number(s.replace(/,/g, ''));
  return Number.isFinite(v) && s !== '' ? v : undefined;
};

/** Walk h2/h3/table in document order; return one row per objective with its category path. */
export function parseWiki(html: string): WikiRow[] {
  const rows: WikiRow[] = [];
  let cat: string | null = null;
  let sub: string | null = null;
  for (const m of html.matchAll(/(<h([23])[^>]*>.*?<\/h\2>|<table[^>]*>.*?<\/table>)/gs)) {
    const tok = m[1];
    if (tok.startsWith('<h')) {
      const t = decode(tok);
      if (t === 'Contents') continue;            // the MediaWiki table-of-contents box
      if (m[2] === '2') { cat = t; sub = null; } else sub = t;
      continue;
    }
    const trs = [...tok.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((x) => x[1]);
    const hdrAt = trs.findIndex((tr) => {
      const c = cells(tr);
      return c.includes('Name') && (c.includes('Obj') || c.includes('Text') || c.includes('Sparks'));
    });
    if (hdrAt < 0) continue;                      // not an objective table (schedules, NPC lists, ...)
    const cols = cells(trs[hdrAt]);
    const idx: Record<string, number> = Object.fromEntries(cols.map((c, i) => [c, i]));
    const get = (c: string[], k: string): string => (k in idx && idx[k] < c.length ? c[idx[k]] : '');
    const shared = (sub ?? '').match(/^Unity \(Shared ([A-F])\)$/);
    const sharedLetter = shared ? shared[1] : null;
    for (const tr of trs.slice(hdrAt + 1)) {
      const c = cells(tr);
      const name = get(c, 'Name');
      if (!name) continue;
      rows.push({
        cat, sub,
        name: sharedLetter ? name.replace(/\s*\(UC\)$/, ` ${sharedLetter} (UC)`) : name,
        text: get(c, 'Text'),
        goal: num(get(c, 'Obj')),
        repeat: 'Repeat' in idx ? get(c, 'Repeat').toLowerCase().startsWith('y') : (cat === 'Unity' ? true : undefined),
        sparks: num(get(c, 'Sparks')),
        exp: num(get(c, 'Exp')),
        acc: num(get(c, 'Acco')),
      });
    }
  }
  return rows;
}

function decorate(r: WikiRow): Partial<CatalogEntry> {
  const d: Partial<CatalogEntry> = {};
  if (r.cat !== null) d.cat = r.cat;
  if (r.sub !== null) d.sub = r.sub;
  if (r.repeat !== undefined) d.repeat = r.repeat;
  if (r.goal !== undefined) d.goal = r.goal;
  if (r.sparks !== undefined) d.sparks = r.sparks;
  if (r.exp !== undefined) d.exp = r.exp;
  if (r.acc !== undefined) d.acc = r.acc;
  if (r.text) d.text = r.text;
  return d;
}

/**
 * Two normalised names are a typo pair when they have the same tokens except for exactly one,
 * and that token differs by at most 2 edits with both spellings at least 5 characters long.
 * Whole-string distance is deliberately not used: "fire" vs "ice" is 2 edits apart but is a
 * different objective, while "hennetiel" vs "hennitiel" is a genuine misspelling.
 */
export function isTypoPair(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  if (ta.length !== tb.length) return false;
  let diff = -1;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    if (diff !== -1) return false;
    diff = i;
  }
  if (diff === -1) return true;
  const x = ta[diff];
  const y = tb[diff];
  return x.length >= 5 && y.length >= 5 && editDistance(x, y) <= 2;
}

// The game lists Unity Wanted NMs in three sections, but the wiki only documents the first, so tiers 2
// and 3 used to fall through to the generic "Unity" bucket. Each tier is a fixed block of ids in the
// game's record table, so they're filed by id. Only Subjugation names count: the tier 3 block also
// holds the Escha Conflict objectives (901-912). The in-game section names aren't in any source we
// have, hence the neutral I/II/III.
export const UNITY_WANTED_TIERS: [number, number, string][] = [
  [817, 837, 'Unity (Wanted I)'],
  [854, 869, 'Unity (Wanted II)'],
  [891, 924, 'Unity (Wanted III)'],
];

function unityWantedTier(e: CatalogEntry): string | null {
  if (!/^subj(ugation|\.):/i.test(e.n)) return null;
  return UNITY_WANTED_TIERS.find(([lo, hi]) => e.id >= lo && e.id <= hi)?.[2] ?? null;
}

export function joinSources(mapping: MappingEntry[], wikiRows: WikiRow[]): { entries: CatalogEntry[]; report: JoinReport } {
  const wikiBy = new Map<string, WikiRow[]>();
  for (const r of wikiRows) {
    const k = normalizeName(r.name);
    const key = ALIASES.get(k) ?? k;
    let list = wikiBy.get(key);
    if (!list) { list = []; wikiBy.set(key, list); }
    list.push(r);
  }
  const report: JoinReport = { exact: 0, fuzzy: 0, fallback: 0, none: 0, unmatchedIds: [], unmatchedWiki: [] };
  const used = new Set<WikiRow>();
  const entries: CatalogEntry[] = mapping.map((e) => ({ id: e.id, n: e.n }));
  let pending: CatalogEntry[] = [];

  // Pass 1: exact normalised name; the k-th duplicate on one side pairs with the k-th on the other
  // (the wiki lists "Guild Master's Request 1" once per guild in the same order as the ids).
  const seen = new Map<string, number>();
  for (const e of entries) {
    const key = normalizeName(e.n);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const cands = wikiBy.get(key) ?? [];
    if (k < cands.length) { Object.assign(e, decorate(cands[k])); used.add(cands[k]); report.exact++; }
    else pending.push(e);
  }
  // Pass 2: typo pairs. A leftover id takes a leftover wiki row only when it is the one row that is a
  // typo pair of the id AND the id is the one leftover id that is a typo pair of the row.
  const leftRows = wikiRows.filter((r) => !used.has(r)).map((r) => ({ r, key: normalizeName(r.name) }));
  const leftIds = pending.map((e) => ({ e, key: normalizeName(e.n) }));
  const taken = new Set<CatalogEntry>();
  const still: CatalogEntry[] = [];
  for (const it of leftIds) {
    const hits = leftRows.filter((x) => !used.has(x.r) && isTypoPair(it.key, x.key));
    if (hits.length === 1) {
      const hit = hits[0];
      const back = leftIds.filter((x) => !taken.has(x.e) && isTypoPair(hit.key, x.key));
      if (back.length === 1 && back[0].e === it.e) {
        Object.assign(it.e, decorate(hit.r));
        used.add(hit.r);
        taken.add(it.e);
        report.fuzzy++;
        continue;
      }
    }
    still.push(it.e);
  }
  pending = still;
  // Pass 3: category by name shape only.
  for (const e of pending) {
    let matched = false;
    for (const [re, cat, sub] of FALLBACK) {
      const m = e.n.match(re);
      if (!m) continue;
      e.cat = cat;
      e.sub = typeof sub === 'function' ? sub(m) : sub;
      matched = true;
      break;
    }
    if (matched) report.fallback++; else report.none++;
    report.unmatchedIds.push(`${e.id}:${e.n}`);
  }
  for (const r of wikiRows) if (!used.has(r)) report.unmatchedWiki.push(`${r.cat}/${r.sub}:${r.name}`);
  for (const e of entries) {
    if (e.id >= AUTO_RANGE[0] && e.id <= AUTO_RANGE[1]) { e.auto = true; e.cat = 'Other'; e.sub = 'Daily Objectives'; }
    const tier = unityWantedTier(e);
    if (tier) { e.cat = 'Unity'; e.sub = tier; }
  }
  return { entries, report };
}
