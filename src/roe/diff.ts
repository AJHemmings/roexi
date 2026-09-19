// Pure result diffing (spec §8.5). Callers pass the plan's `send` list and the real post-batch
// active ids (read from the Box store, not the debounced KnownChar snapshot — see batch.ts).
export type AddDiff = { landed: number[]; notAccepted: number[] };
export function diffAddResult(plan: { send: number[] }, afterActiveIds: number[]): AddDiff {
  const after = new Set(afterActiveIds);
  return { landed: plan.send.filter((id) => after.has(id)), notAccepted: plan.send.filter((id) => !after.has(id)) };
}

export type RemoveDiff = { removed: number[]; notRemoved: number[] };
export function diffRemoveResult(plan: { send: number[] }, afterActiveIds: number[]): RemoveDiff {
  const after = new Set(afterActiveIds);
  return { removed: plan.send.filter((id) => !after.has(id)), notRemoved: plan.send.filter((id) => after.has(id)) };
}
