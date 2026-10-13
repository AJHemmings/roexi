import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, setCommandSink } from '../bridge';
import { resolveGameCommand, normalizeSetName, handleGameCommand } from '../roe/gameCommands';
import { replaceAllSets, getSets } from '../roe/sets';
import { clearResults } from '../roe/results';
import type { CmdFrame } from '../bridge/frames';
import type { CatalogEntry, KnownChar, RoeSet } from '../roe/types';
import type { PendingEntry } from '../roe/pending';

const char = (name: string, conn: number | undefined, online = true): KnownChar => ({
  name, conn, online, active: [], doneIds: new Set(), donePagesKnown: new Set(),
});
const set = (name: string): RoeSet => ({ id: name, name, ids: [1, 2], createdAt: 0, updatedAt: 0 });
const cmd = (over: Partial<CmdFrame> = {}): CmdFrame => ({ t: 'cmd', verb: 'set', name: 'Ambuscade', all: false, ...over });

const known = [char('Mak', 1), char('Alt', 2), char('Gone', undefined, false)];
const sets = [set('Ambuscade'), set('Ambuscade  Daily')];
const base = { conn: 1, known, sets, setsLoaded: true, pending: [] as PendingEntry[] };
const names = (r: ReturnType<typeof resolveGameCommand>) => (r.ok ? r.targets.map((t) => t.name) : r.reply);

describe('normalizeSetName', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeSetName('  Ambuscade   Daily ')).toBe('ambuscade daily');
  });
});

describe('resolveGameCommand', () => {
  it('finds the set whatever the case and targets the typing character', () => {
    const r = resolveGameCommand({ ...base, frame: cmd({ name: 'ambuscade' }) });
    expect(r.ok && r.set.name).toBe('Ambuscade');
    expect(names(r)).toEqual(['Mak']);
  });

  it('matches through extra spaces on either side', () => {
    const r = resolveGameCommand({ ...base, frame: cmd({ name: 'AMBUSCADE DAILY' }) });
    expect(r.ok && r.set.name).toBe('Ambuscade  Daily');
  });

  it('all targets every connected character and never an offline one', () => {
    expect(names(resolveGameCommand({ ...base, frame: cmd({ all: true }) }))).toEqual(['Mak', 'Alt']);
  });

  it('replies when there is no such set', () => {
    expect(resolveGameCommand({ ...base, frame: cmd({ name: 'Ambuscad' }) })).toEqual({ ok: false, reply: 'no set called "Ambuscad"' });
  });

  it('replies while sets are still loading', () => {
    expect(resolveGameCommand({ ...base, setsLoaded: false, frame: cmd() })).toEqual({ ok: false, reply: 'sets are still loading, try again in a moment' });
  });

  it('replies when the typing connection has no known character yet', () => {
    expect(resolveGameCommand({ ...base, conn: 9, frame: cmd() })).toEqual({ ok: false, reply: "roexi doesn't know this character yet, try again in a moment" });
  });

  it('refuses when a target is busy, but only a target', () => {
    const pending: PendingEntry[] = [{ key: 1, kind: 'add', chars: ['Alt'], ids: [5] }];
    expect(resolveGameCommand({ ...base, pending, frame: cmd({ all: true }) }))
      .toEqual({ ok: false, reply: 'busy: Alt is still changing objectives, try again in a moment' });
    expect(names(resolveGameCommand({ ...base, pending, frame: cmd() }))).toEqual(['Mak']);
  });
});

