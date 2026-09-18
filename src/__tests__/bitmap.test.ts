import { describe, it, expect } from 'vitest';
import { doneFromPages, doneState } from '../roe/bitmap';

describe('doneFromPages', () => {
  it('unions pages and records which pages are known', () => {
    const d = doneFromPages({ 0: [1, 2], 2: [2050] });
    expect([...d.doneIds].sort((a, b) => a - b)).toEqual([1, 2, 2050]);
    expect([...d.donePagesKnown].sort()).toEqual([0, 2]);
  });
  it('handles no pages', () => {
    const d = doneFromPages(undefined);
    expect(d.doneIds.size).toBe(0);
    expect(d.donePagesKnown.size).toBe(0);
  });
  it('ignores page keys that are not non-negative integers', () => {
    const d = doneFromPages({ abc: [1], '-1': [2], 1: [1030] } as unknown as Record<number, number[]>);
    expect([...d.donePagesKnown]).toEqual([1]);
    expect([...d.doneIds]).toEqual([1030]);
  });
});

describe('doneState', () => {
  const c = doneFromPages({ 0: [1, 2] });
  it('is done for a listed id on a known page', () => expect(doneState(c, 1)).toBe('done'));
  it('is not-done for an unlisted id on a known page', () => expect(doneState(c, 999)).toBe('not-done'));
  it('is unknown for any id on a page never received', () => {
    expect(doneState(c, 1024)).toBe('unknown');
    expect(doneState(c, 3002)).toBe('unknown');
  });
});
