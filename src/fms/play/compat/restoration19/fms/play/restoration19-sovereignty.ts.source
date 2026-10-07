import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import type {CourtPeople} from './court16-people';
import type {NamingState} from './restoration19-names';
import type {CultureState} from './restoration19-culture';

export type ProvinceCulture={mapCultureId:string;sourceCityId:string;recordedDay:number;origin:'new-world'|'explicit-copy'};
export type Sovereignty={version:1;revision:number;provinces:Record<string,ProvinceCulture>;reigns:Record<string,number>;restorations:Record<string,number>;nativeRebels:Record<string,{provinceId:string;parentId:string}>};
export type SovereignWorld={world:World;chronicle:Chronicle;people:CourtPeople;naming:NamingState;culture:CultureState};
export function initialSovereignty(r:SovereignWorld,copy=false):Sovereignty{
  const data:Sovereignty={version:1,revision:0,provinces:{},reigns:{},restorations:{},nativeRebels:{}};
  for(const p of r.world.provinces){const city=r.world.cities.find(c=>c.provinceId===p.id),name=city&&r.naming.cities[city.id];if(!city||!name||!r.culture.maps[name.mapCultureId])throw Error('省份缺少真实城市文化来源。');data.provinces[p.id]={mapCultureId:name.mapCultureId,sourceCityId:city.id,recordedDay:r.world.day,origin:copy?'explicit-copy':'new-world'};}
  for(const person of Object.values(r.people.persons))data.reigns[person.rulerId]=person.id;
  for(const n of r.world.nations)data.restorations[n.id]=r.chronicle.entries.filter(e=>e.kind==='restoration'&&e.nationIds.includes(n.id)).length;
  return data;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertSovereigntySchema(v:unknown):void{
  const s=v as Sovereignty|undefined;
  if(unknown(s,['version','revision','provinces','reigns','restorations','nativeRebels'])||s?.version!=null&&s.version!==1||record(s?.provinces)&&Object.values(s.provinces).some(p=>unknown(p,['mapCultureId','sourceCityId','recordedDay','origin'])||p?.origin!=null&&!['new-world','explicit-copy'].includes(p.origin))||record(s?.nativeRebels)&&Object.values(s.nativeRebels).some(n=>unknown(n,['provinceId','parentId'])))throw Error('复国存档含未来规则或未知字段，已锁定读写。');
}
export function assertSovereignty(s:Sovereignty,r:SovereignWorld):void{
  assertSovereigntySchema(s);const fail=()=>{throw Error('省文化或人物任次记录损坏，已保留原档。');},integer=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=2147483647;
  if(!record(s)||s.version!==1||!integer(s.revision)||![s.provinces,s.reigns,s.restorations,s.nativeRebels].every(record))return fail();
  if(Object.keys(s.provinces).length!==r.world.provinces.length||Object.keys(s.restorations).length!==r.world.nations.length)return fail();
  for(const p of r.world.provinces){const v=s.provinces[p.id],city=v&&r.world.cities.find(c=>c.id===v.sourceCityId);if(!record(v)||!Object.hasOwn(r.culture.maps,v.mapCultureId)||!city||city.provinceId!==p.id||r.naming.cities[city.id]?.mapCultureId!==v.mapCultureId||!integer(v.recordedDay)||v.recordedDay>r.world.day||!['new-world','explicit-copy'].includes(v.origin)||v.origin==='new-world'&&v.recordedDay!==0)return fail();}
  for(const n of r.world.nations){const count=s.restorations[n.id];if(!integer(count)||count>r.chronicle.leaders[n.id].length||count!==r.chronicle.entries.filter(e=>e.kind==='restoration'&&e.nationIds.includes(n.id)).length)return fail();}
  for(const [reign,id]of Object.entries(s.reigns)){
    const p=r.people.persons[id],history=p&&r.chronicle.leaders[p.nationId]?.find(l=>l.id===reign),name=r.naming.rulers[reign],anchor=p&&r.naming.rulers[p.rulerId];
    const first=p&&r.chronicle.leaders[p.nationId]?.find(l=>l.id===p.rulerId);
    if(!integer(id)||!p||!history||!first||history.ascendedDay<p.recordedDay&&reign!==p.rulerId||history.order<first.order||history.name!==p.name||history.family!==p.family||!name||!anchor||Object.keys(anchor).some(key=>name[key as keyof typeof name]!==anchor[key as keyof typeof anchor]))return fail();
  }
  for(const p of Object.values(r.people.persons))if(s.reigns[p.rulerId]!==p.id)return fail();
  for(const [id,source]of Object.entries(s.nativeRebels))if(!record(source)||!r.world.nations.some(n=>n.id===id)||source.parentId===id||!r.world.nations.some(n=>n.id===source.parentId)||!Object.hasOwn(s.provinces,source.provinceId)||r.naming.nations[id].mapCultureId!==s.provinces[source.provinceId].mapCultureId||!r.chronicle.entries.some(e=>e.kind==='uprising'&&e.place?.id===source.provinceId&&e.nationIds.length===2&&e.nationIds[0]===source.parentId&&e.nationIds[1]===id))return fail();
}
