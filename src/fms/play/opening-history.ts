import type {Chronicle, Ruler} from './chronicle-records';
import {regnalLabel} from './chronicle-records';
import type {NewsItem} from './news';

export type OpeningRuler = {nationId:string;currentNationName:string;day:number;ruler:Ruler};
/** A read-only view of persisted rulers, not invented founding/accession events.
 * Country names are current labels: legacy saves did not capture opening names.
 * Copies can start mid-reign; later independent states are not opening rulers. */
export function openingRulers(c:Chronicle,nations:readonly {id:string;name:string}[]):OpeningRuler[]{
  return nations.flatMap(n=>{
    const ruler=c.leaders[n.id]?.find(r=>r.ascendedDay<=c.originDay&&(r.endedDay===null||r.endedDay>c.originDay));
    return ruler?[{nationId:n.id,currentNationName:n.name,day:c.originDay,ruler}]:[];
  });
}
export function openingNews(c:Chronicle,nations:readonly {id:string;name:string}[]):NewsItem[]{
  const rulers=openingRulers(c,nations);if(!rulers.length)return [];
  const names=rulers.slice(0,2).map(v=>regnalLabel(v.ruler)).join('、');
  return [{key:`opening-${c.originDay}`,day:c.originDay,priority:'major',location:null,
    text:`本局开篇 · ${names}${rulers.length>2?'等':''}，共${rulers.length}位君主在位`,
    reason:'依据本局保留的即位与任期记录。打开大事记查看开篇人物志；不推定旧国名或都城。'}];
}
