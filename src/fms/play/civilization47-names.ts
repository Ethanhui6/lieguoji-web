import {CULTURE_IDS47,culture47,POLITIES47,religion47,rulerTitle47,stateTitle47,personalName47,type CultureId47,type NamingMode47,type ReligionId47} from './civilization47-catalog';
import type {NativePolity} from './native-combat/upper-efficiency';
import type {World} from '../../sim/types';
import {validRegnalName,type Chronicle,type Ruler} from './chronicle-records';
import {validateCivilizationWorld47} from './civilization47-world-validation';

export type CultureChoice47={cultureId:CultureId47;religionId:ReligionId47;polity:NativePolity};
export type WorldCultureSetup47={mode:NamingMode47;enabled:CultureId47[];nations?:Record<string,CultureChoice47>};
export type CulturalName47={value:string;mode:NamingMode47;sourceKey:string;custom:string|null};
export type NationIdentity47=CultureChoice47&{name:CulturalName47;origin:'new-world'|'secession';parentId:string|null};
export type PersonName47={cultureId:CultureId47;name:string;given:string;house:string;gender:0|1;sourceKey:string;mode:NamingMode47};
export type RulerIdentity47=PersonName47&{religionId:ReligionId47;polityAtAccession:NativePolity;regnalName:string;titleAtAccession:string};
export type Civilization47={version:1;catalog:'real-cultures-zh-v2';revision:number;mode:NamingMode47;peopleMode:'culture-generated';enabled:CultureId47[];nations:Record<string,NationIdentity47>;cities:Record<string,{cultureId:CultureId47;name:CulturalName47}>;rulers:Record<string,RulerIdentity47>};
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:readonly string[])=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=100&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
export function validateCultureSetup47(value:WorldCultureSetup47,count:number) {
  if(!Number.isSafeInteger(count)||count<2||count>10000)throw Error('文化配置的国家数量无效。');
  if(!record(value)||Object.keys(value).some(k=>!['mode','enabled','nations'].includes(k))||!['culture-generated','historical-names'].includes(value.mode)||!Array.isArray(value.enabled)||!value.enabled.length||value.enabled.length>CULTURE_IDS47.length||new Set(value.enabled).size!==value.enabled.length)throw Error('新世界文化或命名模式无效。');
  value.enabled.forEach(culture47);
  if(value.nations!==undefined&&!record(value.nations))throw Error('国家文化配置无效。');
  for(const [id,choice] of Object.entries(value.nations??{})) {
    const index=Number(id.slice(2));
    if(id!=='n-'+index||!Number.isSafeInteger(index)||index<0||index>=count||!exact(choice,['cultureId','religionId','polity'])||!value.enabled.includes(choice.cultureId)||!POLITIES47.includes(choice.polity))throw Error('国家文化、宗教或政体配置无效。');
    religion47(choice.religionId);
  }
}
function poolValue(cultureId:CultureId47,mode:NamingMode47,kind:'state'|'city',index:number) {
  const c=culture47(cultureId),roots=kind==='state'?c.stateRoots:c.cityRoots,ends=kind==='state'?c.stateEnds:c.cityEnds,pool=kind==='state'?c.historicalStates:c.historicalCities;
  return mode==='historical-names'?pool[index]:roots[Math.floor(index/ends.length)]+ends[index%ends.length];
}
function capacity(cultureId:CultureId47,mode:NamingMode47,kind:'state'|'city') {
  const c=culture47(cultureId);return mode==='historical-names'?(kind==='state'?c.historicalStates:c.historicalCities).length:(kind==='state'?c.stateRoots.length*c.stateEnds.length:c.cityRoots.length*c.cityEnds.length);
}
function freshName(cultureId:CultureId47,mode:NamingMode47,kind:'state'|'city',seed:string,used:ReadonlySet<string>):CulturalName47 {
  const size=capacity(cultureId,mode,kind),start=hash(seed)%size;
  for(let step=0;step<size;step++){const index=(start+step)%size,value=poolValue(cultureId,mode,kind,index);if(!used.has(value))return {value,mode,sourceKey:`${kind}/${cultureId}/${mode}/${index}`,custom:null};}
  // Native city pool exhaustion reuses an authentic entry, without a numeric
  // suffix. States use an explicit web policy of the same form: a repeated
  // historical base never invents a historical country. Entity IDs stay unique.
  if(mode==='historical-names')return {value:poolValue(cultureId,mode,kind,start),mode,sourceKey:`${kind}/${cultureId}/${mode}/${start}`,custom:null};
  throw Error(`${culture47(cultureId).label}的生成名称库已用尽，原世界未改动。`);
}
export function initialCivilization47(seed:string,count:number,owners:readonly number[],setup:WorldCultureSetup47):Civilization47 {
  if(!Number.isInteger(count)||count<2||count>24||owners.some(n=>!Number.isInteger(n)||n<0||n>=count))throw Error('文化分配缺少有效国家身份。');
  validateCultureSetup47(setup,count);
  const c:Civilization47={version:1,catalog:'real-cultures-zh-v2',revision:0,mode:setup.mode,peopleMode:'culture-generated',enabled:[...setup.enabled],nations:{},cities:{},rulers:{}},states=new Set<string>(),cities=new Map<CultureId47,Set<string>>();
  for(let i=0;i<count;i++) {
    const id='n-'+i,profile=culture47(setup.enabled[i%setup.enabled.length]),choice=setup.nations&&Object.hasOwn(setup.nations,id)?setup.nations[id]:{cultureId:profile.id,religionId:profile.suggestedReligion,polity:profile.suggestedPolity};
    const name=freshName(choice.cultureId,c.mode,'state',`${seed}/state/${id}`,states);states.add(name.value);
    c.nations[id]={...choice,name,origin:'new-world',parentId:null};
  }
  for(const [i,owner] of owners.entries()) {const cultureId=c.nations['n-'+owner].cultureId,used=cities.get(cultureId)??new Set<string>(),name=freshName(cultureId,c.mode,'city',`${seed}/city/${i}`,used);used.add(name.value);cities.set(cultureId,used);c.cities['c-'+i]={cultureId,name};}
  return c;
}
/** A state name not used by any current state, from the same culture pool (original GetRandomCountryKeyExceptNames). */
export function freshStateName47(c:Civilization47,cultureId:CultureId47,seed:string):CulturalName47{return freshName(cultureId,c.mode,'state',seed,new Set(Object.values(c.nations).map(n=>n.name.value)));}
export const nationName47=(n:NationIdentity47)=>n.name.custom??stateTitle47(n.name.value,n.cultureId,n.polity,n.religionId);
export const cityName47=(row:Civilization47['cities'][string])=>row.name.custom??row.name.value;
/** Current office derives from the current polity. The accession identity is
 * immutable evidence of the earlier office, so reforms do not rewrite history. */
