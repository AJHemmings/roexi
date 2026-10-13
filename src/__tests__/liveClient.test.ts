import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invoke, applyLiveClient, parseRoeMenu, parseRoeDat } = vi.hoisted(() => ({
  invoke: vi.fn(), applyLiveClient: vi.fn(), parseRoeMenu: vi.fn(), parseRoeDat: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('../bridge', () => ({ inTauri: true }));
vi.mock('../roe/catalog', () => ({ applyLiveClient }));
vi.mock('../roe/clientMenu', async (importOriginal) => ({ ...(await importOriginal<typeof import('../roe/clientMenu')>()), parseRoeMenu }));
vi.mock('../roe/clientDat', async (importOriginal) => ({ ...(await importOriginal<typeof import('../roe/clientDat')>()), parseRoeDat }));

import { loadLiveClient, resetLiveClient } from '../roe/liveClient';

const MENU = [{ cat: 'Other', sub: 'Monthly Objectives', ids: Array.from({ length: 1200 }, (_, i) => i + 1) }];
const ENTRIES = Array.from({ length: 1600 }, (_, i) => ({ id: i + 1, n: `O${i + 1}`, repeat: false, goal: 1, sparks: 0, exp: 0, acc: 0 }));

let stamp = 'A';
beforeEach(() => {
  resetLiveClient();
  invoke.mockReset(); applyLiveClient.mockReset(); parseRoeMenu.mockReset(); parseRoeDat.mockReset();
  stamp = 'A';
  invoke.mockImplementation(async (cmd: string) => (cmd === 'roe_files_stamp' ? stamp : new ArrayBuffer(8)));
  parseRoeMenu.mockReturnValue(MENU);
  parseRoeDat.mockReturnValue(ENTRIES);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
const reads = () => invoke.mock.calls.map(([cmd]) => cmd).filter((c) => c !== 'roe_files_stamp');

describe('loadLiveClient', () => {
  it('reads both files and applies them', async () => {
    await loadLiveClient('E:\\FFXI');
    expect(reads()).toEqual(['read_roe_menu', 'read_roe_table']);
    expect(applyLiveClient).toHaveBeenCalledWith(ENTRIES, MENU);
  });

  it('does not read again while the files are unchanged, and does when they change', async () => {
    await loadLiveClient('E:\\FFXI');
    await loadLiveClient('E:\\FFXI');
    expect(reads()).toHaveLength(2);
    stamp = 'B';
    await loadLiveClient('E:\\FFXI');
    expect(reads()).toHaveLength(4);
  });

  it('falls back to the menu alone when the table read fails, and tries the table again next time', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'roe_files_stamp') return stamp;
      if (cmd === 'read_roe_table') throw new Error('locked');
      return new ArrayBuffer(8);
    });
    await loadLiveClient('E:\\FFXI');
    expect(applyLiveClient).toHaveBeenLastCalledWith(null, MENU);
    await loadLiveClient('E:\\FFXI');
    expect(reads().filter((c) => c === 'read_roe_table')).toHaveLength(2);
  });

  it('falls back to the menu alone when the table has too few objectives', async () => {
    parseRoeDat.mockReturnValue(ENTRIES.slice(0, 10));
    await loadLiveClient('E:\\FFXI');
    expect(applyLiveClient).toHaveBeenLastCalledWith(null, MENU);
  });

  it('applies nothing when the menu read fails or lists too little', async () => {
    parseRoeMenu.mockReturnValue([{ cat: 'X', sub: 'Y', ids: [1, 2, 3] }]);
    await loadLiveClient('E:\\FFXI');
    invoke.mockImplementation(async (cmd: string) => { if (cmd === 'roe_files_stamp') return stamp; throw new Error('gone'); });
    await loadLiveClient('E:\\FFXI');
    expect(applyLiveClient).not.toHaveBeenCalled();
  });

  it('shares one read between overlapping calls', async () => {
    await Promise.all([loadLiveClient('E:\\FFXI'), loadLiveClient('E:\\FFXI')]);
    expect(reads()).toEqual(['read_roe_menu', 'read_roe_table']);
  });

  it('does nothing without a game folder', async () => {
    await loadLiveClient('');
    expect(invoke).not.toHaveBeenCalled();
  });
});
