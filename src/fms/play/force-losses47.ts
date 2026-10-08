import type {UnitAssignments} from './military-profile';
import {armyTravelLocation47, beginArmyTravel47, haltArmyTravel47} from './army-travel47-state';
import {actualForces47, type ForceRun47} from './force-runtime47';
import {assertForceContacts47, forceKey47, reconcileForceContactsOwned47} from './force-motion47';
import {forceVolley47} from './force-volley47';
import {nationsAtWar} from './realtime-statecraft';
export type ForceDamage47 = {version: 1; carry: Record<string, number>; losses: Record<string, number>};
export const initialForceDamage47 = (): ForceDamage47 => ({version: 1, carry: {}, losses: {}});
type Run = ForceRun47 & {units: UnitAssignments; forceDamage: ForceDamage47};
type CombatInputs = Pick<Parameters<typeof forceVolley47>[3], 'army' | 'navy'> & {
  /** Explicit web hull conversion; original navyCount and 100 hull/ship are
   * different units. No implicit claim of native health-scale equivalence. */
  navyCountToHull: number;
};
/** One due volley computed before ANY deduction, then committed together.
 * Raw native damage remains separate from clamped integer web losses. Fleet
 * cargo loss is distinct from independent Army travelling on the same sea. */
export function applyActualVolley47<T extends Run>(input: T, due: ReadonlySet<string>, inputs: CombatInputs) {
  if (!Number.isFinite(inputs.navyCountToHull) || inputs.navyCountToHull <= 0) throw Error('海军数量与舰体换算无效。');
  const {terrain, ...mutable} = input, next = {...structuredClone(mutable), terrain} as T;
  const {spatial, forces} = actualForces47(next), known = new Set([...next.world.armies.map(a => forceKey47({kind: 'army', id: a.id})), ...next.navy.fleets.map(f => forceKey47({kind: 'fleet', id: f.id}))]);
  const state = next.forceDamage;
  if (!state || Object.keys(state).sort().join('/') !== 'carry/losses/version' || state.version !== 1 || !state.carry || !state.losses || Array.isArray(state.carry) || Array.isArray(state.losses) || Object.entries(state.carry).some(([id,n]) => !known.has(id) || !Number.isFinite(n) || n < 0 || n >= 1) || Object.entries(state.losses).some(([id,n]) => !known.has(id) || !Number.isSafeInteger(n) || n < 0)) throw Error('部队战损余数或累计值无效。');
  const regions = new Map(next.diplomaticGeography.water.flatMap(p => p.faces.map(face => [face, p.id] as const)));
  assertForceContacts47(next.forceContacts, forces, spatial.graph, face => regions.get(face)!);
  const hits = forceVolley47(forces, next.forceContacts, due, {
    ...inputs, enemy: (a,b) => nationsAtWar(next.world,a,b),
    onLand: f => armyTravelLocation47(f.travel, spatial.graph).onLand,
    elite: f => f.kind === 'army' && next.units[f.id] === 'Elite',
  });
  const incoming = new Map<string, number>();
  for (const hit of hits) incoming.set(hit.victim, (incoming.get(hit.victim) ?? 0) + hit.nativeDamage);
  const casualties: {key: string; strength: number; crew: number; lostShips: number; cargo: number}[] = [];
  const sunk = new Set<string>();
  for (const force of forces) {
    const key = forceKey47(force), raw = incoming.get(key); if (raw === undefined) continue;
    const total = raw * (force.kind === 'army' ? 10 : inputs.navyCountToHull) + (state.carry[key] ?? 0);
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw Error('统一战损溢出，原世界未提交。');
    const whole = Math.floor(total); state.carry[key] = total - whole;
    let strength: number; let crew = 0, lostShips = 0;
    if (force.kind === 'army') {
      const a = next.world.armies.find(a => a.id === force.id)!, before = a.troops;
      strength = Math.min(before, whole); a.troops -= strength;
      if (strength) a.morale = Math.max(0, a.morale - Math.max(.2, strength / Math.max(1, before) * 46));
      if (!a.troops) {a.status = 'destroyed'; a.morale = 0; a.route = []; a.progress = 0; next.armyPositions.records[a.id] = haltArmyTravel47(force.travel, spatial.graph); delete next.battles.plans[a.id];}
    } else {
      const f = next.navy.fleets.find(f => f.id === force.id)!, before = next.maritime.hulls[f.id], oldCrew = f.crew;
      strength = Math.min(before, whole); next.maritime.hulls[f.id] = before - strength;
      f.crew = Math.min(oldCrew, Math.ceil(next.maritime.hulls[f.id] / (f.ships * 100) * f.ships * 40)); crew = oldCrew - f.crew;
      if (!next.maritime.hulls[f.id]) {f.status = 'lost'; f.patrol = false; delete next.maritime.retreating[f.id]; lostShips = f.ships; sunk.add(f.id); next.fleetPositions.records[f.id] = haltArmyTravel47(force.travel, spatial.graph);}
    }
    const cumulative = (state.losses[key] ?? 0) + strength;
    if (!Number.isSafeInteger(cumulative)) throw Error('累计战损超出安全范围。');
    state.losses[key] = cumulative; casualties.push({key, strength, crew, lostShips, cargo: 0});
  }
  for (const cargo of next.transports.cargo.filter(c => sunk.has(c.fleetId))) {
    if (next.world.armies.some(a => a.id === cargo.army.id)) throw Error('载军身份重复，原世界未提交。');
    const location = armyTravelLocation47(next.fleetPositions.records[cargo.fleetId], spatial.graph), a = {...cargo.army, troops: 0, morale: 0, status: 'destroyed' as const, route: [], progress: 0};
    next.world.armies.push(a); next.units = {...next.units, [a.id]: cargo.unit};
    next.armyPositions.records[a.id] = beginArmyTravel47(a.id, [location.cell.id], spatial.graph, location.point);
    casualties.push({key: forceKey47({kind: 'army', id: a.id}), strength: 0, crew: 0, lostShips: 0, cargo: cargo.army.troops});
  }
  next.transports.cargo = next.transports.cargo.filter(c => !sunk.has(c.fleetId));
  const after = actualForces47(next);
  const clean = reconcileForceContactsOwned47(after.forces, spatial.graph, next.forceContacts, (a,b) => nationsAtWar(next.world,a,b), face => regions.get(face)!);
  next.forceContacts = clean.contacts;
  assertForceContacts47(next.forceContacts, after.forces, spatial.graph, face => regions.get(face)!);
  for (const a of next.world.armies) if (a.status === 'fighting' && !clean.held.has(forceKey47({kind: 'army', id: a.id}))) a.status = 'idle';
  // The full owner adds logs, global loss ledger, retreat/reorganization and
  // increments one position/session revision after its complete atomic tick.
  return {run: next, nativeHits: hits, casualties};
}