export function currentRuler47(c:Civilization47,chronicle:Chronicle,nationId:string) {
  if(!Object.hasOwn(c.nations,nationId)||!Object.hasOwn(chronicle.leaders,nationId))return null;
  const reign=chronicle.leaders[nationId].at(-1);
  if(!reign||reign.endedDay!==null||Object.hasOwn(chronicle.ended,nationId))return null;
  const n=c.nations[nationId],a=c.rulers[reign.id];
  assertRulerIdentity47(a,c.peopleMode,c.enabled);
  return {name:a.name,given:a.given,title:rulerTitle47(n.cultureId,n.polity,n.religionId,a.gender),order:reign.order,regnalName:reign.regnalName,regnalOrdinal:reign.regnalOrdinal};
}
/** The user's two-mode choice concerns states/cities. People are cultural
 * generated individuals, so native families never splice historical biographies. */
export function personNameFromParts47(cultureId:CultureId47,given:string,house:string,gender:0|1):PersonName47 {
  const p=culture47(cultureId),names=gender===0?p.givenMale:p.givenFemale,index=names.indexOf(given),family=p.houses.indexOf(house);
  if(![0,1].includes(gender)||index<0||family<0)throw Error('人物姓名不属于指定文化来源。');
  return {cultureId,given,house,gender,name:personalName47(cultureId,given,house,gender),mode:'culture-generated',sourceKey:`person/${cultureId}/culture-generated/${gender}/${index}/${family}`};
}
export function generatedPersonName47(cultureId:CultureId47,seed:string,key:string,gender:0|1,house?:string):PersonName47 {
  const p=culture47(cultureId),names=gender===0?p.givenMale:p.givenFemale;
  return personNameFromParts47(cultureId,names[hash(seed+'/'+key+'/given')%names.length],house??p.houses[hash(seed+'/'+key+'/house')%p.houses.length],gender);
}
export function rulerFromPerson47(person:PersonName47,n:CultureChoice47,regnalName=person.given):RulerIdentity47 {
  if(!validRegnalName(regnalName))throw Error('王号无效，原任次未改动。');
  return {...structuredClone(person),religionId:n.religionId,polityAtAccession:n.polity,regnalName,titleAtAccession:rulerTitle47(person.cultureId,n.polity,n.religionId,person.gender)};
}
export function createRulerIdentity47(c:Civilization47,nationId:string,reignId:string,seed:string,inherit?:RulerIdentity47):RulerIdentity47 {
  const n=Object.hasOwn(c.nations,nationId)?c.nations[nationId]:null;if(!n)throw Error('领袖缺少国家文化。');
  const person=generatedPersonName47(n.cultureId,seed,reignId,(hash(seed+'/'+reignId)%2) as 0|1,inherit?.cultureId===n.cultureId?inherit.house:undefined);
  return rulerFromPerson47(person,n);
}
export function initialCivilizationChronicle47(w:World,c:Civilization47):Chronicle {
  if(w.day!==0||Object.keys(c.rulers).length)throw Error('创始人物只能在新世界初始化一次。');
  const out:Chronicle={version:1,originDay:0,nextEntryId:1,nextNationId:1,leaders:{},entries:[],unrest:{},ended:{}};
  for(const n of w.nations){const id=`ruler-${n.id}-1`,v=createRulerIdentity47(c,n.id,id,w.custom!.seed);c.rulers[id]=v;
    const r:Ruler={id,name:v.name,family:v.house,order:1,regnalName:v.given,regnalOrdinal:1,ascendedDay:0,endedDay:null,termEndDay:(12+hash(id)%14)*365};out.leaders[n.id]=[r];
    out.entries.push({id:out.nextEntryId++,day:0,tick:0,kind:'accession',text:`${n.name}：${v.name}就任${v.titleAtAccession}`,reason:'创建世界时依已选文化、宗教和政体建立首任领袖；人物按文化生成，国名和城名模式不改变亲属规则。',nationIds:[n.id],place:null,people:[{id:r.id,name:r.name,order:r.order,regnalName:r.regnalName,regnalOrdinal:r.regnalOrdinal}],sourceEventId:null});
  }
  for(const p of w.provinces)out.unrest[p.id]={pressure:0,controller:p.controller,sinceDay:0,cooldownUntil:0};return out;
}
function assertName(n:CulturalName47,culture:CultureId47,kind:'state'|'city',mode:NamingMode47) {
  if(!exact(n,['value','mode','sourceKey','custom'])||n.mode!==mode||!text(n.value)||n.custom!==null&&!text(n.custom)||typeof n.sourceKey!=='string')throw Error('文化名称来源损坏。');
  const prefix=`${kind}/${culture}/${mode}/`,index=Number(n.sourceKey.slice(prefix.length));
  if(!n.sourceKey.startsWith(prefix)||!Number.isSafeInteger(index)||index<0||index>=capacity(culture,mode,kind)||n.sourceKey!==prefix+index||n.value!==poolValue(culture,mode,kind,index))throw Error('文化名称与来源不一致。');
}
/** Checks source values, including the house actually chosen for an heir.
 * Birth/kin relations are separate: a name key never claims historical ancestry. */
