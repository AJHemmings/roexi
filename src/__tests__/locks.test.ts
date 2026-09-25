import { describe, it, expect } from 'vitest';
import { objectiveState, isRemaining, showInRemaining, summarize } from '../roe/locks';
import type { KnownChar, CatalogEntry } from '../roe/types';

const char = (name: string, over: Partial<KnownChar> = {}): KnownChar => ({
  name, online: true, active: [], doneIds: new Set(), donePagesKnown: new Set([0]), ...over,
});
const entries: CatalogEntry[] = [
  { id: 1, n: 'One-time', repeat: false },
  { id: 2, n: 'Repeatable', repeat: true },
  { id: 3, n: 'Other', repeat: false },
  { id: 4008, n: 'Auto daily', auto: true },
];
const byId = new Map(entries.map((e) => [e.id, e]));

describe('objectiveState', () => {
  it('auto ids are auto', () => expect(objectiveState(char('A'), 4008, byId)).toBe('auto'));
  it('active wins over everything else', () => {
    const c = char('A', { active: [{ id: 1, p: 0 }], doneIds: new Set([1]), locked: new Map([[1, 5]]) });
    expect(objectiveState(c, 1, byId)).toBe('active');
  });
  it('a completed one-time objective is done', () => expect(objectiveState(char('A', { doneIds: new Set([1]) }), 1, byId)).toBe('done'));
  it('a completed repeatable is open again', () => expect(objectiveState(char('A', { doneIds: new Set([2]) }), 2, byId)).toBe('open'));
  it('a refused id is locked', () => expect(objectiveState(char('A', { locked: new Map([[3, 5]]) }), 3, byId)).toBe('locked'));
  it('locked wins over unknown', () => {
    expect(objectiveState(char('A', { donePagesKnown: new Set(), locked: new Map([[3, 5]]) }), 3, byId)).toBe('locked');
  });
  it('a missing completion page is unknown', () => expect(objectiveState(char('A', { donePagesKnown: new Set() }), 3, byId)).toBe('unknown'));
  it('otherwise open', () => expect(objectiveState(char('A'), 3, byId)).toBe('open'));
});

describe('isRemaining / showInRemaining', () => {
  it('only open and unknown remain', () => {
    expect(['open', 'unknown'].every((s) => isRemaining(s as never))).toBe(true);
    expect(['auto', 'active', 'done', 'locked'].some((s) => isRemaining(s as never))).toBe(false);
  });
  it('single scope: hidden when that character has it done', () => {
    expect(showInRemaining([char('A', { doneIds: new Set([1]) })], 1, byId)).toBe(false);
  });
  it('All scope: shown when at least one character could still add it', () => {
    const scope = [char('A', { doneIds: new Set([1]) }), char('B')];
    expect(showInRemaining(scope, 1, byId)).toBe(true);
  });
  it('All scope: hidden when nobody could add it', () => {
    const scope = [char('A', { doneIds: new Set([1]) }), char('B', { locked: new Map([[1, 5]]) })];
    expect(showInRemaining(scope, 1, byId)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts every non-auto catalog entry into exactly one bucket', () => {
    const c = char('A', { doneIds: new Set([1]), locked: new Map([[3, 5]]) });
    expect(summarize(c, entries, byId)).toEqual({ active: 0, done: 1, open: 1, locked: 1, unknown: 0 });
  });
});
