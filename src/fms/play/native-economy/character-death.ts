/** Character.Die 83AEB0. This method has no alive/idempotence guard and no
 * random draw. Monthly selection and private-world rollback belong to callers.
 * Role projection must reflect runtime inheritance, never the roleType text. */
import {f} from './numeric';
import type {NativeHistoryRole,NativePastRole} from './role-history';
export interface NativeDyingCharacter<R> {
 id:number;isAlive:boolean;deathTime:number;spouseId:number;familyId:number;
 roles:(R|null)[]|null;pastRoles:NativePastRole[]|null;
}
export interface NativeDeathPorts<C,R,S,F,E> {
 gameTime:()=>number;
 characterManager:()=>{getCharacter:(id:number)=>C|null}|null;
 roles:(person:C)=>readonly (R|null)[]|null;
 nationalLeader:(role:R)=>{stateId:number;startTime:number}|null;
 stateManager:()=>{getState:(id:number)=>S|null}|null;
 familyManager:()=>{getFamily:(id:number)=>F|null;handlePatriarchSuccession:(family:F)=>void}|null;
 dismissOffices:(person:C,reason:'death')=>void;
 getYearSince:(time:number)=>number;
 createDeathEvent:(state:S,personId:number,cause:'natural',reignYears:number,time:number)=>E;
 recordGlobal:(event:E)=>void;recordState:(state:S,event:E,showPopup:false)=>void;
 pastRole:(role:R|null,time:number,reason:'death')=>NativePastRole;
 resolveState:(state:S,previous:C,reason:'death')=>boolean;
}
function required<T>(value:T|null):T{if(value===null)throw Error('Missing reached native death input');return value;}
export function nativeCharacterDie<R extends NativeHistoryRole,C extends NativeDyingCharacter<R>,S,F extends {patriarchId:number},E>(c:C,p:NativeDeathPorts<C,R,S,F,E>):void{
 c.isAlive=false;c.deathTime=f(p.gameTime());
 if(c.spouseId>0){const spouse=required(p.characterManager()).getCharacter(c.spouseId);if(spouse!==null)spouse.spouseId=0;}
 const isLeader=(r:R|null)=>r!==null&&p.nationalLeader(r)!==null;
 const firstLeader=()=>{const role=required(p.roles(c)).find(isLeader);return role===undefined||role===null?null:p.nationalLeader(role);};
 const wasLeader=required(p.roles(c)).some(isLeader);let state:S|null=null,stateId=0;
 if(wasLeader){const role=firstLeader();if(role!==null&&role.stateId>0){stateId=role.stateId;state=required(p.stateManager()).getState(stateId);}}
 let wasPatriarch=false;
 if(c.familyId>0){const family=required(p.familyManager()).getFamily(c.familyId);wasPatriarch=family!==null&&family.patriarchId===c.id;}
 p.dismissOffices(c,'death');
 if(wasLeader&&state!==null){
  const role=firstLeader(),years=role===null?0:p.getYearSince(role.startTime),id=c.id,time=f(p.gameTime());
  const event=p.createDeathEvent(state,id,'natural',years,time);p.recordGlobal(event);p.recordState(state,event,false);
 }
 // The native loop enumerates current roles after office dismissal/history,
 // then reopens the raw role list for Clear. Production ports must not mutate
 // that list during this enumeration; IL2CPP list-version traps are not modeled.
 for(const role of required(p.roles(c))){
  const time=f(p.gameTime()),past=p.pastRole(role,time,'death');
  c.pastRoles??=[];c.pastRoles.push(past);
 }
 c.roles??=[];c.roles.length=0;
 if(wasLeader&&state!==null&&stateId!==0)p.resolveState(state,c,'death');
 if(wasPatriarch&&c.familyId>0){
  const family=required(p.familyManager()).getFamily(c.familyId);
  if(family!==null)required(p.familyManager()).handlePatriarchSuccession(family);
 }
}
