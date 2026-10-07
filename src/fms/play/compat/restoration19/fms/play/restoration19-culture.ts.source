import {CULTURE_NAMES,mapCultureId,type NamingState} from './restoration19-names';
import type {Sovereignty} from './restoration19-sovereignty';
import {originalNamingCultureIds} from './native-culture/original-naming';
import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import {nativeGenerateEthnic,NATIVE_ETHNIC_NAMES,type NativeEthnicName} from './native-economy/ethnic-generation';
import {originalCultureWeights} from './native-economy/original-cultures';
import {seededCharacterRandom} from './native-economy/character-generation';
export const ETHNIC_LABELS:Record<NativeEthnicName,string>={FishAndHunting:'渔猎',Agriculture:'农业',Nomadic:'游牧',Maritime:'海洋',Commercial:'商业'};
type MapCulture={id:string;name:string;baseCultureId:string;weights:[number,number][]};
type NationCulture={mapCultureId:string;ethnic:NativeEthnicName;recordedDay:number;origin:'new-world'|'explicit-copy'|'secession';parentId:string|null};
export type CultureState={version:1;revision:number;initialization:'multiculture-naming-v1';maps:Record<string,MapCulture>;nations:Record<string,NationCulture>};
type CultureWorld={world:World;chronicle:Chronicle;clock:{tick:number};naming:NamingState;sovereignty?:Sovereignty};
export type CultureEdit={nationId:string;ethnic:NativeEthnicName};
export function initialCultures(r:CultureWorld,previous?:{nations:Record<string,NationCulture>}):CultureState{
 const c:CultureState={version:1,revision:0,initialization:'multiculture-naming-v1',maps:{},nations:{}};
 for(const baseCultureId of r.naming.enabled){const id=mapCultureId(baseCultureId),weights=originalCultureWeights(baseCultureId);if(!weights)throw Error('原文化权重缺失。');c.maps[id]={id,name:CULTURE_NAMES[baseCultureId],baseCultureId,weights:[...weights]};}
 for(const nation of r.world.nations){const id=r.naming.nations[nation.id].mapCultureId,old=previous?.nations[nation.id];if(old)c.nations[nation.id]={...structuredClone(old),mapCultureId:id};else addNation(r,c,nation.id,id,'new-world',null);}
 return c;
}
function addNation(r:CultureWorld,c:CultureState,id:string,cultureId:string,origin:NationCulture['origin'],parentId:string|null){
 const map=c.maps[cultureId];if(!map)throw Error('国家文化引用缺失。');
 const ethnic=nativeGenerateEthnic(new Map(map.weights),seededCharacterRandom(`${r.world.custom!.seed}/ethnic/${id}/${r.world.day}`));
 c.nations[id]={mapCultureId:cultureId,ethnic:NATIVE_ETHNIC_NAMES[ethnic],recordedDay:r.world.day,origin,parentId};
}
/** Same-tick structured creation events supply parent identity. Existing states,
 * including extinct/restored states, keep their original record and draw. */
