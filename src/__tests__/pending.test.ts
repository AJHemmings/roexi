import { describe, it, expect } from 'vitest';
import { beginPending, endPending, getPending, isCharBusy, anyBusy, pendingFor, isIdPending, type PendingEntry } from '../roe/pending';

const list: PendingEntry[] = [
  { key: 1, kind: 'add', chars: ['Aldric'], ids: [10, 11] },
  { key: 2, kind: 'remove', chars: ['Brienne', 'Cassius'], ids: [20] },
];

describe('pending selectors', () => {
  it('isCharBusy is true only for characters in some entry', () => {
    expect(isCharBusy(list, 'Aldric')).toBe(true);
    expect(isCharBusy(list, 'Cassius')).toBe(true);
    expect(isCharBusy(list, 'Delphine')).toBe(false);
  });

  it('anyBusy is true if any of the names is busy', () => {
    expect(anyBusy(list, ['Delphine', 'Brienne'])).toBe(true);
    expect(anyBusy(list, ['Delphine'])).toBe(false);
    expect(anyBusy(list, [])).toBe(false);
  });

  it('pendingFor returns the kind only for an exact character + objective pair', () => {
    expect(pendingFor(list, 'Aldric', 11)).toBe('add');
    expect(pendingFor(list, 'Cassius', 20)).toBe('remove');
    expect(pendingFor(list, 'Aldric', 20)).toBeNull();
  });

  it('isIdPending is true for any id in any entry', () => {
    expect(isIdPending(list, 20)).toBe(true);
    expect(isIdPending(list, 99)).toBe(false);
  });
});

describe('pending store', () => {
  it('begin adds an entry, end removes it, and overlapping entries coexist', () => {
    const a = beginPending('add', ['Aldric'], [10]);
    const b = beginPending('remove', ['Brienne'], [20]);
    expect(isCharBusy(getPending(), 'Aldric')).toBe(true);
    expect(isCharBusy(getPending(), 'Brienne')).toBe(true);
    endPending(a);
    expect(isCharBusy(getPending(), 'Aldric')).toBe(false);
    expect(isCharBusy(getPending(), 'Brienne')).toBe(true);
    endPending(b);
    expect(getPending()).toEqual([]);
  });

  it('endPending on an unknown key is a harmless no-op', () => {
    const before = getPending();
    endPending(987654);
    expect(getPending()).toBe(before);
  });
});
