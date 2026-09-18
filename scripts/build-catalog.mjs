// Builds public/roe_catalog.json.
//
//   node scripts/build-catalog.mjs            downloads the BG-Wiki page into data/cache/ then builds
//   node scripts/build-catalog.mjs --offline  uses the cached page only (fails if it is missing)
//
// Sources (see data/LICENSES.md):
//   data/roe_mapping.lua  -> the authority for ids and names (retail-derived)
//   BG-Wiki               -> categories, goal, repeat flag and rewards, joined by normalised name
// Nothing here may add or rename an id. The wiki only decorates ids that exist in the mapping.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeName, editDistance } from '../src/roe/normalize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAPPING = join(ROOT, 'data', 'roe_mapping.lua');
const CACHE = join(ROOT, 'data', 'cache', 'bg-wiki-roe.html');
const OUT = join(ROOT, 'public', 'roe_catalog.json');
const WIKI_URL = 'https://www.bg-wiki.com/ffxi/Records_of_Eminence';
// Same value as AUTO_RANGE in src/roe/types.ts (the canonical constant; created in a later task). Keep them equal.
const AUTO_RANGE = [4008, 4021];

// Wiki spellings that differ from the client name for a reason other than a typo.
// Key: normalised wiki name, value: normalised client name.
const ALIASES = new Map([
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
].map(([w, c]) => [normalizeName(w), normalizeName(c)]));

// Category guesses for ids the wiki does not list, keyed on the client name.
const FALLBACK = [
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

function readMapping() {
  const text = readFileSync(MAPPING, 'utf8');
  const out = [];
  const re = /^\s*\[(\d+)\]\s*=\s*"((?:[^"\\]|\\.)*)"/gm;
  for (const m of text.matchAll(re)) {
    out.push({ id: Number(m[1]), n: m[2].replace(/\\"/g, '"').replace(/\\'/g, "'") });
  }
  if (out.length === 0) throw new Error(`no entries parsed from ${MAPPING}`);
  return out.sort((a, b) => a.id - b.id);
}

async function readWikiHtml(offline) {
  if (existsSync(CACHE) && offline) return readFileSync(CACHE, 'utf8');
  if (offline) throw new Error(`--offline but ${CACHE} is missing`);
  const res = await fetch(WIKI_URL, { headers: { 'User-Agent': 'Mozilla/5.0 roexi-catalog-build' } });
  if (!res.ok) throw new Error(`wiki fetch failed: ${res.status}`);
  const html = await res.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, html);
  return html;
}

const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cells = (tr) => [...tr.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gs)].map((m) => decode(m[1]));
const num = (s) => { const v = Number(String(s).replace(/,/g, '')); return Number.isFinite(v) && s !== '' ? v : undefined; };

