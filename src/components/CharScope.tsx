import { useStickyPersisted } from '../sticky';
import { useKnownCharacters } from '../bridge';
import { Chip } from '../ui';
import type { KnownChar } from '../roe/types';

const STICKY_KEY = 'records.scope';

/**
 * null means "not customized yet" -> defaults to every known character. A concrete array is
 * always used once the player touches a chip. null (not an eagerly-computed default array) is
 * required because characters connect asynchronously after app start; a default captured once
 * at mount would go stale for anyone who hadn't loaded yet.
 */
export function resolveScopeNames(names: string[] | null, known: KnownChar[]): string[] {
  if (names === null) return known.map((c) => c.name);
  const knownNames = new Set(known.map((c) => c.name));
  return names.filter((n) => knownNames.has(n));
}

/** Toggles `name` in/out of scope, materializing from `known` first if scope is still the null sentinel. */
export function toggleScopeName(names: string[] | null, known: KnownChar[], name: string): string[] {
  const base = names === null ? known.map((c) => c.name) : names;
  return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
}

/**
 * `selectAll` restores the null sentinel rather than freezing today's roster into an array -
 * that keeps "All" meaning "everyone, including characters that connect later," consistent with
 * what null means everywhere else in this hook.
 */
export function useCharScope(): { known: KnownChar[]; scope: KnownChar[]; scopeNames: string[]; toggle: (name: string) => void; selectAll: () => void } {
  const known = useKnownCharacters();
  const [names, setNames] = useStickyPersisted<string[] | null>(STICKY_KEY, null);
  const scopeNames = resolveScopeNames(names, known);

  const toggle = (name: string) => setNames((prev) => toggleScopeName(prev, known, name));
  const selectAll = () => setNames(null);

  return { known, scope: known.filter((c) => scopeNames.includes(c.name)), scopeNames, toggle, selectAll };
}

/**
 * Takes its data as props rather than calling useCharScope() itself: useStickyPersisted's state
 * is per-hook-instance local React state, not a shared external store, so a second independent
 * call here would desync from whatever called useCharScope() to get `scope` for the tabs below —
 * toggling a chip would re-render this component but leave the other instance (and therefore the
 * rows it drives) stale. There must be exactly one useCharScope() call per screen.
 */
export function CharScopeBar({ known, scopeNames, toggle, selectAll }: { known: KnownChar[]; scopeNames: string[]; toggle: (name: string) => void; selectAll: () => void }) {
  if (known.length === 0) return null;
  const allSelected = scopeNames.length === known.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip on={allSelected} onChange={selectAll}>All</Chip>
      {known.map((c) => (
        <Chip key={c.name} on={scopeNames.includes(c.name)} onChange={() => toggle(c.name)}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${c.online ? 'bg-emerald-400' : 'bg-fg-4'}`} />
          {c.name}
        </Chip>
      ))}
    </div>
  );
}
