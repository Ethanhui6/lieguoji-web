import { describe, it, expect } from 'vitest';
import { projectCombatTraits, initializedArmyBase } from './state-traits';
import { nativeCoreDistances, isNativeCore, advanceCoreThreshold, type CoreProvince } from './core-distance';
import { nativeUpperEfficiency, resetNativeProvinceDefense, nativeProvinceDefense, defaultPoliticalCombat, nativeGoldBattleModifier, type ResolvedCombatInput } from './upper-efficiency';
const f = Math.fround;
const neutral = (changes: Partial<ResolvedCombatInput> = {}): ResolvedCombatInput => ({
  baseCombatEfficiency: 1.25, destiny: 30, leadershipModifier: 1, leaderCombatModifier: 0,
  provinceDefense: 1, coreDefense: 1, politicalAttack: 1, politicalDefense: 1,
  goldBattleModifier: 1, attacking: true, sameNationId: false, protruding: false,
  wellTrained: false, homelandDefense: false, conqueror: false, unitModifier: 1, elite: false, ...changes,
});
describe('native inputs: source contracts only, no active v13 integration claim', () => {
  it('resets native defaults, applies ordered replacement, and snapshots base only at initialization', () => {
    const first = projectCombatTraits([]), savedArmyBase = initializedArmyBase(first);
    const changed = projectCombatTraits([{ effects: [
      { key: 'CoreDefenseEfficiencyBoost', isBool: false, value: 1.5 },
      { key: 'BaseBattleEfficiencyBounus', isBool: false, value: 2 },
      { key: 'IsWellTrained', isBool: true, value: 1 },
    ] }, { effects: [{ key: 'BaseBattleEfficiencyBounus', isBool: false, value: .8 }] }]);
    expect(first.CoreDefenseEfficiencyBoost).toBe(f(1.15));
    expect(first.CoreProvinceRate).toBe(f(.15));
    expect(changed.CoreDefenseEfficiencyBoost).toBe(1.5);
    expect(changed.IsWellTrained).toBe(true);
    expect(initializedArmyBase(changed)).toBe(1);
    expect(savedArmyBase).toBe(1.25);
    expect(projectCombatTraits([]).IsWellTrained).toBe(false);
  });
  it('keeps boolean false replacements and ignores unrelated projection fields without guessing', () => {
    expect(projectCombatTraits([{ effects: [
      { key: 'IsConqueror', isBool: true, value: -1 },
      { key: 'IsConqueror', isBool: true, value: 0 },
      { key: 'AFieldOutsideThisProjection', isBool: false, value: 10 },
    ] }]).IsConqueror).toBe(false);
    expect(() => projectCombatTraits([{ effects: [{ key: 'IsConqueror', isBool: false, value: 1 }] }])).toThrow();
    expect(projectCombatTraits([{ effects: [{ key: 'IsConqueror', isBool: true, value: 1e-50 }] }]).IsConqueror).toBe(false);
    expect(projectCombatTraits([{ effects: [{ key: 'IsConqueror', isBool: true, value: -1e-50 }] }]).IsConqueror).toBe(false);
  });
  it('applies the main clamp before the unit and elite factors', () => {
    expect(nativeUpperEfficiency(neutral({ baseCombatEfficiency: 20, unitModifier: 2, elite: true }))).toBe(200);
    expect(nativeUpperEfficiency(neutral({ baseCombatEfficiency: 0, unitModifier: 0 }))).toBe(f(f(.1) * f(.05)));
    expect(nativeUpperEfficiency(neutral({ unitModifier: null }))).toBe(1.25);
  });
  it('well-trained skips only core penalty, retaining province and unit penalties', () => {
    const i = neutral({ provinceDefense: 2, coreDefense: 2, unitModifier: .5 });
    expect(nativeUpperEfficiency(i)).toBe(.15625);
    expect(nativeUpperEfficiency({ ...i, wellTrained: true })).toBe(.3125);
    expect(nativeUpperEfficiency({ ...i, wellTrained: true, conqueror: true })).toBe(.46875);
  });
  it('separates owner identity attack branch from numeric-ID protrusion inversion', () => {
    expect(nativeUpperEfficiency(neutral({ protruding: true }))).toBe(2.5);
    expect(nativeUpperEfficiency(neutral({ protruding: true, sameNationId: true }))).toBe(.625);
    expect(nativeUpperEfficiency(neutral({ attacking: false, sameNationId: true, protruding: true, homelandDefense: true, provinceDefense: 2, coreDefense: 2 }))).toBe(3.75);
  });
  it('uses destiny minimum and resolved leadership/leader channels independently', () => {
    expect(nativeUpperEfficiency(neutral({ destiny: -30 }))).toBe(.125);
    expect(nativeUpperEfficiency(neutral({ leadershipModifier: .5, leaderCombatModifier: .5 }))).toBe(.9375);
    expect(nativeUpperEfficiency(neutral({ destiny: 60 }))).toBe(2.5);
  });
  it('generic defense counts Marine and preserves first-encounter ties instead of area argmax', () => {
    const base = { mountain: false, plateau: false, locked: false, stored: 9 };
    expect(resetNativeProvinceDefense({ ...base, biomeCounts: [{ biome: 0, count: 3 }, { biome: 11, count: 2 }] })).toBe(1);
    expect(resetNativeProvinceDefense({ ...base, biomeCounts: [{ biome: 1, count: 2 }, { biome: 4, count: 2 }] })).toBe(2.5);
    expect(resetNativeProvinceDefense({ ...base, biomeCounts: [{ biome: 4, count: 2 }, { biome: 1, count: 2 }] })).toBe(1);
  });
  it('caps automatic snow at three but preserves locked values and distinct manual-fortress flags', () => {
    const snow = { mountain: false, plateau: false, locked: false, stored: 9, biomeCounts: [{ biome: 11, count: 1 }] };
    expect(resetNativeProvinceDefense(snow)).toBe(3);
    expect(resetNativeProvinceDefense({ ...snow, locked: true })).toBe(9);
    expect(resetNativeProvinceDefense({ ...snow, biomeCounts: [], plateau: true })).toBe(1.5);
    expect(nativeProvinceDefense(9, false, true, true)).toBe(3);
    expect(nativeProvinceDefense(9, true, true, true)).toBe(9);
    expect(nativeProvinceDefense(9, false, false, true)).toBe(9);
  });
  it('keeps original political defaults distinct from final live attributes and treasury boundaries', () => {
    expect(defaultPoliticalCombat('Kingdom')).toEqual({ attack: 1, defense: f(1.05), goldProduction: 1 });
    expect(defaultPoliticalCombat('Empire')).toEqual({ attack: f(1.05), defense: 1, goldProduction: 1 });
    expect(defaultPoliticalCombat('Tribal')).toEqual({ attack: f(1.05), defense: f(.95), goldProduction: f(.9) });
    expect(nativeGoldBattleModifier(0, 1, 'Other')).toBe(f(.9));
    expect(nativeGoldBattleModifier(1, 1, 'Other')).toBe(f(1.1));
    expect(nativeGoldBattleModifier(-1, 0, 'Commercial')).toBe(f(.8));
    expect(nativeGoldBattleModifier(1, 2, 'Commercial')).toBe(f(1.2));
  });
});

