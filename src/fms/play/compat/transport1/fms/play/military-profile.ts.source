/** Bounded original MilitaryProfile.json data. Chinese labels are web translations.
 * Biome factors are not applied until exact biome-to-region mapping is available. */
export const unitProfiles = [
  {
    "key": "Infantry",
    "name": "步兵",
    "power": 1,
    "speed": 1,
    "weight": 1.1,
    "mountainAttack": 1,
    "mountainDefense": 1
  },
  {
    "key": "Archer",
    "name": "弓兵",
    "power": 0.95,
    "speed": 0.95,
    "weight": 0.95,
    "mountainAttack": 1.1,
    "mountainDefense": 1.2
  },
  {
    "key": "Shield",
    "name": "盾兵",
    "power": 1.05,
    "speed": 0.9,
    "weight": 0.9,
    "mountainAttack": 1.05,
    "mountainDefense": 1.3
  },
  {
    "key": "Cavalry",
    "name": "骑兵",
    "power": 1.25,
    "speed": 1.2,
    "weight": 1,
    "mountainAttack": 0.7,
    "mountainDefense": 0.75
  },
  {
    "key": "Elite",
    "name": "精锐",
    "power": 1.35,
    "speed": 1.05,
    "weight": 0.3,
    "mountainAttack": 1.1,
    "mountainDefense": 1.15
  }
] as const;
export type UnitKey = typeof unitProfiles[number]['key'];
export type UnitAssignments = Readonly<Record<string,UnitKey>>;
export const unitProfile = (key:UnitKey) => unitProfiles.find(p=>p.key===key)!;
export const isUnitKey = (v:unknown):v is UnitKey => unitProfiles.some(p=>p.key===v);
