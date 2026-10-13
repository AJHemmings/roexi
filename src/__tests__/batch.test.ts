import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, dropConn, getKnownCharacters, setCommandSink } from '../bridge';
import { runAdd, runRemove, runSetCommand } from '../roe/batch';
import { getResults, clearResults } from '../roe/results';
import type { CatalogEntry } from '../roe/types';
import { beginPending, endPending, getPending, isCharBusy, pendingFor } from '../roe/pending';

const hello = (conn: number, name: string) => ingestLine(conn, JSON.stringify({ t: 'hello', id: conn, name }));
const known = (name: string) => getKnownCharacters().find((c) => c.name === name)!;

// A fake addon: answers roeadd/roecancel after a tick, exactly like dev/mockFeed.ts.
function fakeAddon(active: Map<number, Set<number>>, sent?: string[]) {
  setCommandSink((conn, line) => {
    sent?.push(line);
    const msg = JSON.parse(line) as { cmd: string; ids?: number[]; seq?: number };
    if (msg.cmd === 'notice') return;
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

  it('never writes a lock when the game ignores an add (only the game\'s own message may lock)', async () => {
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
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Refusa', notAccepted: [1] });
    expect(known('Refusa').gameLocked?.size ?? 0).toBe(0);
  });
});

describe('runRemove', () => {
  it('sends roecancel and publishes "ok" with the removed id', async () => {
    hello(5, 'Evander');
    ingestLine(5, JSON.stringify({ t: 'roe', items: [{ id: 1, p: 0 }] }));
    vi.advanceTimersByTime(200);
    fakeAddon(new Map([[5, new Set([1])]]));
    const p = runRemove([known('Evander')], [1], byId);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Evander', status: 'ok', removed: [1], notRemoved: [] });
  });

  it('tells that connection what was removed', async () => {
    hello(12, 'Mireille');
    ingestLine(12, JSON.stringify({ t: 'roe', items: [{ id: 1, p: 0 }] }));
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    const active = new Map([[12, new Set([1])]]);
    setCommandSink((conn, line) => {
      sent.push(line);
      const msg = JSON.parse(line) as { cmd: string; ids?: number[]; seq?: number };
      const set = active.get(conn) ?? new Set<number>();
      active.set(conn, set);
      if (msg.cmd === 'roecancel') for (const id of msg.ids ?? []) set.delete(id);
      setTimeout(() => {
        if (msg.seq != null) ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
        ingestLine(conn, JSON.stringify({ t: 'roe', items: [...set].map((id) => ({ id, p: 0 })) }));
      }, 50);
    });
    const p = runRemove([known('Mireille')], [1], byId);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    const notice = sent.map((l) => JSON.parse(l)).find((m) => m.cmd === 'notice');
    expect(notice).toEqual({ cmd: 'notice', msg: 'removed: Obj 1' });
  });

  it('with notice: false, sends no notice, titles the card and returns the results', async () => {
    hello(14, 'Orla');
    ingestLine(14, JSON.stringify({ t: 'roe', items: [{ id: 1, p: 0 }] }));
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    fakeAddon(new Map([[14, new Set([1])]]), sent);
    const p = runRemove([known('Orla')], [1], byId, { notice: false, label: 'unset Daily (in game)' });
    await vi.advanceTimersByTimeAsync(200);
    const result = await p;
    expect(sent.some((line) => JSON.parse(line).cmd === 'notice')).toBe(false);
    expect(result).toEqual([expect.objectContaining({ name: 'Orla', status: 'ok', removed: [1] })]);
    expect(getResults()[0].label).toBe('unset Daily (in game)');
  });

  it('sends no notice when nothing was removed', async () => {
    hello(13, 'Norah');
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    setCommandSink((conn, line) => {
      sent.push(line);
      const msg = JSON.parse(line) as { cmd: string; seq?: number };
      setTimeout(() => {
        if (msg.seq != null) ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
        ingestLine(conn, JSON.stringify({ t: 'roe', items: [] }));
      }, 50);
    });
    const p = runRemove([known('Norah')], [1], byId);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(sent.some((line) => JSON.parse(line).cmd === 'notice')).toBe(false);
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
    const p = runRemove([known('Helena')], [1], byId);
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

  it('runRemove returns null when it refuses', async () => {
    hello(15, 'Pell');
    vi.advanceTimersByTime(200);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const held = beginPending('add', ['Pell'], [1]);
    try {
      expect(await runRemove([known('Pell')], [1], byId)).toBeNull();
    } finally {
      endPending(held);
      warn.mockRestore();
    }
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
      await runRemove([known('Kael')], [1], byId);
      expect(sent).toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(isCharBusy(getPending(), 'Lysa')).toBe(false); // not left locked by the refused batch
    } finally {
      endPending(held);
      warn.mockRestore();
    }
  });
});

describe('runSetCommand', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => 100 + i);

  it('cancels just enough no-progress objectives, then adds the set', async () => {
    hello(20, 'Quinn');
    ingestLine(20, JSON.stringify({ t: 'roe', items: thirty.map((id, i) => ({ id, p: i === 0 ? 5 : 0 })) }));
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    fakeAddon(new Map([[20, new Set(thirty)]]), sent);
    const p = runSetCommand([known('Quinn')], [1, 2], byId, 'set Pair (in game)');
    await vi.advanceTimersByTimeAsync(400);
    const result = await p;
    expect(sent.map((l) => JSON.parse(l)).map((m) => [m.cmd, m.ids])).toEqual([['roecancel', [101, 102]], ['roeadd', [1, 2]]]);
    expect(result).toEqual([expect.objectContaining({ name: 'Quinn', status: 'ok', cancelled: [101, 102], added: [1, 2], notAccepted: [] })]);
    expect(getResults()[0]).toMatchObject({ kind: 'add', label: 'set Pair (in game)' });
  });

  it('adds without cancelling when the set fits', async () => {
    hello(24, 'Ulla');
    ingestLine(24, JSON.stringify({ t: 'roe', items: [] }));
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    fakeAddon(new Map(), sent);
    const p = runSetCommand([known('Ulla')], [1], byId, 'set One (in game)');
    await vi.advanceTimersByTimeAsync(400);
    const result = await p;
    expect(sent.map((l) => JSON.parse(l).cmd)).toEqual(['roeadd']);
    expect(result![0]).toMatchObject({ status: 'ok', cancelled: [], added: [1] });
  });

  it("stops before adding when a cancel doesn't land", async () => {
    hello(21, 'Rhea');
    ingestLine(21, JSON.stringify({ t: 'roe', items: thirty.map((id) => ({ id, p: 0 })) }));
    vi.advanceTimersByTime(200);
    const sent: string[] = [];
    setCommandSink((conn, line) => {
      sent.push(line);
      const msg = JSON.parse(line) as { seq?: number };
      // The game ignores the cancel: acked, but the active list doesn't change.
      setTimeout(() => {
        if (msg.seq != null) ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
        ingestLine(conn, JSON.stringify({ t: 'roe', items: thirty.map((id) => ({ id, p: 0 })) }));
      }, 50);
    });
    const p = runSetCommand([known('Rhea')], [1], byId, 'set One (in game)');
    await vi.advanceTimersByTimeAsync(400);
    const result = await p;
    expect(sent.map((l) => JSON.parse(l).cmd)).toEqual(['roecancel']);
    expect(result![0]).toMatchObject({ name: 'Rhea', status: 'ok', added: [], cancelled: [], notCancelled: [100] });
  });

  it('sends nothing for a character without enough room', async () => {
    hello(22, 'Sable');
    ingestLine(22, JSON.stringify({ t: 'roe', items: thirty.map((id) => ({ id, p: 3 })) }));
    vi.advanceTimersByTime(200);
    let sent = false;
    setCommandSink(() => { sent = true; });
    const result = await runSetCommand([known('Sable')], [1], byId, 'set One (in game)');
    expect(sent).toBe(false);
    expect(result![0]).toMatchObject({ name: 'Sable', status: 'noroom', needed: 1, freeable: 0, added: [] });
  });

  it('holds the character busy while it runs, including the ids it cancels', async () => {
    hello(23, 'Tamsin');
    ingestLine(23, JSON.stringify({ t: 'roe', items: thirty.map((id) => ({ id, p: 0 })) }));
    vi.advanceTimersByTime(200);
    fakeAddon(new Map([[23, new Set(thirty)]]));
    const p = runSetCommand([known('Tamsin')], [1], byId, 'set One (in game)');
    expect(pendingFor(getPending(), 'Tamsin', 1)).toBe('add');
    expect(pendingFor(getPending(), 'Tamsin', 100)).toBe('add');
    await vi.advanceTimersByTimeAsync(400);
    await p;
    expect(isCharBusy(getPending(), 'Tamsin')).toBe(false);
  });

  it('returns null and sends nothing when a target is already busy', async () => {
    hello(25, 'Vesna');
    vi.advanceTimersByTime(200);
    let sent = 0;
    setCommandSink(() => { sent++; });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const held = beginPending('remove', ['Vesna'], [1]);
    try {
      expect(await runSetCommand([known('Vesna')], [1], byId, 'set One (in game)')).toBeNull();
      expect(sent).toBe(0);
    } finally {
      endPending(held);
      warn.mockRestore();
    }
  });
});
