import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, dropConn, getKnownCharacters, setCommandSink } from '../bridge';
import { runAdd, runRemove } from '../roe/batch';
import { getResults, clearResults } from '../roe/results';
import type { CatalogEntry } from '../roe/types';

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

  it('publishes "no-response" when the addon never acks, but still diffs (still checks landed ids)', async () => {
    hello(4, 'Delphine');
    vi.advanceTimersByTime(200);
    setCommandSink(null); // no answer at all
    const p = runAdd([known('Delphine')], [1], byId);
    await vi.advanceTimersByTimeAsync(20_000); // past the 15s ack timeout + 1.5s settle timeout
    await p;
    expect(getResults()[0].chars[0]).toMatchObject({ name: 'Delphine', status: 'no-response', added: [], notAccepted: [1] });
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
