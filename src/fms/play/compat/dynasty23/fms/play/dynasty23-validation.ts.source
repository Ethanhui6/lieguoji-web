import type {Life22Run} from './life22-model';
import {isKnownKin,kinName,kinLastName,type KinState,type KinPerson} from './dynasty23-state';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
const record=(v:unknown):boolean=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,k:string[])=>record(v)&&Object.keys(v as object).some(x=>!k.includes(x));
const stateKeys=['version','origin','revision','ageTime','lastAgeMonth','persons','families'];
const familyKeys=['id','surname','cultureName','nationId','stateId','headId','allowFemaleInheritance','memberIds','collateralMemberIds'];
const personKeys=['id','firstName','lastName','cultureName','gender','age','birthTime','deathTime','isAlive','isHistoricallyImportant','familyId','originalFamilyId','stateId','religionId','fatherId','motherId','spouseId','marriageType','base','traits','childrenIds','roles','pastRoles','source','initialAge'];
export function assertKinSchema(v:unknown):void{
 const s=v as KinState|undefined,fail=()=>{throw Error('家族存档含未来规则或未知字段，已锁定读写。');};
 if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||s?.origin!=null&&s.origin!=='native-initial-family-web-stream-v1')fail();
 if(record(s?.families)&&Object.values(s!.families).some(f=>unknown(f,familyKeys)))fail();
 if(record(s?.persons))for(const p of Object.values(s!.persons)){
  if(p?.source!=null&&!['founding','initial-family','legacy-unknown','web-observed'].includes(p.source)||unknown(p,p?.source==null||isKnownKin(p)?personKeys:['id','source']))fail();
  const detail=p as Partial<KinPerson>|null|undefined;
  if(detail&&(detail.source==null||isKnownKin(p))&&(unknown(detail.base,['charisma','military','diplomatic','administrative'])||Array.isArray(detail.traits)&&detail.traits.some(t=>typeof t==='string'&&!NATIVE_CHARACTER_POOL.some(n=>n.name===t))||Array.isArray(detail.roles)&&detail.roles.some(r=>unknown(r,['roleType','holderId','startTime','spouseOfId','stateId'])||r?.roleType!=null&&r.roleType!=='Spouse')||Array.isArray(detail.pastRoles)&&detail.pastRoles.length))fail();
 }
}
export function assertKin(s:KinState,r:Life22Run):void{
 assertKinSchema(s);const fail=()=>{throw Error('家谱或人物关联损坏，已保留原档。');},integer=(n:unknown,min=0,max=2147483647)=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||s.origin!=='native-initial-family-web-stream-v1'||!integer(s.revision)||!record(s.persons)||!record(s.families)||s.lastAgeMonth!==r.life.lastAgeMonth||!Number.isFinite(s.ageTime)||s.ageTime<0||s.ageTime>r.life.gameTime)return fail();
  const calendar=createNativeIsoCalendar(r.life.startDate),listed=new Set<number>();
  if(Object.keys(s.families).length&&s.ageTime!==Math.fround((r.world.day-r.life.originDay-r.life.currentDate.day+1)*r.life.secondsPerDay))return fail();
 for(const [id,f]of Object.entries(s.families)){
  const name=r.naming.families[id],head=s.persons[f.headId];
  if(!record(f)||Object.keys(f).length!==familyKeys.length||String(f.id)!==id||!name||f.surname!==name.surname||f.cultureName!==name.cultureName||f.stateId!==r.people.nations[f.nationId]?.id||!isKnownKin(head)||head.familyId!==f.id||!Array.isArray(f.memberIds)||!Array.isArray(f.collateralMemberIds)||typeof f.allowFemaleInheritance!=='boolean')return fail();
  for(const personId of [...f.memberIds,...f.collateralMemberIds]){const p=s.persons[personId];if(!isKnownKin(p)||p.familyId!==f.id||p.stateId!==f.stateId||listed.has(personId))return fail();listed.add(personId);}
  if(!f.memberIds.includes(f.headId))return fail();
 }
 for(const [id,p]of Object.entries(s.persons)){
  if(!record(p)||String(p.id)!==id||!integer(p.id,1,r.people.nextPersonId-1))return fail();
  if(!isKnownKin(p)){if(Object.keys(p).length!==2||!['legacy-unknown','web-observed'].includes(p.source)||!r.people.persons[id])return fail();continue;}
  const family=s.families[p.familyId],life=r.life.persons[id];
  if(Object.keys(p).length!==personKeys.length||!listed.has(p.id)||!family||!r.culture.maps[p.cultureName??'']||![0,1].includes(p.gender)||!integer(p.age,0,20000)||!Number.isFinite(p.birthTime)||p.birthTime!==Math.fround(p.birthTime)||typeof p.firstName!=='string'||!p.firstName||typeof p.lastName!=='string'||!integer(p.originalFamilyId)||p.originalFamilyId>0&&!r.naming.families[p.originalFamilyId]||typeof p.isAlive!=='boolean'||p.deathTime!==0||p.isHistoricallyImportant!==false||p.religionId!==null||p.marriageType!==0||!record(p.base)||Object.keys(p.base).length!==4||Object.values(p.base).some(n=>!Number.isFinite(n)||n<0||n>100)||!Array.isArray(p.traits)||new Set(p.traits).size!==p.traits.length||p.traits.some(t=>!NATIVE_CHARACTER_POOL.some(n=>n.name===t))||!Array.isArray(p.childrenIds)||new Set(p.childrenIds).size!==p.childrenIds.length||!Array.isArray(p.roles)||!Array.isArray(p.pastRoles)||p.pastRoles.length)return fail();
  if(p.source==='founding'){if(!life||life.source!=='native-founding'||p.initialAge!==life.initialAge||p.age!==life.age||p.birthTime!==life.birthTime)return fail();}else if(p.initialAge!==null||p.age!==nativeGetYearSince(p.birthTime,s.ageTime,r.life.secondsPerDay,calendar))return fail();
  for(const key of ['spouseId','fatherId','motherId'] as const){const ref=p[key],other=s.persons[ref];if(!integer(ref)||ref===p.id||ref>0&&(!isKnownKin(other)||other.familyId!==p.familyId||key==='spouseId'&&other.spouseId!==p.id||key!=='spouseId'&&!other.childrenIds.includes(p.id)))return fail();}
  for(const child of p.childrenIds){const c=s.persons[child];if(!isKnownKin(c)||c.fatherId!==p.id&&c.motherId!==p.id)return fail();}
  for(const role of p.roles)if(!record(role)||Object.keys(role).length!==5||role.roleType!=='Spouse'||role.holderId!==p.id||role.spouseOfId!==p.spouseId||role.stateId!==p.stateId||role.startTime!==0)return fail();
  const court=r.people.persons[id];if(court&&(court.alive!==p.isAlive||court.stateId!==p.stateId||court.name!==kinName(r,p)||court.family!==kinLastName(r,p)||JSON.stringify(court.base)!==JSON.stringify(p.base)||JSON.stringify(court.traits)!==JSON.stringify(p.traits)))return fail();
 }
 for(const id of Object.keys(r.people.persons))if(!s.persons[id])return fail();
}
