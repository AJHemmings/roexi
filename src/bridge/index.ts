import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseFrame, applyFrame } from './frames';
import { doneFromPages } from '../roe/bitmap';
import type { Box, KnownChar, PersistedChar } from '../roe/types';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── store ────────────────────────────────────────────────────────────────────
const byConn = new Map<number, Box>();
const persisted = new Map<string, PersistedChar>();
const listeners = new Set<() => void>();
let liveSnapshot: Box[] = [];
let knownSnapshot: KnownChar[] = [];

function toKnown(name: string, b: Box | undefined, pc: PersistedChar | undefined): KnownChar {
  const pages = b?.donePages ?? pc?.donePages;
  const { doneIds, donePagesKnown } = doneFromPages(pages);
  return {
    name,
    id: b?.id ?? pc?.id,
    online: !!b,
    conn: b?.conn,
    main: b?.main ?? pc?.main,
    sub: b?.sub ?? pc?.sub,
    zoneName: b?.zoneName ?? pc?.zoneName,
    active: b?.active ?? pc?.active ?? [],
    activeAt: b?.activeAt ?? pc?.activeAt,
    doneIds,
    donePagesKnown,
    savedAt: pc?.savedAt,
  };
}

function rebuild() {
  liveSnapshot = [...byConn.values()].sort((a, b) => a.name.localeCompare(b.name));
  const known = new Map<string, KnownChar>();
  for (const [name, pc] of persisted) known.set(name, toKnown(name, undefined, pc));
  for (const b of liveSnapshot) known.set(b.name, toKnown(b.name, b, persisted.get(b.name)));
  knownSnapshot = [...known.values()].sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));
  listeners.forEach((l) => l());
}

let rebuildPending = false;
function scheduleRebuild() {
  if (rebuildPending) return;
  rebuildPending = true;
  setTimeout(() => { rebuildPending = false; rebuild(); }, 150);
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export function useBoxes(): Box[] { return useSyncExternalStore(subscribe, () => liveSnapshot, () => liveSnapshot); }
export function useKnownCharacters(): KnownChar[] { return useSyncExternalStore(subscribe, () => knownSnapshot, () => knownSnapshot); }
export function getKnownCharacters(): KnownChar[] { return knownSnapshot; }
/** Raw, un-debounced active ids for a connection. Batch diffs read this, never the KnownChar snapshot. */
export function getBoxActiveIds(conn: number): number[] { return (byConn.get(conn)?.active ?? []).map((a) => a.id); }
export function getBoxActiveAt(conn: number): number { return byConn.get(conn)?.activeAt ?? 0; }

// ── persistence ──────────────────────────────────────────────────────────────
export async function appDataPath(rel: string): Promise<string> {
  const base = (await appLocalDataDir()).replace(/[\\/]+$/, '');
  return `${base}/${rel}`;
}
let cacheDirCache: string | null = null;
async function cacheDir(): Promise<string> {
  if (!cacheDirCache) cacheDirCache = await appDataPath('characters');
  return cacheDirCache;
}
const safeName = (n: string) => n.replace(/[^A-Za-z0-9]/g, '_');

const diskTimers = new Map<string, number>();
function schedulePersist(pc: PersistedChar) {
  const prev = persisted.get(pc.name);
  persisted.set(pc.name, prev ? { ...prev, ...pc } : pc);
  if (!inTauri || diskTimers.has(pc.name)) return;
  diskTimers.set(pc.name, window.setTimeout(async () => {
    diskTimers.delete(pc.name);
    const latest = persisted.get(pc.name);
    if (!latest) return;
    try { await invoke('write_text_file', { path: `${await cacheDir()}/${safeName(pc.name)}.json`, contents: JSON.stringify(latest) }); } catch { /* ignore */ }
  }, 3000));
}

async function loadPersisted() {
  if (!inTauri) return;
  try {
    const files = await invoke<string[]>('list_dir', { path: await cacheDir() });
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue;
      try {
        const pc = JSON.parse(await invoke<string>('read_text_file', { path: f })) as PersistedChar;
        if (pc && pc.name) persisted.set(pc.name, pc);
      } catch { /* skip bad file */ }
    }
    rebuild();
  } catch { /* ignore */ }
}

/** Forget an offline character entirely (memory + disk). An online one would just re-register. */
export async function removeChar(name: string): Promise<void> {
  const t = diskTimers.get(name);
  if (t != null) { clearTimeout(t); diskTimers.delete(name); }
  persisted.delete(name);
  if (inTauri) { try { await invoke('delete_file', { path: `${await cacheDir()}/${safeName(name)}.json` }); } catch { /* ignore */ } }
  for (const [conn, b] of byConn) if (b.name === name) byConn.delete(conn);
  rebuild();
}

/** Dev-only: lets the browser mock feed pretend a character was seen before. */
export function seedPersisted(pc: PersistedChar) { persisted.set(pc.name, pc); scheduleRebuild(); }

