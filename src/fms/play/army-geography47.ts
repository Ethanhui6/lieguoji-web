import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {geographyBinding} from './war30-geography';
import {buildArmyTravelGraph47, type TravelGraph47} from './army-travel47-graph';
import type {ArmyPositions47} from './army-presence47';
import {readArmySpace47} from './army-space47';

type Input = {terrain: FmsDocument; world: World; armyPositions: ArmyPositions47; transports: {cargo: {army: {id: string}}[]}};
const cache = new Map<string, TravelGraph47>();

/** Session-side geometry only. Commands may contain targets, never graphs or
 * routes. Recompute the terrain/province binding before using the bounded
 * cache, so a same-ID but changed coastline cannot reuse an old position book.
 * This is the existing geometry identity, not an authentication checksum. */
export function armySpatialFor47(run: Input) {
  const binding = geographyBinding(run);
  if (run.armyPositions.binding !== binding) throw Error('军队位置与当前地形不一致，已保留原世界。');
  let graph = cache.get(binding);
  if (!graph) {
    graph = buildArmyTravelGraph47(run.terrain, run.world);
    if (cache.size >= 4) cache.delete(cache.keys().next().value!);
    cache.set(binding, graph);
  }
  const input = {graph, binding, positions: run.armyPositions, cargoIds: run.transports.cargo.map(c => c.army.id)};
  readArmySpace47(run.world, input);
  return input;
}
