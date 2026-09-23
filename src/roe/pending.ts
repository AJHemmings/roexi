import { useSyncExternalStore } from 'react';

// In-memory only (never persisted): which characters have an add/remove batch in flight right now.
// Written only by batch.ts (runAdd/runRemove begin an entry up front and end it in a `finally`), read
// by every button that could send to a character. Two overlapping batches to the same character would
// diff against the same live snapshot and misattribute each other's results, so a busy character's
// buttons are disabled until its batch settles. Spec §4.7.
export type PendingKind = 'add' | 'remove';
export type PendingEntry = { key: number; kind: PendingKind; chars: string[]; ids: number[] };

let entries: PendingEntry[] = [];
let nextKey = 1;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

export function beginPending(kind: PendingKind, chars: string[], ids: number[]): number {
  const key = nextKey++;
  entries = [...entries, { key, kind, chars: [...chars], ids: [...ids] }];
  notify();
  return key;
}

export function endPending(key: number): void {
  if (!entries.some((e) => e.key === key)) return;
  entries = entries.filter((e) => e.key !== key);
  notify();
}

export function getPending(): PendingEntry[] { return entries; }

// Module-level so its identity is stable: an inline arrow would make every subscribed row resubscribe on each render.
// Exported so addonReload.ts can wait for the store to go idle without polling.
export const subscribePending = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function usePending(): PendingEntry[] {
  return useSyncExternalStore(subscribePending, () => entries, () => entries);
}

// Pure selectors — take the list explicitly so components pass usePending()'s value and tests pass literals.
export function isCharBusy(list: PendingEntry[], name: string): boolean {
  return list.some((e) => e.chars.includes(name));
}

export function anyBusy(list: PendingEntry[], names: string[]): boolean {
  return names.some((n) => isCharBusy(list, n));
}

/** Which kind of batch (if any) is sending exactly this objective to exactly this character — drives
 * which single button shows the spinner, as opposed to merely being disabled. */
export function pendingFor(list: PendingEntry[], name: string, id: number): PendingKind | null {
  return list.find((e) => e.chars.includes(name) && e.ids.includes(id))?.kind ?? null;
}

export function isIdPending(list: PendingEntry[], id: number): boolean {
  return list.some((e) => e.ids.includes(id));
}
