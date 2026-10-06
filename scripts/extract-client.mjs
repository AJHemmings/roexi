// Extracts the Records of Eminence table from the FFXI client into data/roe_client.json (spec 2026-10-06 §2.3).
//
//   npm run extract:client                                      finds the install via the PlayOnline registry key
//   npm run extract:client -- "D:\Games\PlayOnline\SquareEnix\FINAL FANTASY XI"   uses that folder
//
// Parsing lives in src/roe/clientDat.ts (covered by src/__tests__/clientDat.test.ts). This file only does I/O:
// locate the client, read ROM/307/16.DAT, sanity-check, write the JSON and print what changed.
// Re-run after every FFXI version update, then run npm run build:catalog.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseRoeDat } from '../src/roe/clientDat.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'roe_client.json');
const DAT = ['ROM', '307', '16.DAT'];
const MIN_ENTRIES = 1500;
const REG_KEYS = ['PlayOnlineUS', 'PlayOnlineEU', 'PlayOnline'].flatMap((k) => [
  `HKLM\\SOFTWARE\\WOW6432Node\\${k}\\InstallFolder`,
  `HKLM\\SOFTWARE\\${k}\\InstallFolder`,
]);

function findInstall() {
  if (process.argv[2]) return process.argv[2];
  for (const key of REG_KEYS) {
    try {
      const out = execFileSync('reg', ['query', key, '/v', '0001'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/REG_SZ\s+(.+?)\s*$/m);
      if (m) return m[1];
    } catch { /* this key isn't present */ }
  }
  throw new Error('FFXI install not found in the registry. Pass the folder: npm run extract:client -- "<path to FINAL FANTASY XI>"');
}

const datPath = join(findInstall(), ...DAT);
if (!existsSync(datPath)) throw new Error(`${datPath} not found`);
const entries = parseRoeDat(readFileSync(datPath));
if (entries.length < MIN_ENTRIES) {
  throw new Error(`only ${entries.length} objectives parsed (expected at least ${MIN_ENTRIES}); the file format has probably changed`);
}

const prev = existsSync(OUT) ? new Map(JSON.parse(readFileSync(OUT, 'utf8')).entries.map((e) => [e.id, e.n])) : null;

// One entry per line so a re-extraction after a game update diffs cleanly in git.
const body = entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n');
writeFileSync(OUT, `{\n  "extractedAt": ${JSON.stringify(new Date().toISOString())},\n  "source": "FFXI client ROM/307/16.DAT",\n  "entries": [\n${body}\n  ]\n}\n`);

console.log(`${entries.length} objectives from ${datPath}`);
if (!prev) {
  console.log('first extraction (no previous data/roe_client.json)');
} else {
  const now = new Map(entries.map((e) => [e.id, e.n]));
  const added = [...now].filter(([id]) => !prev.has(id));
  const removed = [...prev].filter(([id]) => !now.has(id));
  const renamed = [...now].filter(([id, n]) => prev.has(id) && prev.get(id) !== n);
  for (const [label, list] of [['new', added], ['removed', removed], ['renamed', renamed]]) {
    console.log(`${label} (${list.length}):`);
    for (const [id, n] of list.slice(0, 60)) console.log(`  ${id}: ${label === 'renamed' ? `${prev.get(id)} -> ` : ''}${n}`);
  }
}
console.log(`wrote ${OUT}`);
