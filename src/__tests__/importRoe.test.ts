import { describe, it, expect } from 'vitest';
import { parseRoeProfiles } from '../roe/importRoe';
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
