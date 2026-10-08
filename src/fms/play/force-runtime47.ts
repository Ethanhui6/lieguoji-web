import type {War46Run} from './war46-model';
import {assertArmyPositions47, type ArmyPositions47} from './army-presence47';
import {armySpatialFor47} from './army-geography47';
import {armyTravelPolicy47, type ArmyMotionRun47, type ArmyRouteWeights47} from './army-commands47';
import {assertDiplomaticGeography} from './war30-geography';
import {nationsAtWar} from './realtime-statecraft';
import {militaryAccess46} from './war46-access';
import {readArmySpace47} from './army-space47';
import {advanceForceContacts47, forceKey47, type ForceContacts47, type MovingForce47} from './force-motion47';
import type {TravelCell47} from './army-travel47-graph';

/** Army and Fleet have separate, equally authoritative travel ledgers. Fleet
 * legacy node/route is not rewritten to fake an arbitrary shore-gate origin.
 * Full47 must render/validate/economize from these ledgers before activation. */
export type ForceRun47 = ArmyMotionRun47 & Pick<War46Run, 'diplomaticGeography' | 'maritime'> & {fleetPositions: ArmyPositions47; forceContacts: ForceContacts47};
export function actualForces47(r: ForceRun47) {
  if (r.battles.engagements.length || r.maritime.contacts.length) throw Error('旧陆海交锋尚未明确转换，原世界保留原规则。');
  const spatial = armySpatialFor47(r);
  assertDiplomaticGeography(r.diplomaticGeography, r);
  assertArmyPositions47(r.fleetPositions, spatial.graph, spatial.binding, r.navy.fleets.map(f => f.id));
  if (!r.maritime.hulls || typeof r.maritime.hulls !== 'object' || Array.isArray(r.maritime.hulls) || Object.keys(r.maritime.hulls).length !== r.navy.fleets.length) throw Error('统一舰体账与舰队身份不一致。');
  for (const f of r.navy.fleets) {
    const hull = r.maritime.hulls[f.id];
    if (!Number.isSafeInteger(f.ships) || f.ships <= 0 || f.ships > 5 || !Number.isSafeInteger(f.crew) || f.crew < 0 || f.crew > f.ships * 40 || !Object.hasOwn(r.maritime.hulls, f.id) || !Number.isSafeInteger(hull) || hull < 0 || hull > f.ships * 100 || (hull === 0) !== (f.status === 'lost')) throw Error('统一舰体或船员数据无效。');
    if (r.fleetPositions.records[f.id].nodes.some(id => spatial.graph.cells.get(id)!.surface !== 'sea')) throw Error('舰队航线进入陆地。');
  }
  for (const [id, until] of Object.entries(r.maritime.retreating)) if (!r.navy.fleets.some(f => f.id === id && f.status !== 'lost') || !Number.isSafeInteger(until) || until <= r.clock.tick || until > r.clock.tick + 120) throw Error('统一舰队撤退引用无效。');
  const forces: MovingForce47[] = r.world.armies.filter(a => a.troops > 0 && a.status !== 'destroyed').map(a => ({kind: 'army', id: a.id, nationId: a.nationId, withdrawing: a.status === 'retreating', travel: r.armyPositions.records[a.id]}));
  forces.push(...r.navy.fleets.filter(f => f.status !== 'lost' && r.maritime.hulls[f.id] > 0).map(f => ({kind: 'fleet' as const, id: f.id, nationId: f.nationId, withdrawing: (r.maritime.retreating[f.id] ?? 0) > r.clock.tick, travel: r.fleetPositions.records[f.id]})));
  return {spatial, forces};
}
/** Coupled Army+Fleet movement/contact phase of the private full-session
 * candidate. Does not run the old v46 Army/Navy movers, old road contacts or
 * damage loops. Caller must bound seconds at day/diplomacy/combat events. */
export function advanceActualForces47<T extends ForceRun47>(input: T, seconds: number, weights: ArmyRouteWeights47, speed: (run: T, force: Readonly<MovingForce47>, cell: Readonly<TravelCell47>) => number, stopAtEvent = false) {
  for (const book of [input.armyPositions, input.fleetPositions]) if (!Number.isSafeInteger(book.revision) || book.revision < 0 || book.revision >= Number.MAX_SAFE_INTEGER) throw Error('统一部队位置版本不能安全推进。');
  const {terrain, ...mutable} = input, next = {...structuredClone(mutable), terrain} as T;
  const {spatial, forces} = actualForces47(next);
  const regions = new Map(next.diplomaticGeography.water.flatMap(p => p.faces.map(face => [face, p.id] as const)));
  const policies = new Map(next.world.armies.map(a => [a.id, armyTravelPolicy47(next, a, weights, a.status === 'retreating')]));
  const out = advanceForceContacts47(forces, next.forceContacts, spatial.graph, seconds, {
    enemy: (a, b) => nationsAtWar(next.world, a, b), seaRegion: face => regions.get(face)!,
    canEnter: (f, c) => f.kind === 'fleet' ? c.surface === 'sea' : c.surface === 'sea' ? policies.get(f.id)!.allowSea : policies.get(f.id)!.canEnter(c.provinceId!),
    speed: (f, c) => speed(next, f, c),
  }, 100000, stopAtEvent);
  for (const f of out.forces) (f.kind === 'army' ? next.armyPositions : next.fleetPositions).records[f.id] = f.travel;
  next.forceContacts = out.contacts;
  const space = readArmySpace47(next.world, {...spatial, positions: next.armyPositions}), access = militaryAccess46(next);
  // All positions are installed before retreat completion or status changes.
  const safelyArrived = new Set([...space.byArmy].filter(([,v]) => v.army.status === 'retreating' && ['arrived', 'halted'].includes(v.travel.status) && v.province && access(next.world, v.army.nationId, v.province.controller) && !(space.land.get(v.province.id) ?? []).some(b => b.army.status !== 'retreating' && nationsAtWar(next.world, v.army.nationId, b.army.nationId))).map(([id]) => id));
  for (const a of next.world.armies) if (a.troops > 0 && a.status !== 'destroyed') {
    if (safelyArrived.has(a.id)) a.status = 'idle';
    else if (a.status !== 'retreating') a.status = out.held.has(forceKey47({kind: 'army', id: a.id})) ? 'fighting' : 'idle';
  }
  next.armyPositions.revision++; next.fleetPositions.revision++;
  actualForces47(next);
  return {run: next, exposure: out.exposure, boundaryEvents: out.events, held:out.held, elapsed:out.elapsed, unusedSeconds:out.unusedSeconds};
}
