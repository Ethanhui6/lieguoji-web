import type {Life22Run} from './life22-model';
import {emptyKin,kinLastName,type KinState,type KinPerson,type KinFamily} from './dynasty23-state';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {seededCharacterRandom,nativeRandomTraits,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeGenerateInitCharacter} from './native-culture/character-init';
import {originalNamingCulture} from './native-culture/original-naming';
import {nativeCharacterName} from './native-culture/character-name';
import {nativeDefaultCulture} from './native-culture/default-culture';
import {nativeBirthTimeFromAge,nativeUpdateCharacterAge,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {nativeGenerateLeaderSpouse,nativeGenerateLeaderChildren,nativeGenerateCollateralMembers,nativeGenerateCollateralHousehold,nativeSpouseRoleDefaults,type NativeFamilyMemberPorts} from './native-economy/family-members';

/** Current naming families are a web identity bridge. Native family land/color
 * creation is deliberately not replayed over established capitals. */
export function initialKin(r:Life22Run):KinState{
 if(r.world.day!==0||r.clock.tick!==0)throw Error('亲属初始化只能用于全新世界。');
 const s=emptyKin(r),calendar=createNativeIsoCalendar(r.life.startDate),registry={nextId:r.people.nextPersonId,characters:new Map<number,KinPerson>()};
 for(const court of Object.values(r.people.persons)){
  const name=r.naming.rulers[court.rulerId],life=r.life.persons[court.id];if(name.origin!=='native'||name.gender===null||life.source!=='native-founding')throw Error('初始君主缺少真实文化或生日。');
  const person:KinPerson={...nativeCharacterDefaults<string,ReturnType<typeof nativeSpouseRoleDefaults>>(),source:'founding',initialAge:life.initialAge,id:court.id,firstName:name.first,lastName:name.storedLast,cultureName:name.mapCultureId,gender:name.gender,age:life.age!,birthTime:life.birthTime!,familyId:name.familyId,originalFamilyId:name.originalFamilyId,stateId:court.stateId,base:structuredClone(court.base),traits:[...court.traits]};
  registry.characters.set(person.id,person);s.persons[person.id]=person;
  const f=r.naming.families[name.familyId],family:KinFamily={...f,nationId:court.nationId,stateId:court.stateId,headId:person.id,allowFemaleInheritance:false,memberIds:[person.id],collateralMemberIds:[]};s.families[family.id]=family;
 }
 for(const family of Object.values(s.families)){
  const leader=registry.characters.get(family.headId)!,random=seededCharacterRandom(`${r.world.custom!.seed}/native-family/${family.id}`);
  const lookup=(id:string|null)=>{const map=id===null?null:r.culture.maps[id];return map?originalNamingCulture(map.baseCultureId):null;};
  const create=(first:string|null,last:string|null,gender:number,culture:string|null)=>nativeCreateNamedCharacter(first,last,gender,culture,{
   createBlank:()=>{if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');return nativeCreateBlankCharacter(registry,{construct:():KinPerson=>({...nativeCharacterDefaults<string,ReturnType<typeof nativeSpouseRoleDefaults>>(),source:'initial-family',initialAge:null}),gameTime:()=>r.life.gameTime});},random,
   selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name),
  });
  const p:NativeFamilyMemberPorts<KinPerson>={
   generateInit:(culture,gender,father)=>nativeGenerateInitCharacter(culture,gender,father,{lookupMapCulture:lookup,determineDefaultCultureId:()=>`map-${nativeDefaultCulture(r.naming.language)}`,
    // The fresh-world culture table is complete. Missing Ensure recovery must
    // abort this private transaction, not invent/register a different culture.
    ensureMapCultureForInit:()=>{throw Error('初始人物文化缺失，已取消新局。');},
    generateName:(c,g,_l,_p,fatherFirstName)=>nativeCharacterName(c,{gender:g,language:null,currentLanguage:()=>r.naming.language,usePatronymic:false,fatherFirstName,defaultCulture:()=>originalNamingCulture(nativeDefaultCulture(r.naming.language)),intRange:random.intRange}),
    getLastName:person=>kinLastName(r,person),createCharacter:create,
   }).character,
   getCharacter:id=>registry.characters.get(id)??null,lastName:person=>kinLastName(r,person),random,
   birthTimeFromAge:age=>nativeBirthTimeFromAge(age,r.life.gameTime,r.life.secondsPerDay),updateAge:person=>nativeUpdateCharacterAge(person,b=>nativeGetYearSince(b,r.life.gameTime,r.life.secondsPerDay,calendar)),gameTime:()=>r.life.gameTime,createSpouseRole:nativeSpouseRoleDefaults,
   reportMissingSpouse:()=>{throw Error('初始配偶缺失，未保存不完整家谱。');},
   generateCollateralHousehold:(person,f,c,isCousin)=>nativeGenerateCollateralHousehold(person,f,c,isCousin,p),
  };
  nativeGenerateLeaderSpouse(leader,family,{i:family.stateId},family.cultureName,p);
  nativeGenerateLeaderChildren(leader,family,true,p);
  nativeGenerateCollateralMembers(leader,family,family.cultureName,p);
 }
 for(const [id,person]of registry.characters)s.persons[id]=person;
 r.people.nextPersonId=registry.nextId;r.people.revision++;s.revision++;return s;
}
