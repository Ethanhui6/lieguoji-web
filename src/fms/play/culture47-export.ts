import type {HistoricalEntry} from './chronicle-records';
import {isoPlusDays,type IsoDate} from './civilization47-iso-calendar';

/** Original HistoryManager.ExportHistoryEvents → HistoryEvents.txt: years in
 * ascending order, each headed "========== {0}年 ==========", events in time
 * order as "{month}.{day} text" (rich-text tags stripped), a blank line after
 * each year. Emergency mobilizations are left out unless included
 * (ExportHistoryPanelUI m_IncludeEmergencyMobilize, off by default). */
export const HISTORY_EXPORT_FILE47='HistoryEvents.txt';
const mobilize=(e:Pick<HistoricalEntry,'kind'|'text'>)=>e.kind==='diplomacy'&&/紧急动员，征召\d+支军队$/.test(e.text);
export function exportHistoryText47(entries:readonly Pick<HistoricalEntry,'kind'|'text'|'day'|'tick'|'id'>[],start:IsoDate,includeEmergencyMobilize=false):string{
  const years=new Map<number,{date:IsoDate;tick:number;id:number;text:string}[]>();
  for(const e of entries){
    if(!includeEmergencyMobilize&&mobilize(e))continue;
    const date=isoPlusDays(start,e.day),list=years.get(date.year)??[];
    list.push({date,tick:e.tick,id:e.id,text:e.text.replace(/<[^>]*>/g,'')});years.set(date.year,list);
  }
  const lines:string[]=[];
  for(const year of [...years.keys()].sort((a,b)=>a-b)){
    lines.push(`========== ${year}年 ==========`);
    for(const e of years.get(year)!.sort((a,b)=>a.tick-b.tick||a.id-b.id))lines.push(`${e.date.month}.${e.date.day} ${e.text}`);
    lines.push('');
  }
  return lines.join('\r\n');
}
export function downloadBlob47(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
