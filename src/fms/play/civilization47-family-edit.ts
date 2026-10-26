import {nativeFindSuccessor} from './native-economy/family-succession';
import {diePersonOwned47} from './civilization47-lifecycle';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type FamilyPerson47,type Population47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {culture47} from './civilization47-catalog';
import {personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {nativeRandomTraits,NATIVE_CHARACTER_POOL,type CharacterRandom} from './native-economy/character-generation';
import {nativeBirthTimeFromAge,nativeGetYearSince,nativeUpdateCharacterAge} from './native-economy/character-calendar';
import {nativeCharacterSkills} from './native-economy/character-income';
import type {NativePastRole} from './native-economy/role-history';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {combatTraits47} from './civilization47-combat-state';
import {recordHistory,type HistoricalKind} from './chronicle-records';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import {inheritTraits47} from './civilization47-nobility-births';
import type {NobilityRun47} from './civilization47-nobility';
import type {Family47,PersonRole47} from './civilization47-population-types';
import {f} from './native-economy/numeric';

/** Original FamilyTreeUI family actions (FamilyActionType), the ones that change existing
 * people. Texts are the original localization (FamilyAction*, FamilyTreeConfirm*):
 * - 设为族长 PromoteToPatriarch: a living member becomes patriarch (a collateral relative is
 *   first made a member, Family.AddMember), then FamilyManager.UpdateFamilyHeir picks the heir;
 * - 设为继承人 SetHeir: a living member other than the patriarch becomes heir;
 * - 离婚 Divorce: both spouses lose the marriage (spouse link and Spouse role);
 * - 处死角色 KillCharacter: the person dies now through the same death path as a natural death
 *   (a ruler's reign ends and succession runs; patriarchship passes on).
 * In original-family worlds also (they draw from the family ledger's own random stream):
 * - 设置年龄 SetAge: an integer age 0–200 moves the birth time (GetBirthTimeFromExactAgeYears);
 * - 添加配偶 AddSpouse → 生成新配偶（随机） (AddGeneratedSpouse/CreateGeneratedSpouse): a living
 *   unmarried person gets a generated spouse of the other gender, of the family's culture, aged
 *   max(18, age ± 10), who joins the family; choosing a spouse from another family comes later;
 * - 添加子嗣 AddChild (CreateGeneratedChild): a married person gets a child aged 0–5 in the
 *   father's family, charisma from the parents, congenital traits inherited, birth recorded.
 * 删除角色 removes a person from every record and comes later. */
export type FamilyEdit47={type:'patriarch'|'heir'|'divorce'|'kill'|'spouse'|'child';personId:number}|{type:'age';personId:number;age:number};
export const FAMILY_ACTIONS47:readonly {type:FamilyEdit47['type'];label:string;confirm?:string}[]=[
  {type:'patriarch',label:'设为族长'},{type:'heir',label:'设为继承人'},{type:'age',label:'设置年龄'},{type:'spouse',label:'添加配偶'},{type:'child',label:'添加子嗣'},
  {type:'divorce',label:'离婚',confirm:'确定要离婚吗？'},{type:'kill',label:'处死角色',confirm:'确定要处死该角色吗？'},
];
const TYPES=['patriarch','heir','divorce','kill','spouse','child','age'];
export function assertFamilyEdit47(v:unknown):asserts v is FamilyEdit47{
  const e=v as FamilyEdit47;
  if(!e||typeof e!=='object'||Object.keys(e).length!==(e.type==='age'?3:2)||!TYPES.includes(e.type)||!Number.isSafeInteger(e.personId)||e.personId<1||e.type==='age'&&!Number.isSafeInteger(e.age))throw Error('家族操作无效。');
}
/** Why the action cannot run now (shown on the disabled button), or null. */
export function familyEditBlocker47(r:Population47,edit:FamilyEdit47):string|null{
  const p=r.kin.persons[edit.personId],f=p&&r.kin.families[p.familyId];
  if(!p)return '找不到这个人物。';
  if(!p.isAlive)return '人物已故。';
  if(!f)return '人物不属于任何家族。';
  if(edit.type==='patriarch'&&f.headId===p.id)return '已是族长。';
  if(edit.type==='heir'){if(f.headId===p.id)return '族长不能同时是继承人。';if(f.heirId===p.id)return '已是继承人。';}
  if(edit.type==='divorce'){const s=r.kin.persons[p.spouseId];if(!s||!s.isAlive)return '没有在世的配偶。';}
  if(edit.type==='age'||edit.type==='spouse'||edit.type==='child'){
    if(!(r as NobilityRun47).nobility)return '这个世界没有启用原作家族。';
    if(edit.type==='age'&&(edit.age<0||edit.age>200))return '年龄超出范围（0-200）';
    if(edit.type==='spouse'&&p.spouseId)return '已有配偶。';
    if(edit.type==='child'){const s=r.kin.persons[p.spouseId];if(!s||s.gender===p.gender)return '没有配偶，无法确定子嗣的父母。';}
  }
  return null;
}
const member=(r:Population47,p:FamilyPerson47)=>{const f=r.kin.families[p.familyId];if(!f.memberIds.includes(p.id)){f.collateralMemberIds=f.collateralMemberIds.filter(id=>id!==p.id);f.memberIds.push(p.id);}return f;};
export function applyFamilyEdit47<T extends Population47>(run:T,edit:FamilyEdit47,expected:PopulationStamp47):T{
  assertFamilyEdit47(edit);
  if(!sameCulture47Value(expected,populationStamp47(run)))throw Error('世界已经推进，请重新操作。');
  const reason=familyEditBlocker47(run,edit);if(reason)throw Error(reason);
  const {terrain,...rest}=run as T&{terrain?:unknown},next={...structuredClone(rest),...(terrain===undefined?{}:{terrain})} as T;
  const p=next.kin.persons[edit.personId],getCharacter=(id:number)=>next.kin.persons[id]??null;
  if(edit.type==='patriarch'){
    const f=member(next,p);f.headId=p.id;p.isHistoricallyImportant=true;
    const heir=nativeFindSuccessor(f,p,getCharacter,()=>null);f.heirId=heir&&heir.id!==p.id?heir.id:0;
  }else if(edit.type==='heir'){
    member(next,p).heirId=p.id;
  }else if(edit.type==='divorce'){
    const s=next.kin.persons[p.spouseId];
    for(const [a,b] of [[p,s],[s,p]] as const){a.spouseId=0;a.roles=a.roles.filter(role=>!(role.nativeKind==='spouse'&&role.spouseOfId===b.id));}
  }else if(edit.type==='kill'){
    diePersonOwned47(next,p,'executed');
  }else if(edit.type==='age'){
    setAge(next as unknown as NobilityRun47,p,edit.age);
  }else if(edit.type==='spouse'){
    addSpouse(next as unknown as NobilityRun47,p);
  }else{
    addChild(next as unknown as NobilityRun47,p);
  }
  next.kin.revision++;
  assertPopulation47(next);
  return next;
}
const yearsAt=(r:Population47,birthTime:number)=>birthTime>r.kin.ageTime?0:nativeGetYearSince(birthTime,r.kin.ageTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
/** GetBirthTimeFromExactAgeYears at the web's aging time (ages are counted monthly). */
function birthForAge(r:Population47,age:number){
  let b=nativeBirthTimeFromAge(age,r.kin.ageTime,r.life.secondsPerDay);
  for(let i=0;i<800&&yearsAt(r,b)!==age;i++)b=f(b+(yearsAt(r,b)>age?r.life.secondsPerDay:-r.life.secondsPerDay));
  if(yearsAt(r,b)!==age)throw Error('年龄输入无效，请输入整数');
  return b;
}
function setAge(r:NobilityRun47,p:FamilyPerson47,age:number){
  const b=birthForAge(r,age);
  (r.nobility!.ageEdits??=[]).push({personId:p.id,from:p.birthTime,to:b,day:r.world.day});
  p.birthTime=b;p.age=age;r.life.persons[p.id].birthTime=b;r.life.persons[p.id].age=age;r.life.revision++;
}
type Made47={family:Family47;gender:0|1;surname:string;source:'collateral'|'newborn';random:CharacterRandom};
/** CharacterManager.GenerateCharacterFromCulture for the family's culture. */
function make(r:NobilityRun47,{family,gender,surname,source,random}:Made47,age:number){
  const profile=culture47(family.cultureName),pool=gender===0?profile.givenMale:profile.givenFemale,first=pool[random.intRange(0,pool.length)];
  const identity=personNameFromParts47(profile.id,first,surname,gender),religionId=r.nobility!.families[String(family.id)]?.religionId??r.civilization.nations[family.nationId].religionId;
  const registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()},life=r.life;
  const p=nativeCreateNamedCharacter(first,surname,gender,profile.id,{
    createBlank:()=>{if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');return nativeCreateBlankCharacter(registry,{construct:():FamilyPerson47=>({...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),source,initialAge:null,religionId,identity}),gameTime:()=>life.gameTime});},random,
    selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name),
  });
  p.familyId=family.id;p.stateId=family.stateId;p.isAlive=true;p.birthTime=Number.isInteger(age)?birthForAge(r,age):f(nativeBirthTimeFromAge(age,r.kin.ageTime,life.secondsPerDay));
  nativeUpdateCharacterAge(p,b=>yearsAt(r,b));
  p.base.charisma=random.floatRange(20,80);p.base.military=random.floatRange(20,80);p.base.diplomatic=random.floatRange(20,80);p.base.administrative=random.floatRange(20,80);
  r.kin.persons[p.id]=p;family.memberIds.push(p.id);
  life.persons[p.id]={source:source==='newborn'?'web-newborn':'native-family',birthTime:p.birthTime,age:p.age,initialAge:null,updatedMonth:r.kin.lastAgeMonth};life.revision++;
  r.people.nextPersonId=registry.nextId;r.people.revision++;
  return p;
}
function addSpouse(r:NobilityRun47,p:FamilyPerson47){
  const n=r.nobility!,random=nobilityRandom47(n),family=r.kin.families[p.familyId],profile=culture47(family.cultureName);
  const surname=profile.houses[random.intRange(0,profile.houses.length)],age=Math.max(18,p.age+random.intRange(-10,11));
  const s=make(r,{family,gender:p.gender===0?1:0,surname,source:'collateral',random},age);
  n.collaterals.push({personId:s.id,familyId:family.id,day:r.world.day});(n.spouses??=[]).push(s.id);
  p.spouseId=s.id;s.spouseId=p.id;
  // Like ExecuteMarriage on the web, a family marriage carries no Spouse role record.
  n.marriages.push({aId:p.id,bId:s.id,moverId:0,fromFamilyId:family.id,toFamilyId:family.id,matrilineal:false,day:r.world.day});
}
function addChild(r:NobilityRun47,p:FamilyPerson47){
  const n=r.nobility!,random=nobilityRandom47(n),spouse=r.kin.persons[p.spouseId],[father,mother]=p.gender===0?[p,spouse]:[spouse,p];
  // DetermineChildFamily: the father's family, the mother's in a matrilineal marriage.
  const family=r.kin.families[(father.marriageType===1?mother:father).familyId]??r.kin.families[p.familyId];
  const gender=random.value()<f(.5)?0:1,c=make(r,{family,gender,surname:family.surname,source:'newborn',random},random.floatRange(0,5));
  const charisma=(q:FamilyPerson47)=>nativeCharacterSkills(q.base,combatTraits47(q.traits)).charisma,cha=f(f(random.floatRange(-.2,.2)+1)*f(f(charisma(father)+charisma(mother))*f(.5)));
  c.base.charisma=0>cha?0:cha>100?100:cha;c.originalFamilyId=family.id;c.fatherId=father.id;c.motherId=mother.id;
  inheritTraits47(c,father,mother,random);
  father.childrenIds.push(c.id);mother.childrenIds.push(c.id);
  n.births.push({personId:c.id,familyId:family.id,fatherId:father.id,motherId:mother.id,day:r.world.day});
  recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,`${c.identity.name}出生`,`${family.surname}家族的${father.identity.name}与${mother.identity.name}之子女出生。`,[family.nationId],null);
}
