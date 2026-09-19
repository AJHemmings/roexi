// Turns a plan into real addon commands and a result card. Spec §8.6.
import { nextSeq, sendBoxCommand, awaitSeqAck, waitForRoeFrame, getBoxActiveIds, type SeqAck } from '../bridge';
import { buildAddPlan, buildRemovePlan, type AddPlan, type RemovePlan } from './plan';
import { diffAddResult, diffRemoveResult } from './diff';
import { pushAddResult, pushRemoveResult, type AckStatus, type AddCharResult, type RemoveCharResult } from './results';
import type { KnownChar, CatalogEntry } from './types';

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
  const plans = buildAddPlan(targets, ids, byId);
  const chars = await Promise.all(plans.map((plan) => runOneAdd(plan, targets)));
  pushAddResult(chars);
}

async function runOneAdd(plan: AddPlan, targets: KnownChar[]): Promise<AddCharResult> {
  const base = { name: plan.name, skipAuto: plan.skipAuto, skipActive: plan.skipActive, skipDone: plan.skipDone };
  if (plan.status !== 'ok' || plan.send.length === 0) {
    return { ...base, status: plan.status, added: [], notAccepted: [] };
  }
  const conn = targets.find((t) => t.name === plan.name)!.conn!;
  const { status, afterActiveIds } = await sendAndSettle(conn, 'roeadd', plan.send);
  const { landed, notAccepted } = diffAddResult(plan, afterActiveIds);
  return { ...base, status, added: landed, notAccepted };
}

export async function runRemove(targets: KnownChar[], ids: number[]): Promise<void> {
  const plans = buildRemovePlan(targets, ids);
  const chars = await Promise.all(plans.map((plan) => runOneRemove(plan, targets)));
  pushRemoveResult(chars);
}

async function runOneRemove(plan: RemovePlan, targets: KnownChar[]): Promise<RemoveCharResult> {
  const base = { name: plan.name, skipNotActive: plan.skipNotActive };
  if (plan.status !== 'ok' || plan.send.length === 0) {
    return { ...base, status: plan.status, removed: [], notRemoved: [] };
  }
  const conn = targets.find((t) => t.name === plan.name)!.conn!;
  const { status, afterActiveIds } = await sendAndSettle(conn, 'roecancel', plan.send);
  const { removed, notRemoved } = diffRemoveResult(plan, afterActiveIds);
  return { ...base, status, removed, notRemoved };
}
