import type {Army, Point, Province, World} from '../../sim/types';
import {assertArmyPositions47, type ArmyPositions47} from './army-presence47';
import type {TravelGraph47} from './army-travel47-graph';
import {armyTravelLocation47, type ArmyTravel47} from './army-travel47-state';

/** Runtime input, never a second serialized position. Binding comes from the
 * validated run geography, not from the untrusted position record itself. */
export type ArmySpaceInput47 = {
  graph: TravelGraph47;
  positions: ArmyPositions47;
  binding: string;
  cargoIds?: readonly string[];
};
export type LocatedArmy47 = {
  army: Army;
  travel: ArmyTravel47;
  point: Point;
  province: Province | null;
  seaFace: number | null;
};
export type ArmySpace47 = {
  byArmy: Map<string, LocatedArmy47>;
  land: Map<string, LocatedArmy47[]>;
  sea: Map<number, LocatedArmy47[]>;
};

/** Rebuild for each world transaction: returned Army references belong to that
 * world, including a cloned candidate. Never cache across movement/roster edits.
 * The global army list stays intact for food, strength and recruitment counts. */
export function readArmySpace47(world: World, input: ArmySpaceInput47): ArmySpace47 {
  const {graph, positions, binding, cargoIds = []} = input;
  assertArmyPositions47(positions, graph, binding, world.armies.map(a => a.id), cargoIds);
  const provinces = new Map(world.provinces.map(p => [p.id, p]));
  const space: ArmySpace47 = {byArmy: new Map(), land: new Map(), sea: new Map()};
  for (const army of world.armies) {
    const travel = positions.records[army.id];
    const location = armyTravelLocation47(travel, graph);
    const province = location.onLand ? provinces.get(location.cell.provinceId!) : null;
    if (location.onLand && !province) throw Error('军队实际陆地不属于当前世界，已保留原档。');
    if (army.troops <= 0 || army.status === 'destroyed') continue;
    const located: LocatedArmy47 = {
      army, travel, point: location.point, province: province ?? null,
      seaFace: location.onLand ? null : location.cell.face,
    };
    space.byArmy.set(army.id, located);
    if (located.province) {
      const group = space.land.get(located.province.id) ?? [];
      group.push(located); space.land.set(located.province.id, group);
    } else {
      const group = space.sea.get(located.seaFace!) ?? [];
      group.push(located); space.sea.set(located.seaFace!, group);
    }
  }
  return space;
}

/** Occupation follows the entered real cell, never legacy progress===0. A
 * coast stop before crossing remains at sea; retreaters do not hold land. */
export const landHolders47 = (space: ArmySpace47, id: string) =>
  (space.land.get(id) ?? []).filter(v => v.army.status !== 'retreating').map(v => v.army);

/** Existing web ration rates, not a recovered native food formula. Movement
 * comes from the unified ledger even while the legacy Army status is idle. */
export function rationPoints47(location: LocatedArmy47, dayFactor=1): number {
  if(!Number.isFinite(dayFactor)||dayFactor<=0)throw Error('口粮日长无效。');
  if (location.army.status === 'fighting') return 8*dayFactor;
  if (location.army.status === 'retreating') return 5*dayFactor;
  return (location.travel.status === 'moving' || location.travel.status === 'blocked' ? 6 : 4)*dayFactor;
}
export const canRefill47 = (location: LocatedArmy47) =>
  !!location.province && location.army.status === 'idle' &&
  (location.travel.status === 'arrived' || location.travel.status === 'halted');
