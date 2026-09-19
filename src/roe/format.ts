import type { CatalogEntry } from './types';

/** "p/goal" when the objective's goal is known, otherwise just "p". Shared by every UI surface
 * that shows an active objective's progress (CharChips, and the Active/Library tabs' per-character
 * expanded lines) so the three don't quietly drift from each other. */
export function formatProgress(p: number, entry?: CatalogEntry): string {
  return entry?.goal ? `${p}/${entry.goal}` : `${p}`;
}