describe('handleGameCommand', () => {
  const byIdLoader = async () => new Map<number, CatalogEntry>([[1, { id: 1, n: 'Obj 1' }]]);

  // A fake addon for every connection: applies roeadd/roecancel and records every line.
  function fakeGame(active: Map<number, Set<number>>) {
    const sent: { conn: number; msg: Record<string, unknown> }[] = [];
    setCommandSink((conn, line) => {
      const msg = JSON.parse(line) as { cmd: string; ids?: number[]; seq?: number };
      sent.push({ conn, msg });
      if (msg.seq == null) return;
      const set = active.get(conn) ?? new Set<number>();
      active.set(conn, set);
      if (msg.cmd === 'roeadd') for (const id of msg.ids ?? []) set.add(id);
      if (msg.cmd === 'roecancel') for (const id of msg.ids ?? []) set.delete(id);
      setTimeout(() => {
        ingestLine(conn, JSON.stringify({ t: 'seqack', seq: msg.seq, ok: true }));
        ingestLine(conn, JSON.stringify({ t: 'roe', items: [...set].map((id) => ({ id, p: 0 })) }));
      }, 50);
    });
    return { notices: () => sent.filter((s) => s.msg.cmd === 'notice').map((s) => [s.conn, s.msg.msg]), sent };
  }

  const online = (conn: number, name: string, activeIds: number[] = []) => {
    ingestLine(conn, JSON.stringify({ t: 'hello', id: conn, name }));
    ingestLine(conn, JSON.stringify({ t: 'roe', items: activeIds.map((id) => ({ id, p: 0 })) }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clearResults();
    replaceAllSets([{ id: 's1', name: 'Ambuscade', ids: [1], createdAt: 0, updatedAt: 0 }]);
  });
  afterEach(() => { setCommandSink(null); vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  it('applies the set to the typing character and answers only there: working, then one line', async () => {
    online(31, 'Mak');
    online(32, 'Alt');
    vi.advanceTimersByTime(200);
    const game = fakeGame(new Map());
    const p = handleGameCommand(31, { t: 'cmd', verb: 'set', name: 'ambuscade', all: false }, byIdLoader);
    await vi.advanceTimersByTimeAsync(400);
    await p;
    expect(game.notices()).toEqual([[31, 'set Ambuscade: working on Mak...'], [31, 'Mak: +1']]);
    expect(game.sent.some((s) => s.conn === 32)).toBe(false);
    expect(getSets()[0].lastAppliedAt).toBeDefined();
  });

  it('all applies to every connected character, with every line in the typing window', async () => {
    online(33, 'Nia');
    online(34, 'Oro', [1]);
    vi.advanceTimersByTime(200);
    const game = fakeGame(new Map([[34, new Set([1])]]));
    const p = handleGameCommand(33, { t: 'cmd', verb: 'set', name: 'Ambuscade', all: true }, byIdLoader);
    await vi.advanceTimersByTimeAsync(400);
    await p;
    const lines = game.notices();
    expect(lines.every(([conn]) => conn === 33)).toBe(true);
    expect(lines.map(([, msg]) => msg)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^set Ambuscade: working on \d+ characters\.\.\.$/),
      'Nia: +1',
      'Oro: nothing to do, 1 already active',
    ]));
  });

  it('answers an unknown set name and does nothing else', async () => {
    online(35, 'Pim');
    vi.advanceTimersByTime(200);
    const game = fakeGame(new Map());
    await handleGameCommand(35, { t: 'cmd', verb: 'set', name: 'Nope', all: false }, byIdLoader);
    expect(game.sent.map((s) => s.msg)).toEqual([{ cmd: 'notice', msg: 'no set called "Nope"' }]);
    expect(getSets()[0].lastAppliedAt).toBeUndefined();
  });

  it('unset sends one summary line and no per-character "removed:" notice', async () => {
    online(36, 'Quo', [1]);
    vi.advanceTimersByTime(200);
    const game = fakeGame(new Map([[36, new Set([1])]]));
    const p = handleGameCommand(36, { t: 'cmd', verb: 'unset', name: 'Ambuscade', all: false }, byIdLoader);
    await vi.advanceTimersByTimeAsync(400);
    await p;
    expect(game.notices()).toEqual([[36, 'unset Ambuscade: working on Quo...'], [36, 'Quo: removed 1']]);
  });
});
