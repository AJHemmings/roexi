import type { CatalogEntry } from './types';

/** "p/goal" when the objective's goal is known, otherwise just "p". Shared by every UI surface
 * that shows an active objective's progress (CharChips, and the Active/Library tabs' per-character
 * expanded lines) so the three don't quietly drift from each other. */
export function formatProgress(p: number, entry?: CatalogEntry): string {
  return entry?.goal ? `${p}/${entry.goal}` : `${p}`;
}

export type ProgressParts = { value: number; max: number | null; label: string; fraction: number | null };

/** Structured pieces for a progress bar — value/max/fraction plus the same label formatProgress
 * produces, so a bar's text and every other progress display never drift apart. `fraction` is
 * clamped to 1 even though a repeatable objective's raw contribution count isn't guaranteed to
 * stay <= goal, so a bar never overflows its track. */
export function progressParts(p: number, entry?: CatalogEntry): ProgressParts {
  const max = entry?.goal ?? null;
  return { value: p, max, label: formatProgress(p, entry), fraction: max ? Math.min(p / max, 1) : null };
}
