// In-game `//roexi [all] set|unset <name>` (spec 2026-10-13). The addon only forwards what was
// typed; everything else happens here, through the same batch runners as the Sets page.
import type { CmdFrame } from '../bridge/frames';
import type { KnownChar, RoeSet } from './types';
import { isCharBusy, type PendingEntry } from './pending';
import { busyText } from './chatText';

/** Set names match case-insensitively, ignoring outer spaces and runs of spaces. */
export const normalizeSetName = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export type ResolvedCommand = { ok: true; set: RoeSet; targets: KnownChar[] } | { ok: false; reply: string };

export function resolveGameCommand(input: {
  frame: CmdFrame;
  conn: number;
  known: KnownChar[];
  sets: RoeSet[];
  setsLoaded: boolean;
  pending: PendingEntry[];
}): ResolvedCommand {
  const { frame, conn, known, sets, setsLoaded, pending } = input;
  if (!setsLoaded) return { ok: false, reply: 'sets are still loading, try again in a moment' };
  const self = known.find((c) => c.online && c.conn === conn);
  if (!self) return { ok: false, reply: "roexi doesn't know this character yet, try again in a moment" };
  const want = normalizeSetName(frame.name);
  const set = sets.find((s) => normalizeSetName(s.name) === want);
  if (!set) return { ok: false, reply: `no set called "${frame.name}"` };
  // `all` means connected right now; remembered-but-offline characters are left out entirely.
  const targets = frame.all ? known.filter((c) => c.online) : [self];
  const busy = targets.find((t) => isCharBusy(pending, t.name));
  if (busy) return { ok: false, reply: busyText(busy.name) };
  return { ok: true, set, targets };
}
