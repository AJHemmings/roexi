import { describe, it, expect } from 'vitest';
import { toggleId } from '../roe/selection';

describe('toggleId', () => {
  it('adds an id that is not present', () => expect(toggleId([1, 2], 3)).toEqual([1, 2, 3]));
  it('removes an id that is present', () => expect(toggleId([1, 2, 3], 2)).toEqual([1, 3]));
  it('does not mutate the input array', () => {
    const ids = [1, 2];
    toggleId(ids, 3);
    expect(ids).toEqual([1, 2]);
  });
});
