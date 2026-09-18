// Shared by the app (Library search), scripts/build-catalog.mjs and the tests.
// Both the id list and the wiki abbreviate objective names, but not the same way
// ("Van. Amorphs with Ph. Dmg." vs "Van. Amorphs with Ph. Damage"), so every token
// either side abbreviates is expanded on BOTH sides before comparing.

const ABBREV = new Map<string, string>(Object.entries({
  van: 'vanquish', vanq: 'vanquish', vanquished: 'vanquish',
  subj: 'subjugation',
  ph: 'physical', dmg: 'damage',
  suc: 'successful', tot: 'total', mons: 'monsters', w: 'with',
  harvest: 'harvesting', alch: 'alchemy', wood: 'woodworking', leath: 'leathercraft',
  black: 'blacksmithing', gold: 'goldsmithing', cloth: 'clothcraft', bone: 'bonecraft', cook: 'cooking',
  behem: 'behemoth',
}));

/** Lowercase, fold quotes, strip punctuation and a trailing "+" marker, expand abbreviations. */
export function normalizeName(s: string | null | undefined): string {
  const folded = String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .trim()
    .replace(/\s*\+$/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return folded.split(' ').map((w) => ABBREV.get(w) ?? w).join(' ');
}

/** Levenshtein distance; only used by the small fuzzy fallback pass in the catalog build. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