export function assertPersonName47(a:PersonName47,mode:NamingMode47,enabled:readonly CultureId47[]) {
  const fail=()=>{throw Error('人物名称、称号或来源损坏，原档未改动。');};
  if(!exact(a,['cultureId','name','given','house','gender','sourceKey','mode'])||!enabled.includes(a.cultureId)||!text(a.name)||!text(a.given)||a.given.length>12||!text(a.house)||!text(a.sourceKey)||a.mode!==mode||![0,1].includes(a.gender))return fail();
  const p=culture47(a.cultureId),prefix=`person/${a.cultureId}/${mode}/`;
  if(!a.sourceKey.startsWith(prefix))return fail();
  const parts=a.sourceKey.slice(prefix.length).split('/'),indices=parts.map(Number);
  if(indices.some((n,i)=>!Number.isSafeInteger(n)||n<0||String(n)!==parts[i]))return fail();
  if(mode==='historical-names') {
    if(indices.length!==1)return fail();const v=p.historicalPeople[indices[0]];
    if(!v||a.name!==v.name.replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XIV)$/,'')||a.given!==v.given||a.house!==v.house||a.gender!==v.gender)return fail();
  }else{
    if(indices.length!==3||indices[0]!==a.gender)return fail();
    const given=(a.gender===0?p.givenMale:p.givenFemale)[indices[1]],house=p.houses[indices[2]];
    if(!given||!house||a.given!==given||a.house!==house||a.name!==personalName47(a.cultureId,given,house,a.gender))return fail();
  }
}
export function assertRulerIdentity47(a:RulerIdentity47,mode:NamingMode47,enabled:readonly CultureId47[]) {
  if(!exact(a,['cultureId','religionId','polityAtAccession','regnalName','name','given','house','gender','sourceKey','mode','titleAtAccession'])||!validRegnalName(a.regnalName)||!POLITIES47.includes(a.polityAtAccession))throw Error('任次身份损坏或含未来字段。');
  const {cultureId,name,given,house,gender,sourceKey,mode:sourceMode}=a;
  religion47(a.religionId);assertPersonName47({cultureId,name,given,house,gender,sourceKey,mode:sourceMode},mode,enabled);
  if(a.titleAtAccession!==rulerTitle47(a.cultureId,a.polityAtAccession,a.religionId,a.gender))throw Error('任次称号与当时制度不一致。');
}
export function assertCivilization47(c:Civilization47,w:World,chronicle:Chronicle) {
  const fail=()=>{throw Error('真实文化存档损坏或含未来规则，已保留原档。');};
  if(!validateCivilizationWorld47(w))return fail();
  if(!exact(c,['version','catalog','revision','mode','peopleMode','enabled','nations','cities','rulers'])||c.version!==1||c.peopleMode!=='culture-generated'||c.catalog!=='real-cultures-zh-v2'||!Number.isSafeInteger(c.revision)||c.revision<0||!record(c.nations)||!record(c.cities)||!record(c.rulers))return fail();
  validateCultureSetup47({mode:c.mode,enabled:c.enabled},w.nations.length);
  if(!exact(c.nations,w.nations.map(n=>n.id))||!exact(c.cities,w.cities.map(n=>n.id)))return fail();
  for(const n of w.nations){const a=c.nations[n.id];if(!exact(a,['cultureId','religionId','polity','name','origin','parentId'])||!c.enabled.includes(a.cultureId)||!POLITIES47.includes(a.polity)||!['new-world','secession'].includes(a.origin)||a.origin==='new-world'&&a.parentId!==null||a.origin==='secession'&&(!a.parentId||a.parentId===n.id||!Object.hasOwn(c.nations,a.parentId)))return fail();religion47(a.religionId);assertName(a.name,a.cultureId,'state',c.mode);if(n.name!==nationName47(a))return fail();}
  for(const city of w.cities){const a=c.cities[city.id];if(!exact(a,['cultureId','name'])||!c.enabled.includes(a.cultureId))return fail();assertName(a.name,a.cultureId,'city',c.mode);if(city.name!==cityName47(a))return fail();}
  // Chronicle is mandatory: omitting it must not bypass character validation.
  if(!chronicle||!record(chronicle.leaders)||!exact(chronicle.leaders,w.nations.map(n=>n.id)))return fail();
  const rulers=Object.values(chronicle.leaders).flat();
  if(!exact(c.rulers,rulers.map(r=>r.id)))return fail();
  for(const r of rulers){const a=c.rulers[r.id];assertRulerIdentity47(a,c.peopleMode,c.enabled);if(a.name!==r.name||a.house!==r.family||a.regnalName!==r.regnalName)return fail();}
}
export type CivilizationEdit47={kind:'nation';id:string;patch:Partial<Pick<NationIdentity47,'polity'|'religionId'>> & {customName?:string|null}}|{kind:'city';id:string;customName:string|null};
/** Private candidate transaction. Current projections change together; prior
 * accession snapshots and historical event text remain exactly as recorded. */
