// Pure per-character add/remove planning. Spec §8.5 — nothing here talks to the bridge or the network;
// batch.ts is the only caller that turns a plan into real commands.
import type { KnownChar, CatalogEntry } from './types';
import { isAutoId, MAX_ACTIVE } from './types';
import { doneState } from './bitmap';

export type PlanStatus = 'ok' | 'full' | 'offline';

export type AddPlan = {
  name: string;
  status: PlanStatus;
  send: number[];
  skipAuto: number[];
  skipActive: number[];
  skipDone: number[];
  free: number;
};

export function buildAddPlan(targets: KnownChar[], ids: number[], byId: Map<number, CatalogEntry>): AddPlan[] {
  return targets.map((t) => {
    const activeSet = new Set(t.active.map((a) => a.id));
    const skipAuto = ids.filter(isAutoId);
    const skipActive = ids.filter((id) => !isAutoId(id) && activeSet.has(id));
    // 'unknown' (page never received) never skips — only a confirmed-done non-repeatable does.
    const skipDone = ids.filter(
      (id) => !isAutoId(id) && !activeSet.has(id) && byId.get(id)?.repeat === false && doneState(t, id) === 'done',
    );
    const skip = new Set([...skipAuto, ...skipActive, ...skipDone]);
    const candidate = ids.filter((id) => !skip.has(id));
    const free = MAX_ACTIVE - t.active.length;
    if (!t.online) return { name: t.name, status: 'offline' as const, send: [], skipAuto, skipActive, skipDone, free };
    if (candidate.length > free) return { name: t.name, status: 'full' as const, send: [], skipAuto, skipActive, skipDone, free };
    return { name: t.name, status: 'ok' as const, send: candidate, skipAuto, skipActive, skipDone, free };
  });
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
