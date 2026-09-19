import { describe, it, expect } from 'vitest';
import { resolveScopeNames, toggleScopeName } from '../components/CharScope';
import type { KnownChar } from '../roe/types';

const char = (name: string, over: Partial<KnownChar> = {}): KnownChar => ({
  name, online: true, active: [], doneIds: new Set(), donePagesKnown: new Set(), ...over,
});

const known = [char('Aldric'), char('Brienne'), char('Cedric')];

describe('resolveScopeNames', () => {
  it('resolves null to every known name', () => {
    expect(resolveScopeNames(null, known)).toEqual(['Aldric', 'Brienne', 'Cedric']);
  });

  it('filters a stored array down to names still in known, preserving stored order', () => {
    expect(resolveScopeNames(['Cedric', 'Aldric', 'Ghost'], known)).toEqual(['Cedric', 'Aldric']);
  });

  it('resolves an empty stored array to no names, not the null default', () => {
    expect(resolveScopeNames([], known)).toEqual([]);
  });
});

describe('toggleScopeName', () => {
  it('starting from null, materializes from known and removes the toggled name', () => {
    expect(toggleScopeName(null, known, 'Brienne')).toEqual(['Aldric', 'Cedric']);
  });

  it('starting from null, materializing and toggling a name still keeps everyone else', () => {
    const result = toggleScopeName(null, known, 'Aldric');
    expect(result).toEqual(['Brienne', 'Cedric']);
  });

  it('on a concrete array, adds a name not already present without consulting known', () => {
    expect(toggleScopeName(['Aldric'], known, 'Brienne')).toEqual(['Aldric', 'Brienne']);
  });

  it('on a concrete array, removes a name already present without consulting known', () => {
    expect(toggleScopeName(['Aldric', 'Brienne'], known, 'Aldric')).toEqual(['Brienne']);
  });

  it('adding a name absent from known still appends it (base is the source of truth once concrete)', () => {
    expect(toggleScopeName(['Aldric'], known, 'Ghost')).toEqual(['Aldric', 'Ghost']);
  });
});
