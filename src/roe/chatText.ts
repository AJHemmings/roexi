// Pure text for the in-game "notice" line the app sends the addon after a Remove. Game chat is
// not UTF-8, so names are sanitized to printable ASCII, and the whole line is capped at 200 chars
// (the addon's own cap — see roexi.lua's notice handler) so a long batch degrades to a count instead
// of getting silently truncated mid-name.
const sanitize = (n: string) => n.replace(/[^\x20-\x7e]/g, '');

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
