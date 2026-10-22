import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {culture47} from './civilization47-catalog';
import {createRulerIdentity47,freshStateName47,nationName47,personNameFromParts47,rulerFromPerson47} from './civilization47-names';
import {leaderRole47} from './civilization47-roles';
import {nativeInitialCharacter,seededCharacterRandom} from './native-economy/character-generation';
import {nativeInitStateLeaderBirth} from './native-economy/leader-birth';
import {nativeBirthTimeFromAge} from './native-economy/character-calendar';
import {nativeCharacterDefaults} from './native-economy/character-registry';
import {nativeLeaderRoleDefaults} from './native-economy/leader-appointment';
import type {NativePastRole} from './native-economy/role-history';
import {createNativeIsoCalendar} from './civilization47-iso-calendar';
import {generateFamilyMembers47} from './civilization47-family';
import type {FamilyPerson47,PersonRole47} from './civilization47-population-types';
import {nameSeed,type Ruler} from './chronicle-records';
import {settlementPalette} from './settlement25-palette';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {reconcileCore} from './core-refresh51';
import {terrainLivelihood47} from './civilization47-economy';
import {nativeDestinyDefaults,nativeRandomDestiny,type DestinyRandom} from './native-economy/destiny';
import {f as fround} from './native-economy/numeric';
import {addFoundedNation46} from './civilization47-diplomatic-state';
import {reconcileWar28Identities} from './war47-wars';
import {announce} from './civilization47-history';
import {relocateLostCapitals47} from './civilization47-capitals';
import {reconcilePortLandOwnersOwned47} from './civilization47-ports';

/** Original StateManager.CreateRebelState + State.Start
 * (InitStateSimulationData / InitializeCharactersAndFamilies): a state founded
 * mid-run gets the same records as a starting state, created at the current
 * game time. Every such state is listed in this ledger; validators accept a
 * nation, ruling family or founding-age person outside the opening only when
 * it is recorded here. Absence keeps the opening-only rules for older worlds. */
export {FOUNDING_RULE47,foundingOfState47,foundingTimeOfState47,foundingMonthOfState47,type Founding47,type Foundings47} from './civilization47-founding-time';
import {FOUNDING_RULE47,type Founding47,type Foundings47} from './civilization47-founding-time';
export type FoundingRun47=PoliticalRun47&{foundings?:Foundings47};
export const foundingDayOfNation47=(r:{foundings?:Foundings47},nationId:string)=>r.foundings?.records.find(f=>f.nationId===nationId)?.day??0;

