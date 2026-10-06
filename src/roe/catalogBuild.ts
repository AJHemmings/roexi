// Pure logic behind scripts/build-catalog.mjs: parse the BG-Wiki page, then join it to the client's
// RoE table by normalised name. No Node imports, so it runs unchanged under Vitest.
//
// Sources (see data/LICENSES.md), all from data/roe_client.json unless noted:
//   entries  -> the authority for ids, names, repeat flag, goal, rewards and text (client ROM/307/16.DAT)
//   menu     -> the game's own category and section for everything its RoE menu lists (ROM/307/24.DAT)
//   BG-Wiki  -> category and section for what the menu doesn't list right now (event objectives between
//               events, the auto dailies), joined by normalised name
// Nothing here may add or rename an id. The wiki only files ids that exist in the client table.

import { normalizeName, editDistance } from './normalize.ts';
import type { ClientEntry } from './clientDat.ts';
import type { MenuSection } from './clientMenu.ts';

export type WikiRow = { cat: string | null; sub: string | null; name: string };
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
  unlisted?: boolean;
};
export type JoinReport = {
  exact: number;
  fuzzy: number;
  fallback: number;
  none: number;
  retired: number;
  internal: number;
  menuPlaced: number;
  unmatchedIds: string[];
  unmatchedWiki: string[];
};
/** [name pattern, category, subcategory]. */
export type FallbackRule = [RegExp, string, string | ((m: RegExpMatchArray) => string)];

// Same value as AUTO_RANGE in src/roe/types.ts (the canonical constant; created in a later task). Keep them equal.
export const AUTO_RANGE: readonly [number, number] = [4008, 4021];

// Removed from the game with the June 2025 version update (item-level Limbus replaced the old Limbus
// content): https://www.bg-wiki.com/ffxi/Records_of_Eminence#Content_(Limbus). The client still carries
// their records, so they're dropped by id.
export const RETIRED: readonly number[] = [772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783];

// The client also carries internal flags the game sets by itself and never lists in its menu: the
// "Scenarios N" / "Unlock Scenarios" story trackers, Mentor License Unlock, the "Escutcheon: X" quest flags
// and Lu Shang's rod. They are the only records with a goal of 0, which no real objective has, and their
// descriptions are blank or internal references ("926", "Records of Eminence Quest 2").
const isInternalFlag = (c: ClientEntry): boolean => c.goal === 0;

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
  ['north gustaberg uc', 'conflict north gustaberg uc'],
  ['dynamis divergence participation m', 'dynamis d instance participation m'],
];
export const ALIASES: Map<string, string> = new Map(
  ALIAS_PAIRS.map(([w, c]): [string, string] => [normalizeName(w), normalizeName(c)]),
);

// Category guesses for ids the wiki does not list, keyed on the client name.
export const FALLBACK: FallbackRule[] = [
  // Mission chapters: the wiki documents unlocks, not each chapter.
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
  [/^fame:/i, 'Achievements', 'Fame'],
  [/^region:/i, 'Fishing', 'Fishing: Tenacity'],
];

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
      rows.push({ cat, sub, name: sharedLetter ? name.replace(/\s*\(UC\)$/, ` ${sharedLetter} (UC)`) : name });
    }
  }
  return rows;
}

function decorate(r: WikiRow): Partial<CatalogEntry> {
  const d: Partial<CatalogEntry> = {};
  if (r.cat !== null) d.cat = r.cat;
  if (r.sub !== null) d.sub = r.sub;
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

/**
 * `menu` = the game's RoE menu (clientMenu.ts). Everything it lists takes the menu's category and section,
 * and everything it doesn't list right now is marked `unlisted` (the wiki/fallback filing still applies to
 * those). Without a menu, nothing is marked.
 */
export function joinSources(client: ClientEntry[], wikiRows: WikiRow[], menu?: readonly MenuSection[]): { entries: CatalogEntry[]; report: JoinReport } {
  const wikiBy = new Map<string, WikiRow[]>();
  for (const r of wikiRows) {
    const k = normalizeName(r.name);
    const key = ALIASES.get(k) ?? k;
    let list = wikiBy.get(key);
    if (!list) { list = []; wikiBy.set(key, list); }
    list.push(r);
  }
  const report: JoinReport = { exact: 0, fuzzy: 0, fallback: 0, none: 0, retired: 0, internal: 0, menuPlaced: 0, unmatchedIds: [], unmatchedWiki: [] };
  const used = new Set<WikiRow>();
  const entries: CatalogEntry[] = [];
  for (const c of client) {
    if (RETIRED.includes(c.id)) { report.retired++; continue; }
    if (isInternalFlag(c)) { report.internal++; continue; }
    entries.push({ id: c.id, n: c.n, repeat: c.repeat, goal: c.goal, sparks: c.sparks, exp: c.exp, acc: c.acc, ...(c.text ? { text: c.text } : {}) });
  }
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
  const placed = new Map<number, MenuSection>();
  for (const s of menu ?? []) for (const id of s.ids) if (!placed.has(id)) placed.set(id, s);
  for (const e of entries) {
    if (e.id >= AUTO_RANGE[0] && e.id <= AUTO_RANGE[1]) { e.auto = true; e.cat = 'Other'; e.sub = 'Daily Objectives'; }
    const s = placed.get(e.id);
    if (s) { e.cat = s.cat; e.sub = s.sub; report.menuPlaced++; }
    else if (menu) e.unlisted = true;
  }
  return { entries, report };
}
