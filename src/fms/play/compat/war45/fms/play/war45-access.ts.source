import type {World} from '../../sim/types';
import type {War45Run} from './war45-model';
import type {War26State} from './war26-state';
import {war26Targets} from './war26-state';
import {nationsAtWar} from './realtime-statecraft';
export type MilitaryAccess45=(world:World,nationId:string,controller:string)=>boolean;
export const ownAccess45:MilitaryAccess45=(_w,a,b)=>a===b;
/** FindProvincePath 801DE3/801ECC: own alliance + own vassals, not
 * transitive friendship or every co-belligerent. Hostility takes precedence
 * in this web adapter; permission never transfers control or gives food. */
export function militaryAccess45(r:Pick<War45Run,'alliances'|'vassals'>):MilitaryAccess45{
 return (w,a,b)=>a===b||!nationsAtWar(w,a,b)&&(
  r.alliances.records.some(v=>v.endedTick===null&&v.members.includes(a)&&v.members.includes(b))||
  r.vassals.records.some(v=>v.endedTick===null&&v.overlordId===a&&v.vassalId===b));
}
/** Web coordination adapter over existing fixed objectives. Each ally only
 * helps against its own actual enemies; it does not inherit their wars.
 * No extra diplomatic claim, ownership change or random objective is made. */
export function militaryDistances45(w:World,s:War26State,id:string,access:MilitaryAccess45){
 const places=new Map(w.provinces.map(p=>[p.id,p])),targets=war26Targets(w,s,id);
 for(const ally of w.nations)if(ally.id!==id&&access(w,id,ally.id))for(const target of war26Targets(w,s,ally.id)){
  const p=places.get(target);if(p&&nationsAtWar(w,id,p.controller))targets.add(target);
 }
 const distances=new Map<string,number>(),queue=[...targets];for(const target of queue)distances.set(target,0);
 for(let i=0;i<queue.length;i++){const p=places.get(queue[i])!;for(const key of p.neighbors){const n=places.get(key)!;
  if(!distances.has(key)&&(access(w,id,n.controller)||nationsAtWar(w,id,n.controller))){distances.set(key,distances.get(p.id)!+1);queue.push(key);}
 }}return distances;
}
