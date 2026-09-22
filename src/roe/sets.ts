import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { appDataPath, inTauri } from '../bridge';
import type { RoeSet } from './types';

// Pure — exported for direct unit testing and for the Create/Edit modals' live inline validation.
export function validateSetName(sets: RoeSet[], name: string, excludeId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  const clash = sets.some((s) => s.id !== excludeId && s.name.toLowerCase() === trimmed.toLowerCase());
  return clash ? 'A set with this name already exists' : null;
}

// Pure — union + dedupe, used by "save to existing set".
export function mergeIds(existing: number[], added: number[]): number[] {
  return [...new Set([...existing, ...added])];
}

// Pure — guards load() against a malformed sets.json entry (partial write, hand-edit) crashing
// downstream code that assumes a RoeSet's shape (s.ids.length, s.name.toLowerCase(), etc).
// lastAppliedAt is intentionally not checked: it's optional, so its absence is valid.
export function isValidSet(x: unknown): x is RoeSet {
  const s = x as Partial<RoeSet> | null;
  return !!s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.ids)
    && typeof s.createdAt === 'number' && typeof s.updatedAt === 'number';
}

let sets: RoeSet[] = [];
let started = false;
// Mirrors settings.ts: guards the async disk read in load() from clobbering a change made before
// it resolves.
let touched = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

async function load() {
  if (started) return;
  started = true;
  if (!inTauri) return;
  try {
    const raw: unknown = JSON.parse(await invoke<string>('read_text_file', { path: await appDataPath('sets.json') }));
    if (!touched && Array.isArray(raw)) sets = raw.filter(isValidSet);
  } catch { /* none saved */ }
  if (!touched) notify();
}
void load();

// Serializes writes so overlapping commit() calls resolve on disk in call order, not resolution
// order — an ordering fix (not a throttle), unlike bridge/index.ts's schedulePersist debounce.
let writeQueue: Promise<void> = Promise.resolve();
async function save() {
  if (!inTauri) return;
  writeQueue = writeQueue.then(async () => {
    try { await invoke('write_text_file', { path: await appDataPath('sets.json'), contents: JSON.stringify(sets) }); } catch { /* ignore */ }
  });
  await writeQueue;
}

function commit(next: RoeSet[]) { touched = true; sets = next; notify(); void save(); }

export function useSets(): RoeSet[] {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sets, () => sets);
}

// Callers must validate with validateSetName() first — this trusts the name is already valid,
// matching how the rest of this codebase keeps validation at the UI boundary rather than
// re-checking internally.
export function createSet(name: string, ids: number[]): RoeSet {
  const now = Date.now();
  const next: RoeSet = { id: crypto.randomUUID(), name: name.trim(), ids: [...ids], createdAt: now, updatedAt: now };
  commit([...sets, next]);
  return next;
}

export function updateSet(id: string, patch: { name?: string; ids?: number[] }): void {
  commit(sets.map((s) => (s.id === id
    ? { ...s, name: patch.name !== undefined ? patch.name.trim() : s.name, ids: patch.ids !== undefined ? [...patch.ids] : s.ids, updatedAt: Date.now() }
    : s)));
}

export function deleteSet(id: string): void {
  commit(sets.filter((s) => s.id !== id));
}

export function markApplied(id: string): void {
  commit(sets.map((s) => (s.id === id ? { ...s, lastAppliedAt: Date.now() } : s)));
}
