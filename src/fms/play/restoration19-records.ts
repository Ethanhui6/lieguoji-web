import {newRulerName,type NamingState} from './restoration19-names';
import type {CourtPerson} from './court16-people';
import type {Sovereignty} from './restoration19-sovereignty';
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
export function appointRuler(c:Chronicle,w:World,nationId:string,naming:NamingState,requestedName?:string):Ruler{
  const history=c.leaders[nationId]??[],order=history.reduce((n,r)=>Math.max(n,r.order),0)+1;
  const seed=nameSeed(`${w.custom!.seed}/${nationId}/${order}`),generated=newRulerName(naming,w,nationId,`ruler-${nationId}-${order}`,history.at(-1)?.id),{name,family}=generated;
  // User-requested extension: a reign name has its own count within this nation,
  // independent of the source-backed total succession order. Keep it across restoration.
  const regnalName=requestedName??history.at(-1)?.regnalName??generated.first;
  const regnalOrdinal=history.filter(r=>r.regnalName===regnalName).length+1;
  const previous=history.at(-1);if(previous&&previous.endedDay===null)previous.endedDay=w.day;
  // Native AppointLeader increments max recorded order, not same-name count.
  // A 12–25 year appointment duration is a disclosed web scheduling rule.
  const ruler={id:`ruler-${nationId}-${order}`,name,family,order,regnalName,regnalOrdinal,ascendedDay:w.day,endedDay:null,termEndDay:w.day+(12+seed%14)*365};
  c.leaders[nationId]=[...history,ruler];return ruler;
}
export function initialChronicle(w:World,naming:NamingState):Chronicle{
  const c:Chronicle={version:1,originDay:w.day,nextEntryId:1,nextNationId:1,leaders:{},entries:[],unrest:{},ended:{}};
  for(const n of w.nations){if(w.provinces.some(p=>p.controller===n.id))appointRuler(c,w,n.id,naming);else{c.leaders[n.id]=[];c.ended[n.id]=w.day;}}
  for(const p of w.provinces)c.unrest[p.id]={pressure:0,controller:p.controller,sinceDay:w.day,cooldownUntil:w.day};
  return c;
}
/** New tenure for an already recorded person; prior tenure snapshots and the
 * person's observation anchor, skills, family identity and offices survive. */
export function restoreKnownRuler(c:Chronicle,w:World,nationId:string,naming:NamingState,person:CourtPerson,s:Sovereignty):Ruler{
  const history=c.leaders[nationId]??[],anchor=history.find(l=>l.id===person.rulerId),name=naming.rulers[person.rulerId];
  if(!anchor||!name||!person.alive||person.nationId!==nationId)throw Error('复位需要本国真实存活的人物记录。');
  const order=history.reduce((n,r)=>Math.max(n,r.order),0)+1,id=`ruler-${nationId}-${order}`,seed=nameSeed(`${w.custom!.seed}/${nationId}/${order}`),regnalName=anchor.regnalName;
  const previous=history.at(-1);if(previous&&previous.endedDay===null)previous.endedDay=w.day;
  const ruler:Ruler={id,name:person.name,family:person.family,order,regnalName,regnalOrdinal:history.filter(r=>r.regnalName===regnalName).length+1,ascendedDay:w.day,endedDay:null,termEndDay:w.day+(12+seed%14)*365};
  c.leaders[nationId]=[...history,ruler];naming.rulers[id]=structuredClone(name);naming.revision++;s.reigns[id]=person.id;s.revision++;return ruler;
}
