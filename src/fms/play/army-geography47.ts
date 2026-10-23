import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {geographyBinding} from './war30-geography';
import {buildArmyTravelGraph47,sealTravelGraph47, type TravelGraph47} from './army-travel47-graph';
import type {ArmyPositions47} from './army-presence47';
import {readArmySpace47} from './army-space47';
import {certifiedGeography47,copyGeographyContent47,geographyDependencies47,ownedTerrainWindow47,retainGeographyWitness47,sameGeographyContent47} from './geography-content47';

type Input = {terrain: FmsDocument; world: World; armyPositions: ArmyPositions47; transports: {cargo: {army: {id: string}}[]}};
const cache:{value:unknown;cost:number;binding:string;graph:TravelGraph47}[]=[];

// Inside one owner window the same frozen terrain and the same certified
// province outlines are the same geography: skip the content comparison.
let recent:{terrain:object;outlines:unknown[];result:{graph:TravelGraph47;binding:string}}|undefined;
const sameOutlines=(world:World,outlines:readonly unknown[])=>world.provinces.length*3===outlines.length&&world.provinces.every((p,i)=>p.id===outlines[3*i]&&p.polygon===outlines[3*i+1]&&p.neighbors===outlines[3*i+2]&&certifiedGeography47(p.polygon)&&certifiedGeography47(p.neighbors));
/** Session-side geometry only. Commands may contain targets, never graphs or
 * routes. Recompute the terrain/province binding before using the bounded
 * cache, so a same-ID but changed coastline cannot reuse an old position book.
 * This is the existing geometry identity, not an authentication checksum. */
export function armyGeographyFor47(run:Pick<Input,'terrain'|'world'>) {
  if(recent&&recent.terrain===run.terrain&&ownedTerrainWindow47(run.terrain)&&sameOutlines(run.world,recent.outlines))return recent.result;
  const dependencies=geographyDependencies47(run),hit=cache.find(e=>sameGeographyContent47(dependencies,e.value));
  // Creation may have warmed this cache before the private owner froze the
  // topology. Promote that already-equal witness once; otherwise every later
  // hit would keep comparing the old mutable copy of the complete point mesh.
  if(hit&&certifiedGeography47(dependencies.points)&&(hit.value as typeof dependencies).points!==dependencies.points){const witness=copyGeographyContent47(dependencies);if(witness){cache.splice(cache.indexOf(hit),1);Object.assign(hit,witness);retainGeographyWitness47(cache,hit);}}
  const binding = hit?.binding??geographyBinding(run);
  let graph = hit?.graph;
  if (!graph) {
    graph = buildArmyTravelGraph47(run.terrain, run.world);sealTravelGraph47(graph);
    const witness=copyGeographyContent47(dependencies);if(witness)retainGeographyWitness47(cache,{...witness,binding,graph});
  }
  const result={graph,binding};
  if(ownedTerrainWindow47(run.terrain))recent={terrain:run.terrain,outlines:run.world.provinces.flatMap(p=>[p.id,p.polygon,p.neighbors]),result};
  return result;
}
export function armySpatialFor47(run: Input) {
  const {graph,binding}=armyGeographyFor47(run);
  if (run.armyPositions.binding !== binding) throw Error('军队位置与当前地形不一致，已保留原世界。');
  const input = {graph, binding, positions: run.armyPositions, cargoIds: run.transports.cargo.map(c => c.army.id)};
  const space=readArmySpace47(run.world, input);
  return {...input,space};
}
