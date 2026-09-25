import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, dropConn, getKnownCharacters, setCommandSink } from '../bridge';
import { runAdd, runRemove } from '../roe/batch';
import { getResults, clearResults } from '../roe/results';
import type { CatalogEntry } from '../roe/types';
import { beginPending, endPending, getPending, isCharBusy, pendingFor } from '../roe/pending';

const hello = (conn: number, name: string) => ingestLine(conn, JSON.stringify({ t: 'hello', id: conn, name }));
const known = (name: string) => getKnownCharacters().find((c) => c.name === name)!;

// A fake addon: answers roeadd/roecancel after a tick, exactly like dev/mockFeed.ts.
function fakeAddon(active: Map<number, Set<number>>) {
  setCommandSink((conn, line) => {
    const msg = JSON.parse(line) as { cmd: string; ids?: number[]; seq?: number };
    const set = active.get(conn) ?? new Set<number>();
    active.set(conn, set);
    if (msg.cmd === 'roeadd') for (const id of msg.ids ?? []) set.add(id);
    if (msg.cmd === 'roecancel') for (const id of msg.ids ?? []) set.delete(id);
    setTimeout(() => {
      if (msg.seq != null) ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
      ingestLine(conn, JSON.stringify({ t: 'roe', items: [...set].map((id) => ({ id, p: 0 })) }));
    }, 50);
  });
}

const byId = new Map<number, CatalogEntry>([[1, { id: 1, n: 'Obj 1', repeat: false }]]);

beforeEach(() => { vi.useFakeTimers(); clearResults(); setCommandSink(null); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

describe('runAdd', () => {
  it('sends roeadd, awaits ack + settle, and publishes an "ok" result with the landed id', async () => {
    hello(1, 'Aldric');
    vi.advanceTimersByTime(200);
    fakeAddon(new Map());
    const p = runAdd([known('Aldric')], [1], byId);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    const [card] = getResults();
    expect(card.kind).toBe('add');
    expect(card.chars[0]).toMatchObject({ name: 'Aldric', status: 'ok', added: [1], notAccepted: [] });
  });

  it('publishes "full" for a character with no room, without sending a command', async () => {
    hello(2, 'Brienne');
    const active = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, p: 0 }));
    ingestLine(2, JSON.stringify({ t: 'roe', items: active }));
    vi.advanceTimersByTime(200);
    let sent = false;
    setCommandSink(() => { sent = true; });
    await runAdd([known('Brienne')], [1], byId);
    expect(sent).toBe(false);
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Brienne', status: 'full', added: [] });
  });

  it('publishes "offline" for a disconnected character, without sending a command', async () => {
    hello(3, 'Cassius');
    ingestLine(3, JSON.stringify({ t: 'roe', items: [] })); // a hello alone doesn't persist; dropConn would just delete the box
    vi.advanceTimersByTime(200);
    dropConn(3);
    let sent = false;
    setCommandSink(() => { sent = true; });
    await runAdd([known('Cassius')], [1], byId);
    expect(sent).toBe(false);
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Cassius', status: 'offline' });
  });

  it('publishes "no-response" when the addon never acks, but still diffs against what actually happened', async () => {
    hello(4, 'Delphine');
    vi.advanceTimersByTime(200);
    setCommandSink((conn, line) => {
      const msg = JSON.parse(line) as { cmd: string; ids?: number[] };
      // Simulate the injection landing but the seqack getting lost: apply state and emit a fresh
      // roe frame, but never send a seqack at all.
      if (msg.cmd === 'roeadd') {
        setTimeout(() => {
          ingestLine(conn, JSON.stringify({ t: 'roe', items: (msg.ids ?? []).map((id) => ({ id, p: 0 })) }));
        }, 50);
      }
    });
    const p = runAdd([known('Delphine')], [1], byId);
    await vi.advanceTimersByTimeAsync(20_000); // past the 15s ack timeout; the roe frame lands well before that
    await p;
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Delphine', status: 'no-response', added: [1], notAccepted: [] });
  });

  it('marks refused ids as locked when the addon acked ok', async () => {
    hello(41, 'Refusa');
    vi.advanceTimersByTime(200);
    setCommandSink((conn, line) => {
      const msg = JSON.parse(line) as { seq?: number };
      setTimeout(() => {
        ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
        ingestLine(conn, JSON.stringify({ t: 'roe', items: [] })); // game ignored the add
      }, 50);
    });
    const p = runAdd([known('Refusa')], [1], byId);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    vi.advanceTimersByTime(200);
    expect(known('Refusa').locked?.has(1)).toBe(true);
  });

  it('does not mark anything when the addon never acked', async () => {
    hello(42, 'Silent');
    vi.advanceTimersByTime(200);
    setCommandSink(() => {});
    const p = runAdd([known('Silent')], [1], byId);
    await vi.advanceTimersByTimeAsync(17_000);
    await p;
    vi.advanceTimersByTime(200);
    expect(known('Silent').locked?.has(1) ?? false).toBe(false);
  });
});

