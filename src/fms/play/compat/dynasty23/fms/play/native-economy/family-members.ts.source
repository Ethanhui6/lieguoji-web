/** Original initial family generation: 5C9D40 / 5C83C0 / 5C8940 / 5C97A0.
 * All mutations target the caller's private candidate. These functions are not
 * atomic, never invent missing old relations, and do not appoint a ruler. */
import {f,finite,int32,iadd} from './numeric';
import type {CharacterRandom} from './character-generation';
export interface NativeFamilyMember {
 id:number;gender:number;age:number;isAlive:boolean;birthTime:number;lastName:string|null;
 familyId:number;stateId:number;spouseId:number;marriageType:number;fatherId:number;motherId:number;
 childrenIds:number[]|null;roles:unknown[]|null;
}
export interface NativeInitialFamily {id:number;stateId:number;cultureName:string|null;memberIds:number[]|null}
export interface NativeSpouseRole {roleType:'Spouse';holderId:number;startTime:number;spouseOfId:number;stateId:number}
export function nativeSpouseRoleDefaults():NativeSpouseRole{return {roleType:'Spouse',holderId:0,startTime:0,spouseOfId:0,stateId:0};}
export interface NativeFamilyMemberPorts<C extends NativeFamilyMember> {
 /** Calls 838EE0 and projects only its person result, ignoring effective culture. */
 generateInit:(culture:string|null,gender:number,father:C|null)=>C|null;
 getCharacter:(id:number)=>C|null;lastName:(person:C)=>string|null;
 random:CharacterRandom;birthTimeFromAge:(age:number)=>number;updateAge:(person:C)=>void;
 gameTime:()=>number;createSpouseRole:()=>NativeSpouseRole;reportMissingSpouse:(leader:C)=>void;
 generateCollateralHousehold:(member:C,family:NativeInitialFamily,culture:string|null,isCousin:boolean)=>void;
}
function required<T>(x:T|null):T{if(x===null)throw Error('Missing reached native family relation');return x;}
function floatDraw(random:CharacterRandom,min:number,max:number):number{const value=finite(random.floatRange(min,max));if(value<min||value>max)throw Error('Invalid native family float draw');return value;}
function intDraw(random:CharacterRandom,min:number,max:number):number{const value=int32(random.intRange(min,max));if(value<min||value>=max)throw Error('Invalid native family integer draw');return value;}
function valueDraw(random:CharacterRandom):number{const value=finite(random.value());if(value<0||value>1)throw Error('Invalid native family probability draw');return value;}
function setBirth<C extends NativeFamilyMember>(person:C,age:number,p:NativeFamilyMemberPorts<C>):void{person.birthTime=f(p.birthTimeFromAge(age));p.updateAge(person);}
function childGender<C extends NativeFamilyMember>(parent:C,p:NativeFamilyMemberPorts<C>):number{
 let male=0,female=0;
 for(const id of required(parent.childrenIds)){const c=p.getCharacter(id);if(!c||!c.isAlive)continue;if(c.gender===0)male=iadd(male,1);else female=iadd(female,1);}
 return male>female?1:female>male?0:valueDraw(p.random)<=f(.5)?1:0;
}
function appendChild<C extends NativeFamilyMember>(child:C,family:NativeInitialFamily,father:C,mother:C):void{
 required(family.memberIds).push(child.id);required(father.childrenIds).push(child.id);required(mother.childrenIds).push(child.id);
}

export function nativeGenerateLeaderSpouse<C extends NativeFamilyMember>(leader:C|null,family:NativeInitialFamily|null,state:{i:number},culture:string|null,p:NativeFamilyMemberPorts<C>):void{
 const l=required(leader),spouse=p.generateInit(culture,l.gender===0?1:0,null);if(spouse===null)return;
 const offset=floatDraw(p.random,-10,10);let age=f(f(l.age)+offset);if(age<16)age=floatDraw(p.random,16,20);
 setBirth(spouse,age,p);
 l.spouseId=spouse.id;spouse.spouseId=l.id;l.marriageType=0;spouse.marriageType=0;
 spouse.familyId=l.familyId;spouse.lastName=p.lastName(l);
 if(family!==null)required(family.memberIds).push(spouse.id);
 spouse.stateId=state.i;
 const roles=spouse.roles,role=p.createSpouseRole();role.spouseOfId=l.id;role.stateId=state.i;role.holderId=spouse.id;role.startTime=f(p.gameTime());required(roles).push(role);
}