export function editCivilization47<T extends {world:World;chronicle:Chronicle;civilization:Civilization47}>(input:T,edit:CivilizationEdit47,expectedRevision:number):T {
  assertCivilization47(input.civilization,input.world,input.chronicle);
  const revision=input.civilization.revision;
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==revision)throw Error('文化配置已变化，请重新查看后再确认。');
  if(!Number.isSafeInteger(revision+1))throw Error('文化版本已达上限。');
  if(!record(edit))throw Error('文化编辑命令无效。');
  if(edit.kind==='nation') {
    const p=edit.patch;
    if(!exact(edit,['kind','id','patch'])||!Object.hasOwn(input.civilization.nations,edit.id)||!record(p)||!Object.keys(p).length||Object.keys(p).some(k=>!['polity','religionId','customName'].includes(k)||p[k as keyof typeof p]===undefined)||p.polity!==undefined&&!POLITIES47.includes(p.polity)||p.customName!==undefined&&p.customName!==null&&!text(p.customName))throw Error('国家制度或名称修改无效。');
    if(p.religionId!==undefined)religion47(p.religionId);
  }else if(edit.kind==='city') {
    if(!exact(edit,['kind','id','customName'])||!Object.hasOwn(input.civilization.cities,edit.id)||edit.customName!==null&&!text(edit.customName))throw Error('城市名称修改无效。');
  }else throw Error('未知文化编辑命令。');
  const next=structuredClone(input),c=next.civilization;
  if(edit.kind==='nation') {
    const n=c.nations[edit.id],p=edit.patch;
    if(p.polity!==undefined)n.polity=p.polity;if(p.religionId!==undefined)n.religionId=p.religionId;if(p.customName!==undefined)n.name.custom=p.customName;
    next.world.nations.find(n=>n.id===edit.id)!.name=nationName47(n);
  }else{
    const a=c.cities[edit.id];a.name.custom=edit.customName;
    const city=next.world.cities.find(v=>v.id===edit.id)!;city.name=cityName47(a);
    // This creator has one named city per region. Do not rename an unrelated
    // province after occupation or infer culture from the current controller.
    const province=next.world.provinces.find(p=>p.id===city.provinceId);
    if(!province)throw Error('城市所在地区不存在，原世界未改动。');province.name=city.name;
  }
  c.revision++;assertCivilization47(c,next.world,next.chronicle);return next;
}
