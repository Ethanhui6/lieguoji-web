import names from './leader-names.json';
import type {World,Point} from '../../sim/types';
export type Ruler={id:string;name:string;family:string;order:number;regnalName:string;regnalOrdinal:number;ascendedDay:number;endedDay:number|null;termEndDay:number};
export type HistoricalKind='accession'|'uprising'|'independence'|'extinction'|'restoration'|'occupation'|'diplomacy'|'capital';
export type HistoricalEntry={id:number;day:number;tick:number;kind:HistoricalKind;text:string;reason:string;nationIds:string[];place:({id:string;name:string}&Point)|null;people:{id:string;name:string;order:number;regnalName:string;regnalOrdinal:number}[];sourceEventId:number|null};
export type Chronicle={version:1;originDay:number;nextEntryId:number;nextNationId:number;leaders:Record<string,Ruler[]>;entries:HistoricalEntry[];unrest:Record<string,{pressure:number;controller:string;sinceDay:number;cooldownUntil:number}>;ended:Record<string,number>};
export function nameSeed(value:string){let state=2166136261;for(const c of value)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;return state;}
export const validRegnalName=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=12&&value.trim()===value&&![...value].some(c=>c.charCodeAt(0)<32)&&!/[0-9零一二三四五六七八九十百千万]+世$/.test(value);
export function regnalLabel(r:Pick<Ruler,'regnalName'|'regnalOrdinal'>){
  const digits='零一二三四五六七八九';
  function chinese(n:number,leading=true):string{if(n<10)return digits[n];const unit=n>=10000?10000:n>=1000?1000:n>=100?100:10,high=Math.floor(n/unit),low=n%unit;return (unit===10&&high===1&&leading?'':chinese(high))+({10:'十',100:'百',1000:'千',10000:'万'} as Record<number,string>)[unit]+(low?(low<unit/10?'零':'')+chinese(low,false):'');}
  return r.regnalName+chinese(r.regnalOrdinal)+'世';
}
export function appointRuler(c:Chronicle,w:World,nationId:string,requestedName?:string):Ruler{
  const history=c.leaders[nationId]??[],order=history.reduce((n,r)=>Math.max(n,r.order),0)+1;
  const seed=nameSeed(`${w.custom!.seed}/${nationId}/${order}`),family=history.at(-1)?.family??names.family[seed%names.family.length].Chinese;
  const pool=seed%2?names.male:names.female,name=family+pool[Math.floor(seed/97)%pool.length].Chinese;
  // User-requested extension: a reign name has its own count within this nation,
  // independent of the source-backed total succession order. Keep it across restoration.
  const regnalName=requestedName??history.at(-1)?.regnalName??pool[Math.floor(seed/97)%pool.length].Chinese;
  const regnalOrdinal=history.filter(r=>r.regnalName===regnalName).length+1;
  const previous=history.at(-1);if(previous&&previous.endedDay===null)previous.endedDay=w.day;
  // Native AppointLeader increments max recorded order, not same-name count.
  // A 12–25 year appointment duration is a disclosed web scheduling rule.
  const ruler={id:`ruler-${nationId}-${order}`,name,family,order,regnalName,regnalOrdinal,ascendedDay:w.day,endedDay:null,termEndDay:w.day+(12+seed%14)*365};
  c.leaders[nationId]=[...history,ruler];return ruler;
}
export function initialChronicle(w:World):Chronicle{
  const c:Chronicle={version:1,originDay:w.day,nextEntryId:1,nextNationId:1,leaders:{},entries:[],unrest:{},ended:{}};
  for(const n of w.nations){if(w.provinces.some(p=>p.controller===n.id))appointRuler(c,w,n.id);else{c.leaders[n.id]=[];c.ended[n.id]=w.day;}}
  for(const p of w.provinces)c.unrest[p.id]={pressure:0,controller:p.controller,sinceDay:w.day,cooldownUntil:w.day};
  return c;
}
export function recordHistory(c:Chronicle,w:World,tick:number,kind:HistoricalKind,text:string,reason:string,nationIds:string[],provinceId:string|null,people:Ruler[]=[],sourceEventId:number|null=null){
  if(c.entries.length>=10000)throw Error('本局已记录一万条大事，请先保留存档；本次推进未写入。');
  const p=w.provinces.find(p=>p.id===provinceId);
  const event:HistoricalEntry={id:c.nextEntryId++,day:w.day,tick,kind,text,reason,nationIds:[...new Set(nationIds)],place:p?{id:p.id,name:p.name,...p.center}:null,people:people.map(({id,name,order,regnalName,regnalOrdinal})=>({id,name,order,regnalName,regnalOrdinal})),sourceEventId};
  c.entries.push(event);
  return event;
}
export function announce(c:Chronicle,w:World,tick:number,kind:HistoricalKind,text:string,reason:string,nationIds:string[],provinceId:string|null,people:Ruler[]=[]){
  const id=w.nextEventId++;w.events.push({id,day:w.day,kind:'system',text,reason});w.events=w.events.slice(-160);
  return recordHistory(c,w,tick,kind,text,reason,nationIds,provinceId,people,id);
}
/** Snapshot only verified transitions. Names are captured now, never reconstructed later. */
export function captureTransitions(c:Chronicle,before:World,after:World,tick:number){
  for(const e of after.events.filter(e=>e.id>=before.nextEventId&&['occupation','diplomacy'].includes(e.kind))){
    const provinces=after.provinces.filter(p=>before.provinces.find(q=>q.id===p.id)?.controller!==p.controller&&e.text.includes(p.name));
    const nations=after.nations.filter(n=>e.text.includes(n.name)).map(n=>n.id);
    recordHistory(c,after,tick,e.kind==='occupation'?'occupation':'diplomacy',e.text,e.reason,nations,provinces.length===1?provinces[0].id:null,[],e.id);
  }
  for(const n of after.nations){const old=before.nations.find(v=>v.id===n.id);if(old&&old.capitalId!==n.capitalId){const city=after.cities.find(v=>v.id===n.capitalId)!;recordHistory(c,after,tick,'capital',`${n.name}迁都${city.name}`,'首都引用已由真实迁都命令变更。',[n.id],city.provinceId);}}
}