/** The original input mapCultureNameID is unused; children use family culture. */
export function nativeGenerateLeaderChildren<C extends NativeFamilyMember>(leader:C|null,family:NativeInitialFamily|null,initial:boolean,p:NativeFamilyMemberPorts<C>):void{
 let count=0;
 if(initial)count=intDraw(p.random,1,4);
 else{const age=required(leader).age;if(age>40)count=intDraw(p.random,1,3);else if(age>30)count=intDraw(p.random,0,3);else if(age>25)count=intDraw(p.random,0,2);}
 const l=required(leader),spouse=l.spouseId>0?p.getCharacter(l.spouseId):null;
 if(spouse===null){if(initial)p.reportMissingSpouse(l);return;}
 for(let i=0;i<count;i++){
  const gender=childGender(l,p),father=l.gender===0?l:spouse,mother=l.gender===1?l:spouse,familyValue=required(family);
  const child=p.generateInit(familyValue.cultureName,gender,father??mother);if(child===null)continue;
  child.familyId=familyValue.id;child.stateId=familyValue.stateId;child.fatherId=father.id;child.motherId=mother.id;
  const younger=f(Math.min(l.age,spouse.age)),offset=floatDraw(p.random,20,35);let age=f(younger-offset);if(age<0)age=f(intDraw(p.random,0,5));
  setBirth(child,age,p);appendChild(child,familyValue,father,mother);
 }
}

export function nativeGenerateCollateralHousehold<C extends NativeFamilyMember>(member:C|null,family:NativeInitialFamily|null,culture:string|null,isCousin:boolean,p:NativeFamilyMemberPorts<C>):void{
 const m=required(member),spouse=p.generateInit(culture,m.gender===0?1:0,null);if(spouse===null)return;
 const memberAge=f(m.age);let age=f(memberAge+floatDraw(p.random,-10,10));if(age<16)age=floatDraw(p.random,16,20);
 setBirth(spouse,age,p);
 const fam=required(family);spouse.familyId=fam.id;spouse.stateId=fam.stateId;spouse.lastName=p.lastName(m);
 m.spouseId=spouse.id;spouse.spouseId=m.id;required(fam.memberIds).push(spouse.id);
 const count=intDraw(p.random,0,isCousin?3:2);
 for(let i=0;i<count;i++){
  const gender=childGender(m,p),father=m.gender===0?m:spouse,mother=m.gender===1?m:spouse;
  const child=p.generateInit(fam.cultureName,gender,father);if(child===null)continue;
  child.familyId=fam.id;child.stateId=fam.stateId;child.fatherId=father.id;child.motherId=mother.id;
  const parentAge=f(m.age);let childAge=f(parentAge-floatDraw(p.random,18,35));if(childAge<0)childAge=f(intDraw(p.random,0,15));
  setBirth(child,childAge,p);appendChild(child,fam,father,mother);
 }
}

export function nativeGenerateCollateralMembers<C extends NativeFamilyMember>(head:C,family:NativeInitialFamily,culture:string|null,p:NativeFamilyMemberPorts<C>):void{
 const first=intDraw(p.random,1,4);
 for(let i=0;i<first;i++){
  const gender=valueDraw(p.random)<=f(.5)?1:0,member=p.generateInit(culture,gender,null);if(member===null)continue;
  const offset=floatDraw(p.random,-15,15);let age=f(f(head.age)+offset);if(age<16)age=floatDraw(p.random,16,25);if(age>70)age=floatDraw(p.random,50,70);
  setBirth(member,age,p);member.familyId=family.id;member.stateId=family.stateId;member.lastName=p.lastName(head);required(family.memberIds).push(member.id);
  if(member.age>=25&&valueDraw(p.random)>f(.3))p.generateCollateralHousehold(member,family,culture,false);
 }
 const second=intDraw(p.random,1,3);
 for(let i=0;i<second;i++){
  const gender=valueDraw(p.random)<=f(.5)?1:0,member=p.generateInit(culture,gender,null);if(member===null)continue;
  const headAge=f(head.age);let age=f(floatDraw(p.random,10,30)+headAge);if(age>80)age=floatDraw(p.random,60,80);
  setBirth(member,age,p);member.familyId=family.id;member.stateId=family.stateId;member.lastName=p.lastName(head);required(family.memberIds).push(member.id);
  if(valueDraw(p.random)>f(.4))p.generateCollateralHousehold(member,family,culture,true);
 }
}
