import { useStickyPersisted } from '../sticky';
import { useKnownCharacters } from '../bridge';
import { Select } from '../ui';
import type { KnownChar } from '../roe/types';

const STICKY_KEY = 'records.scope.v2';

/** Sentinel Select value for "All" — Select's value type is a plain string, so null (the real
 * "All" sentinel used everywhere else in this hook) can't be handed to it directly. No real
 * character name is ever empty, so this can't collide. */
const ALL = '';

/**
 * Resolves the persisted selection to the actual scope: null ("All") -> every known character;
 * a name -> just that character, or [] if they've since been forgotten (e.g. removed while
 * offline). Exactly one option is ever selected — no arbitrary multi-character subsets.
 */
export function resolveScope(selected: string | null, known: KnownChar[]): KnownChar[] {
  if (selected === null) return known;
  return known.filter((c) => c.name === selected);
}

/**
 * `selected` persists as null ("All") or a character name. null is a real sentinel, not an absent
 * value — a character connecting later must still be included in "All" — so it is never eagerly
 * resolved into a snapshot at mount.
 */
export function useCharScope(): { known: KnownChar[]; scope: KnownChar[]; charSelected: string | null; setCharSelected: (v: string | null) => void } {
  const known = useKnownCharacters();
  const [charSelected, setCharSelected] = useStickyPersisted<string | null>(STICKY_KEY, null);
  return { known, scope: resolveScope(charSelected, known), charSelected, setCharSelected };
}

/**
 * Takes its data as props rather than calling useCharScope() itself, for the same reason the old
 * CharScopeBar did: useStickyPersisted's state is per-hook-instance local React state, not a
 * shared external store, so a second independent call here would desync from whatever called
 * useCharScope() to get `scope` for the tabs below. There must be exactly one useCharScope() call
 * per screen.
 */
export function CharScopeSelect({ known, charSelected, setCharSelected }: { known: KnownChar[]; charSelected: string | null; setCharSelected: (v: string | null) => void }) {
  if (known.length === 0) return null;
  const onlineByName = new Map(known.map((c) => [c.name, c.online]));
  return (
    <Select
      full
      value={charSelected ?? ALL}
      onChange={(v) => setCharSelected(v === ALL ? null : v)}
      options={[ALL, ...known.map((c) => c.name)]}
      renderOption={(v) => v === ALL ? (
        <span className="font-semibold">All</span>
      ) : (
        <span className="flex items-center gap-1.5 truncate">
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${onlineByName.get(v) ? 'bg-emerald-400' : 'bg-fg-4'}`} />
          <span className="truncate">{v}</span>
        </span>
      )}
    />
  );
}
