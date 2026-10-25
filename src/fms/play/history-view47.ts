import type {HistoricalEntry} from './chronicle-records';
import {historyPresentation47} from './CultureHistory47';
import {isoPlusDays,type IsoDate} from './civilization47-iso-calendar';

/** Original HistoryEventType for a web chronicle entry, with the original's Chinese name
 * (localization.csv EventType_*) and a timeline colour. Entries the original has no type for
 * keep the web's own wording. HistoryInfoPanel pages history by half-year
 * (HistoryHalfYearPrev 前半年 / HistoryHalfYearNext 后半年). */
export type HistoryType47={key:string;label:string;color:string};
const T=(key:string,label:string,color:string):HistoryType47=>({key,label,color});
export const HISTORY_TYPES47={
  Founded:T('Founded','国家建立','#c9a227'),Reestablished:T('Reestablished','国家重建','#b98b2e'),Destroyed:T('Destroyed','国家灭亡','#4a4440'),
  StartWar:T('StartWar','战争开始','#c0392b'),EndWar:T('EndWar','战争结束','#2e8b7a'),ProvinceConquered:T('ProvinceConquered','省份被占领','#d9772b'),
  EmergencyMobilize:T('EmergencyMobilize','紧急动员','#a0522d'),Rebellion:T('Rebellion','叛乱','#8e2a4a'),Independence:T('Independence','独立','#b0466b'),
  AllianceFormed:T('AllianceFormed','联盟建立','#2f6fb0'),Vassalization:T('Vassalization','附庸化','#3f8f4a'),
  LeaderAscension:T('LeaderAscension','领导人继位','#7b5ea7'),LeaderDeath:T('LeaderDeath','领导人去世','#5b5068'),
  CharacterBirth:T('CharacterBirth','角色出生','#d4789c'),CharacterMarriage:T('CharacterMarriage','角色结婚','#c76e9e'),
  Family:T('Family','家族','#8b6b4a'),TerritoryRedistribution:T('TerritoryRedistribution','领土重新分配','#9a7b4f'),Capital:T('Capital','迁都','#6d7f3a'),Recruit:T('Recruit','征募','#7d6e5a'),Other:T('Other','其他','#7a7f86'),
} as const;
export function historyType47(e:Pick<HistoricalEntry,'kind'|'text'|'reason'|'day'>&Partial<Pick<HistoricalEntry,'people'>>,death=false):HistoryType47{
  if(death)return HISTORY_TYPES47.LeaderDeath;
  const t=HISTORY_TYPES47,kind=historyPresentation47(e).kind;
  switch(e.kind as string){
    case 'accession':return t.LeaderAscension;
    case 'uprising':return t.Rebellion;
    case 'independence':return t.Independence;
    case 'extinction':return t.Destroyed;
    case 'restoration':return t.Reestablished;
    case 'occupation':return t.ProvinceConquered;
    case 'capital':return t.Capital;
    case 'family':return /出生$/.test(e.text)?t.CharacterBirth:/结婚|成婚/.test(e.text)?t.CharacterMarriage:e.text.includes('领土重新分配')?t.TerritoryRedistribution:t.Family;
  }
  if(kind==='宣战'||e.text.includes('宣战'))return t.StartWar;
  if(kind==='战争结束'||/停战|战胜/.test(e.text))return t.EndWar;
  if(kind==='紧急动员')return t.EmergencyMobilize;
  if(kind==='出生')return t.CharacterBirth;
  if(kind==='成婚')return t.CharacterMarriage;
  if(kind==='征募'||kind==='遣散')return t.Recruit;
  if(e.text.includes('联盟'))return t.AllianceFormed;
  if(e.text.includes('附庸'))return t.Vassalization;
  if(e.text.includes('建国')||e.text.includes('成立'))return t.Founded;
  return t.Other;
}
/** Half-year index: year × 2, +1 for July–December. */
export const halfYear47=(start:IsoDate,day:number)=>{const d=isoPlusDays(start,day);return d.year*2+(d.month>6?1:0);};
export const halfYearLabel47=(h:number)=>`公元${Math.floor(h/2)}年 · ${h%2?'下半年':'上半年'}`;
