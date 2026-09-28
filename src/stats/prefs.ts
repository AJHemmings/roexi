// Stats page preferences, persisted through useStickyPersisted (ui_sticky.json). Stored values are
// untrusted (an old or hand-edited file), so every read goes through a parser with safe defaults.
import { KINDS, LEFT_SORTS, type Kind, type LeftSort } from '../roe/completion';

export type ChartType = 'bar' | 'radar' | 'donut';
export type ChartValue = 'pct' | 'count';
export type ChartPrefs = { type: ChartType; value: ChartValue; hiddenCats: string[] };
export const DEFAULT_CHART: ChartPrefs = { type: 'bar', value: 'pct', hiddenCats: [] };

export type StatsTab = 'completion' | 'left';
/** The Completion tab's measure switch has no Unclassified option (spec §4.2); Left to do does (§4.3). */
export type CompletionKind = Exclude<Kind, 'unclassified'>;
export type ViewPrefs = { tab: StatsTab; completionKind: CompletionKind; leftKind: Kind; leftSort: LeftSort; leftHiddenCats: string[] };
export const DEFAULT_VIEW: ViewPrefs = { tab: 'completion', completionKind: 'one-time', leftKind: 'one-time', leftSort: 'sparks', leftHiddenCats: [] };

const COMPLETION_KINDS: readonly CompletionKind[] = ['one-time', 'repeatable', 'event'];

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function parseChartPrefs(v: unknown): ChartPrefs {
  const o = obj(v);
  return {
    type: pick(o.type, ['bar', 'radar', 'donut'] as const, DEFAULT_CHART.type),
    value: pick(o.value, ['pct', 'count'] as const, DEFAULT_CHART.value),
    hiddenCats: strings(o.hiddenCats),
  };
}

export function parseViewPrefs(v: unknown): ViewPrefs {
  const o = obj(v);
  return {
    tab: pick(o.tab, ['completion', 'left'] as const, DEFAULT_VIEW.tab),
    completionKind: pick(o.completionKind, COMPLETION_KINDS, DEFAULT_VIEW.completionKind),
    leftKind: pick(o.leftKind, KINDS, DEFAULT_VIEW.leftKind),
    leftSort: pick(o.leftSort, LEFT_SORTS, DEFAULT_VIEW.leftSort),
    leftHiddenCats: strings(o.leftHiddenCats),
  };
}

/** Radar is always %: categories differ in size, so counts can't share one radial scale. */
export const valueFor = (p: ChartPrefs): ChartValue => (p.type === 'radar' ? 'pct' : p.value);
