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
export function useCharScope(): { known: KnownChar[]; scope: KnownChar[]; scopeNames: string[]; toggle: (name: string) => void; selectAll: () => void } {
  const known = useKnownCharacters();
  const [names, setNames] = useStickyPersisted<string[] | null>(STICKY_KEY, null);
  const knownNames = new Set(known.map((c) => c.name));
  const scopeNames = names === null ? known.map((c) => c.name) : names.filter((n) => knownNames.has(n));

  const toggle = (name: string) => setNames((prev) => {
    const base = prev === null ? known.map((c) => c.name) : prev;
    return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
  });
  const selectAll = () => setNames(known.map((c) => c.name));

  return { known, scope: known.filter((c) => scopeNames.includes(c.name)), scopeNames, toggle, selectAll };
}

export function CharScopeBar() {
  const { known, scopeNames, toggle, selectAll } = useCharScope();
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
