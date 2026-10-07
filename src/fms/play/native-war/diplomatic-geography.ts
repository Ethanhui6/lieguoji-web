import type {NativeWarProvince,NativeWarLookup} from '../war26-native';
interface NeighborSet {clear:()=>void;add:(id:number)=>unknown}
export interface NativeNeighborState {
 id:number;provinces:readonly (NativeWarProvince|null)[]|null;
 neighbors:NeighborSet|null;seaNeighbors:NeighborSet|null;
}
const required=<T>(v:T|null|undefined):T=>{if(v==null)throw Error('Native null reference');return v;};
/** UpdateNeighborState 5DECB0 adjacency fragment, excluding its later color
 * changes. A logical water PROVINCE is one hop; render triangles and harbor
 * reachability are not interchangeable inputs. lookup must throw on invalid
 * native list indices. Null results/collections also throw. Writes are ordered
 * and in-place; web callers should provide their private transaction candidate.
 * Provinces are ordinary objects: seed/visited identity is by reference. */
export function nativeUpdateDiplomaticNeighbors(s:NativeNeighborState,lookup:NativeWarLookup):void{
 required(s.neighbors).clear();required(s.seaNeighbors).clear();
 const water=new Set<NativeWarProvince>();
 const addForeign=(p:NativeWarProvince,set:()=>NeighborSet|null)=>{if(p.stateId!==s.id&&p.stateId!==0)required(set()).add(p.stateId);};
 for(const source of required(s.provinces))for(const id of required(required(source).neighbors)){
  const p=required(lookup(id));if(p.isLand)addForeign(p,()=>s.neighbors);else water.add(p);
 }
 const queue=[...water],visited=new Set<NativeWarProvince>();let head=0;
 for(let round=0;round<4;round++){
  const end=queue.length;
  while(head<end){
   const p=queue[head++];if(visited.has(p))continue;visited.add(p);
   for(const id of required(p.neighbors)){
    const n=required(lookup(id));
    if(n.isLand)addForeign(n,()=>s.seaNeighbors);else if(!visited.has(n))queue.push(n);
   }
  }
 }
}
