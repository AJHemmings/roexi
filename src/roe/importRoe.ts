// Import of the Windower roe addon's saved profiles (addons\roe\data\settings.xml) as roexi Sets.
// Everything here is pure so the whole decision flow is unit-tested; ImportRoeModal is just a view
// over planImport → validateImport → buildImportedSets.
import type { RoeSet } from './types';

export type RoeProfile = { name: string; ids: number[] };

// Regex, not an XML parser, on purpose: the file has one writer (Windower's config lib, called by
// roe.lua as settings:save('global')) and it always produces a flat
// <profiles><name>id,id,…</name>…</profiles> block. Returns null when there's no profiles block at
// all, which the caller reports as "not a roe settings.xml".
export function parseRoeProfiles(xml: string): RoeProfile[] | null {
  const block = xml.match(/<profiles>([\s\S]*?)<\/profiles>/i);
  if (!block) return null;
  const out: RoeProfile[] = [];
  for (const m of block[1].matchAll(/<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g)) {
    const ids = [...new Set(m[2].split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number).filter((n) => n > 0))];
    if (ids.length) out.push({ name: m[1], ids });
  }
  return out;
}
