import { describe, it, expect, beforeEach } from 'vitest';
import { updateNoticeText, sendUpdateNotices, resetUpdateNotices } from '../updateNotice';

beforeEach(() => resetUpdateNotices());

describe('updateNoticeText', () => {
  it('names only what is outdated, in plain ASCII', () => {
    expect(updateNoticeText('0.3.1-beta', null)).toBe('update available - app v0.3.1-beta. Open roexi and click Install.');
    expect(updateNoticeText(null, '0.3.1-beta')).toBe('update available - addon v0.3.1-beta. Open roexi and click Install.');
    expect(updateNoticeText('0.3.1-beta', '0.3.1-beta')).toBe('update available - app v0.3.1-beta, addon v0.3.1-beta. Open roexi and click Update all.');
    expect(updateNoticeText(null, null)).toBeNull();
    expect(/^[\x20-\x7e]*$/.test(updateNoticeText('1', '1')!)).toBe(true);
  });
});

describe('sendUpdateNotices', () => {
  const capture = () => { const sent: [number, string][] = []; return { sent, send: (c: number, l: string) => { sent.push([c, l]); } }; };

  it('sends once per connection, then again only to new connections', () => {
    const { sent, send } = capture();
    sendUpdateNotices([1, 2], 'hi', send);
    sendUpdateNotices([1, 2], 'hi', send);
    sendUpdateNotices([1, 2, 3], 'hi', send);
    expect(sent.map(([c]) => c)).toEqual([1, 2, 3]);
    expect(JSON.parse(sent[0][1])).toEqual({ cmd: 'notice', msg: 'hi' });
  });
  it('resends when the text changes', () => {
    const { sent, send } = capture();
    sendUpdateNotices([1], 'a', send);
    sendUpdateNotices([1], 'b', send);
    expect(sent).toHaveLength(2);
  });
  it('sends nothing without text, and forgets connections that went away', () => {
    const { sent, send } = capture();
    sendUpdateNotices([1], null, send);
    expect(sent).toHaveLength(0);
    sendUpdateNotices([1], 'a', send);
    sendUpdateNotices([], 'a', send);   // conn 1 dropped
    sendUpdateNotices([1], 'a', send);  // same id reconnected → new addon session, tell it again
    expect(sent).toHaveLength(2);
  });
});
