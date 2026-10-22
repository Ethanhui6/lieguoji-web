import {culture47,type CultureId47} from './civilization47-catalog';
import {assertCivilization47,personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {seededCharacterRandom,nativeRandomTraits,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeGenerateInitCharacter} from './native-culture/character-init';
import {nativeBirthTimeFromAge,nativeUpdateCharacterAge,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {nativeGenerateLeaderSpouse,nativeGenerateLeaderChildren,nativeGenerateCollateralMembers,nativeGenerateCollateralHousehold,nativeSpouseRoleDefaults,type NativeFamilyMemberPorts} from './native-economy/family-members';
import {assertPopulation47} from './civilization47-population-validation';
import type {PopulationBase47,Kin47,FamilyPerson47,Life47,PersonRole47} from './civilization47-population-types';
import type {NativePastRole} from './native-economy/role-history';
import {nativeLeaderRoleDefaults} from './native-economy/leader-appointment';
import {nativeDeathStatsDefaults} from './native-economy/character-month';
import {nameSeed} from './chronicle-records';
import type {Sovereignty} from './restoration19-sovereignty';

/** The original family kernels mutate; this owner isolates registry, name,
 * birthday and relation writes until the complete candidate validates. */
export function attachFamilies47<T extends PopulationBase47>(input:T) {
  assertCivilization47(input.civilization,input.world,input.chronicle);
  if(input.world.day!==0||input.clock.tick!==0||'kin' in input||'sovereignty' in input)throw Error('家族只能在新世界初始化一次。');
  const r=structuredClone(input),life:Life47=r.life,kin:Kin47={version:1,origin:'native-family-real-culture-v1',revision:0,ageTime:0,lastAgeMonth:12,persons:{},families:{},lifecycle:{version:1,rule:'native-month-death-known-emergency-v1',revision:0,lastMonth:12,random:{state:nameSeed(input.world.custom!.seed+'/life47'),draws:0},stats:nativeDeathStatsDefaults(),deaths:[],vacancies:{}}},calendar=createNativeIsoCalendar(life.startDate);
  const sovereignty:Sovereignty={version:1,revision:0,provinces:{},reigns:{},restorations:{},nativeRebels:{}};
  for(const p of r.world.provinces){const city=r.world.cities.find(c=>c.provinceId===p.id);if(!city)throw Error('辖区缺少真实城市。');sovereignty.provinces[p.id]={mapCultureId:r.civilization.cities[city.id].cultureId,sourceCityId:city.id,recordedDay:0,origin:'new-world'};}
  const registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()};
  for(const n of r.world.nations){
    const court=r.people.persons[r.people.nations[n.id].leaderId!],identity=r.civilization.rulers[court.rulerId],birth=life.persons[court.id],familyId=r.people.nations[n.id].id;
    if(!birth||birth.source!=='native-founding'||birth.age===null||birth.birthTime===null)throw Error('创始人物缺少已核出生记录。');
    const name=personNameFromParts47(identity.cultureId,identity.given,identity.house,identity.gender);
    const p:FamilyPerson47={...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),id:court.id,firstName:name.given,lastName:name.house,cultureName:name.cultureId,gender:name.gender,age:birth.age,birthTime:birth.birthTime,familyId,originalFamilyId:familyId,stateId:court.stateId,religionId:identity.religionId,base:structuredClone(court.base),traits:[...court.traits],source:'founding',initialAge:birth.initialAge,identity:name};
    p.roles.push({...nativeLeaderRoleDefaults(()=>life.gameTime),nativeKind:'leader',holderId:p.id,stateId:p.stateId,title:identity.titleAtAccession});
    registry.characters.set(p.id,p);kin.persons[p.id]=p;
    kin.families[familyId]={id:familyId,surname:name.house,cultureName:name.cultureId,nationId:n.id,stateId:court.stateId,headId:p.id,heirId:0,allowFemaleInheritance:false,memberIds:[p.id],collateralMemberIds:[]};
    sovereignty.reigns[court.rulerId]=court.id;sovereignty.restorations[n.id]=0;
  }
  for(const family of Object.values(kin.families))generateFamilyMembers47(r,kin,life,registry,calendar,family);
  // Native spouse/collateral creation overwrites lastName after generateInit.
  // Finalize the source key only after those writes, never before them.
  for(const [id,p] of registry.characters){
    p.identity=personNameFromParts47(culture47(p.cultureName!).id,p.firstName!,p.lastName!,p.gender as 0|1);kin.persons[id]=p;
    if(p.source==='initial-family')life.persons[id]={source:'native-family',birthTime:p.birthTime,age:p.age,initialAge:null,updatedMonth:12};
  }
  r.people.nextPersonId=registry.nextId;r.people.revision++;kin.revision++;
  const result={...r,life,kin,sovereignty};assertPopulation47(result);return result;
}

