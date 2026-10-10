import {nativeLeaderRoleDefaults} from './native-economy/leader-appointment';
import {nativeFillPastRole,nativePastRoleDefaults,nativeNormalizeTimestamp} from './native-economy/role-history';
import {nativeRoundToEven} from './native-economy/native-round';
import type {Population47,PersonRole47,FamilyPerson47} from './civilization47-population-types';

export function leaderRole47(r:Population47,person:FamilyPerson47,title:string):PersonRole47{
 return {...nativeLeaderRoleDefaults(()=>r.life.gameTime),nativeKind:'leader',holderId:person.id,stateId:person.stateId,title};
}
export function pastRole47(role:PersonRole47|null,time:number,reason:string){
 const out=nativePastRoleDefaults();nativeFillPastRole(out,role,time,reason,{
  nationalLeader:v=>v.nativeKind==='leader'?v:null,patriarch:()=>null,governmentOffice:()=>null,
  normalize:value=>nativeNormalizeTimestamp(value,(n,digits)=>nativeRoundToEven(n,digits)),
 });return out;
}
/** End this real office only; a former ruler remains a living family member. */
export function closeLeaderRole47(r:Population47,nationId:string,reason:string){
 const id=r.people.nations[nationId].leaderId;if(id===null)return;
 const p=r.kin.persons[id],roles=p.roles.filter(role=>role.nativeKind==='leader'&&role.stateId===p.stateId);
 if(roles.length!==1)throw Error('现任领袖角色缺失或重复。');
 p.pastRoles.push(pastRole47(roles[0],r.life.gameTime,reason));p.roles=p.roles.filter(role=>!roles.includes(role));
}
