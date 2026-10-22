import {regnalLabel,type HistoricalEntry,type HistoricalKind} from './chronicle-records';

/** 'family' entries exist only in original-family worlds (FamilyManager history events). */
export const historyKinds:Record<HistoricalKind|'family',string>={accession:'君主传位',uprising:'地方起义',independence:'宣布独立',extinction:'国家覆亡',restoration:'复国',occupation:'领土易手',diplomacy:'外交',capital:'迁都',family:'家族'};
export const isMajorHistory=(e:Pick<HistoricalEntry,'kind'>)=>e.kind!=='occupation';
export type HistoryQuery={text:string;kind:HistoricalKind|''|'important';nationId:string};
const normalize=(text:string)=>text.normalize('NFKC').toLocaleLowerCase();
/** Search captured history, never replace its names with the current world's names. */
export function queryHistory(entries:readonly HistoricalEntry[],query:HistoryQuery){
  const words=normalize(query.text.trim()).split(/\s+/u).filter(Boolean);
  return entries.filter(e=>{
    if(query.kind==='important'?!isMajorHistory(e):query.kind&&e.kind!==query.kind)return false;
    if(query.nationId&&!e.nationIds.includes(query.nationId))return false;
    const text=normalize([e.text,e.reason,e.place?.name??'',historyKinds[e.kind],...e.people.map(p=>`${p.name} ${regnalLabel(p)} 第${p.order}任`)].join(' '));
    return words.every(word=>text.includes(word));
  }).slice().reverse();
}
