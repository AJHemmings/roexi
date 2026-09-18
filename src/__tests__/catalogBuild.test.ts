import { describe, it, expect } from 'vitest';
import { parseWiki, parseMapping, joinSources, isTypoPair } from '../roe/catalogBuild';
import type { WikiRow } from '../roe/catalogBuild';

const row = (name: string, cat: string, sub: string, extra: Partial<WikiRow> = {}): WikiRow =>
  ({ cat, sub, name, text: `${name} text`, ...extra });

describe('parseWiki', () => {
  const html = `
<h2><span class="mw-headline">Tutorial</span></h2>
<h2>Contents</h2>
<h3><span class="mw-headline">Basics</span></h3>
<table class="sortable">
<tr><th></th><th></th><th></th><th></th><th colspan="4">Rewards </th></tr>
<tr><th>Name </th><th>Text </th><th>Obj </th><th>Repeat </th><th>Sparks </th><th>Exp </th></tr>
<tr><td>First Step Forward </td><td>Speak with an NPC. </td><td>1 </td><td>No </td><td>100 </td><td>300 </td></tr>
<tr><td>Vanquish 1 Enemy </td><td>Defeat one enemy. </td><td>1 </td><td>Yes </td><td>100 </td><td>500 </td></tr>
</table>
<h2><span class="mw-headline">Unity</span></h2>
<h3><span class="mw-headline">Unity (Shared A)</span></h3>
<table>
<tr><th>Name</th><th>Text</th><th>Obj</th><th>Sparks</th><th>Exp</th><th>Acco</th></tr>
<tr><td>Unity Communique (UC)</td><td>Read the communique.</td><td>1</td><td>200</td><td>1,000</td><td>50</td></tr>
</table>`;

  it('walks headings and objective tables in document order, skipping the Contents box', () => {
    const rows = parseWiki(html);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      cat: 'Tutorial', sub: 'Basics', name: 'First Step Forward', text: 'Speak with an NPC.',
      goal: 1, repeat: false, sparks: 100, exp: 300,
    });
    expect(rows[0].acc).toBeUndefined();
    expect(rows[1]).toMatchObject({ cat: 'Tutorial', sub: 'Basics', name: 'Vanquish 1 Enemy', repeat: true, exp: 500 });
  });

  it('renames shared Unity rows with their letter and marks them repeatable', () => {
    const unity = parseWiki(html)[2];
    expect(unity).toMatchObject({
      cat: 'Unity', sub: 'Unity (Shared A)', name: 'Unity Communique A (UC)', repeat: true,
      goal: 1, sparks: 200, exp: 1000, acc: 50,
    });
  });
});

describe('joinSources', () => {
  it('pairs the k-th duplicate id with the k-th duplicate wiki row', () => {
    const mapping = [{ id: 2168, n: "Guild Master's Request 1" }, { id: 2172, n: "Guild Master's Request 1" }];
    const wiki = [
      row("Guild Master's Request 1", 'Crafting', 'Crafting: Escutcheons (Woodworking)'),
      row("Guild Master's Request 1", 'Crafting', 'Crafting: Escutcheons (Clothcraft)'),
    ];
    const { entries, report } = joinSources(mapping, wiki);
    expect(entries[0]).toMatchObject({ id: 2168, sub: 'Crafting: Escutcheons (Woodworking)' });
    expect(entries[1]).toMatchObject({ id: 2172, sub: 'Crafting: Escutcheons (Clothcraft)' });
    expect(report.exact).toBe(2);
  });

  it('accepts a single misspelt token as a typo pair', () => {
    const mapping = [{ id: 1, n: 'Conflict: Foret de Hennetiel I' }];
    const wiki = [row('Conflict: Foret de Hennitiel I', 'Combat (Region)', 'Combat (Region)', { goal: 10 })];
    const { entries, report } = joinSources(mapping, wiki);
    expect(entries[0]).toMatchObject({ cat: 'Combat (Region)', sub: 'Combat (Region)', goal: 10, text: 'Conflict: Foret de Hennitiel I text' });
    expect(report.fuzzy).toBe(1);
    expect(report.fallback).toBe(0);
  });

  it('does not pair objectives that differ by a short whole word', () => {
    const mapping = [{ id: 3063, n: 'Deal 500+ Fire Damage (VBD)' }];
    const wiki = [row('Deal 500+ Ice Damage (VBD)', 'Special Events', "Vana'bout Daily")];
    const { entries, report } = joinSources(mapping, wiki);
    expect(report.fuzzy).toBe(0);
    expect(report.fallback).toBe(1);
    expect(entries[0]).toMatchObject({ id: 3063, cat: 'Special Events', sub: "Vana'bout Daily" });
    expect(entries[0].text).toBeUndefined();
    expect(report.unmatchedWiki).toEqual(["Special Events/Vana'bout Daily:Deal 500+ Ice Damage (VBD)"]);
  });

  it('marks the auto-tracked id range even with no wiki data', () => {
    const { entries, report } = joinSources([{ id: 4013, n: 'Gain Experience' }], []);
    expect(entries[0]).toMatchObject({ id: 4013, auto: true, cat: 'Other', sub: 'Daily Objectives' });
    expect(report.none).toBe(1);
  });
});

describe('isTypoPair', () => {
  it('rejects a differing token that is too short to be a misspelling', () => {
    expect(isTypoPair('deal 500 fire damage vbd', 'deal 500 ice damage vbd')).toBe(false);
  });
  it('accepts one long token within two edits', () => {
    expect(isTypoPair('conflict foret de hennetiel i', 'conflict foret de hennitiel i')).toBe(true);
    expect(isTypoPair('spoils couerls', 'spoils coeurls')).toBe(true);
  });
  it('rejects different token counts and more than one differing token', () => {
    expect(isTypoPair('conflict foret de hennetiel', 'conflict foret de hennetiel i')).toBe(false);
    expect(isTypoPair('conflict foret de hennetiel i', 'conflict forest de hennitiel i')).toBe(false);
  });
  it('treats identical strings as a pair', () => {
    expect(isTypoPair('gain experience', 'gain experience')).toBe(true);
  });
});

describe('parseMapping', () => {
  it('reads id/name pairs and unescapes quotes', () => {
    const entries = parseMapping('local roe_mapping = {\n    [1] = "First Step Forward",\n    [2047] = "Say \\"hi\\"",\n}');
    expect(entries).toEqual([{ id: 1, n: 'First Step Forward' }, { id: 2047, n: 'Say "hi"' }]);
  });
  it('throws when nothing parses', () => {
    expect(() => parseMapping('')).toThrow();
  });
});
