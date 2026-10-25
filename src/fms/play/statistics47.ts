import type {FoundingForces47} from './civilization47-forces';
import {war26Strength} from './war26-strength';
import {RELIGIONS47,type ReligionId47} from './civilization47-catalog';
import {nationColor} from './politics';

/** Original StatisticsInfoUI (the statistics panel; one button cycles StatisticsCategory),
 * categories in the original order with their localization titles. Rows read the same
 * accounts the simulation uses:
 * - 国力: State.GetStrength (war26Strength), every state that still holds land;
 * - 人口: the state's province population (GetStateInternalPopulation), descending;
 * - 经济: State gold descending; a negative treasury reads "赤字" (Deficit);
 * - 战争统计: the wars in progress, with their start date;
 * - 宗教信息: followers per religion (population of the provinces of states holding it) and
 *   the share of the world population, descending.
 * CorruptionInfo is left out: the web does not simulate corruption yet. */
export type StatisticsCategory47='power'|'population'|'economy'|'war'|'religion';
export const STATISTICS_CATEGORIES47:readonly {id:StatisticsCategory47;label:string}[]=[
  {id:'power',label:'国力排行'},{id:'population',label:'人口排名'},{id:'economy',label:'经济排行'},{id:'war',label:'战争统计'},{id:'religion',label:'宗教信息'},
];
export type StatisticsRow47={key:string;name:string;value:number;text:string;color?:string;nationId?:string;share?:number};

const living=(r:FoundingForces47)=>r.world.nations.filter(n=>r.world.provinces.some(p=>p.controller===n.id));
const fmt=(n:number)=>Math.round(n).toLocaleString('zh-CN');
export function statistics47(r:FoundingForces47,category:StatisticsCategory47):StatisticsRow47[]{
  const states=living(r),owned=(id:string)=>new Set(r.world.provinces.filter(p=>p.controller===id).map(p=>p.id));
  const population=(id:string)=>{const set=owned(id);return r.world.statecraft!.provinces.filter(p=>set.has(p.provinceId)).reduce((n,p)=>n+p.population,0);};
  const sort=(rows:StatisticsRow47[])=>rows.sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'zh-CN'));
  switch(category){
    case 'power':return sort(states.map(n=>{const v=war26Strength(r.world,r,n.id);return {key:n.id,nationId:n.id,name:n.name,color:nationColor(n),value:v,text:v.toFixed(1)};}));
    case 'population':return sort(states.map(n=>{const v=population(n.id);return {key:n.id,nationId:n.id,name:n.name,color:nationColor(n),value:v,text:fmt(v)};}));
    case 'economy':return sort(states.map(n=>{const v=r.finance.nations[n.id]?.gold??0;return {key:n.id,nationId:n.id,name:n.name,color:nationColor(n),value:v,text:v<0?`赤字 ${fmt(-v)}`:fmt(v)};}));
    case 'war':{
      const name=(id:string)=>r.world.nations.find(n=>n.id===id)?.name??id;
      return r.world.statecraft!.relations.filter(x=>x.status==='war').map(x=>({key:x.a+'/'+x.b,name:`${name(x.a)} — ${name(x.b)}`,value:r.world.day-x.sinceDay,text:`第 ${Math.max(0,r.world.day-x.sinceDay)} 天`})).sort((a,b)=>b.value-a.value);
    }
    case 'religion':{
      const followers=new Map<string,number>();
      for(const n of states){const id=r.civilization.nations[n.id]?.religionId;if(id)followers.set(id,(followers.get(id)??0)+population(n.id));}
      const total=r.world.statecraft!.provinces.reduce((n,p)=>n+p.population,0)||1;
      return sort([...followers].map(([id,v])=>({key:id,name:RELIGIONS47[id as ReligionId47]??id,value:v,share:v/total,text:`${fmt(v)}（${(v/total*100).toFixed(1)}%）`})));
    }
  }
}
