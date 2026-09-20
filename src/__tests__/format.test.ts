import { describe, it, expect } from 'vitest';
import { formatProgress, progressParts } from '../roe/format';

describe('formatProgress', () => {
  it('shows "p/goal" when the objective has a known goal', () => expect(formatProgress(3, { id: 1, n: 'x', goal: 10 })).toBe('3/10'));
  it('shows just "p" when the goal is unknown', () => expect(formatProgress(3, { id: 1, n: 'x' })).toBe('3'));
  it('shows just "p" when there is no catalog entry at all', () => expect(formatProgress(3, undefined)).toBe('3'));
});

describe('progressParts', () => {
  it('computes value/max/fraction when the goal is known', () => {
    expect(progressParts(3, { id: 1, n: 'x', goal: 10 })).toEqual({ value: 3, max: 10, label: '3/10', fraction: 0.3 });
  });

  it('clamps fraction to 1 when progress exceeds goal', () => {
    expect(progressParts(15, { id: 1, n: 'x', goal: 10 })).toEqual({ value: 15, max: 10, label: '15/10', fraction: 1 });
  });

  it('has a null max and fraction when the goal is unknown', () => {
    expect(progressParts(3, { id: 1, n: 'x' })).toEqual({ value: 3, max: null, label: '3', fraction: null });
  });
});