const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('/')===[...keys].sort().join('/');
export function assertFoundings47(r:FoundingRun47){
  const s=r.foundings;if(s===undefined)return;
  const fail=()=>{throw Error('新建国家记录损坏，原世界保留。');};
  const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v),int=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max,rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const provinces=new Set(r.world.provinces.map(p=>p.id)),nationIds=new Set(r.world.nations.map(n=>n.id));
  if(!exact(s,['version','rule','enabledTick','revision','records','enabled','minMonths','month','random','destinyToRebel','destinyToRebelConnected','recalTime','coreMonths','conquered','lastRebel','recent','updateDays'])||typeof s.enabled!=='boolean'||!int(s.minMonths,0,240)||!int(s.month)||!exact(s.random,['state','draws'])||!int(s.random.state,0,4294967295)||!int(s.random.draws,0,Number.MAX_SAFE_INTEGER)
    ||!int(s.destinyToRebelConnected,0,100)||s.destinyToRebel!==s.destinyToRebelConnected+10||!num(s.recalTime)||s.recalTime>r.life.gameTime
    ||!rec(s.coreMonths)||Object.entries(s.coreMonths).some(([p,m])=>!provinces.has(p)||!rec(m)||Object.entries(m).some(([n,v])=>!nationIds.has(n)||!num(v)||v<0))
    ||!rec(s.conquered)||!exact(s.conquered,[...provinces])||Object.values(s.conquered).some(v=>!exact(v,['controller','time'])||!nationIds.has(v.controller)||!num(v.time)||v.time>r.life.gameTime)
    ||!rec(s.lastRebel)||Object.entries(s.lastRebel).some(([n,v])=>!nationIds.has(n)||!num(v)||v>r.life.gameTime)||!rec(s.recent)||Object.entries(s.recent).some(([n,v])=>!nationIds.has(n)||!Array.isArray(v)||v.some(t=>!num(t)||t>r.life.gameTime))
    ||!rec(s.updateDays)||Object.entries(s.updateDays).some(([p,d])=>!provinces.has(p)||!int(d,1,31))||s.version!==1||s.rule!==FOUNDING_RULE47||!Number.isSafeInteger(s.enabledTick)||s.enabledTick<0||s.enabledTick>r.clock.tick||!Number.isSafeInteger(s.revision)||s.revision<s.records.length||!Array.isArray(s.records))return fail();
  const nations=new Set<string>(),states=new Set<number>();let tick=s.enabledTick;
  for(const f of s.records){
    const n=r.world.nations.find(v=>v.id===f?.nationId),identity=n&&r.civilization.nations[n.id];
    if(!exact(f,['nationId','stateId','parentId','provinceIds','tick','day','gameTime','month','leaderId','personIds','couples','entryId'])||!n||nations.has(f.nationId)||states.has(f.stateId)||r.people.nations[f.nationId]?.id!==f.stateId||!identity||identity.origin!=='secession'||identity.parentId!==f.parentId
      ||!Number.isSafeInteger(f.tick)||f.tick<tick||f.tick>r.clock.tick||f.day!==Math.floor(f.tick/120)||f.gameTime!==Math.fround(f.tick/120*r.life.secondsPerDay)||!Array.isArray(f.provinceIds)||!f.provinceIds.length||!Array.isArray(f.personIds)||!f.personIds.includes(f.leaderId)
      ||f.personIds.some(id=>r.kin.persons[id]?.stateId!==f.stateId)||!r.chronicle.entries.some(e=>e.id===f.entryId&&e.tick===f.tick&&e.nationIds.includes(f.nationId)))return fail();
    nations.add(f.nationId);states.add(f.stateId);tick=f.tick;
  }
  // Every nation outside the opening is a recorded founding.
  for(const n of r.world.nations)if(r.civilization.nations[n.id].origin==='secession'&&!nations.has(n.id))return fail();
}
export function enableFoundings47<T extends FoundingRun47>(input:T):T{
  if(input.foundings)throw Error('新建国家规则已启用。');
  const d=input.life.currentDate,month=d.year*12+d.month-1;
  return {...input,foundings:{version:1,rule:FOUNDING_RULE47,enabledTick:input.clock.tick,revision:0,records:[],
    // Defaults: GameConfig.isAllowRebel=true, minMonthSinceLastRebel=12,
    // DiplomacyManager.destinyToRebel=30 / destniyToRebelConnected=20, last
    // recalculation and every province's last conquest at game time 0.
    enabled:true,minMonths:12,month,random:{state:nameSeed(`${input.world.custom!.seed}/rebellion47`),draws:0},destinyToRebel:30,destinyToRebelConnected:20,recalTime:0,
    coreMonths:{},conquered:Object.fromEntries(input.world.provinces.map(p=>[p.id,{controller:p.controller,time:0}])),lastRebel:{},recent:{},updateDays:{}}};
}

/** Native State.Start RandomDestiny for a new state, with the same stream as
 * destiny20 uses for states it adds (seed per nation id). */
function startDestiny47(r:PoliticalRun47,id:string){
  const random=(st:{seed:number}):DestinyRandom=>{const unit=()=>{st.seed=(Math.imul(st.seed,1664525)+1013904223)>>>0;return st.seed/4294967296;};return {intRange:(min,max)=>min+Math.floor(unit()*(max-min)),floatRange:(min,max)=>fround(min+(max-min)*unit())};};
  const stream={seed:nameSeed(`${r.world.custom?.seed??''}/destiny20/${id}`)},v={...nativeDestinyDefaults(random(stream)),seed:stream.seed,initializedDay:r.world.day,lastMonth:Math.floor(r.world.day/30),restorations:0,resets:0,ledger:null};
  r.destiny.nations[id]=v;const change=nativeRandomDestiny(v,true,random(v));Object.assign(v,change.state);r.upperCombat.nations[id].destiny=v.destiny;
  if(change.clearEmergencyMobilizations)r.tactics.mobilizations[id].recent=[];r.destiny.revision++;
}
function colorFor(r:PoliticalRun47,index:number){
  const used=new Set(r.world.nations.map(n=>n.color.toLowerCase()));
  for(let i=0;i<settlementPalette.length;i++){const c=settlementPalette[(index+i)%settlementPalette.length];if(!used.has(c.toLowerCase()))return c;}
  for(let attempt=1;;attempt++){const c='#'+((nameSeed(`${r.world.custom!.seed}/state-color/${index}`)+attempt*0x43755b)&0xffffff).toString(16).padStart(6,'0');if(!used.has(c))return c;}
}
/** Creates one state on the given provinces of its parent and moves them.
 * War, armies and the rebellion texts are added by the caller. */
/** `family` (FamilyManager.StartFamilyRebellion): the state is founded by an
 * existing family whose living member `leaderId` becomes the first ruler; the
 * culture is the family's, and `moveFamilies` moves it (and rallied families)
 * in before the leader takes office. The state's own family record stays empty. */
