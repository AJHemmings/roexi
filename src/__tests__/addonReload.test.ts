import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, setCommandSink } from '../bridge';
import { beginPending, endPending } from '../roe/pending';
import { reloadAddonInGame, supportsReload, reloadSummary } from '../addonReload';

const reloads: number[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  reloads.length = 0;
  setCommandSink((conn, line) => { if ((JSON.parse(line) as { cmd: string }).cmd === 'reload') reloads.push(conn); });
});
afterEach(() => { setCommandSink(null); vi.useRealTimers(); });

// The bridge is a module-level singleton store, so these two connections are created once and reused
// by every test below — none of these tests drop or mutate the connections themselves, only the
// pending store, so a shared beforeAll is safe and avoids each test picking fresh conn ids.
beforeAll(() => {
  ingestLine(1, JSON.stringify({ t: 'hello', id: 1, name: 'Aldric', av: '0.2.0-beta' }));
  ingestLine(2, JSON.stringify({ t: 'hello', id: 2, name: 'Brienne', av: '0.2.0-beta' }));
});

describe('reloadAddonInGame', () => {
  it('reloads every connected client straight away when nothing is in flight, and returns the count', async () => {
    expect(await reloadAddonInGame()).toEqual({ reloaded: 2, manual: 0 });
    expect(reloads.sort()).toEqual([1, 2]);
  });

  it('waits for in-flight batches to finish before reloading', async () => {
    const key = beginPending('add', ['Aldric'], [1]);
    try {
      const p = reloadAddonInGame();
      await vi.advanceTimersByTimeAsync(1000);
      expect(reloads).toEqual([]);
      endPending(key);
      expect(await p).toEqual({ reloaded: 2, manual: 0 });
      expect(reloads.length).toBe(2);
    } finally {
      endPending(key);
    }
  });

  it('reloads anyway after the 20s cap if a batch never finishes', async () => {
    const key = beginPending('add', ['Aldric'], [1]);
    try {
      const p = reloadAddonInGame();
      await vi.advanceTimersByTimeAsync(19_000);
      expect(reloads).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await p).toEqual({ reloaded: 2, manual: 0 });
      expect(reloads.length).toBe(2);
    } finally {
      endPending(key);
    }
  });

  it('only reloads clients whose addon understands the command', async () => {
    ingestLine(3, JSON.stringify({ t: 'hello', id: 3, name: 'Cassius', av: '0.1.0-beta' }));
    expect(await reloadAddonInGame()).toEqual({ reloaded: 2, manual: 1 });
    expect(reloads.sort()).toEqual([1, 2]);
  });
});

describe('supportsReload', () => {
  it.each([
    ['0.2.0-beta', true],
    ['0.10.0', true],
    ['1.0.0', true],
    ['0.1.9', false],
    [undefined, false],
    ['mock', false],
  ] as const)('supportsReload(%s) -> %s', (av, expected) => {
    expect(supportsReload(av)).toBe(expected);
  });
});

describe('reloadSummary', () => {
  it('reloaded some, none left manual', () => {
    expect(reloadSummary({ reloaded: 3, manual: 0 })).toBe('reloaded on 3 clients.');
  });
  it('reloaded some, some manual', () => {
    expect(reloadSummary({ reloaded: 1, manual: 2 })).toBe('reloaded on 1 client; run //lua reload roexi in-game on the other 2.');
  });
  it('none reloaded, some manual', () => {
    expect(reloadSummary({ reloaded: 0, manual: 2 })).toBe('run //lua reload roexi in-game to apply.');
  });
  it('nothing connected', () => {
    expect(reloadSummary({ reloaded: 0, manual: 0 })).toBe('no characters connected; it loads next time you start roexi in-game.');
  });
});
