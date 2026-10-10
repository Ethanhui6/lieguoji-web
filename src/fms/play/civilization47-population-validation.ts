import {assertCivilization47,assertPersonName47} from './civilization47-names';
import {religion47} from './civilization47-catalog';
import {assertChronicleState47} from './civilization47-chronicle-validation';
import {assertLifecycle47} from './civilization47-lifecycle-validation';
import {assertPeople} from './restoration19-people';
import {NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeBirthTimeFromAge,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';
import type {Population47} from './civilization47-population-types';
import {assertOrigins47} from './civilization47-origins';
import {assertHouses47} from './civilization47-houses';
import {assertHouseGovernance47} from './civilization47-house-governance';

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:unknown,keys:readonly string[])=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown,min=0,max=2147483647):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const personKeys=['id','firstName','lastName','cultureName','gender','age','birthTime','deathTime','isAlive','isHistoricallyImportant','familyId','originalFamilyId','stateId','religionId','fatherId','motherId','spouseId','marriageType','base','traits','childrenIds','roles','pastRoles','source','initialAge','identity'];
const uniqueIds=(v:unknown):v is number[]=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(n=>integer(n,1));
export function assertPopulation47(r:Population47) {
  const fail=()=>{throw Error('真实文化家谱、年龄或人物任次损坏，原世界未改动。');};
  assertCivilization47(r.civilization,r.world,r.chronicle);
  if(typeof r.id!=='string'||r.id!==r.world.custom?.id)return fail();
  const s=r.kin,l=r.life,v=r.sovereignty;
  if(!exact(s,['version','origin','revision','ageTime','lastAgeMonth','persons','families','lifecycle'])||s.version!==1||s.origin!=='native-family-real-culture-v1'||!integer(s.revision)||!record(s.persons)||!record(s.families))return fail();
  assertChronicleState47(r);
  if(!exact(l,['version','schedule','revision','originDay','startDate','secondsPerDay','gameTime','lastTick','currentDate','lastAgeMonth','persons'])||l.version!==1||l.schedule!=='iso-age-web-ticks-v1'||!integer(l.revision)||l.originDay!==0||!exact(l.startDate,['year','month','day'])||l.startDate.year!==1||l.startDate.month!==1||l.startDate.day!==1||l.secondsPerDay!==Math.fround(.1)||!exact(r.clock,['version','tick'])||r.clock.version!==1||!integer(r.clock.tick,0,120_000_000_000)||Math.floor(r.clock.tick/120)!==r.world.day||l.lastTick!==r.clock.tick||l.gameTime!==Math.fround(r.clock.tick/120*l.secondsPerDay)||!exact(l.currentDate,['year','month','day'])||!exact(l.persons,Object.keys(s.persons)))return fail();
  const date=isoPlusDays(l.startDate,r.world.day),month=date.year*12+date.month-1,calendar=createNativeIsoCalendar(l.startDate),ageTime=Math.fround((r.world.day-date.day+1)*l.secondsPerDay);
  if(l.currentDate.year!==date.year||l.currentDate.month!==date.month||l.currentDate.day!==date.day||l.lastAgeMonth!==month||s.lastAgeMonth!==month||s.ageTime!==ageTime)return fail();
  if(!exact(v,['version','revision','provinces','reigns','restorations','nativeRebels'])||v.version!==1||!integer(v.revision)||!exact(v.provinces,r.world.provinces.map(p=>p.id))||!exact(v.restorations,r.world.nations.map(n=>n.id))||!exact(v.reigns,Object.keys(r.civilization.rulers))||!record(v.nativeRebels))return fail();
  // Political creation/restoration registers its own records in a later slice;
  // do not accept unverified flags now merely because they are empty on create.
  if(Object.keys(v.nativeRebels).length||Object.entries(v.restorations).some(([id,n])=>!integer(n)||n!==r.chronicle.entries.filter(e=>e.kind==='restoration'&&e.nationIds.includes(id)).length))return fail();
  for(const p of r.world.provinces){const row=v.provinces[p.id],city=r.world.cities.find(c=>c.id===row?.sourceCityId);if(!exact(row,['mapCultureId','sourceCityId','recordedDay','origin'])||!city||city.provinceId!==p.id||row.mapCultureId!==r.civilization.cities[city.id].cultureId||row.recordedDay!==0||row.origin!=='new-world')return fail();}
  assertPeople(r.people,r,v);
  // Extra houses need an exact recorded split; never accept arbitrary new IDs.
  assertHouses47(r);
  assertHouseGovernance47(r);
  if(!exact(s.families,[...Object.values(r.people.nations).map(n=>String(n.id)),...(r.houses?.grants??[]).map(g=>String(g.familyId))]))return fail();
  const listed=new Set<number>();
  for(const [id,f] of Object.entries(s.families)){
    const head=s.persons[f?.headId];
    if(!exact(f,['id','surname','cultureName','nationId','stateId','headId','heirId','allowFemaleInheritance','memberIds','collateralMemberIds'])||!integer(f.id,1)||String(f.id)!==id||!r.civilization.enabled.includes(f.cultureName)||!Object.hasOwn(r.people.nations,f.nationId)||f.stateId!==r.people.nations[f.nationId].id||!integer(f.headId)||f.headId!==0&&(!head||head.familyId!==f.id)||typeof f.allowFemaleInheritance!=='boolean'||!uniqueIds(f.memberIds)||!uniqueIds(f.collateralMemberIds)||f.headId!==0&&!f.memberIds.includes(f.headId)&&!f.collateralMemberIds.includes(f.headId))return fail();
    for(const member of [...f.memberIds,...f.collateralMemberIds]){const p=s.persons[member];if(!p||p.familyId!==f.id||p.stateId!==f.stateId||listed.has(member))return fail();listed.add(member);}
    if(f.id!==f.stateId&&!r.houses?.grants.some(g=>g.familyId===f.id)||f.cultureName!==r.civilization.nations[f.nationId].cultureId)return fail();
  }
  if(listed.size!==Object.keys(s.persons).length)return fail();
  for(const [id,p] of Object.entries(s.persons)){
    if(!exact(p,personKeys)||!integer(p.id,1,r.people.nextPersonId-1)||String(p.id)!==id||!['founding','initial-family'].includes(p.source)||!integer(p.familyId,1)||!Object.hasOwn(s.families,p.familyId)||!integer(p.originalFamilyId)||p.originalFamilyId>0&&!Object.hasOwn(s.families,p.originalFamilyId)||![0,1].includes(p.gender)||!integer(p.age,0,20000)||!Number.isFinite(p.birthTime)||p.birthTime!==Math.fround(p.birthTime)||!Number.isFinite(p.deathTime)||p.deathTime<0||typeof p.isAlive!=='boolean'||typeof p.isHistoricallyImportant!=='boolean'||p.marriageType!==0||!exact(p.base,['charisma','military','diplomatic','administrative'])||Object.values(p.base).some(n=>!Number.isFinite(n)||n<0||n>100)||!Array.isArray(p.traits)||p.traits.length>27||new Set(p.traits).size!==p.traits.length||p.traits.some(t=>!NATIVE_CHARACTER_POOL.some(n=>n.name===t))||!uniqueIds(p.childrenIds)||!Array.isArray(p.roles)||!Array.isArray(p.pastRoles))return fail();
    assertPersonName47(p.identity,r.civilization.peopleMode,r.civilization.enabled);religion47(p.religionId!);
    // Both accepted sources were born before or at day-zero initialization.
    // Whole-year rounding alone can otherwise accept a future newborn as age 0.
    if(p.birthTime>0||p.originalFamilyId!==(p.source==='founding'?p.familyId:0))return fail();
    const f=s.families[p.familyId],birth=l.persons[id],house=s.families[p.originalFamilyId||p.familyId].surname;
    if(p.cultureName!==f.cultureName||p.identity.cultureId!==p.cultureName||p.identity.given!==p.firstName||p.identity.house!==p.lastName||p.identity.house!==house||p.identity.gender!==p.gender||!exact(birth,['source','birthTime','age','initialAge','updatedMonth'])||birth.birthTime!==p.birthTime||birth.age!==p.age||!integer(birth.updatedMonth,12,month)||p.isAlive&&birth.updatedMonth!==month)return fail();
    if(p.source==='founding') {if(birth.source!=='native-founding'||!integer(p.initialAge,35,54)||birth.initialAge!==p.initialAge||p.birthTime!==nativeBirthTimeFromAge(p.initialAge,0,l.secondsPerDay)||month===12&&p.age!==p.initialAge)return fail();}
    else if(birth.source!=='native-family'||birth.initialAge!==null||p.initialAge!==null)return fail();
    if(p.isAlive&&(p.source!=='founding'||month!==12)&&p.age!==nativeGetYearSince(p.birthTime,ageTime,l.secondsPerDay,calendar))return fail();
    for(const key of ['spouseId','fatherId','motherId'] as const){const ref=p[key],other=s.persons[ref];if(!integer(ref)||ref===p.id||ref>0&&(!other||(key==='spouseId'?other.familyId!==p.familyId:other.stateId!==p.stateId||(!r.houses&&other.familyId!==p.familyId))||key==='spouseId'&&(p.isAlive?(!other.isAlive||other.spouseId!==p.id):other.isAlive&&other.spouseId!==0)||key!=='spouseId'&&!other.childrenIds.includes(p.id)||key==='fatherId'&&other.gender!==0||key==='motherId'&&other.gender!==1))return fail();}
    for(const child of p.childrenIds){const c=s.persons[child];if(!c||c.fatherId!==p.id&&c.motherId!==p.id)return fail();}
    const court=r.people.persons[id];if(court&&(court.alive!==p.isAlive||court.stateId!==p.stateId||court.name!==p.identity.name||court.family!==p.identity.house||JSON.stringify(court.base)!==JSON.stringify(p.base)||JSON.stringify(court.traits)!==JSON.stringify(p.traits)))return fail();
  }
  const visiting=new Set<number>(),done=new Set<number>();
  const visit=(id:number)=>{if(visiting.has(id))return fail();if(done.has(id))return;visiting.add(id);const p=s.persons[id];for(const parent of [p.fatherId,p.motherId])if(parent)visit(parent);visiting.delete(id);done.add(id);};
  for(const p of Object.values(s.persons))visit(p.id);
  for(const [id,p] of Object.entries(r.people.persons))if(!Object.hasOwn(s.persons,id)||v.reigns[p.rulerId]!==p.id)return fail();
  for(const [reign,id] of Object.entries(v.reigns)){
    const p=r.people.persons[id],person=s.persons[id],name=r.civilization.rulers[reign],history=p&&r.chronicle.leaders[p.nationId]?.find(h=>h.id===reign);
    if(!integer(id,1)||!p||!person||!history||history.name!==person.identity.name||history.family!==person.identity.house||history.ascendedDay<p.recordedDay||name.sourceKey!==person.identity.sourceKey||name.cultureId!==person.identity.cultureId)return fail();
  }
  assertLifecycle47(r);
  assertOrigins47(r);
}
