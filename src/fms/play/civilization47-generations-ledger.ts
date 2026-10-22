import type {Population47,FamilyPerson47} from './civilization47-population-types';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './civilization47-iso-calendar';

export const GENERATIONS_RULE47='known-couples-birth-household-web-v1';
export type Birth47={personId:number;fatherId:number;motherId:number;familyId:number;day:number;tick:number;entryId:number};
export type Marriage47={aId:number;bId:number;movingPersonId:number;fromFamilyId:number;toFamilyId:number;day:number;tick:number;entryId:number};
export type Generations47={version:1;rule:typeof GENERATIONS_RULE47;enabledTick:number;firstPersonId:number;lastMonth:number;random:{state:number;draws:number};initialCouples:[number,number][];births:Birth47[];marriages:Marriage47[]};
export const generationMonth47=(r:Population47)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
export function personAgeAt47(r:Population47,p:FamilyPerson47,tick:number){return nativeGetYearSince(p.birthTime,Math.fround(tick/120*r.life.secondsPerDay),r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));}
export function aliveAt47(r:Population47,id:number,tick:number){const p=r.kin.persons[id];return !!p&&p.birthTime<=Math.fround(tick/120*r.life.secondsPerDay)&&!r.kin.lifecycle.deaths.some(d=>d.personId===id&&d.tick<=tick);}
/** Excludes every known direct ancestor, siblings and shared grandparents.
 * Missing native ancestry is unknown, never claimed to prove unrelatedness. */
export function closeKin47(r:Population47,a:number,b:number){
 const ancestors=(id:number,max:number)=>{const out=new Set<number>();let level=[id];for(let i=0;i<max&&level.length;i++){const next:number[]=[];for(const n of level){const p=r.kin.persons[n];for(const parent of [p?.fatherId,p?.motherId])if(parent&&!out.has(parent)){out.add(parent);next.push(parent);}}level=next;}return out;};
 if(a===b)return true;const aa=ancestors(a,Object.keys(r.kin.persons).length),bb=ancestors(b,Object.keys(r.kin.persons).length);if(aa.has(b)||bb.has(a))return true;
 const nearA=ancestors(a,2),nearB=ancestors(b,2);return [...nearA].some(id=>nearB.has(id));
}
/** Rebuild membership from immutable appointments plus explicit births/moves.
 * entryId disambiguates births, weddings and grants on the same month tick. */
