import { describe, it, expect } from 'vitest';
import { removedNoticeText } from '../roe/chatText';

describe('removedNoticeText', () => {
  it('returns null for an empty list', () => {
    expect(removedNoticeText([])).toBeNull();
  });

  it('joins a couple of names', () => {
    expect(removedNoticeText(['Aldric', 'Brienne'])).toBe('removed: Aldric, Brienne');
  });

  it('strips non-ASCII characters from names', () => {
    expect(removedNoticeText(['Café☆', 'Zoë'])).toBe('removed: Caf, Zo');
  });

  it('truncates a long list with a fitting "(+N more)" suffix', () => {
    const names = Array.from({ length: 50 }, (_, i) => `Character${i}`);
    const text = removedNoticeText(names)!;
    expect(text.length).toBeLessThanOrEqual(200);
    const m = text.match(/^removed: (.*) \(\+(\d+) more\)$/);
    expect(m).not.toBeNull();
    const [, joined, moreStr] = m!;
    const included = joined.length === 0 ? [] : joined.split(', ');
    expect(included.length + Number(moreStr)).toBe(names.length);
    // every included name really is one of the sanitized inputs, in order
    expect(names.slice(0, included.length)).toEqual(included);
  });
});
