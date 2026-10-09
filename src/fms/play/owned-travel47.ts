import type {ArmyTravel47} from './army-travel47-state';
import type {TravelGraph47,TravelCell47} from './army-travel47-graph';

type Proof={graph:TravelGraph47;version:number;nodes:number[];origin:object;destination:object|undefined};
type Window={proofs:WeakMap<object,Proof>;graphs:Map<TravelGraph47,{size:number;cells:Map<number,{ref:TravelCell47;content:string}>}>};
let active:Window|undefined;
export const isOwnedTravelWindow47=()=>!!active;
/** Synchronous Culture47Session action ONLY: all callbacks are its fixed
 * simulation owners/trace collector. Never wrap a public user callback or an
 * async task. Commit is permitted only after every reached graph cell matches.
 * Static route leaves are frozen, but progress remains independently mutable.
 * Nothing here bypasses dynamic progress, identity, contacts or save checks. */
export function withOwnedTravel47<T>(action:()=>T):T {
  if(active)throw Error('不能嵌套私有行军事务。');
  const window:Window={proofs:new WeakMap(),graphs:new Map()};active=window;
  try{
    const result=action();
    for(const [graph,witness]of window.graphs){
      if(graph.cells.size!==witness.size)throw Error('行军拓扑在推演期间改变，候选未提交。');
      for(const [id,c]of witness.cells)if(graph.cells.get(id)!==c.ref||JSON.stringify(c.ref)!==c.content)throw Error('行军几何在推演期间改变，候选未提交。');
    }
    return result;
  }finally{active=undefined;}
}
export function hasOwnedTravelProof47(s:ArmyTravel47,g:TravelGraph47):boolean {
  const p=active?.proofs.get(s);
  return !!p&&p.graph===g&&p.version===s.version&&p.nodes===s.nodes&&p.origin===s.origin&&p.destination===(s.version===2?s.destination:undefined);
}
/** Called only AFTER the public static topology/endpoints have been checked. */
export function rememberOwnedTravel47(s:ArmyTravel47,g:TravelGraph47):void {
  if(!active)return;
  let witness=active.graphs.get(g);if(!witness){witness={size:g.cells.size,cells:new Map()};active.graphs.set(g,witness);}
  for(const id of s.nodes)if(!witness.cells.has(id)){const cell=g.cells.get(id)!;witness.cells.set(id,{ref:cell,content:JSON.stringify(cell)});}
  Object.freeze(s.nodes);Object.freeze(s.origin);if(s.version===2)Object.freeze(s.destination);
  active.proofs.set(s,{graph:g,version:s.version,nodes:s.nodes,origin:s.origin,destination:s.version===2?s.destination:undefined});
}
/** Outside a private window (including generic observers), keep a deep copy.
 * Within it, share only leaves frozen by a completed geometry validation. */
export function cloneTravel47(s:ArmyTravel47):ArmyTravel47 {
  const proof=active?.proofs.get(s);
  if(proof&&hasOwnedTravelProof47(s,proof.graph)){const copy={...s};active!.proofs.set(copy,proof);return copy;}
  return s.version===2?{...s,origin:{...s.origin},nodes:[...s.nodes],destination:{...s.destination}}:{...s,origin:{...s.origin},nodes:[...s.nodes]};
}
export function cloneForceTravelRecords47<T extends {travel:ArmyTravel47}>(input:readonly T[]):T[]{
  return active?input.map(f=>({...f,travel:cloneTravel47(f.travel)})):structuredClone([...input]);
}
