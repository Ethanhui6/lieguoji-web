import type {World} from '../../sim/types';
import type {SeaGraph} from './sea-path';
import type {Voyages} from './voyage24-state';
import {nationsAtWar} from './realtime-statecraft';
import {landComponents} from './voyage24-geography';
import {NativeWarIdSet,nativeChooseOccupyCount,nativeGrowClaimComponent,nativeProvinceDistance,type NativeWarProvince} from './war26-native';
export type War26Goal={nationId:string;enemyId:string;provinceIds:string[];requestedCount:number;entry:'land'|'sea'|'unavailable'};
export type War26Campaign={id:string;a:string;b:string;sinceDay:number;openedTick:number;endedTick:number|null;initialOwners:Record<string,string>;goals:War26Goal[]};
export type War26State={version:1;revision:number;campaigns:War26Campaign[]};
export type War26Context={state:War26State;graph:SeaGraph;voyages:Voyages;reservedArmyIds:Set<string>;strength:(world:World,nationId:string)=>number};
export const initialWar26=():War26State=>({version:1,revision:0,campaigns:[]});
/** Web adapter: dense IDs and planar coordinates for the recovered leaf rules.
 * Entry ranking is web policy, not recovered BuildConnectedClaimProvinces. */
export function buildWar26Goal(w:World,g:SeaGraph,nationId:string,enemyId:string,strength:(w:World,id:string)=>number):War26Goal{
 const numberById=new Map(w.provinces.map((p,i)=>[p.id,i])),nations=new Map(w.nations.map((n,i)=>[n.id,i])),positions=w.provinces.map(p=>({x:p.center.x,y:0,z:p.center.y}));
 const provinces:NativeWarProvince[]=w.provinces.map((p,i)=>({id:i,center:i,stateId:nations.get(p.controller)!,isLand:true,neighbors:new NativeWarIdSet(p.neighbors.map(id=>numberById.get(id)!))})),lookup=(id:number)=>provinces[id]??null;
 const enemy=w.provinces.filter(p=>p.controller===enemyId),ours=w.provinces.filter(p=>p.controller===nationId),distance=(a:NativeWarProvince,b:NativeWarProvince|null)=>nativeProvinceDistance(a,b,()=>positions),near=(id:string)=>ours.reduce((best,p)=>Math.min(best,distance(provinces[numberById.get(id)!],provinces[numberById.get(p.id)!])),Infinity);
 const contact=(id:string)=>w.provinces[numberById.get(id)!].neighbors.filter(n=>w.provinces[numberById.get(n)!].controller===nationId).length;
 const land=enemy.filter(p=>contact(p.id)>0).sort((a,b)=>contact(b.id)-contact(a.id)||near(a.id)-near(b.id)||numberById.get(a.id)!-numberById.get(b.id)!);
 const lands=landComponents(w,g),starts=g.ports.filter(p=>ours.some(o=>o.id===p.provinceId));
 // Match the transport executor before freezing a goal: a same-continent port
 // behind neutral territory is not an executable overseas landing entry.
 const seaIds=new Set(g.ports.filter(p=>starts.some(from=>lands.get(from.provinceId)!==lands.get(p.provinceId)&&g.nodes.get(from.node)!.component===g.nodes.get(p.node)!.component)).map(p=>p.provinceId));
 const sea=enemy.filter(p=>seaIds.has(p.id)).sort((a,b)=>near(a.id)-near(b.id)||numberById.get(a.id)!-numberById.get(b.id)!);
 const seed=land[0]??sea[0],count=enemy.length?nativeChooseOccupyCount(strength(w,nationId),strength(w,enemyId),enemy.length):0,result:number[]=[];
 if(seed)nativeGrowClaimComponent(provinces[numberById.get(seed.id)!],nations.get(enemyId)!,count,result,new NativeWarIdSet(),lookup,distance);
 return {nationId,enemyId,provinceIds:result.map(i=>w.provinces[i].id),requestedCount:count,entry:land.length?'land':seed?'sea':'unavailable'};
}
export function reconcileWar26(w:World,state:War26State,g:SeaGraph,tick:number,strength:(w:World,id:string)=>number){
 const active=new Set<string>();for(const r of w.statecraft!.relations){if(r.status!=='war')continue;const id=`${r.a}/${r.b}/${r.sinceDay}`;active.add(id);if(state.campaigns.some(c=>c.id===id&&c.endedTick===null))continue;
  // A declaration begins a new fixed plan; territory changes never reroll it.
  state.campaigns.push({id,a:r.a,b:r.b,sinceDay:r.sinceDay,openedTick:tick,endedTick:null,initialOwners:Object.fromEntries(w.provinces.map(p=>[p.id,p.controller])),goals:[buildWar26Goal(w,g,r.a,r.b,strength),buildWar26Goal(w,g,r.b,r.a,strength)]});state.revision++;
 }
 for(const c of state.campaigns)if(c.endedTick===null&&!active.has(c.id)){c.endedTick=tick;state.revision++;}
 // Recent plans supplement the permanent chronicle, whose history is separate.
 if(state.campaigns.length>1500){state.campaigns=state.campaigns.filter(c=>c.endedTick===null).concat(state.campaigns.filter(c=>c.endedTick!==null).slice(-200));state.revision++;}
}
export function war26Targets(w:World,s:War26State,nationId:string){const p=new Map(w.provinces.map(p=>[p.id,p]));return new Set(s.campaigns.filter(c=>c.endedTick===null).flatMap(c=>c.goals.filter(g=>g.nationId===nationId&&nationsAtWar(w,nationId,g.enemyId)).flatMap(g=>g.provinceIds.filter(id=>p.get(id)?.controller===g.enemyId))));}
/** Distances to a fixed goal through own/hostile land only. Neutral borders and
 * ocean are absent; combat and supply checks remain in the military core. */
export function war26Distances(w:World,s:War26State,nationId:string){
 const provinces=new Map(w.provinces.map(p=>[p.id,p])),targets=war26Targets(w,s,nationId),distance=new Map<string,number>(),queue=[...targets];for(const id of queue)distance.set(id,0);
 for(let i=0;i<queue.length;i++){const p=provinces.get(queue[i])!;for(const id of p.neighbors){const n=provinces.get(id)!;if(!distance.has(id)&&(n.controller===nationId||nationsAtWar(w,nationId,n.controller))){distance.set(id,distance.get(p.id)!+1);queue.push(id);}}}return distance;
}
