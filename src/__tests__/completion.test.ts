import { describe, it, expect } from 'vitest';
import {
  kindOf, isCompleted, completionFor, quickStats, left, unclassifiedCount, categoriesFor, subsFor,
  cellEntries, leftToDo, neededBy, sortLeft, KINDS,
} from '../roe/completion';
import { showInRemaining } from '../roe/locks';
import type { KnownChar, CatalogEntry } from '../roe/types';

const char = (name: string, over: Partial<KnownChar> = {}): KnownChar => ({
  name, online: true, active: [], doneIds: new Set(), donePagesKnown: new Set([0, 1, 2, 3]), ...over,
});
const entries: CatalogEntry[] = [
  { id: 1, n: 'Zilart 1', cat: 'Tutorial', sub: 'Missions (Zilart)', repeat: false, sparks: 100 },
  { id: 2, n: 'Zilart 2', cat: 'Tutorial', sub: 'Missions (Zilart)', repeat: false, sparks: 300 },
  { id: 3, n: 'Basics', cat: 'Tutorial', sub: 'Basics', repeat: false, exp: 50 },
  { id: 4, n: 'Vanquish', cat: 'Combat (Wide Area)', sub: 'Combat (General)', repeat: true, sparks: 200 },
  { id: 5, n: 'Plaudits! (VB)', cat: 'Special Events', sub: "Vana'bout Round", repeat: false },
  { id: 6, n: 'Anniversary', cat: "Vana'versary", sub: "15th Vana'versary I", repeat: true },
  { id: 7, n: 'Spoils (Red Chip)', cat: 'Combat (Wide Area)', sub: 'Combat (Spoils)' },
  { id: 8, n: 'Mystery' },
  { id: 4008, n: 'Auto daily', cat: 'Other', sub: 'Daily Objectives', auto: true, repeat: true },
];
const byId = new Map(entries.map((e) => [e.id, e]));

describe('kindOf', () => {
  it('classifies every row of the spec table', () => {
    expect(entries.map((e) => kindOf(e))).toEqual([
      'one-time', 'one-time', 'one-time', 'repeatable', 'event', 'event', 'unclassified', 'unclassified', null,
    ]);
  });
  it('an auto id is never counted even without the auto flag', () => {
    expect(kindOf({ id: 4010, n: 'x', repeat: true })).toBeNull();
  });
});

describe('isCompleted', () => {
  it('is true whenever the completion bit is set, repeatables included', () => {
    const c = char('A', { doneIds: new Set([4]) });
    expect(isCompleted(c, 4)).toBe(true);
    expect(isCompleted(c, 1)).toBe(false);
  });
  it('is false when the page is unknown', () => {
    expect(isCompleted(char('A', { doneIds: new Set([1]), donePagesKnown: new Set() }), 1)).toBe(false);
  });
});

describe('completionFor', () => {
  it('counts one-time objectives per category and subcategory', () => {
    const comp = completionFor(char('A', { doneIds: new Set([1, 3]) }), entries, ['one-time']);
    expect(comp.overall).toEqual({ done: 2, total: 3, unknown: 0 });
    expect(comp.byCat.get('Tutorial')).toEqual({ done: 2, total: 3, unknown: 0 });
    expect(comp.bySub.get('Tutorial::Missions (Zilart)')).toEqual({ done: 1, total: 2, unknown: 0 });
    expect(left(comp.overall)).toBe(1);
  });
  it('counts a repeatable completed once as done', () => {
    expect(completionFor(char('A', { doneIds: new Set([4]) }), entries, ['repeatable']).overall).toEqual({ done: 1, total: 1, unknown: 0 });
  });
  it('keeps events out of one-time even when flagged repeat:false', () => {
    const comp = completionFor(char('A', { doneIds: new Set([5]) }), entries, ['one-time']);
    expect(comp.overall.done).toBe(0);
    expect(completionFor(char('A', { doneIds: new Set([5]) }), entries, ['event']).overall).toEqual({ done: 1, total: 2, unknown: 0 });
  });
  it('counts unknown pages as left, never done', () => {
    const comp = completionFor(char('A', { doneIds: new Set([1]), donePagesKnown: new Set() }), entries, ['one-time']);
    expect(comp.overall).toEqual({ done: 0, total: 3, unknown: 3 });
  });
  it('ignores done ids that are not in the catalog', () => {
    expect(completionFor(char('A', { doneIds: new Set([1, 2985, 4085]) }), entries, ['one-time']).overall.done).toBe(1);
  });
  it('tallies an entry with no cat/sub under Uncategorized', () => {
    expect(completionFor(char('A'), entries, ['unclassified']).byCat.get('Uncategorized')).toEqual({ done: 0, total: 1, unknown: 0 });
    expect(categoriesFor(entries, ['unclassified'])).toEqual(['Combat (Wide Area)', 'Uncategorized']);
  });
});

