import {culture47} from './civilization47-catalog';
import {personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {nativeRandomTraits,NATIVE_CHARACTER_POOL,type CharacterRandom} from './native-economy/character-generation';
import {nativeGenerateInitCharacter} from './native-culture/character-init';
import {nativeCharacterSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import {recordHistory,type HistoricalKind} from './chronicle-records';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import type {FamilyPerson47,PersonRole47} from './civilization47-population-types';
import type {NativePastRole} from './native-economy/role-history';
import type {NobilityRun47,Nobility47,NobleFamily47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** Original FamilyManager.ProcessSingleFamilyPopulation 869170 → ProcessBirths
 * 8684C0: families under 15 living members; each married woman aged 18–40 with
 * a living husband, both under 3 children, gives birth with
 * CalculateBirthChance 8554F0 / 12 per family update. CreateChild 85A720 names
 * the child in the father's line, averages charisma, inherits congenital
 * traits (InheritTraits 864520) and records important births (IsImportantBirth 864C60). */
const living=(r:NobilityRun47,id:string)=>{const k=r.kin.families[id];return k.memberIds.map(m=>r.kin.persons[m]).filter((p):p is FamilyPerson47=>!!p&&p.isAlive&&p.familyId===k.id);};
const charisma=(p:FamilyPerson47)=>nativeCharacterSkills(p.base,combatTraits47(p.traits)).charisma;
/** HasYoungChild(member, 2): a living child younger than two. */
const hasYoungChild=(r:NobilityRun47,p:FamilyPerson47)=>p.childrenIds.some(id=>{const c=r.kin.persons[id];return !!c&&c.isAlive&&f(2)>c.age;});
export function birthChance47(r:NobilityRun47,id:string,p:FamilyPerson47){
  const n=p.childrenIds.length;let v=f(n===0?.45:n===1?.3:n===2?.1:.2);
  if(p.age>=18&&p.age<=25)v=f(v+f(.1));else if(p.age>=26&&p.age<=35)v=f(v+f(.05));else if(p.age>=36&&p.age<=40)v=f(v+f(-.1));
  const count=living(r,id).length;
  if(count<3)v=f(v+f(.1));else if(count<5)v=f(v+f(.05));else if(count>10)v=f(v+f(-.15));
  if(hasYoungChild(r,p))v=f(v*f(.3));
  return Math.max(0,v);
}
export function processBirths47(r:NobilityRun47,n:Nobility47,id:string){
  const members=living(r,id);if(members.length>=15)return 0;
  const random=nobilityRandom47(n);let born=0;
  for(const p of members){
    if(p.gender!==1||!p.spouseId||p.age<18||p.age>40)continue;
    const spouse=r.kin.persons[p.spouseId];if(!spouse||!spouse.isAlive)continue;
    if(p.childrenIds.length>=3||spouse.childrenIds.length>=3)continue;
    const chance=f(birthChance47(r,id,p)/f(12));
    if(chance>random.value()){createChild47(r,n,id,p,random);born++;}
  }
  return born;
}
function createChild47(r:NobilityRun47,n:Nobility47,id:string,mother:FamilyPerson47,random:CharacterRandom){
  const father=r.kin.persons[mother.spouseId];
  let male=0,female=0;for(const c of mother.childrenIds.map(v=>r.kin.persons[v]))if(c?.isAlive){if(c.gender===0)male++;else female++;}
  const gender=male>female?1:male<female?0:random.value()<=f(.5)?1:0;
  // Patrilineal: the father's family and surname (matrilineal marriages come with F3b).
  const k=r.kin.families[String(father.familyId)]??r.kin.families[id],last=r.kin.families[String(father.familyId)]?.surname??k.surname;
  const life=r.life,registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()},religionId=n.families[String(k.id)]?.religionId??r.civilization.nations[k.nationId].religionId;
  const lookup=(c:string|null)=>c!==null&&r.civilization.enabled.includes(c as never)?culture47(c):null;
  const child=nativeGenerateInitCharacter(k.cultureName,gender,father,{lookupMapCulture:lookup,determineDefaultCultureId:()=>k.cultureName,ensureMapCultureForInit:()=>{throw Error('本局文化缺失，已取消出生。');},
    generateName:(profile,g)=>{const pool=g===0?profile.givenMale:profile.givenFemale;return {first:pool[random.intRange(0,pool.length)],last:profile.houses[random.intRange(0,profile.houses.length)]};},
    getLastName:()=>last,createCharacter:(first,surname,g,culture)=>{
      if(first===null||surname===null||culture===null)throw Error('人物文化或姓名缺失。');
      const identity=personNameFromParts47(culture47(culture).id,first,surname,g as 0|1);
      return nativeCreateNamedCharacter(first,surname,g,culture,{
        createBlank:()=>{if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');return nativeCreateBlankCharacter(registry,{construct:():FamilyPerson47=>({...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),source:'newborn',initialAge:null,religionId,identity}),gameTime:()=>life.gameTime});},random,
        selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name),
      });
    }}).character;
  if(!child)return;
  child.familyId=k.id;child.originalFamilyId=k.id;child.stateId=k.stateId;child.fatherId=father.id;child.motherId=mother.id;child.isAlive=true;child.age=0;
  const scale=f(random.floatRange(-.2,.2)+1),mean=f(f(charisma(father)+charisma(mother))*f(.5)),cha=f(scale*mean);
  child.base.charisma=0>cha?0:cha>100?100:cha;child.base.military=random.floatRange(20,80);child.base.diplomatic=random.floatRange(20,80);child.base.administrative=random.floatRange(20,80);
  for(const parent of [father,mother])for(const name of parent.traits??[]){
    const t=NATIVE_CHARACTER_POOL.find(t=>t.name===name) as {isCongenital?:boolean;incompatibleTraits?:readonly string[]|null}|undefined;
    if(!t?.isCongenital||!(f(.2)>random.value()))continue;
    const traits=child.traits??(child.traits=[]);if(traits.includes(name))continue;
    if(traits.some(o=>t.incompatibleTraits?.includes(o)||(NATIVE_CHARACTER_POOL.find(v=>v.name===o)?.incompatibleTraits??[]).includes(name)))continue;
    traits.push(name);
  }
  father.childrenIds.push(child.id);mother.childrenIds.push(child.id);k.memberIds.push(child.id);
  r.kin.persons[child.id]=child;life.persons[child.id]={source:'web-newborn',birthTime:child.birthTime,age:0,initialAge:null,updatedMonth:r.kin.lastAgeMonth};
  r.people.nextPersonId=registry.nextId;r.people.revision++;r.kin.revision++;life.revision++;
  n.births.push({personId:child.id,familyId:k.id,fatherId:father.id,motherId:mother.id,day:r.world.day});
  if(importantBirth(n.families[String(k.id)],r.kin.families[String(k.id)],child,father,mother,r))
    recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,`${child.identity.name}出生`,`${k.surname}家族的${father.identity.name}与${mother.identity.name}之子女出生。`,[k.nationId],null);
}
function importantBirth(fam:NobleFamily47|undefined,k:{headId:number;heirId:number},child:FamilyPerson47,father:FamilyPerson47,mother:FamilyPerson47,r:NobilityRun47){
  if(!fam)return false;
  if(fam.ruling||[k.headId,k.heirId].some(v=>v===father.id||v===mother.id))return true;
  if(fam.influence>500&&(father.childrenIds.length===1||mother.childrenIds.length===1))return true;
  if(child.gender!==0)return false;
  const otherSon=father.childrenIds.some(v=>v!==child.id&&r.kin.persons[v]?.isAlive&&r.kin.persons[v].gender===0);
  return !otherSon&&fam.influence>200;
}
