// Builds public/roe_catalog.json.
//
//   node scripts/build-catalog.mjs            downloads the BG-Wiki page into data/cache/ then builds
//   node scripts/build-catalog.mjs --offline  uses the cached page only (fails if it is missing)
//
// All parsing and join logic lives in src/roe/catalogBuild.ts (covered by src/__tests__/catalogBuild.test.ts).
// This file only does I/O: read the two sources, run the join, sanity-check the result, write the JSON
// and print the report. Nothing here may add or rename an id; the wiki only decorates ids in the mapping.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMapping, parseWiki, joinSources } from '../src/roe/catalogBuild.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAPPING = join(ROOT, 'data', 'roe_mapping.lua');
const CACHE = join(ROOT, 'data', 'cache', 'bg-wiki-roe.html');
const OUT = join(ROOT, 'public', 'roe_catalog.json');
const WIKI_URL = 'https://www.bg-wiki.com/ffxi/Records_of_Eminence';

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

const offline = process.argv.includes('--offline');
const mapping = parseMapping(readFileSync(MAPPING, 'utf8'));
const wikiRows = parseWiki(await readWikiHtml(offline));
const { entries, report } = joinSources(mapping, wikiRows);

// If the wiki markup drifts (renamed columns, restructured headings) the parser degrades quietly to a
// near-empty result rather than crashing. Refuse to overwrite a good catalog with one.
if (wikiRows.length < 1000) {
  throw new Error(`only ${wikiRows.length} wiki rows parsed (expected at least 1000); the page markup has probably changed`);
}
if (report.exact < 1200) {
  throw new Error(`only ${report.exact} exact name matches (expected at least 1200); the page markup has probably changed`);
}

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
