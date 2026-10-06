import { describe, it, expect } from 'vitest';
import { parseWiki, joinSources, isTypoPair, RETIRED } from '../roe/catalogBuild';
import type { WikiRow } from '../roe/catalogBuild';
import type { ClientEntry } from '../roe/clientDat';

const row = (name: string, cat: string, sub: string): WikiRow => ({ cat, sub, name });
const ce = (id: number, n: string, over: Partial<ClientEntry> = {}): ClientEntry =>
  ({ id, n, repeat: false, goal: 1, sparks: 100, exp: 300, acc: 0, ...over });

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
    expect(parseWiki(html)).toEqual([
      { cat: 'Tutorial', sub: 'Basics', name: 'First Step Forward' },
      { cat: 'Tutorial', sub: 'Basics', name: 'Vanquish 1 Enemy' },
      { cat: 'Unity', sub: 'Unity (Shared A)', name: 'Unity Communique A (UC)' },
    ]);
  });
});

describe('joinSources', () => {
  it('takes everything but the category from the client; the wiki only files it', () => {
    const { entries, report } = joinSources(
      [ce(12, 'Vanquish Multiple Enemies I', { repeat: true, goal: 200, sparks: 1000, exp: 5000, acc: 100, text: 'Defeat enemies.' })],
      [row('Vanquish Multiple Enemies I', 'Combat (Wide Area)', 'Combat (General)')],
    );
    expect(entries).toEqual([{
      id: 12, n: 'Vanquish Multiple Enemies I', repeat: true, goal: 200, sparks: 1000, exp: 5000, acc: 100,
      text: 'Defeat enemies.', cat: 'Combat (Wide Area)', sub: 'Combat (General)',
    }]);
    expect(report.exact).toBe(1);
  });

  it('pairs the k-th duplicate id with the k-th duplicate wiki row', () => {
    const { entries, report } = joinSources(
      [ce(2168, "Guild Master's Request 1"), ce(2172, "Guild Master's Request 1")],
      [row("Guild Master's Request 1", 'Crafting', 'Crafting: Escutcheons (Woodworking)'), row("Guild Master's Request 1", 'Crafting', 'Crafting: Escutcheons (Clothcraft)')],
    );
    expect(entries.map((e) => [e.id, e.sub])).toEqual([[2168, 'Crafting: Escutcheons (Woodworking)'], [2172, 'Crafting: Escutcheons (Clothcraft)']]);
    expect(report.exact).toBe(2);
  });

  it('accepts a single misspelt token as a typo pair', () => {
    const { entries, report } = joinSources([ce(1, 'Conflict: Foret de Hennetiel I', { goal: 5 })],
      [row('Conflict: Foret de Hennitiel I', 'Combat (Region)', 'Combat (Region)')]);
    expect(entries[0]).toMatchObject({ cat: 'Combat (Region)', sub: 'Combat (Region)', goal: 5 });
    expect(report.fuzzy).toBe(1);
  });

  it('does not pair objectives that differ by a short whole word', () => {
    const { entries, report } = joinSources([ce(3063, 'Deal 500+ Fire Damage (VBD)')], [row('Deal 500+ Ice Damage (VBD)', 'Special Events', "Vana'bout Daily")]);
    expect(report.fuzzy).toBe(0);
    expect(report.fallback).toBe(1);
    expect(entries[0]).toMatchObject({ id: 3063, cat: 'Special Events', sub: "Vana'bout Daily" });
    expect(report.unmatchedWiki).toEqual(["Special Events/Vana'bout Daily:Deal 500+ Ice Damage (VBD)"]);
  });

  it('marks the auto-tracked id range even with no wiki data', () => {
    const { entries, report } = joinSources([ce(4013, 'Gain Experience')], []);
    expect(entries[0]).toMatchObject({ id: 4013, auto: true, cat: 'Other', sub: 'Daily Objectives' });
    expect(report.none).toBe(1);
  });

  it('files everything the game\'s menu lists under the menu\'s own category and section', () => {
    const { entries, report } = joinSources(
      [ce(817, 'Subjugation: Hugemaw Harold (UC)', { repeat: true }), ce(915, 'Subjugation: Hidhaegg (UC)', { repeat: true }), ce(1069, 'Obtaining Ambuscade Armor')],
      [row('Subjugation: Hugemaw Harold (UC)', 'Unity', 'Unity (Wanted)'), row('Obtaining Ambuscade Armor', 'Tutorial', 'Intermediate 2')],
      [{ cat: 'Unity', sub: 'Unity (Wanted 1)', ids: [817, 915] }, { cat: 'Tutorial', sub: 'Intermediate 2', ids: [1069] }],
    );
    expect(entries.map((e) => [e.id, e.cat, e.sub, e.repeat, e.unlisted])).toEqual([
      [817, 'Unity', 'Unity (Wanted 1)', true, undefined],
      [915, 'Unity', 'Unity (Wanted 1)', true, undefined],
      [1069, 'Tutorial', 'Intermediate 2', false, undefined],
    ]);
    expect(report.menuPlaced).toBe(3);
  });

  it('marks what the menu does not list right now as unlisted, filed by the wiki or a fallback', () => {
    const { entries } = joinSources(
      [ce(1, 'First Step Forward'), ce(2999, 'Echoes of Creation (VB)'), ce(4013, 'Gain Experience')],
      [],
      [{ cat: 'Tutorial', sub: 'Basics', ids: [1] }],
    );
    expect(entries.map((e) => [e.id, e.cat, e.sub, e.unlisted ?? false])).toEqual([
      [1, 'Tutorial', 'Basics', false],
      [2999, 'Special Events', "Vana'bout Round", true],
      [4013, 'Other', 'Daily Objectives', true],
    ]);
  });

  it('without a menu nothing is marked unlisted', () => {
    const { entries } = joinSources([ce(2999, 'Echoes of Creation (VB)')], []);
    expect(entries[0].unlisted).toBeUndefined();
  });

  it('files mission chapters the wiki does not list, with the client flag', () => {
    const { entries } = joinSources([ce(1, 'Rise of the Zilart 5'), ce(2, "San d'Oria Rank 3-1"), ce(3, 'Seekers of Adoulin 2')], []);
    expect(entries.map((e) => [e.sub, e.repeat])).toEqual([['Missions (Zilart)', false], ["Missions (San d'Oria)", false], ['Missions (Adoulin)', false]]);
  });

  it('matches the Ayame North Gustaberg row the wiki lists without its Conflict: prefix', () => {
    const { entries, report } = joinSources([ce(3509, 'Conflict: North Gustaberg (UC)')], [row('North Gustaberg (UC)', 'Unity', 'Unity (Ayame)')]);
    expect(entries[0]).toMatchObject({ cat: 'Unity', sub: 'Unity (Ayame)' });
    expect(report.exact).toBe(1);
  });

  it('matches the Dynamis (D) monthly the wiki lists under its old name', () => {
    const { entries } = joinSources([ce(3778, 'Dynamis (D) Instance Participation (M)')], [row('Dynamis - Divergence Participation (M)', 'Content', 'A.M.A.N. Trove')]);
    expect(entries[0]).toMatchObject({ cat: 'Content', sub: 'A.M.A.N. Trove' });
  });

  it('drops the client\'s internal flags: records with a goal of 0 can never be undertaken', () => {
    const { entries, report } = joinSources([
      ce(3996, 'Scenarios 18', { goal: 0 }),
      ce(4053, 'Mentor License Unlock', { goal: 0 }),
      ce(4057, 'Escutcheon: Woodworking', { goal: 0 }),
      ce(1060, 'Mentor License'),
    ], []);
    expect(entries.map((e) => e.id)).toEqual([1060]);
    expect(report.internal).toBe(3);
  });

  it('drops the retired Content (Limbus) objectives', () => {
    expect(RETIRED).toEqual([772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783]);
    const { entries, report } = joinSources([ce(772, 'Spoils (Ivory Chip)'), ce(782, 'Subjugation: Proto-Ultima'), ce(784, 'Kept')], []);
    expect(entries.map((e) => e.id)).toEqual([784]);
    expect(report.retired).toBe(2);
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