export function foundState47(r:FoundingRun47,parentId:string,provinceIds:readonly string[],reason:string,family?:{familyId:number;leaderId:number;moveFamilies:(nationId:string)=>void}):Founding47{
  const s=r.foundings;if(!s)throw Error('本世界未启用新建国家规则。');
  const w=r.world,parent=w.nations.find(n=>n.id===parentId);if(!parent)throw Error('叛乱所属国家不存在。');
  const provinces=provinceIds.map(id=>{const p=w.provinces.find(v=>v.id===id);if(!p||p.controller!==parentId)throw Error('叛乱行省不属于该国。');return p;});
  if(!provinces.length||new Set(provinceIds).size!==provinceIds.length)throw Error('叛乱行省无效。');
  if(w.nations.length>=50)throw Error('本局国家记录已达上限。');
  const index=w.nations.length,id='n-'+index;if(w.nations.some(n=>n.id===id))throw Error('新国家编号冲突。');
  const capital=w.cities.find(c=>c.provinceId===provinces[0].id);if(!capital)throw Error('叛乱行省没有城市。');
  const seed=w.custom!.seed,day=w.day,tick=r.clock.tick,c=r.civilization,cultureId=family?r.kin.families[family.familyId].cultureName:c.cities[capital.id].cultureId,profile=culture47(cultureId);
  // Religion follows the provinces (DetermineStateReligion); the web keeps
  // religion per state, so the parent's religion is the provinces' religion.
  const identity={cultureId,religionId:c.nations[parentId].religionId,polity:profile.suggestedPolity,name:freshStateName47(c,cultureId,`${seed}/rebel-state/${id}`),origin:'secession' as const,parentId};
  c.nations[id]=identity;c.revision++;
  w.nations.push({id,name:nationName47(identity),color:colorFor(r,index),capitalId:capital.id,regimeId:'regime-'+index,dynastyId:'dynasty-'+index});
  w.statecraft!.nations.push({nationId:id,priority:'balanced',lastLedger:null,lastDecision:null});
  for(const n of w.nations.filter(n=>n.id!==id)){const [a,b]=[n.id,id].sort();w.statecraft!.relations.push({a,b,status:'peace',sinceDay:day,truceUntilDay:0});}
  // Ruler identity and chronicle reign, as initialCivilizationChronicle47 does at day 0.
  const reignId=`ruler-${id}-1`,ruler=family?rulerFromPerson47(r.kin.persons[family.leaderId].identity,identity):createRulerIdentity47(c,id,reignId,seed);c.rulers[reignId]=ruler;
  const reign:Ruler={id:reignId,name:ruler.name,family:ruler.house,order:1,regnalName:ruler.given,regnalOrdinal:1,ascendedDay:day,endedDay:null,termEndDay:day+(12+nameSeed(reignId)%14)*365};
  r.chronicle.leaders[id]=[reign];
  // Court person and founding birth (State.InitializeCurrentLeaderRecord), at the current time.
  const life=r.life,stateId=r.houses?r.houses.nextFamilyId:r.people.nextStateId;
  if(r.houses)r.houses.nextFamilyId++;r.people.nextStateId=Math.max(r.people.nextStateId,stateId+1);
  r.people.nations[id]={id:stateId,leaderId:null,offices:{assignments:[],normalized:true,revision:0}};
  const month=r.life.lastAgeMonth;let personId:number,personIds:number[],couples:[number,number][];
  if(family){
    // The family (and rallied families) move in; its leader takes office (AppointLeader 'rebellion').
    family.moveFamilies(id);
    const leader=r.kin.persons[family.leaderId];personId=leader.id;
    if(leader.stateId!==stateId||Object.hasOwn(r.people.persons,personId))throw Error('叛乱家族领袖无法就任。');
    r.people.persons[personId]={id:personId,stateId,nationId:id,rulerId:reignId,name:ruler.name,family:ruler.house,alive:true,recordedDay:day,base:structuredClone(leader.base),traits:[...(leader.traits??[])]};
    r.people.nations[id].leaderId=personId;r.people.revision++;
    leader.roles.push(leaderRole47(r,leader,ruler.titleAtAccession));
    r.kin.families[stateId]={id:stateId,surname:r.kin.families[family.familyId].surname,cultureName:cultureId,nationId:id,stateId,headId:0,heirId:0,allowFemaleInheritance:false,memberIds:[],collateralMemberIds:[]};
    r.kin.revision++;personIds=[personId];couples=[];
  }else{
    const random=seededCharacterRandom(`${seed}/native-person/${reignId}/${tick}`),generated=nativeInitialCharacter(random),birth={age:0,birthTime:0};personId=r.people.nextPersonId++;
    nativeInitStateLeaderBirth(birth,random,age=>nativeBirthTimeFromAge(age,life.gameTime,life.secondsPerDay));
    r.people.persons[personId]={id:personId,stateId,nationId:id,rulerId:reignId,name:ruler.name,family:ruler.house,alive:true,recordedDay:day,base:generated.base,traits:generated.traits.map(t=>t.name)};
    r.people.nations[id].leaderId=personId;r.people.revision++;
    life.persons[personId]={source:'native-founding',birthTime:birth.birthTime,age:birth.age,initialAge:birth.age,updatedMonth:month};life.revision++;
    // Ruling family (InitializeCharactersAndFamilies).
    const name=personNameFromParts47(ruler.cultureId,ruler.given,ruler.house,ruler.gender);
    const leader:FamilyPerson47={...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),id:personId,firstName:name.given,lastName:name.house,cultureName:name.cultureId,gender:name.gender,age:birth.age,birthTime:birth.birthTime,familyId:stateId,originalFamilyId:stateId,stateId,religionId:ruler.religionId,base:structuredClone(generated.base),traits:generated.traits.map(t=>t.name),source:'founding',initialAge:birth.age,identity:name};
    leader.roles.push({...nativeLeaderRoleDefaults(()=>life.gameTime),nativeKind:'leader',holderId:personId,stateId,title:ruler.titleAtAccession});
    const kin=r.kin,registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>([[personId,leader]])};kin.persons[personId]=leader;
    const family=kin.families[stateId]={id:stateId,surname:name.house,cultureName:name.cultureId,nationId:id,stateId,headId:personId,heirId:0,allowFemaleInheritance:false,memberIds:[personId],collateralMemberIds:[]};
    generateFamilyMembers47(r,kin,life,registry,createNativeIsoCalendar(life.startDate),family);
    for(const [pid,p] of registry.characters){
      p.identity=personNameFromParts47(culture47(p.cultureName!).id,p.firstName!,p.lastName!,p.gender as 0|1);kin.persons[pid]=p;
      if(p.source==='initial-family')life.persons[pid]={source:'native-family',birthTime:p.birthTime,age:p.age,initialAge:null,updatedMonth:month};
    }
    r.people.nextPersonId=registry.nextId;kin.revision++;
    personIds=[...registry.characters.keys()];couples=[...registry.characters.values()].filter(p=>p.spouseId>p.id).map(p=>[p.id,p.spouseId] as [number,number]);
  }
  r.sovereignty.reigns[reignId]=personId;r.sovereignty.restorations[id]=0;r.sovereignty.revision++;
  if(r.houseGovernance)r.houseGovernance.enabled[id]=true;
  // Government rows: gold starts at 0 (a new State object), destiny by RandomDestiny.
  r.upperCombat.nations[id]={polity:identity.polity,traits:[],destiny:0,coreThreshold:2,coreYear:Math.floor(day/360),provinceOrder:[]};
  r.finance.nations[id]={gold:0,goldPerMonth:0,armyCostGold:0,goldBattleModifier:1,initializedDay:day,lastMonth:Math.floor(day/30),ledger:null};
  r.economy.nations[id]={ethnic:terrainLivelihood47(provinceIds,r.finance.provinces),source:'terrain-start',provinceIds:[...provinceIds]};r.economy.revision++;
  r.tactics.mobilizations[id]={lastMonth:null,recent:[]};
  startDestiny47(r,id);
  r.combatPersonnel.nations[id]={damageTraits:[],leader:{leaderId:null,traitNames:[],enemyIds:[],refreshedTick:tick,modifier:0}};
  r.diplomacy.nations[id]=true;r.diplomacy.revision++;
  addFoundedNation46(r.nativeDiplomacy,r,id,parentId);
  reconcileWar28Identities(r.nativeWars,r as never);
  // Provinces change hands (OnProvinceRemoved / OnProvinceAdded); the parent
  // capital is recalculated if it was among them (State.RecalculateCapital).
  for(const p of provinces){transferEconomy(w,p.id,parentId,id);p.controller=p.legalOwner=id;}
  const moved=new Set(provinceIds);
  r.occupation={...r.occupation,sieges:r.occupation.sieges.filter(v=>!moved.has(v.provinceId))};
  relocateLostCapitals47(r);reconcileCore(w,r.upperCombat);reconcilePortLandOwnersOwned47(r);
  const entry=announce(r.chronicle,w,tick,'uprising',`${w.nations[index].name} 成立于 ${provinces[0].name}`,reason,[parentId,id],provinces[0].id,[reign]);
  const founding:Founding47={nationId:id,stateId,parentId,provinceIds:[...provinceIds],tick,day,gameTime:life.gameTime,month,leaderId:personId,personIds,couples,entryId:entry.id};
  s.records.push(founding);s.revision++;
  return founding;
}
