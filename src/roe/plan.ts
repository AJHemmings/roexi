// Pure per-character add/remove planning. Spec §8.5 — nothing here talks to the bridge or the network;
// batch.ts is the only caller that turns a plan into real commands.
import type { KnownChar, CatalogEntry } from './types';
import { isAutoId, MAX_ACTIVE } from './types';
import { doneState } from './bitmap';

export type PlanStatus = 'ok' | 'full' | 'offline';

type AddSkips = {
  skipAuto: number[];
  /** Not in the game's RoE menu right now (an event objective outside its event). Spec 2026-10-06 §8. */
  skipUnlisted: number[];
  skipActive: number[];
  skipDone: number[];
};

export type AddPlan = AddSkips & {
  name: string;
  status: PlanStatus;
  send: number[];
  free: number;
};

// The skip rules Apply and the in-game `set` share, so the two can never disagree about what to send.
function sortAdd(t: KnownChar, ids: number[], byId: Map<number, CatalogEntry>): AddSkips & { candidate: number[] } {
  const activeSet = new Set(t.active.map((a) => a.id));
  const skipAuto = ids.filter(isAutoId);
  const skipActive = ids.filter((id) => !isAutoId(id) && activeSet.has(id));
  const unlisted = (id: number) => !isAutoId(id) && !activeSet.has(id) && byId.get(id)?.unlisted === true;
  const skipUnlisted = ids.filter(unlisted);
  // 'unknown' (page never received) never skips — only a confirmed-done non-repeatable does.
  const skipDone = ids.filter(
    (id) => !isAutoId(id) && !activeSet.has(id) && !unlisted(id) && byId.get(id)?.repeat === false && doneState(t, id) === 'done',
  );
  const skip = new Set([...skipAuto, ...skipUnlisted, ...skipActive, ...skipDone]);
  return { skipAuto, skipUnlisted, skipActive, skipDone, candidate: ids.filter((id) => !skip.has(id)) };
}

export function buildAddPlan(targets: KnownChar[], ids: number[], byId: Map<number, CatalogEntry>): AddPlan[] {
  return targets.map((t) => {
    const { candidate, ...skips } = sortAdd(t, ids, byId);
    const free = MAX_ACTIVE - t.active.length;
    if (!t.online) return { name: t.name, status: 'offline' as const, send: [], ...skips, free };
    if (candidate.length > free) return { name: t.name, status: 'full' as const, send: [], ...skips, free };
    return { name: t.name, status: 'ok' as const, send: candidate, ...skips, free };
  });
}

export type SetPlan = AddSkips & {
  name: string;
  status: 'ok' | 'noroom' | 'offline';
  send: number[];
  /** Cancelled first, to make room. */
  cancel: number[];
  /** Slots short before cancelling anything (0 when the set fits). */
  needed: number;
  /** How many active objectives could be cancelled. */
  freeable: number;
};

// The in-game `set` (spec 2026-10-13 §6): like roe, make room by cancelling objectives with no
// progress, but never a set member, a daily, or an unlisted one (an event objective outside its
// event can't be taken back). All or nothing: if there still isn't room, nothing is planned.
export function buildSetPlan(t: KnownChar, ids: number[], byId: Map<number, CatalogEntry>): SetPlan {
  const { candidate, ...skips } = sortAdd(t, ids, byId);
  const inSet = new Set(ids);
  const cancellable = t.active
    .filter((a) => a.p === 0 && !inSet.has(a.id) && !isAutoId(a.id) && byId.get(a.id)?.unlisted !== true)
    .map((a) => a.id);
  const needed = Math.max(0, candidate.length - (MAX_ACTIVE - t.active.length));
  const base = { name: t.name, ...skips, needed, freeable: cancellable.length };
  if (!t.online) return { ...base, status: 'offline', send: [], cancel: [] };
  if (needed > cancellable.length) return { ...base, status: 'noroom', send: [], cancel: [] };
  return { ...base, status: 'ok', send: candidate, cancel: cancellable.slice(0, needed) };
}

export type RemovePlan = { name: string; status: 'ok' | 'offline'; send: number[]; skipNotActive: number[] };

export function buildRemovePlan(targets: KnownChar[], ids: number[]): RemovePlan[] {
  return targets.map((t) => {
    if (!t.online) return { name: t.name, status: 'offline' as const, send: [], skipNotActive: ids };
    const activeSet = new Set(t.active.map((a) => a.id));
    return {
      name: t.name,
      status: 'ok' as const,
      send: ids.filter((id) => activeSet.has(id)),
      skipNotActive: ids.filter((id) => !activeSet.has(id)),
    };
  });
}
