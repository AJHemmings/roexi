import { describe, it, expect } from 'vitest';
import { parseRoeProfiles, sameIds, findMatches, uniqueName, planImport, validateImport, buildImportedSets, type ImportRow } from '../roe/importRoe';
import type { RoeSet } from '../roe/types';
import { SAMPLE_ROE_SETTINGS } from '../dev/sampleRoeSettings';

describe('parseRoeProfiles', () => {
  it('reads every non-empty profile in file order', () => {
    const profiles = parseRoeProfiles(SAMPLE_ROE_SETTINGS)!;
    expect(profiles.map((p) => p.name)).toEqual(['aman', 'ambu', 'deeds', 'monthly', 'peculiar', 'vagary']);
    expect(profiles.find((p) => p.name === 'ambu')!.ids).toEqual([3760, 3758, 3998]);
    expect(profiles.find((p) => p.name === 'aman')!.ids).toHaveLength(23);
  });

  it('returns null when there is no profiles block', () => {
    expect(parseRoeProfiles('<settings><global><clear>true</clear></global></settings>')).toBeNull();
    expect(parseRoeProfiles('not xml at all')).toBeNull();
  });

  it('returns null for a self-closing profiles tag', () => {
    expect(parseRoeProfiles('<settings><global><profiles /></global></settings>')).toBeNull();
  });

  it('returns an empty list when every profile is empty', () => {
    expect(parseRoeProfiles('<profiles><default /></profiles>')).toEqual([]);
  });

  it('drops junk, zero and negative ids, and dedupes', () => {
    expect(parseRoeProfiles('<profiles><a>1, x,2,,2,-3,0, 7 </a></profiles>')).toEqual([{ name: 'a', ids: [1, 2, 7] }]);
  });

  it('skips a profile whose ids are all junk', () => {
    expect(parseRoeProfiles('<profiles><a>x,y</a><b>5</b></profiles>')).toEqual([{ name: 'b', ids: [5] }]);
  });
});

const set = (id: string, name: string, ids: number[]): RoeSet => ({ id, name, ids, createdAt: 0, updatedAt: 0 });
const sample = () => parseRoeProfiles(SAMPLE_ROE_SETTINGS)!;
const idsOf = (name: string) => sample().find((p) => p.name === name)!.ids;

describe('sameIds', () => {
  it('ignores order', () => { expect(sameIds([1, 2, 3], [3, 1, 2])).toBe(true); });
  it('is false when lengths differ', () => { expect(sameIds([1, 2], [1, 2, 3])).toBe(false); });
  it('is false for different ids of the same length', () => { expect(sameIds([1, 2], [1, 3])).toBe(false); });
});

describe('findMatches', () => {
  // Real overlaps from the sample: ambu↔monthly 2, aman↔monthly 10, aman↔deeds 2.
  const existing = [set('d', 'deeds', idsOf('deeds')), set('m', 'monthly', idsOf('monthly'))];

  it('matches on any shared id and splits the ids three ways', () => {
    const [m, ...rest] = findMatches(existing, idsOf('ambu'));
    expect(rest).toEqual([]);
    expect(m.set.id).toBe('m');
    expect(m.shared).toEqual([3760, 3758]);
    expect(m.onlyImport).toEqual([3998]);
    expect(m.onlyExisting).toHaveLength(11);
  });

  it('orders several matches by most shared first', () => {
    const ms = findMatches(existing, idsOf('aman'));
    expect(ms.map((m) => [m.set.id, m.shared.length])).toEqual([['m', 10], ['d', 2]]);
  });

  it('returns nothing when no ids are shared', () => {
    expect(findMatches(existing, idsOf('vagary'))).toEqual([]);
  });
});

describe('uniqueName', () => {
  it('keeps a free name', () => { expect(uniqueName('ambu', ['monthly'])).toBe('ambu'); });
  it('suffixes a case-insensitive clash', () => { expect(uniqueName('ambu', ['Ambu'])).toBe('ambu (2)'); });
  it('skips suffixes that are taken too', () => { expect(uniqueName('ambu', ['ambu', 'AMBU (2)'])).toBe('ambu (3)'); });
});

describe('planImport', () => {
  // "monthly" already imported unchanged; an unrelated set that happens to be called "ambu".
  const existing = [set('m', 'monthly', idsOf('monthly')), set('x', 'ambu', [1])];
  const row = (key: string) => planImport(existing, sample()).find((r) => r.key === key)!;

  it('defaults identical ids to Keep existing, targeting that set', () => {
    expect(row('monthly')).toMatchObject({ choice: 'keepExisting', targetId: 'm' });
  });

  it('defaults a partial match to Keep both and dodges the name clash', () => {
    expect(row('ambu')).toMatchObject({ choice: 'keepBoth', targetId: 'm', name: 'ambu (2)', ids: [3760, 3758, 3998] });
  });

  it('defaults an unmatched profile to Import with no target', () => {
    expect(row('vagary')).toMatchObject({ choice: 'import', targetId: null, name: 'vagary' });
  });

  it('copies ids so editing a row never mutates the parsed profile', () => {
    const r = row('ambu');
    expect(r.ids).not.toBe(r.profile.ids);
  });
});

