// Dismissible, capped (20) feed of batch-action outcomes. Same useSyncExternalStore shape as
// bridge/index.ts, including a non-hook getResults() so batch.ts and tests don't need React.
import { useSyncExternalStore } from 'react';

export type AckStatus = 'ok' | 'no-response' | 'addon-error';

export type AddCharResult = {
  name: string;
  status: 'full' | 'offline' | 'noroom' | AckStatus;
  skipAuto: number[];
  skipUnlisted: number[];
  skipActive: number[];
  skipDone: number[];
  added: number[];
  notAccepted: number[];
  /** In-game `set` only (spec 2026-10-13 §7): cancelled to make room, and cancels that didn't land. */
  cancelled?: number[];
  notCancelled?: number[];
  /** 'noroom' only: slots short, and how many could have been freed. */
  needed?: number;
  freeable?: number;
};
export type RemoveCharResult = {
  name: string;
  status: 'offline' | AckStatus;
  skipNotActive: number[];
  removed: number[];
  notRemoved: number[];
};
export type ResultCard =
  | { id: number; kind: 'add'; createdAt: number; chars: AddCharResult[]; label?: string }
  | { id: number; kind: 'remove'; createdAt: number; chars: RemoveCharResult[]; label?: string };

const CAP = 20;
let cards: ResultCard[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// `label` replaces the card's plain "Add result"/"Remove result" title, e.g. "set Ambuscade (in game)".
export function pushAddResult(chars: AddCharResult[], label?: string): void {
  const card: ResultCard = { id: nextId++, kind: 'add', createdAt: Date.now(), chars, ...(label ? { label } : {}) };
  cards = [card, ...cards].slice(0, CAP);
  notify();
}
export function pushRemoveResult(chars: RemoveCharResult[], label?: string): void {
  const card: ResultCard = { id: nextId++, kind: 'remove', createdAt: Date.now(), chars, ...(label ? { label } : {}) };
  cards = [card, ...cards].slice(0, CAP);
  notify();
}
export function dismissResult(id: number): void {
  cards = cards.filter((c) => c.id !== id);
  notify();
}
/** Test-only: reset between specs so each test's assertions don't depend on prior pushes. */
export function clearResults(): void { cards = []; notify(); }

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export function getResults(): ResultCard[] { return cards; }
export function useResults(): ResultCard[] { return useSyncExternalStore(subscribe, () => cards, () => cards); }
