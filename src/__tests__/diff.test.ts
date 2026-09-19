import { describe, it, expect } from 'vitest';
import { diffAddResult, diffRemoveResult } from '../roe/diff';

describe('diffAddResult', () => {
  it('splits sent ids into landed and notAccepted based on the real active list', () => {
    const { landed, notAccepted } = diffAddResult({ send: [1, 2, 3] }, [1, 3, 99]);
    expect(landed).toEqual([1, 3]);
    expect(notAccepted).toEqual([2]);
  });
});

describe('diffRemoveResult', () => {
  it('splits sent ids into removed and notRemoved based on the real active list', () => {
    const { removed, notRemoved } = diffRemoveResult({ send: [1, 2, 3] }, [2]);
    expect(removed).toEqual([1, 3]);
    expect(notRemoved).toEqual([2]);
  });
});