type FamilyRun47={world:PopulationBase47['world'];civilization:PopulationBase47['civilization']};
/** Spouse, children and collateral members of one ruling family, exactly as
 * the original InitializeCharactersAndFamilies does for a starting state. A
 * state founded later (rebellion) uses the same kernels at the current time. */
export function generateFamilyMembers47(r:FamilyRun47,kin:Kin47,life:Life47,registry:{nextId:number;characters:Map<number,FamilyPerson47>},calendar:ReturnType<typeof createNativeIsoCalendar>,family:Kin47['families'][string]){
  const leader=registry.characters.get(family.headId)!,random=seededCharacterRandom(`${r.world.custom!.seed}/native-family/${family.id}`),religionId=r.civilization.nations[family.nationId].religionId;
  const lookup=(id:string|null)=>id!==null&&r.civilization.enabled.includes(id as CultureId47)?culture47(id):null;
  const create=(first:string|null,last:string|null,gender:number,culture:string|null)=>{
    if(first===null||last===null||culture===null||![0,1].includes(gender))throw Error('人物文化或姓名缺失。');
    const identity=personNameFromParts47(culture47(culture).id,first,last,gender as 0|1);
    return nativeCreateNamedCharacter(first,last,gender,culture,{
      createBlank:()=>{if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');return nativeCreateBlankCharacter(registry,{construct:():FamilyPerson47=>({...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),source:'initial-family',initialAge:null,religionId,identity}),gameTime:()=>life.gameTime});},random,
      selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name),
    });
  };
  const ports:NativeFamilyMemberPorts<FamilyPerson47>={
    generateInit:(culture,gender,father)=>nativeGenerateInitCharacter(culture,gender,father,{lookupMapCulture:lookup,determineDefaultCultureId:()=>family.cultureName,ensureMapCultureForInit:()=>{throw Error('本局文化缺失，已取消家族创建。');},
      generateName:(profile,g)=>{const pool=g===0?profile.givenMale:profile.givenFemale;return {first:pool[random.intRange(0,pool.length)],last:profile.houses[random.intRange(0,profile.houses.length)]};},
      getLastName:p=>kin.families[p.originalFamilyId]?.surname??kin.families[p.familyId]?.surname??p.lastName,createCharacter:create,
    }).character,
    getCharacter:id=>registry.characters.get(id)??null,lastName:p=>kin.families[p.originalFamilyId]?.surname??kin.families[p.familyId]?.surname??p.lastName,random,
    birthTimeFromAge:age=>nativeBirthTimeFromAge(age,life.gameTime,life.secondsPerDay),updateAge:p=>nativeUpdateCharacterAge(p,b=>nativeGetYearSince(b,life.gameTime,life.secondsPerDay,calendar)),gameTime:()=>life.gameTime,createSpouseRole:()=>({...nativeSpouseRoleDefaults(),nativeKind:'spouse'}),
    reportMissingSpouse:()=>{throw Error('初始配偶缺失，原世界未改动。');},generateCollateralHousehold:(p,f,c,isCousin)=>nativeGenerateCollateralHousehold(p,f,c,isCousin,ports),
  };
  nativeGenerateLeaderSpouse(leader,family,{i:family.stateId},family.cultureName,ports);
  nativeGenerateLeaderChildren(leader,family,true,ports);
  nativeGenerateCollateralMembers(leader,family,family.cultureName,ports);
}
