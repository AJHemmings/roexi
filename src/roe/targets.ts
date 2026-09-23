// Pure: which online characters actually have at least one of the given ids active right now —
// used as the default pre-selection for a Remove action (checking live active state, not catalog data).
import type { KnownChar, CatalogEntry } from './types';
import { buildAddPlan } from './plan';

export function computeRemoveDefault(known: KnownChar[], selectedIds: number[]): string[] {
  return known.filter((c) => c.online && selectedIds.some((id) => c.active.some((a) => a.id === id))).map((c) => c.name);
}

// Turns the character *names* a TargetPicker/TargetPickerModal hands back into the KnownChar
// objects runAdd/runRemove need. Filters against `known` (not `names`), so the result is always
// in `known`'s order and silently drops any name no longer present.
export function resolveTargets(known: KnownChar[], names: string[]): KnownChar[] {
  return known.filter((c) => names.includes(c.name));
}

export type AddBlockReason = 'auto' | 'active' | 'completed' | 'offline' | 'full';

// Pure: why `char` can't take `id` right now, or null if an add would actually be sent. Derived from
// buildAddPlan (the same rules runAdd uses) so a disabled button can never disagree with the batch
// runner. Permanent reasons win over temporary ones: an offline character who already completed a
// one-time objective reports 'completed', because logging them in won't help. Spec §4.1.
export function addBlockReason(char: KnownChar, id: number, byId: Map<number, CatalogEntry>): AddBlockReason | null {
  const [plan] = buildAddPlan([char], [id], byId);
  if (plan.skipAuto.includes(id)) return 'auto';
  if (plan.skipActive.includes(id)) return 'active';
  if (plan.skipDone.includes(id)) return 'completed';
  if (plan.status === 'offline') return 'offline';
  if (plan.status === 'full') return 'full';
  return null;
}

// Pure: mirrors computeRemoveDefault — the characters an Add picker should pre-tick.
export function computeAddDefault(known: KnownChar[], ids: number[], byId: Map<number, CatalogEntry>): string[] {
  return known.filter((c) => ids.some((id) => addBlockReason(c, id, byId) === null)).map((c) => c.name);
}
