import { describe, it, expect } from 'vitest';
import { normalizeName, editDistance } from '../roe/normalize';

describe('normalizeName', () => {
  it('lowercases, strips punctuation and a trailing plus marker', () => {
    expect(normalizeName('Vanquish 1 Enemy +')).toBe('vanquish 1 enemy');
    expect(normalizeName("Spoils (Light Crystal)")).toBe('spoils light crystal');
  });
  it('expands the abbreviations both sources use so they compare equal', () => {
    expect(normalizeName('Van. Amorphs with Ph. Dmg. A (UC)')).toBe(normalizeName('Van. Amorphs with Ph. Damage A (UC)'));
    expect(normalizeName('Total Suc. Harvest. Attempts C (UC)')).toBe(normalizeName('Total Suc. Harvesting Attempts C (UC)'));
    expect(normalizeName('Subj.: Putraxia 1 (W)')).toBe(normalizeName('Subjugation: Putraxia 1 (W)'));
  });
  it('folds curly quotes', () => {
    expect(normalizeName('San d’Oria Rank 1-1')).toBe("san d oria rank 1 1");
  });
});

describe('editDistance', () => {
  it('counts single edits', () => {
    expect(editDistance('hennetiel', 'hennitiel')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
