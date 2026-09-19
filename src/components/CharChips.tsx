import type { KnownChar, CatalogEntry } from '../roe/types';

/** One small pill per scoped character showing this objective's state for them: accent = active
 * (with progress if known), plain = not active, dimmed = the character is offline. */
export function CharChips({ id, scope, entry }: { id: number; scope: KnownChar[]; entry?: CatalogEntry }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scope.map((c) => {
        const active = c.active.find((a) => a.id === id);
        const cls = !c.online ? 'bg-field text-fg-4 opacity-50' : active ? 'bg-accent text-on-accent' : 'bg-field text-fg-4';
        const progress = active ? (entry?.goal ? `${active.p}/${entry.goal}` : `${active.p}`) : null;
        return (
          <span key={c.name} title={c.name} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cls}`}>
            {c.name.slice(0, 3)}{progress ? ` ${progress}` : ''}
          </span>
        );
      })}
    </div>
  );
}
