import { describe, expect, it } from 'vitest';
import { countryTerritoryOwner, type CountryOwnershipView } from './ownership-view';

describe('country ownership view', () => {
  it('keeps legal ownership visible when a nation has no controlled land', () => {
    const territories = Object.freeze([
      Object.freeze({ cellId: 6, legalNationId: '岚川', controllingNationId: '海岬' }),
      Object.freeze({ cellId: 8, legalNationId: '海岬', controllingNationId: '海岬' }),
    ]);
    expect(territories.filter(t => countryTerritoryOwner(t, 'control') === '岚川')).toEqual([]);
    expect(territories.filter(t => countryTerritoryOwner(t, 'legal') === '岚川').map(t => t.cellId)).toEqual([6]);
    expect(territories.map(t => countryTerritoryOwner(t, 'control'))).toEqual(['海岬', '海岬']);
    expect(territories.map(t => countryTerritoryOwner(t, 'legal'))).toEqual(['岚川', '海岬']);
  });

  it('switches repeatedly without rewriting, sorting or sharing an ownership value between cells', () => {
    const territories = Object.freeze([
      Object.freeze({ cellId: 19, legalNationId: '岚川', controllingNationId: '海岬' }),
      Object.freeze({ cellId: 4, legalNationId: '海岬', controllingNationId: '岚川' }),
    ]), before = JSON.stringify(territories);
    for (const view of ['legal', 'control', 'legal'] as const) {
      expect(territories.map(t => countryTerritoryOwner(t, view))).toEqual(view === 'legal' ? ['岚川', '海岬'] : ['海岬', '岚川']);
    }
    expect(JSON.stringify(territories)).toBe(before);
    expect(territories.map(t => t.cellId)).toEqual([19, 4]);
  });

  it('rejects an unsupported view instead of silently showing current control', () => {
    const territory = Object.freeze({ cellId: 6, legalNationId: '岚川', controllingNationId: '海岬' });
    for (const view of ['', 'future', 'controllingNationId', null, undefined, 1]) {
      expect(() => countryTerritoryOwner(territory, view as CountryOwnershipView)).toThrow('归属视图无效');
    }
  });
});
