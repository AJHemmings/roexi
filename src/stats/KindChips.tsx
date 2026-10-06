// Stats kind chips: All plus one chip per kind (spec 2026-10-06 §3.1). The rules live in toggleKind.
import { Chip } from '../ui';
import { toggleKind, type CompletionKind } from './prefs';
import type { Kind } from '../roe/completion';

export type KindOption<K extends Kind> = { v: K; label: string };
export const COMPLETION_KIND_OPTIONS: readonly KindOption<CompletionKind>[] = [
  { v: 'one-time', label: 'One-time' },
  { v: 'repeatable', label: 'Repeatables' },
  { v: 'event', label: 'Events' },
];

export function KindChips<K extends Kind>({ value, onChange, options }: {
  value: readonly K[];
  onChange: (v: K[]) => void;
  options: readonly KindOption<K>[];
}) {
  const all = options.map((o) => o.v);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip on={all.every((k) => value.includes(k))} onChange={() => onChange(toggleKind(value, 'all', all))}>All</Chip>
      {options.map((o) => (
        <Chip key={o.v} on={value.includes(o.v)} onChange={() => onChange(toggleKind(value, o.v, all))}>{o.label}</Chip>
      ))}
    </div>
  );
}
