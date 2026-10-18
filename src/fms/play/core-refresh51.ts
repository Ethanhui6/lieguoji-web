import type {World} from '../../sim/types';
import {POLITIES,type UpperCombat} from './upper14-state';
import {nativeCoreDistances} from './native-combat/core-distance';
function initialIndex(w:World,id:string,key:string,count:number){let h=2166136261;for(const c of `${w.custom?.seed??''}/${key}/${id}`)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)%count;}
type CoreResult=ReturnType<typeof nativeCoreDistances>|null;
// Private derived cache, never serialized. Each nation is keyed by the exact
// owned order, capital and neighbor identities/controllers consumed by BFS.
const coreCache=new WeakMap<UpperCombat,Map<string,{key:string;result:CoreResult}>>();
function coreContext(w:World){return {graph:w.provinces.map(p=>({id:p.id,stateRef:p.controller,neighbors:p.neighbors})),byId:new Map(w.provinces.map(p=>[p.id,p]))};}
function refreshNationCore(w:World,u:UpperCombat,n:World['nations'][number],context:ReturnType<typeof coreContext>):boolean{
 const year=Math.floor(w.day/360);
 let s=u.nations[n.id];
 if(!s)s=u.nations[n.id]={polity:POLITIES[initialIndex(w,n.id,'native-no-culture-polity',6)],traits:[],destiny:10+initialIndex(w,n.id,'native-destiny',80),coreThreshold:2,coreYear:year,provinceOrder:[]};
 const owned=new Set(w.provinces.filter(p=>p.controller===n.id).map(p=>p.id));
 s.provinceOrder=s.provinceOrder.filter(id=>owned.has(id));const existing=new Set(s.provinceOrder);
 for(const p of w.provinces)if(owned.has(p.id)&&!existing.has(p.id))s.provinceOrder.push(p.id);
 const capital=w.cities.find(c=>c.id===n.capitalId),capitalId=capital&&owned.has(capital.provinceId)?capital.provinceId:undefined;
 const key=JSON.stringify([capitalId,context.graph.map(p=>p.id),s.provinceOrder.map(id=>[id,context.byId.get(id)!.neighbors.map(next=>[next,context.byId.get(next)?.controller])])]);
 let cache=coreCache.get(u);if(!cache){cache=new Map();coreCache.set(u,cache);}
 const old=cache.get(n.id),recomputed=old?.key!==key;
 const distances=recomputed?(capitalId?nativeCoreDistances(context.graph,n.id,capitalId,s.provinceOrder):null):old!.result;
 if(recomputed)cache.set(n.id,{key,result:distances});
 // Always project primitive outputs: even a mutated/replaced province record
// is repaired, so cache hits cannot hide stale or tampered defense values.
 for(const id of s.provinceOrder){u.provinces[id].distance=distances?.[id].distance??2147483647;u.provinces[id].connected=distances?.[id].connected??false;}
 return recomputed;
}
/** Single-country native BFS substage, ready for a future State.Update owner.
 * Annual threshold growth and fiscal settlement deliberately remain separate. */
export function reconcileNationCore(w:World,u:UpperCombat,nationId:string):boolean{
 const nation=w.nations.find(n=>n.id===nationId);if(!nation)throw Error('核心距离缺少国家。');
 return refreshNationCore(w,u,nation,coreContext(w));
}
export function reconcileCore(w:World,u:UpperCombat){
 const nationIds=new Set(w.nations.map(n=>n.id)),context=coreContext(w);
 for(const id of Object.keys(u.nations))if(!nationIds.has(id)){delete u.nations[id];coreCache.get(u)?.delete(id);}
 for(const nation of w.nations)refreshNationCore(w,u,nation,context);
}
