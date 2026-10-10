// Engine47 lifecycle contract. Historical engines retain chronicle-model's
// original kind and active-ruler rules unchanged. Vacancy/death evidence is
// cross-checked by assertLifecycle47, not accepted as a permissive flag.
import {validRegnalName,type Chronicle} from './chronicle-records';
import type {Population47} from './civilization47-population-types';
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).some(k=>['__proto__','prototype','constructor'].includes(k));
const integer=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
const text=(s:unknown,max=800)=>typeof s==='string'&&s.length>0&&s.length<=max&&![...s].some(c=>c.charCodeAt(0)<32&&![9,10,13].includes(c.charCodeAt(0)));
export function assertChronicleState47(r:Population47){
  const c=r.chronicle,w=r.world,tick=r.clock.tick;
  const fail=()=>{throw Error('史书含未知字段或无效历史，已锁定读写。');};
  if(!exact(c,['version','originDay','nextEntryId','nextNationId','leaders','entries','unrest','ended'])||c.version!==1||!integer(c.originDay,0,w.day)||!integer(c.nextEntryId,1)||!integer(c.nextNationId,1)||!record(c.leaders)||!record(c.unrest)||!record(c.ended)||!Array.isArray(c.entries)||c.entries.length>10000)fail();
  const nationIds=new Set(w.nations.map(n=>n.id)),provinceIds=new Set(w.provinces.map(p=>p.id)),rulerIds=new Set<string>(),rulerById=new Map<string,Chronicle['leaders'][string][number]>();
  if(Object.keys(c.leaders).length!==nationIds.size||Object.keys(c.unrest).length!==provinceIds.size)fail();
  for(const [id,history]of Object.entries(c.leaders)){
    if(!nationIds.has(id)||!Array.isArray(history)||history.length>10000)fail();
    const ordinals=new Map<string,number>();
    for(const [index,r]of history.entries()){
      if(!exact(r,['id','name','family','order','regnalName','regnalOrdinal','ascendedDay','endedDay','termEndDay'])||r.id!==`ruler-${id}-${index+1}`||rulerIds.has(r.id)||!text(r.name,80)||!text(r.family,20)||r.order!==index+1||!validRegnalName(r.regnalName)||r.regnalOrdinal!==(ordinals.get(r.regnalName)??0)+1||!integer(r.ascendedDay,c.originDay,w.day)||!integer(r.termEndDay,r.ascendedDay+1)||(r.endedDay!==null&&!integer(r.endedDay,r.ascendedDay,w.day))||(index<history.length-1&&r.endedDay===null))fail();
      ordinals.set(r.regnalName,r.regnalOrdinal);
      const previous=history[index-1];if(previous&&(previous.endedDay===null||previous.endedDay>r.ascendedDay))fail();
      rulerIds.add(r.id);
      rulerById.set(r.id,r);
    }
    const holding=w.provinces.some(p=>p.controller===id),ended=Object.hasOwn(c.ended,id),last=history.at(-1);
    if(holding===ended||holding&&(!last||last.endedDay!==null&&!Object.hasOwn(r.kin.lifecycle.vacancies,id))||!holding&&last?.endedDay===null)fail();
  }
  for(const [id,s]of Object.entries(c.unrest))if(!provinceIds.has(id)||!exact(s,['pressure','controller','sinceDay','cooldownUntil'])||!Number.isFinite(s.pressure)||s.pressure<0||s.pressure>100||!nationIds.has(s.controller)||!integer(s.sinceDay,c.originDay,w.day)||!integer(s.cooldownUntil))fail();
  for(const [id,day]of Object.entries(c.ended))if(!nationIds.has(id)||!integer(day,c.originDay,w.day))fail();
  let previous=0,previousTick=0;
  for(const e of c.entries){
    if(!exact(e,['id','day','tick','kind','text','reason','nationIds','place','people','sourceEventId'])||!integer(e.id,previous+1,c.nextEntryId-1)||!integer(e.day,c.originDay,w.day)||!integer(e.tick,previousTick,tick)||Math.floor(e.tick/120)!==e.day||!['accession','uprising','independence','extinction','restoration','occupation','diplomacy','capital'].includes(e.kind)||!text(e.text)||!text(e.reason,2000)||!Array.isArray(e.nationIds)||!e.nationIds.every(n=>nationIds.has(n))||new Set(e.nationIds).size!==e.nationIds.length||!Array.isArray(e.people))fail();
    if(e.place!==null&&(!exact(e.place,['id','name','x','y'])||!provinceIds.has(e.place.id)||!text(e.place.name)||!Number.isFinite(e.place.x)||!Number.isFinite(e.place.y)))fail();
    if(e.people.some(r=>{const identity=rulerById.get(r?.id);return !exact(r,['id','name','order','regnalName','regnalOrdinal'])||!identity||(['name','order','regnalName','regnalOrdinal'] as const).some(k=>r[k]!==identity[k]);}))fail();
    if(e.sourceEventId!==null&&!integer(e.sourceEventId,1,w.nextEventId-1))fail();previous=e.id;previousTick=e.tick;
  }
  if(c.nextEntryId!==previous+1)fail();
}
