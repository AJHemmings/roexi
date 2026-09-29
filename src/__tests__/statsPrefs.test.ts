import { describe, it, expect } from 'vitest';
import { parseChartPrefs, parseViewPrefs, valueFor, DEFAULT_CHART, DEFAULT_VIEW } from '../stats/prefs';
import { seriesColor, catColor, colorByName, SERIES } from '../stats/palette';

describe('parseChartPrefs', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseChartPrefs(undefined)).toEqual(DEFAULT_CHART);
    expect(parseChartPrefs({ type: 'pie', value: 'x', hiddenCats: 'no' })).toEqual(DEFAULT_CHART);
  });
  it('keeps valid values and drops non-string hidden categories', () => {
    expect(parseChartPrefs({ type: 'radar', value: 'count', hiddenCats: ['Unity', 3] })).toEqual({ type: 'radar', value: 'count', hiddenCats: ['Unity'] });
  });
  it('radar always shows percentages', () => {
    expect(valueFor({ type: 'radar', value: 'count', hiddenCats: [] })).toBe('pct');
    expect(valueFor({ type: 'bar', value: 'count', hiddenCats: [] })).toBe('count');
  });
});

describe('parseViewPrefs', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_VIEW);
    expect(parseViewPrefs({ tab: 'x', completionKind: 'unclassified', leftKind: 'nope', leftSort: 'size' })).toEqual(DEFAULT_VIEW);
  });
  it('the Completion measure can never be unclassified; Left to do can', () => {
    const v = parseViewPrefs({ tab: 'left', completionKind: 'event', leftKind: 'unclassified', leftSort: 'exp', leftHiddenCats: ['Unity'] });
    expect(v).toEqual({ tab: 'left', completionKind: 'event', leftKind: 'unclassified', leftSort: 'exp', leftHiddenCats: ['Unity'] });
  });
  it('remembers the Objectives tab', () => {
    expect(parseViewPrefs({ tab: 'objectives' }).tab).toBe('objectives');
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
