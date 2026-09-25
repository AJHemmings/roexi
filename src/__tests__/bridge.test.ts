import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, dropConn, getKnownCharacters, waitForRoeFrame, awaitSeqAck, removeChar, recordRefusals, clearLocks } from '../bridge';

// The bridge module is a singleton store, so every test uses its own conn id and character name.
const hello = (id: number, name: string, over: Record<string, unknown> = {}) => JSON.stringify({ t: 'hello', id, name, ...over });
const roe = (items: { id: number; p: number }[]) => JSON.stringify({ t: 'roe', items });
const roedone = (page: number, ids: number[]) => JSON.stringify({ t: 'roedone', page, ids });
const known = (name: string) => getKnownCharacters().find((c) => c.name === name);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  // Flush the 150 ms rebuild debounce so a test can never leave the store's "rebuild pending" flag stuck.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('bridge store', () => {
  it('builds a KnownChar from hello, roe and roedone', () => {
    ingestLine(1, hello(1, 'Aldric', { main: 'WAR' }));
    ingestLine(1, roe([{ id: 77, p: 3 }]));
    ingestLine(1, roedone(0, [1, 2]));
    vi.advanceTimersByTime(200);
    const c = known('Aldric');
    expect(c).toBeDefined();
    expect(c!.online).toBe(true);
    expect(c!.conn).toBe(1);
    expect(c!.main).toBe('WAR');
    expect(c!.active).toEqual([{ id: 77, p: 3 }]);
    expect(c!.doneIds.has(1)).toBe(true);
    expect(c!.doneIds.has(2)).toBe(true);
    expect(c!.donePagesKnown.has(0)).toBe(true);
  });

  it('keeps a character offline with its last state after dropConn', () => {
    ingestLine(2, hello(2, 'Brienne', { main: 'WAR' }));
    ingestLine(2, roe([{ id: 77, p: 3 }]));
    ingestLine(2, roedone(0, [1, 2]));
    vi.advanceTimersByTime(200);
    dropConn(2);
    const c = known('Brienne');
    expect(c).toBeDefined();
    expect(c!.online).toBe(false);
    expect(c!.conn).toBeUndefined();
    expect(c!.active).toEqual([{ id: 77, p: 3 }]);
    expect(c!.doneIds.has(1)).toBe(true);
    expect(c!.donePagesKnown.has(0)).toBe(true);
  });

  it('does not overwrite a known field with undefined when persisting', () => {
    ingestLine(3, hello(3, 'Cassius', { main: 'RDM' }));
    ingestLine(3, roe([{ id: 12, p: 0 }]));
    vi.advanceTimersByTime(200);
    dropConn(3);
    // Same character reconnects but this hello carries no job; the roe frame that follows must not erase it.
    ingestLine(3, hello(3, 'Cassius'));
    ingestLine(3, roe([{ id: 12, p: 1 }]));
    vi.advanceTimersByTime(200);
    dropConn(3);
    const c = known('Cassius');
    expect(c).toBeDefined();
    expect(c!.online).toBe(false);
    expect(c!.main).toBe('RDM');
    expect(c!.active).toEqual([{ id: 12, p: 1 }]);
  });

  it('dropConn fails pending roe waiters and seq waiters promptly', async () => {
    ingestLine(4, hello(4, 'Delphine'));
    vi.advanceTimersByTime(200);
    const p1 = waitForRoeFrame(4, Date.now() + 1, 10_000);
    const p2 = awaitSeqAck(4, 999, 10_000);
    dropConn(4);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toEqual({ ok: false, reason: 'no response' });
  });

  it('waitForRoeFrame resolves true when a newer roe frame arrives', async () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    ingestLine(5, hello(5, 'Evander'));
    const p = waitForRoeFrame(5, now, 5000);
    vi.setSystemTime(now + 10);
    ingestLine(5, roe([{ id: 1, p: 0 }]));
    vi.advanceTimersByTime(200);
    await expect(p).resolves.toBe(true);
  });

  it('seqack resolves a pending waiter with the addon result', async () => {
    ingestLine(6, hello(6, 'Fiora'));
    vi.advanceTimersByTime(200);
    const p = awaitSeqAck(6, 41, 5000);
    ingestLine(6, '{"t":"seqack","seq":41,"ok":false}');
    await expect(p).resolves.toEqual({ ok: false, reason: 'addon error' });
  });

  it('removeChar leaves an online character alone', async () => {
    ingestLine(7, hello(7, 'Gareth', { main: 'THF' }));
    ingestLine(7, roe([{ id: 5, p: 0 }]));
    vi.advanceTimersByTime(200);
    await removeChar('Gareth');
    const c = known('Gareth');
    expect(c).toBeDefined();
    expect(c!.online).toBe(true);
    expect(c!.active).toEqual([{ id: 5, p: 0 }]);
  });

  it('removeChar forgets an offline character', async () => {
    ingestLine(8, hello(8, 'Hilde'));
    ingestLine(8, roe([{ id: 5, p: 0 }]));
    vi.advanceTimersByTime(200);
    dropConn(8);
    expect(known('Hilde')).toBeDefined();
    await removeChar('Hilde');
    expect(known('Hilde')).toBeUndefined();
  });
});

describe('locked marks', () => {
  it('recordRefusals marks ids on the live character', () => {
    ingestLine(61, hello(61, 'Lock1'));
    recordRefusals(61, 'Lock1', [5, 6], 1234);
    vi.advanceTimersByTime(200);
    expect([...known('Lock1')!.locked!.entries()]).toEqual([[5, 1234], [6, 1234]]);
  });

  it('never marks an id that is active right now', () => {
    ingestLine(62, hello(62, 'Lock2'));
    ingestLine(62, roe([{ id: 5, p: 0 }]));
    recordRefusals(62, 'Lock2', [5], 1);
    vi.advanceTimersByTime(200);
    expect(known('Lock2')!.locked?.has(5) ?? false).toBe(false);
  });

  it('marks survive a later ordinary frame and going offline', () => {
    ingestLine(63, hello(63, 'Lock3'));
    ingestLine(63, roe([]));
    recordRefusals(63, 'Lock3', [5], 1);
    ingestLine(63, roe([{ id: 9, p: 0 }]));
    dropConn(63);
    expect(known('Lock3')!.locked?.get(5)).toBe(1);
  });

  it('a later roe frame with the id clears the mark', () => {
    ingestLine(64, hello(64, 'Lock4'));
    recordRefusals(64, 'Lock4', [5], 1);
    ingestLine(64, roe([{ id: 5, p: 0 }]));
    vi.advanceTimersByTime(200);
    expect(known('Lock4')!.locked?.has(5)).toBe(false);
  });

  it('clearLocks works online and offline', () => {
    ingestLine(65, hello(65, 'Lock5'));
    ingestLine(65, roe([]));
    recordRefusals(65, 'Lock5', [5], 1);
    clearLocks('Lock5');
    expect(known('Lock5')!.locked?.size).toBe(0);
    recordRefusals(65, 'Lock5', [6], 1);
    dropConn(65);
    clearLocks('Lock5');
    expect(known('Lock5')!.locked?.size).toBe(0);
  });

  it('a stale recordRefusals call from before a character swap on the same conn does not mark the new character', () => {
    ingestLine(66, hello(66, 'SwapA'));
    ingestLine(66, hello(66, 'SwapB', { id: 67 }));
    recordRefusals(66, 'SwapA', [5], 1);
    vi.advanceTimersByTime(200);
    expect(known('SwapB')!.locked?.has(5) ?? false).toBe(false);
  });
});
