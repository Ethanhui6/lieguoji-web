// Current47 keeps complete permanent records without a gameplay-count cutoff.
// Historical engines retain their original recorder and validators.
import type {World} from '../../sim/types';
import type {Chronicle,HistoricalKind,HistoricalEntry,Ruler} from './chronicle-records';
export function recordHistory(c:Chronicle,w:World,tick:number,kind:HistoricalKind,text:string,reason:string,nationIds:string[],provinceId:string|null,people:Ruler[]=[],sourceEventId:number|null=null){
  if(!Number.isSafeInteger(c.nextEntryId+1)||!Number.isSafeInteger(w.nextEventId+1))throw Error('历史编号无法精确表示，保留当前存档。');
  const p=w.provinces.find(p=>p.id===provinceId);
  const event:HistoricalEntry={id:c.nextEntryId++,day:w.day,tick,kind,text,reason,nationIds:[...new Set(nationIds)],place:p?{id:p.id,name:p.name,...p.center}:null,people:people.map(({id,name,order,regnalName,regnalOrdinal})=>({id,name,order,regnalName,regnalOrdinal})),sourceEventId};
  c.entries.push(event);
  return event;
}
export function announce(c:Chronicle,w:World,tick:number,kind:HistoricalKind,text:string,reason:string,nationIds:string[],provinceId:string|null,people:Ruler[]=[]){
  const id=w.nextEventId++;w.events.push({id,day:w.day,kind:'system',text,reason});w.events=w.events.slice(-160);
  return recordHistory(c,w,tick,kind,text,reason,nationIds,provinceId,people,id);
}
