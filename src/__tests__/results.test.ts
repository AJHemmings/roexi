import { describe, it, expect, beforeEach } from 'vitest';
import { pushAddResult, pushRemoveResult, dismissResult, getResults, clearResults } from '../roe/results';

beforeEach(() => clearResults());

describe('results store', () => {
  it('pushAddResult adds a card, newest first, with an id and createdAt', () => {
    pushAddResult([{ name: 'Aldric', status: 'ok', skipAuto: [], skipActive: [], skipDone: [], added: [1], notAccepted: [] }]);
    const [card] = getResults();
    expect(card.kind).toBe('add');
    expect(card.id).toBeDefined();
    expect(card.createdAt).toBeGreaterThan(0);
    expect(card.chars[0].name).toBe('Aldric');
  });

  it('pushRemoveResult and pushAddResult both prepend, so the newest push is first', () => {
    pushAddResult([{ name: 'A', status: 'ok', skipAuto: [], skipActive: [], skipDone: [], added: [], notAccepted: [] }]);
    pushRemoveResult([{ name: 'B', status: 'ok', skipNotActive: [], removed: [1], notRemoved: [] }]);
    expect(getResults()[0].kind).toBe('remove');
    expect(getResults()[1].kind).toBe('add');
  });

  it('caps the list at 20, dropping the oldest', () => {
    for (let i = 0; i < 25; i++) {
      pushAddResult([{ name: `C${i}`, status: 'ok', skipAuto: [], skipActive: [], skipDone: [], added: [], notAccepted: [] }]);
    }
    expect(getResults()).toHaveLength(20);
    expect(getResults()[0].chars[0].name).toBe('C24');
  });

  it('dismissResult removes only the matching card', () => {
    pushAddResult([{ name: 'A', status: 'ok', skipAuto: [], skipActive: [], skipDone: [], added: [], notAccepted: [] }]);
    const id = getResults()[0].id;
    dismissResult(id);
    expect(getResults().find((c) => c.id === id)).toBeUndefined();
  });
});
