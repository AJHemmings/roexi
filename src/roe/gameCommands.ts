// In-game `//roexi [all] set|unset <name>` (spec 2026-10-13). The addon only forwards what was
// typed; everything else happens here, through the same batch runners as the Sets page.
import { getKnownCharacters, sendBoxCommand, setGameCommandHandler } from '../bridge';
import type { CmdFrame } from '../bridge/frames';
import type { CatalogEntry, KnownChar, RoeSet } from './types';
import { getPending, isCharBusy, type PendingEntry } from './pending';
import { busyText, chatLine, setResultText, unsetResultText, workingText } from './chatText';
import { getSets, getSetsLoaded, markApplied } from './sets';
import { loadCatalog } from './catalog';
import { runRemove, runSetCommand } from './batch';

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

const loadById = async (): Promise<Map<number, CatalogEntry>> => (await loadCatalog()).byId;

/** `loadCatalogById` is only swapped out by tests (there is no catalog file under vitest). */
export async function handleGameCommand(conn: number, frame: CmdFrame, loadCatalogById = loadById): Promise<void> {
  const say = (text: string) => sendBoxCommand(conn, JSON.stringify({ cmd: 'notice', msg: chatLine(text) }));
  const r = resolveGameCommand({ frame, conn, known: getKnownCharacters(), sets: getSets(), setsLoaded: getSetsLoaded(), pending: getPending() });
  if (!r.ok) { say(r.reply); return; }
  const { set, targets } = r;
  let byId: Map<number, CatalogEntry>;
  try {
    byId = await loadCatalogById();
  } catch (e) {
    console.warn('[roexi] game command: catalog failed to load', e);
    say("couldn't load the objective list, try again in a moment");
    return;
  }
  say(workingText(frame.verb, set.name, targets.map((t) => t.name)));
  const label = `${frame.verb} ${set.name} (in game)`;
  // Something can start in the app while the catalog loads; the runners then refuse and return null.
  const busyName = () => targets.find((t) => isCharBusy(getPending(), t.name))?.name ?? targets[0].name;
  if (frame.verb === 'set') {
    const results = await runSetCommand(targets, set.ids, byId, label);
    if (!results) { say(busyText(busyName())); return; }
    markApplied(set.id);
    for (const c of results) say(setResultText(c));
  } else {
    const results = await runRemove(targets, set.ids, byId, { notice: false, label });
    if (!results) { say(busyText(busyName())); return; }
    for (const c of results) say(unsetResultText(c));
  }
}

/** Called once from main.tsx. */
export function startGameCommands(): void {
  setGameCommandHandler((conn, frame) => {
    void handleGameCommand(conn, frame).catch((e: unknown) => console.warn('[roexi] game command failed', e));
  });
}
