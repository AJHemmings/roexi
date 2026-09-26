// Turns a plan into real addon commands and a result card. Spec §8.6.
import { nextSeq, sendBoxCommand, awaitSeqAck, waitForRoeFrame, getBoxActiveIds, recordRefusals, type SeqAck } from '../bridge';
import { buildAddPlan, buildRemovePlan, type AddPlan, type RemovePlan } from './plan';
import { diffAddResult, diffRemoveResult } from './diff';
import { pushAddResult, pushRemoveResult, type AckStatus, type AddCharResult, type RemoveCharResult } from './results';
import { removedNoticeText } from './chatText';
import type { KnownChar, CatalogEntry } from './types';
import { beginPending, endPending, getPending, anyBusy } from './pending';

const ACK_TIMEOUT_MS = 15_000;
const SETTLE_TIMEOUT_MS = 1_500;

function ackStatus(ack: SeqAck): AckStatus {
  if (ack.ok) return 'ok';
  return ack.reason === 'no response' ? 'no-response' : 'addon-error';
}

async function sendAndSettle(conn: number, cmd: 'roeadd' | 'roecancel', ids: number[]): Promise<{ status: AckStatus; afterActiveIds: number[] }> {
  const seq = nextSeq();
  const sentAt = Date.now();
  sendBoxCommand(conn, JSON.stringify({ cmd, ids, seq }));
  const ack = await awaitSeqAck(conn, seq, ACK_TIMEOUT_MS);
  await waitForRoeFrame(conn, sentAt, SETTLE_TIMEOUT_MS);
  // A 'no response' or addon-error batch is still diffed: the injections may have happened and
  // only the ack (or its timely arrival) was lost.
  return { status: ackStatus(ack), afterActiveIds: getBoxActiveIds(conn) };
}

export async function runAdd(targets: KnownChar[], ids: number[], byId: Map<number, CatalogEntry>): Promise<void> {
  const names = targets.map((t) => t.name);
  // Backstop: the UI disables buttons for busy characters, so this should be unreachable. If a future
  // caller gets here anyway, refuse the whole batch rather than send an overlapping one. Spec §4.7.
  if (anyBusy(getPending(), names)) { console.warn('runAdd refused: a target already has a batch in flight', names); return; }
  // Marked busy synchronously, before the first await, so a double-click lands on a disabled button.
  // Released in `finally` so success, the no-response timeout, and a throw all unlock.
  const key = beginPending('add', names, ids);
  try {
    const plans = buildAddPlan(targets, ids, byId);
    const chars = await Promise.all(plans.map((plan) => runOneAdd(plan, targets)));
    pushAddResult(chars);
  } finally {
    endPending(key);
  }
}

async function runOneAdd(plan: AddPlan, targets: KnownChar[]): Promise<AddCharResult> {
  const base = { name: plan.name, skipAuto: plan.skipAuto, skipActive: plan.skipActive, skipDone: plan.skipDone };
  if (plan.status !== 'ok' || plan.send.length === 0) {
    return { ...base, status: plan.status, added: [], notAccepted: [] };
  }
  const conn = targets.find((t) => t.name === plan.name)!.conn!;
  const { status, afterActiveIds } = await sendAndSettle(conn, 'roeadd', plan.send);
  const { landed, notAccepted } = diffAddResult(plan, afterActiveIds);
  // Spec §2 rule 1: only an acked batch is trustworthy evidence that the game said no.
  // Note: waitForRoeFrame can resolve on the 0x111 triggered by the *first* injection in a
  // multi-id add, so the last ids may still show as "not accepted" here and get briefly marked
  // locked; the next 0x111 clears them via applyFrame's self-correct (unlock). Don't "fix" this
  // by removing that self-correct - it's what keeps a transient false mark from sticking.
  if (status === 'ok') recordRefusals(conn, plan.name, notAccepted, Date.now());
  return { ...base, status, added: landed, notAccepted };
}

export async function runRemove(targets: KnownChar[], ids: number[], byId: Map<number, CatalogEntry>): Promise<void> {
  const names = targets.map((t) => t.name);
  if (anyBusy(getPending(), names)) { console.warn('runRemove refused: a target already has a batch in flight', names); return; }
  const key = beginPending('remove', names, ids);
  try {
    const plans = buildRemovePlan(targets, ids);
    const chars = await Promise.all(plans.map((plan) => runOneRemove(plan, targets, byId)));
    pushRemoveResult(chars);
  } finally {
    endPending(key);
  }
}

async function runOneRemove(plan: RemovePlan, targets: KnownChar[], byId: Map<number, CatalogEntry>): Promise<RemoveCharResult> {
  const base = { name: plan.name, skipNotActive: plan.skipNotActive };
  if (plan.status !== 'ok' || plan.send.length === 0) {
    return { ...base, status: plan.status, removed: [], notRemoved: [] };
  }
  const conn = targets.find((t) => t.name === plan.name)!.conn!;
  const { status, afterActiveIds } = await sendAndSettle(conn, 'roecancel', plan.send);
  const { removed, notRemoved } = diffRemoveResult(plan, afterActiveIds);
  if (removed.length > 0) {
    const msg = removedNoticeText(removed.map((id) => byId.get(id)?.n ?? `#${id}`));
    if (msg) sendBoxCommand(conn, JSON.stringify({ cmd: 'notice', msg }));
  }
  return { ...base, status, removed, notRemoved };
}
