import type {Life22Run} from './life22-model';
import type {NativeRegisteredCharacter} from './native-economy/character-registry';
import type {NativeSpouseRole} from './native-economy/family-members';
import {nativeLastName,nativeFullName,nativeFullNameCulture,nativeNameOrder} from './native-culture/full-name';
import {originalNamingCulture} from './native-culture/original-naming';
import {nativeDefaultCulture} from './native-culture/default-culture';
import {nativeGetYearSince,nativeUpdateCharacterAge} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {nativeFindSuccessor} from './native-economy/family-succession';

export type KinPerson=NativeRegisteredCharacter<string,NativeSpouseRole>&{source:'founding'|'initial-family';initialAge:number|null};
export type KinRecord=KinPerson|{id:number;source:'legacy-unknown'|'web-observed'};
export type KinFamily={id:number;surname:string;cultureName:string;nationId:string;stateId:number;headId:number;allowFemaleInheritance:boolean;memberIds:number[];collateralMemberIds:number[]};
export type KinState={version:1;origin:'native-initial-family-web-stream-v1';revision:number;ageTime:number;lastAgeMonth:number;persons:Record<string,KinRecord>;families:Record<string,KinFamily>};
export const isKnownKin=(p:KinRecord|undefined):p is KinPerson=>!!p&&(p.source==='founding'||p.source==='initial-family');
export const emptyKin=(r:Life22Run):KinState=>({version:1,origin:'native-initial-family-web-stream-v1',revision:0,ageTime:r.life.gameTime,lastAgeMonth:r.life.lastAgeMonth,persons:Object.fromEntries(Object.values(r.people.persons).map(p=>[p.id,{id:p.id,source:'legacy-unknown'}])),families:{}});
export function kinLastName(r:Pick<Life22Run,'naming'>,p:KinPerson):string{return nativeLastName(p.originalFamilyId,p.familyId,p.lastName,id=>r.naming.families[id]??null);}
export function kinName(r:Pick<Life22Run,'naming'|'culture'>,p:KinPerson):string{
 const c=nativeFullNameCulture(p.originalFamilyId,p.familyId,id=>r.naming.families[id]??null,id=>{const map=r.culture.maps[id];return map?originalNamingCulture(map.baseCultureId):null;});
 return nativeFullName(p.firstName,kinLastName(r,p),c?nativeNameOrder(c,()=>nativeDefaultCulture(r.naming.language)):null);
}
export function kinHeir(s:KinState,headId:number):KinPerson|null{
 const head=s.persons[headId];if(!isKnownKin(head))return null;const family=s.families[head.familyId];if(!family)return null;
 return nativeFindSuccessor(family,head,id=>{const p=s.persons[id];return isKnownKin(p)?p:null;},()=>null);
}
/** Only already-observed people enter unknown records. No surname inference. */
export function reconcileKin(s:KinState,r:Pick<Life22Run,'people'|'life'>):void{
 for(const p of Object.values(r.people.persons)){const known=s.persons[p.id];if(!known){s.persons[p.id]={id:p.id,source:'web-observed'};s.revision++;}else if(isKnownKin(known))known.isAlive=p.alive;}
 if(s.lastAgeMonth===r.life.lastAgeMonth)return;
 const calendar=createNativeIsoCalendar(r.life.startDate);
 for(const p of Object.values(s.persons))if(isKnownKin(p))nativeUpdateCharacterAge(p,b=>nativeGetYearSince(b,r.life.gameTime,r.life.secondsPerDay,calendar));
 s.lastAgeMonth=r.life.lastAgeMonth;s.ageTime=r.life.gameTime;s.revision++;
}
