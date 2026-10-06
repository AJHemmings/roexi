import { describe, it, expect } from 'vitest';
import { parseChartPrefs, parseViewPrefs, valueFor, toggleKind, DEFAULT_CHART, DEFAULT_VIEW } from '../stats/prefs';
import { seriesColor, catColor, colorByName, SERIES } from '../stats/palette';

describe('parseChartPrefs', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseChartPrefs(undefined)).toEqual(DEFAULT_CHART);
    expect(parseChartPrefs({ type: 'pie', value: 'x', hidden: 'no' })).toEqual(DEFAULT_CHART);
  });
  it('keeps valid values and drops non-string hidden keys', () => {
    expect(parseChartPrefs({ type: 'radar', value: 'count', hidden: ['Unity', 'Unity::Unity (Wanted II)', 3] }))
      .toEqual({ type: 'radar', value: 'count', hidden: ['Unity', 'Unity::Unity (Wanted II)'] });
  });
  it('carries old hiddenCats over as category keys, unless hidden is already saved', () => {
    expect(parseChartPrefs({ hiddenCats: ['Unity'] }).hidden).toEqual(['Unity']);
    expect(parseChartPrefs({ hidden: [], hiddenCats: ['Unity'] }).hidden).toEqual([]);
  });
  it('radar always shows percentages', () => {
    expect(valueFor({ type: 'radar', value: 'count', hidden: [] })).toBe('pct');
    expect(valueFor({ type: 'bar', value: 'count', hidden: [] })).toBe('count');
  });
});

describe('parseViewPrefs', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_VIEW);
    expect(parseViewPrefs({ tab: 'x', completionKinds: ['unclassified', 9], leftKinds: 'nope', leftSort: 'size' })).toEqual(DEFAULT_VIEW);
  });
  it('starts on All: the old single-kind keys are ignored', () => {
    const v = parseViewPrefs({ completionKind: 'one-time', leftKind: 'event' });
    expect(v.completionKinds).toEqual(['one-time', 'repeatable', 'event']);
    expect(v.leftKinds).toEqual(['one-time', 'repeatable', 'event']);
  });
  it('keeps chosen kinds in canonical order; Completion never includes unclassified, Left to do can', () => {
    expect(parseViewPrefs({ tab: 'left', completionKinds: ['event', 'one-time', 'unclassified'], leftKinds: ['unclassified', 'repeatable'], leftSort: 'exp', leftHiddenCats: ['Unity'] }))
      .toEqual({ tab: 'left', completionKinds: ['one-time', 'event'], leftKinds: ['repeatable', 'unclassified'], leftSort: 'exp', leftHiddenCats: ['Unity'] });
  });
  it('remembers the Objectives tab', () => {
    expect(parseViewPrefs({ tab: 'objectives' }).tab).toBe('objectives');
  });
});

describe('toggleKind', () => {
  const ALL = ['one-time', 'repeatable', 'event'] as const;
  it('All turns every option on', () => expect(toggleKind(['event'], 'all', ALL)).toEqual([...ALL]));
  it('a chip toggles, keeping canonical order', () => {
    expect(toggleKind(['event'], 'one-time', ALL)).toEqual(['one-time', 'event']);
    expect(toggleKind([...ALL], 'repeatable', ALL)).toEqual(['one-time', 'event']);
  });
  it('the last chip that is on stays on', () => expect(toggleKind(['repeatable'], 'repeatable', ALL)).toEqual(['repeatable']));
  it('drops saved kinds that are not offered', () => {
    expect(toggleKind<string>(['unclassified', 'event'], 'one-time', ALL)).toEqual(['one-time', 'event']);
  });
});

describe('palette', () => {
  it('cycles six series colours', () => {
    expect(SERIES).toHaveLength(6);
    expect(seriesColor(6)).toBe(seriesColor(0));
  });
  it('spreads category hues evenly and stays valid for zero categories', () => {
    expect(catColor(0, 4)).toBe('hsl(0 55% 62%)');
    expect(catColor(2, 4)).toBe('hsl(180 55% 62%)');
    expect(catColor(0, 0)).toBe('hsl(0 55% 62%)');
  });
  it('colorByName is alphabetical, so colours are stable when the online order changes', () => {
    const a = colorByName(['Zed', 'Amy']);
    const b = colorByName(['Amy', 'Zed']);
    expect(a('Amy')).toBe(b('Amy'));
    expect(a('Amy')).toBe(seriesColor(0));
  });
});
