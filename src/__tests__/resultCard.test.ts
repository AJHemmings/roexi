import { describe, it, expect } from 'vitest';
import { addLine, removeLine } from '../components/ResultCard';
import type { AddCharResult, RemoveCharResult } from '../roe/results';
import type { CatalogEntry } from '../roe/types';

const byId = new Map<number, CatalogEntry>([
  [1, { id: 1, n: 'Sortie A' }],
  [2, { id: 2, n: 'Sortie B' }],
  [3, { id: 3, n: 'Sortie C' }],
]);

const add = (over: Partial<AddCharResult> = {}): AddCharResult => ({
  name: 'Aldric', status: 'ok', skipAuto: [], skipActive: [], skipDone: [], added: [], notAccepted: [], ...over,
});

const remove = (over: Partial<RemoveCharResult> = {}): RemoveCharResult => ({
  name: 'Aldric', status: 'ok', skipNotActive: [], removed: [], notRemoved: [], ...over,
});

describe('addLine', () => {
  it('reports offline status', () => {
    expect(addLine(add({ status: 'offline' }), byId)).toBe('Aldric: offline');
  });

  it('reports full status', () => {
    expect(addLine(add({ status: 'full' }), byId)).toBe('Aldric: full (30 active already)');
  });

  it('reports no-response status', () => {
    expect(addLine(add({ status: 'no-response' }), byId)).toBe('Aldric: no response from the addon (state may still have changed)');
  });

  it('reports addon-error status', () => {
    expect(addLine(add({ status: 'addon-error' }), byId)).toBe('Aldric: addon error');
  });

  it('joins multiple non-empty fields with middot separators, using catalog names', () => {
    const line = addLine(add({ added: [1], notAccepted: [2], skipActive: [3] }), byId);
    expect(line).toBe('Aldric: added Sortie A · not accepted: Sortie B · already active: Sortie C');
  });

  it('falls back to "nothing to do" when every list is empty', () => {
    expect(addLine(add(), byId)).toBe('Aldric: nothing to do');
  });
});

describe('removeLine', () => {
  it('reports offline status', () => {
    expect(removeLine(remove({ status: 'offline' }), byId)).toBe('Aldric: offline');
  });

  it('reports no-response status', () => {
    expect(removeLine(remove({ status: 'no-response' }), byId)).toBe('Aldric: no response from the addon (state may still have changed)');
  });

  it('reports addon-error status', () => {
    expect(removeLine(remove({ status: 'addon-error' }), byId)).toBe('Aldric: addon error');
  });

  it('joins multiple non-empty fields with middot separators, using catalog names', () => {
    const line = removeLine(remove({ removed: [1], notRemoved: [2], skipNotActive: [3] }), byId);
    expect(line).toBe('Aldric: removed Sortie A · not removed: Sortie B · wasn\'t active: Sortie C');
  });

  it('falls back to "nothing to do" when every list is empty', () => {
    expect(removeLine(remove(), byId)).toBe('Aldric: nothing to do');
  });
});
