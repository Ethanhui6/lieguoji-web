/** AppointLeader 506C10 and EndCurrentLeaderReign 5C5BC0. Runtime role
 * projection, names, snapshots, title localization, event construction and
 * reform are ports, not synthesized replacements for those subsystems. */
import {f,iadd} from './numeric';
import type {NativeHistoryRole,NativePastRole} from './role-history';

export interface NativeLeaderRole extends NativeHistoryRole {holderId:number;title:string|null;reignStartTime:number;stateId:number}
export interface NativeAppointee {id:number;isAlive:boolean;gender:number;familyId:number;stateId:number;isHistoricallyImportant:boolean;traits:readonly ({canReform:boolean}|null)[]|null}
export interface NativeLeaderRecord<P> {
 leaderId:number;leaderName:string|null;leaderTitle:string|null;leaderOrder:number;
 reignStartTime:number;reignEndTime:number;successionType:string|null;endType:string|null;
 startSnapshot:P|null;endSnapshot:P|null;
 warsInitiated:number;warsDefended:number;warsAsAlly:number;warsWon:number;warsLost:number;warsDrawn:number;
 conquestWars:number;liberationWars:number;civilWars:number;vassalizationWars:number;rebelWars:number;
 regularRebelWars:number;familyRebelWars:number;rebellionsSuppressed:number;regularRebellionsSuppressed:number;
 familyRebellionsSuppressed:number;alliancesFormed:number;diplomacyEvents:number;
}
export interface NativeAppointmentState<P> {
 i:number;leaderId:number;politicalSystem:number;cachedName:string|null;
 currentLeaderRecord:NativeLeaderRecord<P>|null;leaderHistory:(NativeLeaderRecord<P>|null)[]|null;
 isNeedNameLabelUpdate:boolean;lastElectionTime:number;currentLeaderTerms:number;
}
export function nativeLeaderRecordDefaults<P>():NativeLeaderRecord<P>{return {
 leaderId:0,leaderName:null,leaderTitle:null,leaderOrder:0,reignStartTime:0,reignEndTime:-1,successionType:null,endType:null,startSnapshot:null,endSnapshot:null,
 warsInitiated:0,warsDefended:0,warsAsAlly:0,warsWon:0,warsLost:0,warsDrawn:0,conquestWars:0,liberationWars:0,civilWars:0,vassalizationWars:0,rebelWars:0,regularRebelWars:0,familyRebelWars:0,rebellionsSuppressed:0,regularRebellionsSuppressed:0,familyRebellionsSuppressed:0,alliancesFormed:0,diplomacyEvents:0,
};}
/** 885870 sets the derived reignStartTime, not base Role.startTime. */
export function nativeLeaderRoleDefaults(gameTime:()=>number):NativeLeaderRole{return {holderId:0,startTime:0,roleType:'NationalLeader',title:null,reignStartTime:f(gameTime()),stateId:0};}
function required<T>(value:T|null):T{if(value===null)throw Error('Missing reached native appointment input');return value;}
/** Stable in-place List.RemoveAll for pure role projections. */
function removeAll<T>(list:T[],predicate:(item:T)=>boolean):void{let n=0;for(const item of list)if(!predicate(item))list[n++]=item;list.length=n;}
export function nativeEndLeaderReign<P>(state:NativeAppointmentState<P>,reason:string|null,p:{gameTime:()=>number;snapshot:(state:NativeAppointmentState<P>)=>P}):void{
 if(state.currentLeaderRecord===null)return;
 state.currentLeaderRecord.endType=reason;
 const timed=required(state.currentLeaderRecord),time=f(p.gameTime()),snapshotTarget=state.currentLeaderRecord;
 timed.reignEndTime=time;
 const snapshot=p.snapshot(state);required(snapshotTarget).endSnapshot=snapshot;
 required(state.leaderHistory).push(state.currentLeaderRecord);state.currentLeaderRecord=null;
}
export interface NativeAppointmentPorts<S,C,R,P,E> {
 roles:(person:C)=>(R|null)[]|null;pastRoles:(person:C)=>NativePastRole[]|null;
 nationalLeader:(role:R)=>NativeLeaderRole|null;
 pastRole:(role:R,time:number,reason:string)=>NativePastRole;
 createLeaderRole:()=>R&NativeLeaderRole;
 gameTime:()=>number;fullName:(person:C)=>string|null;
 title:(politicalSystem:number,gender:number,language:null)=>string|null;
 familyManager:()=>{getFamily:(id:number)=>{id:number;surname:string|null}|null;getRulingFamily:(stateId:number)=>{id:number}|null;setRulingFamily:(stateId:number,familyId:number)=>void}|null;
 endReign:(state:S,reason:string)=>void;snapshot:(state:S)=>P;
 createAscensionEvent:(state:S,leaderId:number,previousId:number,kind:string|null,time:number)=>E;
 recordGlobal:(event:E)=>void;reform:(state:S,person:C)=>void;
 log:(message:string)=>void;error:(message:string)=>void;
}
function roleEndReason(alive:boolean,kind:string|null):string{return !alive?'death':kind==='hereditary'?'succession':kind==='rebellion'||kind==='coup'?'overthrown':'resignation';}
function reignEndReason(alive:boolean,kind:string|null):string{return !alive?'death':kind==='election'?'election':kind==='rebellion'||kind==='coup'?'coup':kind==='abdication'?'abdication':'succession';}
export function nativeAppointLeader<P,S extends NativeAppointmentState<P>,C extends NativeAppointee,R extends NativeHistoryRole,E>(state:S|null,leader:C|null,kind:string|null,previous:C|null,p:NativeAppointmentPorts<S,C,R,P,E>):void{
 if(state===null||leader===null){p.error('[StateManager] AppointLeader: Invalid state or leader');return;}
 const s=state,c=leader,isLeader=(r:R|null)=>r!==null&&p.nationalLeader(r)!==null;
 if(previous!==null&&previous.id!==c.id){
  const matches=(r:R|null)=>r!==null&&p.nationalLeader(r)?.stateId===s.i;
  const selected=required(p.roles(previous)).filter(matches);
  for(const role of selected){const reason=roleEndReason(previous.isAlive,kind),time=f(p.gameTime()),past=p.pastRole(required(role),time,reason);required(p.pastRoles(previous)).push(past);}
  removeAll(required(p.roles(previous)),matches);
  p.log(`[StateManager] Moved leader role to history for previous leader: ${p.fullName(previous)??''}`);
 }
 const oldLeaderId=s.leaderId;s.leaderId=c.id;
 const selected=required(p.roles(c)).filter(isLeader);
 for(const role of selected){const time=f(p.gameTime()),past=p.pastRole(required(role),time,'promotion');required(p.pastRoles(c)).push(past);}
 removeAll(required(p.roles(c)),isLeader);
 const role=p.createLeaderRole();role.holderId=c.id;role.stateId=s.i;role.title=p.title(s.politicalSystem,c.gender,null);role.reignStartTime=f(p.gameTime());
 required(p.roles(c)).push(role);c.isHistoricallyImportant=true;if(c.stateId!==s.i)c.stateId=s.i;
 if(c.familyId>0){
  const family=required(p.familyManager()).getFamily(c.familyId);
  if(family!==null){const ruling=required(p.familyManager()).getRulingFamily(s.i);if(ruling===null||ruling.id!==family.id){required(p.familyManager()).setRulingFamily(s.i,family.id);p.log(`[StateManager] Set ${family.surname??''} as ruling family for ${s.cachedName??''}`);}}
 }
 if(s.currentLeaderRecord!==null&&previous!==null&&previous.id!==c.id)p.endReign(s,reignEndReason(previous.isAlive,kind));
 if(s.currentLeaderRecord===null){
  s.currentLeaderRecord=nativeLeaderRecordDefaults<P>();s.currentLeaderRecord.leaderId=c.id;
  const named=required(s.currentLeaderRecord);named.leaderName=p.fullName(c);
  required(s.currentLeaderRecord).successionType=kind;
  const timed=required(s.currentLeaderRecord);timed.reignStartTime=f(p.gameTime());
  const history=required(s.leaderHistory);let order=1;
  if(history.length>0){let max=required(history[0]).leaderOrder;for(let i=1;i<history.length;i++)max=Math.max(max,required(history[i]).leaderOrder);order=iadd(max,1);}
  required(s.currentLeaderRecord).leaderOrder=order;
  const titled=required(s.currentLeaderRecord);titled.leaderTitle=p.title(s.politicalSystem,c.gender,null);
  const snapshotted=required(s.currentLeaderRecord);snapshotted.startSnapshot=p.snapshot(s);
  p.log(`[StateManager] Created leader record for ${p.fullName(c)??''}, order: ${order}`);
 }
 if(kind!=='initial'){
  const leaderId=c.id,previousId=oldLeaderId>0?oldLeaderId:previous?.id??0,time=f(p.gameTime());
  p.recordGlobal(p.createAscensionEvent(s,leaderId,previousId,kind,time));
 }
 s.isNeedNameLabelUpdate=true;
 if(s.politicalSystem===3||s.politicalSystem===2){s.lastElectionTime=f(p.gameTime());s.currentLeaderTerms=1;}
 if(c.traits!==null)for(const trait of c.traits){if(required(trait).canReform){p.reform(s,c);break;}}
 p.log(`[StateManager] Appointed ${p.fullName(c)??''} as ${role.title??''} of ${s.cachedName??''} (Type: ${kind??''})`);
}
