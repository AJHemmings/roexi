import { describe, it, expect } from 'vitest';
import { resolveScope, SCOPE_KEYS } from '../components/CharScope';
import type { KnownChar } from '../roe/types';

const char = (name: string, over: Partial<KnownChar> = {}): KnownChar => ({
  name, online: true, active: [], doneIds: new Set(), donePagesKnown: new Set(), ...over,
});

const known = [char('Aldric'), char('Brienne'), char('Cedric')];

describe('resolveScope', () => {
  it('resolves null to every known character', () => {
    expect(resolveScope(null, known)).toEqual(known);
  });

  it('resolves a name to just that character', () => {
    expect(resolveScope('Brienne', known)).toEqual([char('Brienne')]);
  });

  it('resolves a name no longer present in known to an empty scope', () => {
    expect(resolveScope('Ghost', known)).toEqual([]);
  });
});

describe('SCOPE_KEYS', () => {
  it('Records and Stats persist their character pick under different keys', () => {
    expect(SCOPE_KEYS.records).toBe('records.scope.v2'); // unchanged, so existing picks survive
    expect(SCOPE_KEYS.stats).not.toBe(SCOPE_KEYS.records);
  });
});
