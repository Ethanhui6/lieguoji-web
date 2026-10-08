import {allianceOf46} from './war46-alliance';
import type {War46Run} from './war46-model';
import type {War46Campaign,War46Wars} from './war46-wars';
import {nativeBuildWarSides,nativeOpposingPrincipals,type NativeSideMember} from './native-war/side-builder';
import {overlord46} from './war46-vassals';
export const participantNationIds46=(s:War46Wars,c:War46Campaign)=>[...c.participants,...c.destroyedParticipants].map(p=>s.nationIds.find(n=>n[0]===p.stateId)![1]);
export function opposedPairs46(s:War46Wars,c:War46Campaign,currentOnly=false):[string,string][]{
 const all=currentOnly?c.participants:[...c.participants,...c.destroyedParticipants],pairs:[string,string][]=[];
 for(const a of all.filter(p=>p.side===0))for(const b of all.filter(p=>p.side===1))pairs.push([s.nationIds.find(n=>n[0]===a.stateId)![1],s.nationIds.find(n=>n[0]===b.stateId)![1]]);
 return pairs;
}
export const diplomaticEndPairs46=(s:War46Wars,c:War46Campaign)=>opposedPairs46(s,c,!!c.coalition);
export const coversPair46=(c:War46Campaign,s:War46Wars,a:string,b:string)=>opposedPairs46(s,c).some(p=>p.includes(a)&&p.includes(b));
export function coalitionPeaceDetails46(r:War46Run,a:string,b:string){
 const wars=r.nativeWars.campaigns.filter(c=>c.endedTick===null&&coversPair46(c,r.nativeWars,a,b)),war=wars[0];
 if(!war)return [];
 const names=participantNationIds46(r.nativeWars,war).map(id=>r.world.nations.find(n=>n.id===id)!.name);
 return [`此次结束战争 ${war.id}，参战国家：${names.join('、')}。`,`${wars.length>1?'双方还有其他战争，结束本场后仍可能交战。':'同一场战争的其他参战国一并停战。'}上帝干预停战不执行割地、赔款或附庸和约。`];
}
export function buildParticipants46(r:War46Run,attacker:string,defender:string,internal?:War46Campaign['internal']){
 const states=r.world.nations.map(n=>({id:r.people.nations[n.id].id,key:n.id,dead:!r.world.provinces.some(p=>p.controller===n.id)})),find=(id:string)=>states.find(n=>n.key===id)??null;
 const a=find(attacker),b=find(defender);if(!a||!b)throw Error('战争主攻或主守国家缺失。');
 const members=nativeBuildWarSides({attackerId:a.id,defenderId:b.id,internal:!!internal,rebelStateId:internal?.rebelStateId??-1,motherStateId:internal?.motherStateId??-1},r.life.gameTime,{
  state:id=>states.find(s=>s.id===id)??null,
  allianceMembers:s=>(allianceOf46(r,s.key)?.members??[]).map(find),isOverlord:s=>r.vassals.records.some(v=>v.endedTick===null&&v.overlordId===s.key),
  vassals:s=>r.vassals.records.filter(v=>v.endedTick===null&&v.overlordId===s.key).map(v=>find(v.vassalId)),
  isVassal:s=>overlord46(r,s.key)!==null,overlord:s=>{const id=overlord46(r,s.key);return id?find(id):null;},
 });
 if(!nativeOpposingPrincipals(members,a.id,b.id))throw Error('主攻与主守不能组成相对战方，未发动战争。');
 return members;
}
/** Existing pairwise navigation/combat reads these real hostilities. A single
 * campaign owns all pairs; extra pairs must not become fake separate wars. */
export function openCoalitionRelations46(r:War46Run,members:readonly NativeSideMember[]){
 const key=(id:number)=>r.world.nations.find(n=>r.people.nations[n.id].id===id)!.id;
 for(const a of members.filter(p=>p.side===0))for(const b of members.filter(p=>p.side===1)){
  const ka=key(a.stateId),kb=key(b.stateId),p=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(ka)&&[p.a,p.b].includes(kb));
  if(!p)throw Error('参战双方外交关系缺失。');
  if(p.status!=='war'){p.status='war';p.sinceDay=r.world.day;p.truceUntilDay=0;}
 }
}
