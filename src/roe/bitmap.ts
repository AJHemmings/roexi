// Completion state is paged: each 0x112 packet covers 1024 ids. A page the addon never
// forwarded tells us nothing, so lookups distinguish 'unknown' from 'not-done'.

export type DoneView = { doneIds: Set<number>; donePagesKnown: Set<number> };
export type DoneState = 'done' | 'not-done' | 'unknown';

export const PAGE_SIZE = 1024;
export const pageOf = (id: number): number => Math.floor(id / PAGE_SIZE);

export function doneFromPages(pages: Record<number, number[]> | undefined): DoneView {
  const doneIds = new Set<number>();
  const donePagesKnown = new Set<number>();
  for (const [k, ids] of Object.entries(pages ?? {})) {
    donePagesKnown.add(Number(k));
    for (const id of ids) doneIds.add(id);
  }
  return { doneIds, donePagesKnown };
}

/** Every consumer of completion state goes through this; nothing reads doneIds directly. */
export function doneState(c: DoneView, id: number): DoneState {
  if (!c.donePagesKnown.has(pageOf(id))) return 'unknown';
  return c.doneIds.has(id) ? 'done' : 'not-done';
}
