import { describe, it, expect } from 'vitest';
import { formatProgress } from '../roe/format';

describe('formatProgress', () => {
  it('shows "p/goal" when the objective has a known goal', () => expect(formatProgress(3, { id: 1, n: 'x', goal: 10 })).toBe('3/10'));
  it('shows just "p" when the goal is unknown', () => expect(formatProgress(3, { id: 1, n: 'x' })).toBe('3'));
  it('shows just "p" when there is no catalog entry at all', () => expect(formatProgress(3, undefined)).toBe('3'));
});