describe('quickStats', () => {
  it('is exactly the Stats One-time Overall figure', () => {
    const c = char('A', { doneIds: new Set([1, 4, 5]) });
    expect(quickStats(c, entries)).toEqual(completionFor(c, entries, ['one-time']).overall);
  });
});

describe('catalog helpers', () => {
  it('unclassifiedCount counts entries with no known repeat flag', () => expect(unclassifiedCount(entries)).toBe(2));
  it('categoriesFor lists categories that have entries of the kind, sorted', () => {
    expect(categoriesFor(entries, ['one-time'])).toEqual(['Tutorial']);
    expect(categoriesFor(entries, ['event'])).toEqual(['Special Events', "Vana'versary"]);
  });
  it('subsFor lists a category\'s subcategories for the kind, sorted', () => {
    expect(subsFor(entries, ['one-time'], 'Tutorial')).toEqual(['Basics', 'Missions (Zilart)']);
  });
  it('cellEntries: Overall, a category, and a subcategory', () => {
    expect(cellEntries(entries, ['one-time'], null, null).map((e) => e.id)).toEqual([1, 2, 3]);
    expect(cellEntries(entries, ['one-time'], 'Tutorial', null).map((e) => e.id)).toEqual([1, 2, 3]);
    expect(cellEntries(entries, ['one-time'], 'Tutorial', 'Basics').map((e) => e.id)).toEqual([3]);
  });
});

describe('leftToDo', () => {
  const scope = [char('A', { doneIds: new Set([1]) }), char('B', { doneIds: new Set([1, 2]), active: [{ id: 3, p: 0 }] })];

  it('lists what at least one character can still take, for one kind', () => {
    expect(leftToDo(scope, entries, byId, ['one-time']).map((e) => e.id)).toEqual([2, 3]);
  });
  it('agrees with Library Remaining: per kind it is Remaining filtered to that kind, and the union is all of Remaining', () => {
    const remaining = entries.filter((e) => showInRemaining(scope, e.id, byId)).map((e) => e.id).sort((a, b) => a - b);
    const union: number[] = [];
    for (const k of KINDS) {
      const ids = leftToDo(scope, entries, byId, [k]).map((e) => e.id);
      expect(ids).toEqual(remaining.filter((id) => kindOf(byId.get(id)!) === k));
      union.push(...ids);
    }
    expect(union.sort((a, b) => a - b)).toEqual(remaining);
  });
  it('neededBy names the characters it is still left for', () => {
    expect(neededBy(scope, 2, byId)).toEqual(['A']);
    expect(neededBy(scope, 3, byId)).toEqual(['A']);
  });
});

describe('sortLeft', () => {
  const list = [entries[0], entries[1], entries[2], entries[3]];
  it('sparks: highest first, missing sparks last, then name', () => {
    expect(sortLeft(list, 'sparks').map((e) => e.id)).toEqual([2, 4, 1, 3]);
  });
  it('exp: highest first, missing exp last, then name', () => {
    expect(sortLeft(list, 'exp').map((e) => e.id)).toEqual([3, 4, 1, 2]);
  });
  it('category: category, then subcategory, then name', () => {
    expect(sortLeft(list, 'category').map((e) => e.id)).toEqual([4, 3, 1, 2]);
  });
  it('name: alphabetical', () => expect(sortLeft(list, 'name').map((e) => e.n)).toEqual(['Basics', 'Vanquish', 'Zilart 1', 'Zilart 2']));
});

describe('kind lists', () => {
  it('completionFor counts every selected kind together', () => {
    const comp = completionFor(char('A', { doneIds: new Set([1, 4]) }), entries, ['one-time', 'repeatable']);
    expect(comp.overall).toEqual({ done: 2, total: 4, unknown: 0 });
    expect(comp.byCat.get('Combat (Wide Area)')).toEqual({ done: 1, total: 1, unknown: 0 });
  });
  it('categoriesFor lists the union of the selected kinds, sorted', () => {
    expect(categoriesFor(entries, ['one-time', 'event'])).toEqual(['Special Events', 'Tutorial', "Vana'versary"]);
  });
  it('an empty list counts nothing', () => {
    expect(completionFor(char('A'), entries, []).overall).toEqual({ done: 0, total: 0, unknown: 0 });
  });
  it('leftToDo with every kind is exactly Library Remaining', () => {
    const scope = [char('A', { doneIds: new Set([1]) })];
    const remaining = entries.filter((e) => showInRemaining(scope, e.id, byId) && kindOf(e) !== null).map((e) => e.id);
    expect(leftToDo(scope, entries, byId, KINDS).map((e) => e.id)).toEqual(remaining);
  });
});
