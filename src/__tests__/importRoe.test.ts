import { describe, it, expect } from 'vitest';
import { parseRoeProfiles, sameIds, findMatches, uniqueName, planImport } from '../roe/importRoe';
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
