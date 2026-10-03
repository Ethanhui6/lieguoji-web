import type { CountryTerritory } from './model';

export type CountryOwnershipView = 'control' | 'legal';

/** Presentation chooses an existing ownership field; it never changes either
 * record or infers legal ownership from current control. */
export function countryTerritoryOwner(territory: Readonly<CountryTerritory>, view: CountryOwnershipView): string {
  if (view === 'control') return territory.controllingNationId;
  if (view === 'legal') return territory.legalNationId;
  throw new Error('国家归属视图无效，未用其他归属替代显示。');
}
