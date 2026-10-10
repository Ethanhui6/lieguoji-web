import {graphFor46,type HarborLayout46} from './war46-geography';
import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import type {SeaGraph} from './sea-path';
import {certifiedGeography47,copyGeographyContent47,geographyDependencies47,retainGeographyWitness47,sameGeographyContent47} from './geography-content47';

const cache:{value:unknown;cost:number;graph:SeaGraph}[]=[];
/** The 47 action owner replaces numeric buffers on each transaction. Reuse
 * actual sea topology by full terrain/land/harbor content, not object identity
 * or a short hash. Mutable aliases outside the owner window are rescanned.
 * Controllers, port ownership, blockades and diplomacy remain live consumers.
 * Frozen 46 keeps its original graph implementation and save behavior. */
export function graphFor47(r:{terrain:FmsDocument;world:World;harbors:HarborLayout46}):SeaGraph{
 const dependencies={geography:geographyDependencies47(r),harbors:r.harbors};
 // Promoted/current worlds are at the end. Trying stale mutable witnesses
 // first would still traverse the whole mesh before reaching the fast hit.
 let hit:typeof cache[number]|undefined;
 for(let i=cache.length-1;i>=0;i--)if(sameGeographyContent47(dependencies,cache[i].value)){hit=cache[i];break;}
 // Opening warms this cache before the Session freezes its point mesh. After
 // a complete content hit, promote that old mutable witness to the certified
 // leaves, just as the Army graph does. Numeric samples remain copied/checked.
 if(hit&&certifiedGeography47(dependencies.geography.points)&&(hit.value as typeof dependencies).geography.points!==dependencies.geography.points){const witness=copyGeographyContent47(dependencies);if(witness){cache.splice(cache.indexOf(hit),1);Object.assign(hit,witness);retainGeographyWitness47(cache,hit);}}
 if(hit)return hit.graph;
 // Fresh identities prevent the legacy helper's reference cache from hiding
 // an alias edit after a full-content miss in this owner.
 const graph=graphFor46({...r,terrain:{...r.terrain},harbors:structuredClone(r.harbors)}),witness=copyGeographyContent47(dependencies);
 if(witness)retainGeographyWitness47(cache,{...witness,graph});return graph;
}
