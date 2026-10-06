// Stats page preferences, persisted through useStickyPersisted (ui_sticky.json). Stored values are
// untrusted (an old or hand-edited file), so every read goes through a parser with safe defaults.
import { KINDS, LEFT_SORTS, type Kind, type LeftSort } from '../roe/completion';

export type ChartType = 'bar' | 'radar' | 'donut';
export type ChartValue = 'pct' | 'count';
/** `hidden`: category and section keys left out of Completion and Objectives (see stats/sections.ts). */
export type ChartPrefs = { type: ChartType; value: ChartValue; hidden: string[] };
export const DEFAULT_CHART: ChartPrefs = { type: 'bar', value: 'pct', hidden: [] };

export type StatsTab = 'completion' | 'left' | 'objectives';
/** Completion's kind chips have no Unclassified option (spec 2026-09-28 §4.2); Left to do does (§4.3). */
export type CompletionKind = Exclude<Kind, 'unclassified'>;
export const COMPLETION_KINDS: readonly CompletionKind[] = ['one-time', 'repeatable', 'event'];
// completionKinds/leftKinds replaced the single completionKind/leftKind (spec 2026-10-06 §3.1). The old
// keys are deliberately not migrated, so everyone starts on All once.
export type ViewPrefs = { tab: StatsTab; completionKinds: CompletionKind[]; leftKinds: Kind[]; leftSort: LeftSort; leftHiddenCats: string[] };
export const DEFAULT_VIEW: ViewPrefs = { tab: 'completion', completionKinds: [...COMPLETION_KINDS], leftKinds: [...COMPLETION_KINDS], leftSort: 'sparks', leftHiddenCats: [] };

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
/** Allowed values present in v, in canonical order; the fallback when none are. */
const kindList = <K extends string>(v: unknown, allowed: readonly K[], fallback: readonly K[]): K[] => {
  const got = strings(v);
  const out = allowed.filter((k) => got.includes(k));
  return out.length > 0 ? out : [...fallback];
};

export function parseChartPrefs(v: unknown): ChartPrefs {
  const o = obj(v);
  return {
    type: pick(o.type, ['bar', 'radar', 'donut'] as const, DEFAULT_CHART.type),
    value: pick(o.value, ['pct', 'count'] as const, DEFAULT_CHART.value),
    // Before 0.6.0 only whole categories could be hidden, as hiddenCats; those keys mean the same thing.
    hidden: Array.isArray(o.hidden) ? strings(o.hidden) : strings(o.hiddenCats),
  };
}

export function parseViewPrefs(v: unknown): ViewPrefs {
  const o = obj(v);
  return {
    tab: pick(o.tab, ['completion', 'left', 'objectives'] as const, DEFAULT_VIEW.tab),
    completionKinds: kindList(o.completionKinds, COMPLETION_KINDS, COMPLETION_KINDS),
    leftKinds: kindList(o.leftKinds, KINDS, COMPLETION_KINDS),
    leftSort: pick(o.leftSort, LEFT_SORTS, DEFAULT_VIEW.leftSort),
    leftHiddenCats: strings(o.leftHiddenCats),
  };
}

/** Radar is always %: categories differ in size, so counts can't share one radial scale. */
export const valueFor = (p: ChartPrefs): ChartValue => (p.type === 'radar' ? 'pct' : p.value);

/**
 * Kind chip rules (spec 2026-10-06 §3.1): 'all' turns every offered kind on; a chip toggles its kind; the
 * last offered chip that is on stays on. The result keeps the options' order and drops kinds not offered.
 */
export function toggleKind<K extends string>(current: readonly K[], k: K | 'all', options: readonly K[]): K[] {
  if (k === 'all') return [...options];
  const on = current.includes(k);
  const visibleOn = options.filter((x) => current.includes(x));
  if (on && visibleOn.length === 1) return visibleOn;
  const next = new Set(current);
  if (on) next.delete(k); else next.add(k);
  return options.filter((x) => next.has(x));
}
