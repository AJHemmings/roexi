import { describe, it, expect } from 'vitest';
import { resolveGameCommand, normalizeSetName } from '../roe/gameCommands';
import type { CmdFrame } from '../bridge/frames';
import type { KnownChar, RoeSet } from '../roe/types';
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
