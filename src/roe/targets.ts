// Pure: which online characters actually have at least one of the given ids active right now —
// used as the default pre-selection for a Remove action (checking live active state, not catalog data).
import type { KnownChar } from './types';

export function computeRemoveDefault(known: KnownChar[], selectedIds: number[]): string[] {
  return known.filter((c) => c.online && selectedIds.some((id) => c.active.some((a) => a.id === id))).map((c) => c.name);
}

// Turns the character *names* a TargetPicker/TargetPickerModal hands back into the KnownChar
// objects runAdd/runRemove need. Filters against `known` (not `names`), so the result is always
// in `known`'s order and silently drops any name no longer present.
export function resolveTargets(known: KnownChar[], names: string[]): KnownChar[] {
  return known.filter((c) => names.includes(c.name));
}
