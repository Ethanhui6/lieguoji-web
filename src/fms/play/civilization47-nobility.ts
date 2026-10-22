import {culture47,type CultureId47} from './civilization47-catalog';
import {personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {seededCharacterRandom,nativeRandomTraits,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeGenerateInitCharacter} from './native-culture/character-init';
import {nativeBirthTimeFromAge,nativeUpdateCharacterAge,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {nativeGenerateCollateralHousehold,nativeGenerateCollateralMembers,nativeSpouseRoleDefaults,type NativeFamilyMemberPorts} from './native-economy/family-members';
import {nativeAllocateRulingTerritories,nativeAssignRemainingToNearest,nativeGenerateNobleFamilyMembers,nativeNobleFamilyCount,nativeNobleFemaleInheritance,nativeNoblePatriarchAge,nativeSelectOrigins,nativeValidateInitialDistribution,type NativeTerritoryFamily,type NativeTerritoryProvince} from './native-economy/noble-families';
import type {PopulationBase47,Kin47,FamilyPerson47,Life47,PersonRole47,Population47} from './civilization47-population-types';
import type {NativePastRole} from './native-economy/role-history';
import {f} from './native-economy/numeric';
import {nobilityMonth47} from './civilization47-nobility-monthly';
import {nameSeed} from './chronicle-records';

/** Original family system (FantasyWorld.CharacterSystem.FamilyManager) for new
 * worlds. Kin keeps the people and family membership; this ledger keeps the
 * original Family fields the web lacked. Family defaults come from Family..ctor:
 * influence 50, wealth 100, extendedMembers 50, updateDay 1. */
export const NOBILITY_RULE47='original-families-v1';
export type NobleFamily47={nationId:string;ruling:boolean;homeProvinceId:string;originalHomeProvinceId:string;controlledProvinces:string[];
  influence:number;wealth:number;extendedMembers:number;religionId:string;foundingTime:number;updateDay:number;
  totalEnemyDestroyed:number;totalProvincesConquered:number;rallyCooldown:number;historicalClaims:Record<string,number>;historicalStateIds:string[];lastRulingTime:Record<string,number>;rulingDuration:Record<string,number>;stateResidenceMonths:Record<string,number>};
/** month/year: last calendar month and year processed; monthFamilies: the
 * month's update list; collaterals: CreateCollateralMember records; detached:
 * dead collateral dropped from the family list (still in the population). */
export type Nobility47={version:1;rule:typeof NOBILITY_RULE47;families:Record<string,NobleFamily47>;month:number;year:number;monthFamilies:string[];random:{state:number;draws:number};
  collaterals:{personId:number;familyId:number;day:number}[];detached:number[];
  /** State.monthsUntilTerritoryRedistribution (−1 = not drawn) and State.familyWarContributions. */
  redistribution:Record<string,number>;warContributions:Record<string,Record<string,number>>;
  /** CreateChild records (ProcessBirths). */
  births:{personId:number;familyId:number;fatherId:number;motherId:number;day:number}[];
  /** ExecuteMarriage records; moverId 0 when nobody changed family. */
  marriages:{aId:number;bId:number;moverId:number;fromFamilyId:number;toFamilyId:number;matrilineal:boolean;day:number}[];
  /** Ruling family by state when not the state family (SetRulingFamily); families retired by CheckFamilyExtinction. */
  rulingFamilies:Record<string,number>;extinct:number[];
  /** Family.relations: stored relation of a family towards another (rally, exile). */
  relations:Record<string,Record<string,number>>;
  /** Army.familyId / isCentralArmy (DetermineArmyFamilyAndType). */
  armies:Record<string,{familyId:number;central:boolean}>;
  /** States alive at the last daily update (to detect DestroyState). */
  aliveStates:string[];
  /** AI全局配置: 允许家族叛乱/家族叛乱最小间隔 (18)/允许内战/内战最小间隔 (36); State.timeStampLastFamilyRebellion. */
  settings:{allowFamilyRebellion:boolean;familyRebelMinMonths:number;allowCivilWar:boolean;civilWarMinMonths:number};lastFamilyRebellion:Record<string,number>;
  /** State.timeStampLastCivilWar per mother state; running civil wars by rebel state. */
  lastCivilWar:Record<string,number>;civilWars:Record<string,CivilWar47>};
/** One civil war started by StartCivilWar (names kept for the end record). */
export type CivilWar47={motherId:string;type:8|9|10|11;cause:string;familyId:number;familyIds:number[];rebelName:string;motherName:string};
export type NobilityRun47=Population47&{nobility?:Nobility47};

const provinceNumber=(id:string)=>Number(id.slice(2))+1;
const provinceKey=(n:number)=>'p-'+(n-1);

/** State.InitializeCharactersAndFamilies after the ruling family: its
 * territories, noble families with territories, the remaining provinces and
 * the initial distribution check, state by state in nation order. */
export function attachNobility47<T extends Population47>(input:T):T&{nobility:Nobility47}{
  if(input.clock.tick!==0||'nobility' in input||input.houses||input.generations)throw Error('原作家族只能在新世界开局建立。');
  const r=structuredClone(input) as T&{nobility:Nobility47},seed=r.world.custom!.seed,life:Life47=r.life,kin:Kin47=r.kin,calendar=createNativeIsoCalendar(life.startDate);
  const nobility:Nobility47={version:1,rule:NOBILITY_RULE47,families:{},month:nobilityMonth47(r),year:r.life.currentDate.year,monthFamilies:[],random:{state:nameSeed(seed+'/nobility47'),draws:0},collaterals:[],detached:[],redistribution:{},warContributions:{},births:[],marriages:[],rulingFamilies:{},extinct:[],relations:{},armies:{},aliveStates:r.world.nations.filter(v=>r.world.provinces.some(p=>p.controller===v.id)).map(v=>v.id),settings:{allowFamilyRebellion:true,familyRebelMinMonths:18,allowCivilWar:true,civilWarMinMonths:36},lastFamilyRebellion:{},lastCivilWar:{},civilWars:{}};r.nobility=nobility;
  const scale=r.world.provinces.length?(r as unknown as {scale:number}).scale:1;
  const centers=new Map(r.world.provinces.map(p=>[provinceNumber(p.id),{x:p.center.x/scale,y:p.center.y/scale}]));
  // State.CalculateProvincesDistance: distance between the province centres (original map units).
  const distance=(a:number,b:number)=>{const p=centers.get(a),q=centers.get(b);return p&&q?f(Math.hypot(p.x-q.x,p.y-q.y)):f(3.4028234663852886e38);};
  let nextFamilyId=Math.max(...Object.values(kin.families).map(v=>v.id))+1;
  const registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()};
  for(const n of r.world.nations){
    const identity=r.civilization.nations[n.id],polity=identity.polity,stateId=r.people.nations[n.id].id,random=seededCharacterRandom(`${seed}/nobility/${n.id}`);
    const views:NativeTerritoryProvince[]=r.world.provinces.filter(p=>p.controller===n.id).map(p=>({id:provinceNumber(p.id),familyId:0,neighbors:new Set(p.neighbors.map(provinceNumber))}));
    if(!views.length)continue;
    // Ruling family: home = capital province; GenerateLeader… already done by attachFamilies47.
    const rulingKin=kin.families[String(stateId)],capital=r.world.cities.find(c=>c.id===n.capitalId)!.provinceId;
    rulingKin.allowFemaleInheritance=f(random.value())<f(.2);
    const ruling:NativeTerritoryFamily={id:rulingKin.id,homeProvinceId:provinceNumber(capital),controlledProvinces:[]};
    const home=views.find(v=>v.id===ruling.homeProvinceId)!;ruling.controlledProvinces.push(home.id);home.familyId=ruling.id;
    nativeAllocateRulingTerritories(ruling,views,polity,distance);
    nobility.families[String(ruling.id)]=nobleRecord(n.id,true,ruling,identity.religionId);
    // Noble families with territories.
    const unowned=views.filter(v=>v.familyId===0),families:NativeTerritoryFamily[]=[];
    if(unowned.length){
      const origins=nativeSelectOrigins(unowned,nativeNobleFamilyCount(unowned.length,polity,random),distance,random);
      for(const origin of origins){
        const fam=createNobleFamily(r,kin,life,calendar,registry,n.id,stateId,identity.cultureId,identity.religionId,nextFamilyId++,origin,random);
        if(fam)families.push(fam);
      }
      nativeAssignRemainingToNearest(unowned.filter(v=>!origins.includes(v)),families,distance);
    }
    nativeValidateInitialDistribution([ruling,...families],views,polity,distance);
    nobility.families[String(ruling.id)].controlledProvinces=ruling.controlledProvinces.map(provinceKey);
    for(const fam of families)nobility.families[String(fam.id)]=nobleRecord(n.id,false,fam,identity.religionId);
  }
  // Native spouse/collateral creation overwrites lastName; finalize identities last.
  for(const [id,p] of registry.characters){
    p.identity=personNameFromParts47(culture47(p.cultureName!).id,p.firstName!,p.lastName!,p.gender as 0|1);kin.persons[id]=p;
    life.persons[id]={source:'native-family',birthTime:p.birthTime,age:p.age,initialAge:null,updatedMonth:12};
  }
  // State and family ids share one number space (a state's family has its state id).
  r.people.nextPersonId=registry.nextId;r.people.nextStateId=Math.max(r.people.nextStateId,nextFamilyId);r.people.revision++;kin.revision++;life.revision++;
  return r;
}
function nobleRecord(nationId:string,ruling:boolean,fam:NativeTerritoryFamily,religionId:string):NobleFamily47{
  return {nationId,ruling,homeProvinceId:provinceKey(fam.homeProvinceId),originalHomeProvinceId:provinceKey(fam.homeProvinceId),controlledProvinces:fam.controlledProvinces.map(provinceKey),influence:50,wealth:100,extendedMembers:50,religionId,foundingTime:0,updateDay:1,totalEnemyDestroyed:0,totalProvincesConquered:0,rallyCooldown:0,historicalClaims:{},historicalStateIds:[],lastRulingTime:{},rulingDuration:{},stateResidenceMonths:{}};
}
/** CreateNobleFamilyWithTerritory + FamilyManager.CreateFamily + GenerateNobleFamilyMembers. */
function createNobleFamily(r:PopulationBase47,kin:Kin47,life:Life47,calendar:ReturnType<typeof createNativeIsoCalendar>,registry:{nextId:number;characters:Map<number,FamilyPerson47>},nationId:string,stateId:number,cultureId:CultureId47,religionId:string,familyId:number,origin:NativeTerritoryProvince,random:ReturnType<typeof seededCharacterRandom>):NativeTerritoryFamily|null{
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
    generateInit:(culture,gender,father)=>nativeGenerateInitCharacter(culture,gender,father,{lookupMapCulture:lookup,determineDefaultCultureId:()=>cultureId,ensureMapCultureForInit:()=>{throw Error('本局文化缺失，已取消家族创建。');},
      generateName:(profile,g)=>{const pool=g===0?profile.givenMale:profile.givenFemale;return {first:pool[random.intRange(0,pool.length)],last:profile.houses[random.intRange(0,profile.houses.length)]};},
      getLastName:p=>kin.families[p.originalFamilyId]?.surname??kin.families[p.familyId]?.surname??p.lastName,createCharacter:create,
    }).character,
    getCharacter:id=>registry.characters.get(id)??kin.persons[id]??null,lastName:p=>kin.families[p.originalFamilyId]?.surname??kin.families[p.familyId]?.surname??p.lastName,random,
    birthTimeFromAge:age=>nativeBirthTimeFromAge(age,life.gameTime,life.secondsPerDay),updateAge:p=>nativeUpdateCharacterAge(p,b=>nativeGetYearSince(b,life.gameTime,life.secondsPerDay,calendar)),gameTime:()=>life.gameTime,createSpouseRole:()=>({...nativeSpouseRoleDefaults(),nativeKind:'spouse'}),
    reportMissingSpouse:()=>{throw Error('初始配偶缺失，原世界未改动。');},generateCollateralHousehold:(p,fam,c,isCousin)=>nativeGenerateCollateralHousehold(p,fam,c,isCousin,ports),
  };
  // Patriarch: male, 25–60, historically important.
  const head=ports.generateInit(cultureId,0,null);if(head===null)return null;
  head.birthTime=f(nativeBirthTimeFromAge(nativeNoblePatriarchAge(random),life.gameTime,life.secondsPerDay));ports.updateAge(head);
  head.familyId=familyId;head.stateId=stateId;head.isHistoricallyImportant=true;
  const family=kin.families[String(familyId)]={id:familyId,surname:head.lastName!,cultureName:cultureId,nationId,stateId,headId:head.id,heirId:0,allowFemaleInheritance:nativeNobleFemaleInheritance(random),memberIds:[head.id],collateralMemberIds:[]};
  const territory:NativeTerritoryFamily={id:familyId,homeProvinceId:origin.id,controlledProvinces:[origin.id]};origin.familyId=familyId;
  nativeGenerateNobleFamilyMembers(head,family,stateId,cultureId,true,ports,h=>nativeGenerateCollateralMembers(h,family,cultureId,ports));
  for(const id of family.memberIds){const p=registry.characters.get(id);if(p){p.familyId=familyId;p.stateId=stateId;}}
  return territory;
}