/** Walk h2/h3/table in document order; return one row per objective with its category path. */
function parseWiki(html) {
  const rows = [];
  let cat = null, sub = null;
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
    if (hdrAt < 0) continue;                      // not an objective table (schedules, NPC lists…)
    const cols = cells(trs[hdrAt]);
    const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
    const get = (c, k) => (k in idx && idx[k] < c.length ? c[idx[k]] : '');
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

function decorate(r) {
  const d = { cat: r.cat, sub: r.sub };
  if (r.repeat !== undefined) d.repeat = r.repeat;
  if (r.goal !== undefined) d.goal = r.goal;
  if (r.sparks !== undefined) d.sparks = r.sparks;
  if (r.exp !== undefined) d.exp = r.exp;
  if (r.acc !== undefined) d.acc = r.acc;
  if (r.text) d.text = r.text;
  return d;
}

/** Among candidates, the single closest one within `max`; null when tied or none. */
function closest(key, cands, max) {
  let best = null, bestD = max + 1, tie = false;
  for (const c of cands) {
    const d = editDistance(key, c.key);
    if (d < bestD) { best = c; bestD = d; tie = false; }
    else if (d === bestD) tie = true;
  }
  return best && !tie ? best : null;
}

function joinSources(mapping, wikiRows) {
  const wikiBy = new Map();
  for (const r of wikiRows) {
    const k = normalizeName(r.name);
    const key = ALIASES.get(k) ?? k;
    if (!wikiBy.has(key)) wikiBy.set(key, []);
    wikiBy.get(key).push(r);
  }
  const report = { exact: 0, fuzzy: 0, fallback: 0, none: 0, unmatchedIds: [], unmatchedWiki: [] };
  const used = new Set();
  const entries = mapping.map((e) => ({ id: e.id, n: e.n }));
  let pending = [];

  // Pass 1: exact normalised name; the k-th duplicate on one side pairs with the k-th on the other
  // (the wiki lists "Guild Master's Request 1" once per guild in the same order as the ids).
  const seen = new Map();
  for (const e of entries) {
    const key = normalizeName(e.n);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const cands = wikiBy.get(key) ?? [];
    if (k < cands.length) { Object.assign(e, decorate(cands[k])); used.add(cands[k]); report.exact++; }
    else pending.push(e);
  }
  // Pass 2: fuzzy. For each leftover id, the unique closest leftover wiki row within 2 edits,
  // provided that row's closest leftover id is this one (mutual best match).
  const leftRows = wikiRows.filter((r) => !used.has(r)).map((r) => ({ r, key: normalizeName(r.name) }));
  const leftIds = pending.map((e) => ({ e, key: normalizeName(e.n) }));
  const still = [];
  for (const it of leftIds) {
    const hit = it.key.length >= 8 ? closest(it.key, leftRows.filter((x) => !used.has(x.r)), 2) : null;
    const back = hit ? closest(hit.key, leftIds.filter((x) => !x.e.cat), 2) : null;
    if (hit && back && back.e === it.e) { Object.assign(it.e, decorate(hit.r)); used.add(hit.r); report.fuzzy++; }
    else still.push(it.e);
  }
  pending = still;
  // Pass 3: category by name shape only.
  for (const e of pending) {
    const rule = FALLBACK.find(([re]) => re.test(e.n));
    if (rule) {
      const m = e.n.match(rule[0]);
      e.cat = rule[1];
      e.sub = typeof rule[2] === 'function' ? rule[2](m) : rule[2];
      report.fallback++;
    } else {
      report.none++;
    }
    report.unmatchedIds.push(`${e.id}:${e.n}`);
  }
  for (const r of wikiRows) if (!used.has(r)) report.unmatchedWiki.push(`${r.cat}/${r.sub}:${r.name}`);
  for (const e of entries) {
    if (e.id >= AUTO_RANGE[0] && e.id <= AUTO_RANGE[1]) { e.auto = true; e.cat = 'Other'; e.sub = 'Daily Objectives'; }
  }
  return { entries, report };
}

const offline = process.argv.includes('--offline');
const mapping = readMapping();
const wikiRows = parseWiki(await readWikiHtml(offline));
const { entries, report } = joinSources(mapping, wikiRows);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  builtAt: new Date().toISOString(),
  sources: { ids: 'commandobill/roe roe_mapping.lua (MIT)', meta: WIKI_URL },
  report: { exact: report.exact, fuzzy: report.fuzzy, fallback: report.fallback, none: report.none, wikiRows: wikiRows.length },
  entries,
}));
console.log(`ids ${entries.length}  wiki rows ${wikiRows.length}`);
console.log(`exact ${report.exact}  fuzzy ${report.fuzzy}  fallback-category ${report.fallback}  uncategorised ${report.none}`);
console.log(`unmatched ids (${report.unmatchedIds.length}):`);
for (const s of report.unmatchedIds.slice(0, 60)) console.log('  ' + s);
console.log(`unmatched wiki rows (${report.unmatchedWiki.length}):`);
for (const s of report.unmatchedWiki.slice(0, 60)) console.log('  ' + s);
console.log(`wrote ${OUT}`);
