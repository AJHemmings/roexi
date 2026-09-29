// Chart colours. Series (one per character) are theme tokens defined in styles.css; category colours
// are evenly spaced hues so any number of categories stays distinguishable.
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'] as const;

export const seriesColor = (i: number): string => SERIES[((i % SERIES.length) + SERIES.length) % SERIES.length];

export const catColor = (i: number, n: number): string => `hsl(${Math.round((i * 360) / Math.max(1, n)) % 360} 55% 62%)`;

/** Stable colour per character: by alphabetical position among every known character, so a
 * character keeps its colour when others go offline or the scope changes. */
export function colorByName(allNames: string[]): (name: string) => string {
  const sorted = [...allNames].sort((a, b) => a.localeCompare(b));
  return (name) => seriesColor(Math.max(0, sorted.indexOf(name)));
}