describe('validateImport / buildImportedSets', () => {
  // Alpha shares 2 ids with the "alpha" profile and Bravo shares 1, so Alpha is the default target.
  // planImport names the alpha profile "alpha (2)", since "Alpha" is taken (case-insensitive).
  const A = set('a', 'Alpha', [1, 2, 3]);
  const B = set('b', 'Bravo', [4]);
  const sets = [A, B];
  const base = () => planImport(sets, [{ name: 'alpha', ids: [2, 3, 4] }, { name: 'beta', ids: [9] }]);
  const withRow = (key: string, patch: Partial<ImportRow>) => base().map((r) => (r.key === key ? { ...r, ...patch } : r));
  const build = (rows: ImportRow[], edits = {}) => { let n = 0; return buildImportedSets(sets, rows, edits, 100, () => `n${++n}`); };

  it('defaults are valid: Keep both + Import creates two sets and leaves the rest alone', () => {
    const rows = base();
    expect(rows[0]).toMatchObject({ choice: 'keepBoth', targetId: 'a', name: 'alpha (2)' });
    expect(validateImport(sets, rows, {})).toEqual({ rowErrors: {}, existingErrors: {}, count: 2, ok: true });
    const out = build(rows);
    expect(out[0]).toBe(A);
    expect(out[1]).toBe(B);
    expect(out.slice(2)).toEqual([
      { id: 'n1', name: 'alpha (2)', ids: [2, 3, 4], createdAt: 100, updatedAt: 100 },
      { id: 'n2', name: 'beta', ids: [9], createdAt: 100, updatedAt: 100 },
    ]);
  });

  it('Keep imported replaces the target ids, keeps its id and history, and takes its edited name', () => {
    const rows = withRow('alpha', { choice: 'keepImported' });
    const edits = { a: { name: 'Alpha v2', ids: [1, 2, 3] } };
    expect(validateImport(sets, rows, edits)).toMatchObject({ ok: true, count: 2 });
    const out = build(rows, edits);
    expect(out[0]).toEqual({ id: 'a', name: 'Alpha v2', ids: [2, 3, 4], createdAt: 0, updatedAt: 100 });
    expect(out).toHaveLength(3); // Alpha (replaced), Bravo, new beta
  });

  it('Keep both can rename and trim the existing set too', () => {
    const rows = withRow('alpha', { name: 'Alpha' });
    const edits = { a: { name: 'Alpha old', ids: [1, 2] } };
    expect(validateImport(sets, rows, edits)).toMatchObject({ ok: true, count: 3 });
    const out = build(rows, edits);
    expect(out[0]).toMatchObject({ id: 'a', name: 'Alpha old', ids: [1, 2], updatedAt: 100 });
    expect(out[2]).toMatchObject({ name: 'Alpha', ids: [2, 3, 4] });
  });

  it('Keep existing imports nothing for that row', () => {
    const rows = withRow('alpha', { choice: 'keepExisting' });
    expect(validateImport(sets, rows, {})).toMatchObject({ ok: true, count: 1 });
    expect(build(rows).map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'beta']);
  });

  it('ignores edits to a set the row no longer targets', () => {
    const rows = withRow('alpha', { targetId: 'b' }); // user edited Alpha, then switched the Compare tab to Bravo
    const edits = { a: { name: 'Edited', ids: [1] } };
    expect(validateImport(sets, rows, edits).count).toBe(2);
    expect(build(rows, edits)[0]).toBe(A);
  });

  it('flags a new name that clashes with an untouched existing set, on the row only', () => {
    const v = validateImport(sets, withRow('alpha', { name: 'ALPHA' }), {});
    expect(v.rowErrors).toEqual({ alpha: 'A set with this name already exists' });
    expect(v.existingErrors).toEqual({});
    expect(v.ok).toBe(false);
  });

  it('flags two rows given the same name', () => {
    const v = validateImport(sets, withRow('beta', { name: 'alpha (2)' }), {});
    expect(v.rowErrors).toEqual({ alpha: 'A set with this name already exists', beta: 'A set with this name already exists' });
  });

  it('flags a renamed existing set that clashes with a new one', () => {
    const v = validateImport(sets, base(), { a: { name: 'Alpha (2)', ids: [1, 2, 3] } });
    expect(v.existingErrors).toEqual({ a: 'A set with this name already exists' });
    expect(v.rowErrors).toEqual({ alpha: 'A set with this name already exists' });
  });

  it('allows an existing set to keep its own name', () => {
    expect(validateImport(sets, base(), { a: { name: 'Alpha', ids: [1, 2] } }).ok).toBe(true);
  });

  it('requires a name and at least one objective', () => {
    expect(validateImport(sets, withRow('beta', { name: '  ' }), {}).rowErrors).toEqual({ beta: 'Name is required' });
    expect(validateImport(sets, withRow('beta', { ids: [] }), {}).rowErrors).toEqual({ beta: 'A set needs at least one objective' });
    expect(validateImport(sets, withRow('alpha', { choice: 'keepImported', ids: [] }), {}).existingErrors).toEqual({ a: 'A set needs at least one objective' });
  });

  it('flags a second row replacing the same set', () => {
    const rows = base().map((r) => ({ ...r, choice: 'keepImported' as const, targetId: 'a' }));
    expect(validateImport(sets, rows, {}).rowErrors).toEqual({ beta: 'Another profile already replaces this set' });
  });

  it('counts nothing when every row is skipped', () => {
    const rows = base().map((r) => ({ ...r, choice: (r.matches.length ? 'keepExisting' : 'skip') as ImportRow['choice'] }));
    expect(validateImport(sets, rows, {})).toMatchObject({ ok: true, count: 0 });
  });
});