export function reconcileCultures(r:CultureWorld,c:CultureState):void{
 for(const n of r.world.nations)if(!c.nations[n.id]){
  const e=r.chronicle.entries.find(e=>e.tick===r.clock.tick&&e.day===r.world.day&&['uprising','independence'].includes(e.kind)&&e.nationIds.length===2&&e.nationIds[1]===n.id),parent=e?.nationIds[0];
  if(!parent||!c.nations[parent])throw Error('新国家缺少可信文化来源，本次推进未写入。');
  addNation(r,c,n.id,r.naming.nations[n.id].mapCultureId,'secession',parent);c.revision++;
 }
}
export function nationEthnic(c:CultureState,id:string):NativeEthnicName{const ethnic=c.nations[id]?.ethnic;if(!NATIVE_ETHNIC_NAMES.includes(ethnic))throw Error('国家族群引用无效。');return ethnic;}
export function previewCultureEdit(r:CultureWorld&{culture:CultureState},a:CultureEdit){
 const no=(reason:string)=>({valid:false,title:'调整族群特点',reason,details:[] as string[]});
 if(!a||typeof a.nationId!=='string'||Object.keys(a).some(k=>!['nationId','ethnic'].includes(k))||!NATIVE_ETHNIC_NAMES.includes(a.ethnic))return no('族群参数无效。');
 const n=r.world.nations.find(n=>n.id===a.nationId);if(!n||!r.culture.nations[n.id]||!r.world.provinces.some(p=>p.controller===n.id))return no('该国当前没有实际控制的地方。');
 const before=nationEthnic(r.culture,n.id);if(before===a.ethnic)return no('该国已经采用这个族群特点。');
 return {valid:true,title:'调整族群特点',reason:`${n.name}：${ETHNIC_LABELS[before]} → ${ETHNIC_LABELS[a.ethnic]}`,details:['相关资源收入会按原族群规则计算，下次月结才入账。','国名、城市、人名、已有国库与账单保持；这次调整为上帝干预，不代表自动文化同化。']};
}
export function applyCultureEdit(r:CultureWorld&{culture:CultureState},a:CultureEdit):void{
 const p=previewCultureEdit(r,a);if(!p.valid)throw Error(p.reason);
 r.culture.nations[a.nationId].ethnic=a.ethnic;r.culture.revision++;
 r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'system',text:p.reason,reason:p.details.join('')});r.world.events=r.world.events.slice(-160);
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertCultureSchema(value:unknown):void{
 const c=value as CultureState|undefined,fail=()=>{throw Error('文化存档含未来规则或未知字段，已锁定读写。');};
 if(unknown(c,['version','revision','initialization','maps','nations'])||c?.version!=null&&c.version!==1||c?.initialization!=null&&c.initialization!=='multiculture-naming-v1')fail();
 if(record(c?.maps)&&Object.values(c.maps).some(m=>unknown(m,['id','name','baseCultureId','weights'])||m?.baseCultureId!=null&&!originalNamingCultureIds.includes(m.baseCultureId)))fail();
 if(record(c?.nations)&&Object.values(c.nations).some(n=>unknown(n,['mapCultureId','ethnic','recordedDay','origin','parentId'])||n?.ethnic!=null&&!NATIVE_ETHNIC_NAMES.includes(n.ethnic)||n?.origin!=null&&!['new-world','explicit-copy','secession'].includes(n.origin)))fail();
}
export function assertCulture(c:CultureState,r:CultureWorld):void{
 assertCultureSchema(c);const fail=()=>{throw Error('文化存档损坏，已保留原档。');};
 if(!record(c)||c.version!==1||c.initialization!=='multiculture-naming-v1'||!Number.isSafeInteger(c.revision)||c.revision<0||!record(c.maps)||!record(c.nations))return fail();
 if(Object.keys(c.maps).length!==r.naming.enabled.length)return fail();
 for(const id of r.naming.enabled){const map=c.maps[mapCultureId(id)];if(!record(map)||map.id!==mapCultureId(id)||map.name!==CULTURE_NAMES[id]||map.baseCultureId!==id||JSON.stringify(map.weights)!==JSON.stringify([...originalCultureWeights(id)!]))return fail();}
 if(Object.keys(c.nations).length!==r.world.nations.length||r.world.nations.some(n=>!Object.hasOwn(c.nations,n.id)))return fail();
 for(const [id,n]of Object.entries(c.nations)){
  if(!record(n)||n.mapCultureId!==r.naming.nations[id]?.mapCultureId||!NATIVE_ETHNIC_NAMES.includes(n.ethnic)||!Number.isSafeInteger(n.recordedDay)||n.recordedDay<0||n.recordedDay>r.world.day||!['new-world','explicit-copy','secession'].includes(n.origin))return fail();
  if(n.origin==='new-world'&&n.recordedDay!==0)return fail();
  if(n.origin==='secession'){
   const rebel=r.sovereignty?.nativeRebels[id],source=rebel?r.sovereignty?.provinces[rebel.provinceId]?.mapCultureId:n.parentId?c.nations[n.parentId]?.mapCultureId:undefined;
   if(!n.parentId||n.parentId===id||!Object.hasOwn(c.nations,n.parentId)||n.mapCultureId!==source||!r.chronicle.entries.some(e=>e.day===n.recordedDay&&['uprising','independence'].includes(e.kind)&&e.nationIds.length===2&&e.nationIds[0]===n.parentId&&e.nationIds[1]===id))return fail();
  }else if(n.parentId!==null)return fail();
 }
}