// ── seq/ack and "next roe frame" waiters ─────────────────────────────────────
let seqCounter = 1;
export function nextSeq(): number { return seqCounter++; }
export type SeqAck = { ok: boolean; reason?: string };
type Waiter = { conn: number; resolve: (a: SeqAck) => void; timer: number };
const seqWaiters = new Map<number, Waiter>();
function resolveSeq(seq: number, a: SeqAck) {
  const w = seqWaiters.get(seq);
  if (!w) return;
  seqWaiters.delete(seq);
  clearTimeout(w.timer);
  w.resolve(a);
}
/** Resolves on the addon's seqack, on timeout ('no response'), or early when the connection drops. */
export function awaitSeqAck(conn: number, seq: number, timeoutMs: number): Promise<SeqAck> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolveSeq(seq, { ok: false, reason: 'no response' }), timeoutMs);
    seqWaiters.set(seq, { conn, resolve, timer });
  });
}

const roeWaiters = new Map<number, Set<() => void>>();
/** Resolves true once this connection has an active list newer than `afterTs`, else false after timeoutMs. */
export function waitForRoeFrame(conn: number, afterTs: number, timeoutMs: number): Promise<boolean> {
  if (getBoxActiveAt(conn) > afterTs) return Promise.resolve(true);
  return new Promise((resolve) => {
    const set = roeWaiters.get(conn) ?? new Set();
    roeWaiters.set(conn, set);
    const done = (ok: boolean) => { set.delete(fn); clearTimeout(timer); resolve(ok); };
    const fn = () => { if (getBoxActiveAt(conn) > afterTs) done(true); };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    set.add(fn);
  });
}

// ── ingest ───────────────────────────────────────────────────────────────────
/** Feed one line from a connection. Used by the Tauri listener and by the dev mock feed. */
export function ingestLine(conn: number, line: string) {
  const f = parseFrame(line);
  if (!f) return;
  if (f.t === 'seqack') { resolveSeq(f.seq, { ok: f.ok, reason: f.ok ? undefined : 'addon error' }); return; }
  const prev = byConn.get(conn);
  const seed = f.t === 'hello' || f.t === 'self' ? persisted.get(f.name) : undefined;
  const r = applyFrame(prev, conn, f, Date.now(), seed);
  if (!r) return;
  byConn.set(conn, r.box);
  if (r.persist) {
    schedulePersist({
      name: r.box.name, id: r.box.id, main: r.box.main, sub: r.box.sub, zoneName: r.box.zoneName,
      active: r.box.active, activeAt: r.box.activeAt, donePages: r.box.donePages, doneAt: r.box.doneAt, savedAt: Date.now(),
    });
  }
  if (f.t === 'roe') roeWaiters.get(conn)?.forEach((fn) => fn());
  const identityChanged = !prev || prev.name !== r.box.name || prev.main !== r.box.main || prev.sub !== r.box.sub || prev.zoneName !== r.box.zoneName;
  if (r.persist || identityChanged) scheduleRebuild();
}

export function dropConn(conn: number) {
  byConn.delete(conn);
  for (const [seq, w] of seqWaiters) if (w.conn === conn) resolveSeq(seq, { ok: false, reason: 'no response' });
  roeWaiters.get(conn)?.forEach((fn) => fn());
  rebuild();
}

// ── commands out ─────────────────────────────────────────────────────────────
type CommandSink = (conn: number, line: string) => void;
let commandSink: CommandSink | null = null;
/** Dev-only: the mock feed registers itself here so commands work without Tauri. */
export function setCommandSink(fn: CommandSink | null) { commandSink = fn; }

export function sendBoxCommand(conn: number, line: string) {
  if (inTauri) void invoke('send_box_command', { conn, line }).catch(() => {});
  else commandSink?.(conn, line);
}
export function broadcastBoxCommand(line: string): Promise<number> {
  if (inTauri) return invoke<number>('broadcast_box_command', { line }).catch(() => 0);
  for (const conn of byConn.keys()) commandSink?.(conn, line);
  return Promise.resolve(byConn.size);
}
export function requestRefresh(conn: number) { sendBoxCommand(conn, JSON.stringify({ cmd: 'roerefresh' })); }
export function requestSync(conn: number) { sendBoxCommand(conn, JSON.stringify({ cmd: 'sync' })); }
export function openExternal(url: string) {
  if (inTauri) void invoke('open_url', { url }).catch(() => {});
  else window.open(url, '_blank');
}

// ── listener health ──────────────────────────────────────────────────────────
/** Polls the Rust side every 3 s; true in the browser so the dev UI never shows a red dot. */
export function useIpcBound(): boolean {
  const [bound, setBound] = useState(true);
  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    const tick = async () => { try { const b = await invoke<boolean>('ipc_bound'); if (alive) setBound(b); } catch { /* ignore */ } };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  return bound;
}

// ── startup ──────────────────────────────────────────────────────────────────
let started = false;
export async function startBridge() {
  if (started || !inTauri) return;
  started = true;
  await listen<{ conn: number; line: string }>('roexi://box-msg', (e) => ingestLine(e.payload.conn, e.payload.line));
  await listen<number>('roexi://box-gone', (e) => dropConn(e.payload));
  // The Rust listener binds before the webview registers these listeners, so an addon that was
  // already running may have sent its hello/roe/roedone burst into the void. Ask every connected
  // addon to resend its snapshot now that we are listening.
  await broadcastBoxCommand(JSON.stringify({ cmd: 'sync' }));
}

if (inTauri) {
  void startBridge();
  void loadPersisted();
}
