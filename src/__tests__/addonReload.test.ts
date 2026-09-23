import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestLine, setCommandSink } from '../bridge';
import { beginPending, endPending } from '../roe/pending';
import { reloadAddonInGame } from '../addonReload';

const reloads: number[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  reloads.length = 0;
  setCommandSink((conn, line) => { if ((JSON.parse(line) as { cmd: string }).cmd === 'reload') reloads.push(conn); });
});
afterEach(() => { setCommandSink(null); vi.useRealTimers(); });

ingestLine(1, JSON.stringify({ t: 'hello', id: 1, name: 'Aldric' }));
ingestLine(2, JSON.stringify({ t: 'hello', id: 2, name: 'Brienne' }));

describe('reloadAddonInGame', () => {
  it('reloads every connected client straight away when nothing is in flight, and returns the count', async () => {
    expect(await reloadAddonInGame()).toBe(2);
    expect(reloads.sort()).toEqual([1, 2]);
  });

  it('waits for in-flight batches to finish before reloading', async () => {
    const key = beginPending('add', ['Aldric'], [1]);
    const p = reloadAddonInGame();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reloads).toEqual([]);
    endPending(key);
    expect(await p).toBe(2);
    expect(reloads.length).toBe(2);
  });

  it('reloads anyway after the 20s cap if a batch never finishes', async () => {
    const key = beginPending('add', ['Aldric'], [1]);
    try {
      const p = reloadAddonInGame();
      await vi.advanceTimersByTimeAsync(19_000);
      expect(reloads).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await p).toBe(2);
    } finally {
      endPending(key);
    }
  });
});
