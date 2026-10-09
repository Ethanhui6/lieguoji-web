import {graphFor46,type HarborLayout46} from './war46-geography';
import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import type {SeaGraph} from './sea-path';
import {copyGeographyContent47,geographyDependencies47,retainGeographyWitness47,sameGeographyContent47} from './geography-content47';

const cache:{value:unknown;cost:number;graph:SeaGraph}[]=[];
/** The 47 action owner replaces numeric buffers on each transaction. Reuse
 * actual sea topology by full terrain/land/harbor content, not object identity
 * or a short hash. Mutable aliases outside the owner window are rescanned.
 * Controllers, port ownership, blockades and diplomacy remain live consumers.
 * Frozen 46 keeps its original graph implementation and save behavior. */
export function graphFor47(r:{terrain:FmsDocument;world:World;harbors:HarborLayout46}):SeaGraph{
 const dependencies={geography:geographyDependencies47(r),harbors:r.harbors},hit=cache.find(e=>sameGeographyContent47(dependencies,e.value));
 if(hit)return hit.graph;
 // Fresh identities prevent the legacy helper's reference cache from hiding
 // an alias edit after a full-content miss in this owner.
 const graph=graphFor46({...r,terrain:{...r.terrain},harbors:structuredClone(r.harbors)}),witness=copyGeographyContent47(dependencies);
 if(witness)retainGeographyWitness47(cache,{...witness,graph});return graph;
}
