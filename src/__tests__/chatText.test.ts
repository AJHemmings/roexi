import { describe, it, expect } from 'vitest';
import { removedNoticeText, chatLine, workingText, busyText, setResultText, unsetResultText } from '../roe/chatText';
import type { AddCharResult, RemoveCharResult } from '../roe/results';

const add = (over: Partial<AddCharResult> = {}): AddCharResult => ({
  name: 'Mak', status: 'ok', skipAuto: [], skipUnlisted: [], skipActive: [], skipDone: [], added: [], notAccepted: [], ...over,
});
const rem = (over: Partial<RemoveCharResult> = {}): RemoveCharResult => ({
  name: 'Mak', status: 'ok', skipNotActive: [], removed: [], notRemoved: [], ...over,
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('removedNoticeText', () => {
  it('returns null for an empty list', () => {
    expect(removedNoticeText([])).toBeNull();
  });

  it('joins a couple of names', () => {
    expect(removedNoticeText(['Aldric', 'Brienne'])).toBe('removed: Aldric, Brienne');
  });

  it('strips non-ASCII characters from names', () => {
    expect(removedNoticeText(['Café☆', 'Zoë'])).toBe('removed: Caf, Zo');
  });

  it('truncates a long list with a fitting "(+N more)" suffix', () => {
    const names = Array.from({ length: 50 }, (_, i) => `Character${i}`);
    const text = removedNoticeText(names)!;
    expect(text.length).toBeLessThanOrEqual(200);
    const m = text.match(/^removed: (.*) \(\+(\d+) more\)$/);
    expect(m).not.toBeNull();
    const [, joined, moreStr] = m!;
    const included = joined.length === 0 ? [] : joined.split(', ');
    expect(included.length + Number(moreStr)).toBe(names.length);
    // every included name really is one of the sanitized inputs, in order
    expect(names.slice(0, included.length)).toEqual(included);
  });
});

describe('chatLine', () => {
  it('strips non-ASCII and caps at 200 characters', () => {
    expect(chatLine('Café ☆ ok')).toBe('Caf  ok');
    expect(chatLine('x'.repeat(250))).toHaveLength(200);
  });
});

describe('workingText and busyText', () => {
  it('names a single character', () => {
    expect(workingText('set', 'Ambuscade', ['Mak'])).toBe('set Ambuscade: working on Mak...');
  });

  it('counts several characters', () => {
    expect(workingText('unset', 'Ambuscade', ['A', 'B', 'C'])).toBe('unset Ambuscade: working on 3 characters...');
  });

  it('says who is busy', () => {
    expect(busyText('Mak')).toBe('busy: Mak is still changing objectives, try again in a moment');
  });
});

describe('setResultText', () => {
  it('counts what was added and cancelled, then the skips', () => {
    expect(setResultText(add({ added: ids(6), cancelled: [90, 91], skipActive: ids(3) }))).toBe('Mak: +6, cancelled 2 (no progress), 3 already active');
  });

  it('puts every part in order', () => {
    expect(setResultText(add({ added: [1], cancelled: [2], notAccepted: [3], skipActive: [4], skipDone: [5], skipUnlisted: [6], skipAuto: [4013] })))
      .toBe('Mak: +1, cancelled 1 (no progress), 1 not accepted, 1 already active, 1 already completed, 1 not in the menu right now, 1 daily');
  });

  it('says nothing to do when nothing was added, cancelled or refused', () => {
    expect(setResultText(add({ skipActive: ids(10) }))).toBe('Mak: nothing to do, 10 already active');
    expect(setResultText(add())).toBe('Mak: nothing to do');
    expect(setResultText(add({ notAccepted: ids(3) }))).toBe('Mak: 3 not accepted');
  });

  it('reports not enough room', () => {
    expect(setResultText(add({ status: 'noroom', needed: 8, freeable: 3 }))).toBe('Mak: not enough room (needs 8 slots, can free 3)');
    expect(setResultText(add({ status: 'noroom', needed: 1, freeable: 0 }))).toBe('Mak: not enough room (needs 1 slot, can free 0)');
  });

  it("reports cancels that didn't land", () => {
    expect(setResultText(add({ cancelled: [1], notCancelled: [2] }))).toBe("Mak: couldn't cancel 1 of 2, nothing added");
  });

  it('lets a failed ack win over a failed cancel', () => {
    expect(setResultText(add({ status: 'no-response', notCancelled: [2] }))).toBe('Mak: no response from the addon (may still have changed)');
    expect(setResultText(add({ status: 'addon-error' }))).toBe('Mak: addon error');
  });

  it('reports offline', () => {
    expect(setResultText(add({ status: 'offline' }))).toBe('Mak: offline');
  });
});

describe('unsetResultText', () => {
  it('counts removed and not active', () => {
    expect(unsetResultText(rem({ removed: ids(5), skipNotActive: [6, 7] }))).toBe("Mak: removed 5, 2 weren't active");
    expect(unsetResultText(rem({ removed: [1], skipNotActive: [2] }))).toBe("Mak: removed 1, 1 wasn't active");
  });

  it('reports what the game kept', () => {
    expect(unsetResultText(rem({ removed: ids(4), notRemoved: [5] }))).toBe('Mak: removed 4, 1 not removed');
  });

  it('says nothing to do when nothing was removed', () => {
    expect(unsetResultText(rem({ skipNotActive: ids(7) }))).toBe("Mak: nothing to do, 7 weren't active");
  });

  it('reports a failed ack', () => {
    expect(unsetResultText(rem({ status: 'no-response' }))).toBe('Mak: no response from the addon (may still have changed)');
  });
});
