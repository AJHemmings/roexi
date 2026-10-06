// Per-character objective state: the single answer to "can this character still take it?"
// (Remaining filter, Left to do, add plans). Completion counts live in completion.ts.
import type { KnownChar, CatalogEntry } from './types';
import { isAutoId } from './types';
import { doneState } from './bitmap';

export type ObjState = 'auto' | 'active' | 'unlisted' | 'done' | 'locked' | 'unknown' | 'open';

/**
 * Precedence: auto → active → unlisted (the game's menu doesn't list it right now, spec 2026-10-06 §8) →
 * done (one-time only, like buildAddPlan) → locked → unknown → open.
 */
export function objectiveState(c: KnownChar, id: number, byId: Map<number, CatalogEntry>): ObjState {
  if (isAutoId(id)) return 'auto';
  if (c.active.some((a) => a.id === id)) return 'active';
  if (byId.get(id)?.unlisted) return 'unlisted';
  const done = doneState(c, id);
  if (done === 'done' && byId.get(id)?.repeat === false) return 'done';
  if (c.gameLocked?.has(id)) return 'locked';
  if (done === 'unknown') return 'unknown';
  return 'open';
}

/** Could this character still add it? Unknown counts: better to show too much than hide something real. */
export const isRemaining = (s: ObjState): boolean => s === 'open' || s === 'unknown';

/** Works for both scopes: single scope is a one-element array. All scope = "left for anyone". */
export function showInRemaining(scope: KnownChar[], id: number, byId: Map<number, CatalogEntry>): boolean {
  return scope.some((c) => isRemaining(objectiveState(c, id, byId)));
}