export function generationMembership47(r:Population47,beforeEntry=Infinity){
 const members=new Map(Object.values(r.kin.persons).filter(p=>p.source!=='newborn').map(p=>[p.id,p.stateId]));
 const rows=[...(r.houses?.grants??[]).map(v=>({kind:'grant' as const,...v})),...(r.generations?.births??[]).map(v=>({kind:'birth' as const,...v})),...(r.generations?.marriages??[]).map(v=>({kind:'marriage' as const,...v}))].sort((a,b)=>a.entryId-b.entryId);
 let previous=0;
 for(const v of rows){if(v.entryId>=beforeEntry)break;if(v.entryId<=previous)throw Error('家族成员履历次序重复。');previous=v.entryId;
  if(v.kind==='birth'){if(members.has(v.personId)||members.get(v.fatherId)!==v.familyId||members.get(v.motherId)!==v.familyId)throw Error('出生家庭与父母履历不符。');members.set(v.personId,v.familyId);}
  else if(v.kind==='marriage'){if(members.get(v.movingPersonId)!==v.fromFamilyId||members.get(v.aId)!==v.toFamilyId)throw Error('婚姻转入来源不符。');members.set(v.movingPersonId,v.toFamilyId);}
  else for(const id of v.memberIds){if(members.get(id)!==v.parentId)throw Error('分封历史成员来源不符。');members.set(id,v.familyId);}
 }
 return members;
}
export function familyMembersAt47(r:Population47,familyId:number,beforeEntry=Infinity){return [...generationMembership47(r,beforeEntry)].filter(([,f])=>f===familyId).map(([id])=>id);}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const int=(v:number,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function assertGenerations47(r:Population47){
 const s=r.generations;if(!s){if(Object.values(r.kin.persons).some(p=>p.source==='newborn'))throw Error('新生儿缺少出生规则。');return;}
 const fail=():never=>{throw Error('出生、婚姻或家族成员历史不一致。');};
 if(!exact(s,['version','rule','enabledTick','firstPersonId','lastMonth','random','initialCouples','births','marriages'])||s.version!==1||s.rule!==GENERATIONS_RULE47||s.enabledTick!==0||!int(s.firstPersonId,1,2147483646)||s.lastMonth!==generationMonth47(r)||!exact(s.random,['state','draws'])||!int(s.random.state,0,4294967295)||!int(s.random.draws)||!Array.isArray(s.initialCouples)||!Array.isArray(s.births)||!Array.isArray(s.marriages))return fail();
 const couples=new Map<number,number>(),foundings=(r as {foundings?:{records:{personIds:number[];couples:[number,number][]}[]}}).foundings?.records??[],founded=new Set(foundings.flatMap(f=>f.personIds));
 for(const pair of s.initialCouples){if(!Array.isArray(pair)||pair.length!==2||pair[0]>=pair[1])return fail();const [a,b]=pair.map(id=>r.kin.persons[id]);if(!a||!b||a.id>=s.firstPersonId||b.id>=s.firstPersonId||a.gender===b.gender||a.stateId!==b.stateId||couples.has(a.id)||couples.has(b.id))return fail();couples.set(a.id,b.id);couples.set(b.id,a.id);}
 // Couples of a state founded mid-run (rebellion) are initial couples of that state.
 for(const f of foundings)for(const pair of f.couples){const [a,b]=pair.map(id=>r.kin.persons[id]);if(!a||!b||!f.personIds.includes(a.id)||!f.personIds.includes(b.id)||a.gender===b.gender||a.stateId!==b.stateId||couples.has(a.id)||couples.has(b.id))return fail();couples.set(a.id,b.id);couples.set(b.id,a.id);}
 const events=[...s.births.map(v=>({kind:'birth' as const,...v})),...s.marriages.map(v=>({kind:'marriage' as const,...v}))].sort((a,b)=>a.entryId-b.entryId),born=new Set<number>();let entry=0,birthId=s.firstPersonId;
 for(const v of events){
  const keys=v.kind==='birth'?['kind','personId','fatherId','motherId','familyId','day','tick','entryId']:['kind','aId','bId','movingPersonId','fromFamilyId','toFamilyId','day','tick','entryId'];
  const e=r.chronicle.entries.find(e=>e.id===v.entryId),date=isoPlusDays(r.life.startDate,v.day);
  if(!exact(v,keys)||!int(v.day,1,r.world.day)||!int(v.tick,120,r.clock.tick)||v.tick!==v.day*120||date.day!==1||!int(v.entryId,entry+1)||!e||e.kind!=='diplomacy'||e.tick!==v.tick||e.day!==v.day)return fail();entry=v.entryId;
  const members=generationMembership47(r,v.entryId);
  if(v.kind==='birth'){
   const p=r.kin.persons[v.personId],father=r.kin.persons[v.fatherId],mother=r.kin.persons[v.motherId],f=r.kin.families[v.familyId];
   if(!p||!father||!mother||!f||p.source!=='newborn'||p.id!==(()=>{while(founded.has(birthId))birthId++;return birthId++;})()||born.has(p.id)||p.originalFamilyId!==f.id||p.birthTime!==Math.fround(v.tick/120*r.life.secondsPerDay)||p.fatherId!==father.id||p.motherId!==mother.id||father.gender!==0||mother.gender!==1||!aliveAt47(r,father.id,v.tick)||!aliveAt47(r,mother.id,v.tick)||members.get(father.id)!==f.id||members.get(mother.id)!==f.id||couples.get(father.id)!==mother.id||personAgeAt47(r,mother,v.tick)<18||personAgeAt47(r,mother,v.tick)>42||personAgeAt47(r,father,v.tick)<18||personAgeAt47(r,father,v.tick)>65||e.nationIds.length!==1||e.nationIds[0]!==f.nationId)return fail();born.add(p.id);
  }else{
   const a=r.kin.persons[v.aId],b=r.kin.persons[v.bId],f=r.kin.families[v.toFamilyId];
   if(!a||!b||!f||v.aId===v.bId||a.gender===b.gender||v.movingPersonId!==b.id||members.get(a.id)!==f.id||members.get(b.id)!==v.fromFamilyId||a.stateId!==b.stateId||a.cultureName!==b.cultureName||couples.has(a.id)||couples.has(b.id)||!aliveAt47(r,a.id,v.tick)||!aliveAt47(r,b.id,v.tick)||personAgeAt47(r,a,v.tick)<18||personAgeAt47(r,b,v.tick)<18||closeKin47(r,a.id,b.id)||e.nationIds.length!==1||e.nationIds[0]!==f.nationId)return fail();couples.set(a.id,b.id);couples.set(b.id,a.id);
  }
 }
 const members=generationMembership47(r);
 while(founded.has(birthId))birthId++;
 if(r.people.nextPersonId!==birthId||members.size!==Object.keys(r.kin.persons).length)return fail();
 for(const p of Object.values(r.kin.persons)){
  if((p.source==='newborn')!==born.has(p.id)||members.get(p.id)!==p.familyId||p.source!=='newborn'&&p.id>=s.firstPersonId&&!founded.has(p.id))return fail();
  const mate=couples.get(p.id),selfDeath=r.kin.lifecycle.deaths.findIndex(d=>d.personId===p.id),mateDeath=r.kin.lifecycle.deaths.findIndex(d=>d.personId===mate);
  const expected=mate&&(mateDeath<0||selfDeath>=0&&selfDeath<mateDeath)?mate:0;if(p.spouseId!==expected)return fail();
 }
}