describe('runRemove', () => {
  it('sends roecancel and publishes "ok" with the removed id', async () => {
    hello(5, 'Evander');
    ingestLine(5, JSON.stringify({ t: 'roe', items: [{ id: 1, p: 0 }] }));
    vi.advanceTimersByTime(200);
    fakeAddon(new Map([[5, new Set([1])]]));
    const p = runRemove([known('Evander')], [1]);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Evander', status: 'ok', removed: [1], notRemoved: [] });
  });
});

describe('in-flight lock', () => {
  it('holds the character busy while runAdd runs and releases it afterwards', async () => {
    hello(6, 'Gideon');
    vi.advanceTimersByTime(200);
    fakeAddon(new Map());
    const p = runAdd([known('Gideon')], [1], byId);
    // Synchronously busy — before any timer has run — so a second click can't slip in.
    expect(isCharBusy(getPending(), 'Gideon')).toBe(true);
    expect(pendingFor(getPending(), 'Gideon', 1)).toBe('add');
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(isCharBusy(getPending(), 'Gideon')).toBe(false);
  });

  it('holds the character busy while runRemove runs and releases it afterwards', async () => {
    hello(7, 'Helena');
    ingestLine(7, JSON.stringify({ t: 'roe', items: [{ id: 1, p: 0 }] }));
    vi.advanceTimersByTime(200);
    fakeAddon(new Map([[7, new Set([1])]]));
    const p = runRemove([known('Helena')], [1]);
    expect(pendingFor(getPending(), 'Helena', 1)).toBe('remove');
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(isCharBusy(getPending(), 'Helena')).toBe(false);
  });

  it('keeps the lock through a missing ack and releases it after the timeout', async () => {
    hello(8, 'Ivo');
    vi.advanceTimersByTime(200);
    setCommandSink(() => { /* addon never answers */ });
    const p = runAdd([known('Ivo')], [1], byId);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isCharBusy(getPending(), 'Ivo')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000); // past ack (15s) + settle (1.5s)
    await p;
    expect(isCharBusy(getPending(), 'Ivo')).toBe(false);
  });

  it('releases the lock when sending throws', async () => {
    hello(9, 'Juno');
    vi.advanceTimersByTime(200);
    setCommandSink(() => { throw new Error('boom'); });
    await expect(runAdd([known('Juno')], [1], byId)).rejects.toThrow('boom');
    expect(isCharBusy(getPending(), 'Juno')).toBe(false);
  });

  it('refuses the whole batch, sending nothing, if any target is already busy', async () => {
    hello(10, 'Kael');
    hello(11, 'Lysa');
    vi.advanceTimersByTime(200);
    let sent = 0;
    setCommandSink(() => { sent++; });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const held = beginPending('add', ['Kael'], [1]);
    try {
      await runAdd([known('Kael'), known('Lysa')], [1], byId);
      await runRemove([known('Kael')], [1]);
      expect(sent).toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(isCharBusy(getPending(), 'Lysa')).toBe(false); // not left locked by the refused batch
    } finally {
      endPending(held);
      warn.mockRestore();
    }
  });
});
