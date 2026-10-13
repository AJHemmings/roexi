// Pure text for the in-game "notice" lines the app sends the addon (after a Remove, and the replies
// to in-game set commands). Game chat is
// not UTF-8, so names are sanitized to printable ASCII, and the whole line is capped at 200 chars
// (the addon's own cap — see roexi.lua's notice handler) so a long batch degrades to a count instead
// of getting silently truncated mid-name.
import type { AddCharResult, RemoveCharResult } from './results';

const sanitize =(n: string) => n.replace(/[^\x20-\x7e]/g, '');

const MAX_LEN = 200;
const PREFIX = 'removed: ';

export function removedNoticeText(names: string[]): string | null {
  if (names.length === 0) return null;
  const clean = names.map(sanitize);
  let count = 0;
  while (count < clean.length && (PREFIX + clean.slice(0, count + 1).join(', ')).length <= MAX_LEN) count++;
  if (count === clean.length) return PREFIX + clean.join(', ');
  for (let n = count; n >= 0; n--) {
    const remaining = clean.length - n;
    const text = PREFIX + clean.slice(0, n).join(', ') + ` (+${remaining} more)`;
    if (text.length <= MAX_LEN) return text;
  }
  return null; // unreachable: n=0 always fits unless MAX_LEN is absurdly small
}

// ── in-game set commands (spec 2026-10-13 §8) ───────────────────────────────
// Every line goes only to the typing character's window. Counts, not objective names, so a line
// always fits; the names are on the app's result card.

/** Any text the app sends to game chat: printable ASCII, at most 200 characters. */
export function chatLine(text: string): string {
  return sanitize(text).slice(0, MAX_LEN);
}

export function workingText(verb: 'set' | 'unset', setName: string, targetNames: string[]): string {
  const who = targetNames.length === 1 ? targetNames[0] : `${targetNames.length} characters`;
  return chatLine(`${verb} ${setName}: working on ${who}...`);
}

export function busyText(name: string): string {
  return chatLine(`busy: ${name} is still changing objectives, try again in a moment`);
}

function failedLine(name: string, status: string): string | null {
  if (status === 'offline') return `${name}: offline`;
  if (status === 'no-response') return `${name}: no response from the addon (may still have changed)`;
  if (status === 'addon-error') return `${name}: addon error`;
  return null;
}

const withLead = (name: string, lead: string[], rest: string[]) =>
  chatLine(`${name}: ${[...(lead.length ? lead : ['nothing to do']), ...rest].join(', ')}`);

export function setResultText(c: AddCharResult): string {
  if (c.status === 'noroom') {
    const n = c.needed ?? 0;
    return chatLine(`${c.name}: not enough room (needs ${n} slot${n === 1 ? '' : 's'}, can free ${c.freeable ?? 0})`);
  }
  if (c.status === 'full') return chatLine(`${c.name}: full (30 active already)`);
  const failed = failedLine(c.name, c.status);
  if (failed) return chatLine(failed);
  if (c.notCancelled?.length) {
    const total = (c.cancelled?.length ?? 0) + c.notCancelled.length;
    return chatLine(`${c.name}: couldn't cancel ${c.notCancelled.length} of ${total}, nothing added`);
  }
  const lead: string[] = [];
  if (c.added.length) lead.push(`+${c.added.length}`);
  if (c.cancelled?.length) lead.push(`cancelled ${c.cancelled.length} (no progress)`);
  if (c.notAccepted.length) lead.push(`${c.notAccepted.length} not accepted`);
  const skips: string[] = [];
  if (c.skipActive.length) skips.push(`${c.skipActive.length} already active`);
  if (c.skipDone.length) skips.push(`${c.skipDone.length} already completed`);
  if (c.skipUnlisted.length) skips.push(`${c.skipUnlisted.length} not in the menu right now`);
  if (c.skipAuto.length) skips.push(`${c.skipAuto.length} daily`);
  return withLead(c.name, lead, skips);
}

export function unsetResultText(c: RemoveCharResult): string {
  const failed = failedLine(c.name, c.status);
  if (failed) return chatLine(failed);
  const lead: string[] = [];
  if (c.removed.length) lead.push(`removed ${c.removed.length}`);
  if (c.notRemoved.length) lead.push(`${c.notRemoved.length} not removed`);
  const n = c.skipNotActive.length;
  return withLead(c.name, lead, n ? [`${n} ${n === 1 ? "wasn't" : "weren't"} active`] : []);
}