describe('native province core graph', () => {
  const graph: CoreProvince[] = [
    { id: 'c', stateRef: 'A', neighbors: ['p', 'sea', 'foreign'] },
    { id: 'p', stateRef: 'A', neighbors: ['c', 'q'] },
    { id: 'q', stateRef: 'A', neighbors: ['p'] },
    { id: 'island1', stateRef: 'A', neighbors: ['sea'] },
    { id: 'island2', stateRef: 'A', neighbors: [] },
    { id: 'sea', stateRef: 'neutral', neighbors: ['c', 'island1'] },
    { id: 'foreign', stateRef: 'B', neighbors: ['c'] },
  ];
  it('uses same-state unweighted graph and ordered finite disconnected distances', () => {
    const distance = nativeCoreDistances(graph, 'A', 'c', ['c', 'p', 'q', 'island1', 'island2']);
    expect(distance).toEqual({ c: { distance: 0, connected: true }, p: { distance: 1, connected: true }, q: { distance: 2, connected: true }, island1: { distance: 4, connected: false }, island2: { distance: 5, connected: false } });
    const reversed = nativeCoreDistances(graph, 'A', 'c', ['c', 'island2', 'q', 'island1', 'p']);
    expect(reversed.island2.distance).toBe(4); expect(reversed.island1.distance).toBe(5);
    expect(isNativeCore(distance.island1.distance, 4, true)).toBe(true);
    expect(isNativeCore(0, 2, false)).toBe(false);
  });
  it('grows one threshold per annual call on equality, never shrinks and preserves empty unordered behavior', () => {
    expect(advanceCoreThreshold(2, 3, 20, .15)).toBe(3);
    expect(advanceCoreThreshold(2, 4, 20, .15)).toBe(2);
    expect(advanceCoreThreshold(2, 0, 100, .3)).toBe(3);
    expect(advanceCoreThreshold(8, 0, 0, .15)).toBe(9);
    expect(advanceCoreThreshold(2147483647, 0, 100, .15)).toBe(-2147483648);
  });
  it('rejects invalid graph identity instead of silently treating missing provinces as neutral', () => {
    expect(() => nativeCoreDistances(graph, 'A', 'foreign', ['c'])).toThrow();
    expect(() => nativeCoreDistances(graph, 'A', 'c', ['c', 'p', 'q', 'island1', 'island1'])).toThrow();
    expect(() => nativeCoreDistances(graph.filter(p => p.id !== 'q'), 'A', 'c', ['c', 'p'])).toThrow();
  });
});
