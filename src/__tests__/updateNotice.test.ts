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
  const t = (conn: number, text: string | null) => ({ conn, text });

  it('sends once per connection, then again only to new connections', () => {
    const { sent, send } = capture();
    sendUpdateNotices([t(1, 'hi'), t(2, 'hi')], send);
    sendUpdateNotices([t(1, 'hi'), t(2, 'hi')], send);
    sendUpdateNotices([t(1, 'hi'), t(2, 'hi'), t(3, 'hi')], send);
    expect(sent.map(([c]) => c)).toEqual([1, 2, 3]);
    expect(JSON.parse(sent[0][1])).toEqual({ cmd: 'notice', msg: 'hi' });
  });
  it('resends when the text changes', () => {
    const { sent, send } = capture();
    sendUpdateNotices([t(1, 'a')], send);
    sendUpdateNotices([t(1, 'b')], send);
    expect(sent).toHaveLength(2);
  });
  it('sends nothing without text, and forgets connections that went away', () => {
    const { sent, send } = capture();
    sendUpdateNotices([t(1, null)], send);
    expect(sent).toHaveLength(0);
    sendUpdateNotices([t(1, 'a')], send);
    sendUpdateNotices([], send);   // conn 1 dropped
    sendUpdateNotices([t(1, 'a')], send);  // same id reconnected → new addon session, tell it again
    expect(sent).toHaveLength(2);
  });
  it('sends per-target text independently, and a null text sends nothing but keeps the conn live', () => {
    const { sent, send } = capture();
    sendUpdateNotices([t(1, 'a'), t(2, null)], send);
    expect(sent).toEqual([[1, JSON.stringify({ cmd: 'notice', msg: 'a' })]]);
    // conn 2 stayed live (not pruned) even though it got no text; a later text for it still sends.
    sendUpdateNotices([t(1, 'a'), t(2, 'b')], send);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual([2, JSON.stringify({ cmd: 'notice', msg: 'b' })]);
  });
});
