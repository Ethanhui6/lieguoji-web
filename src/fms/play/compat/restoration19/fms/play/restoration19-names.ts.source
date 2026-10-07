import type {World,Point} from '../../sim/types';
import type {FmsDocument} from '../model';
import type {Chronicle} from './chronicle-records';
import {seededCharacterRandom} from './native-economy/character-generation';
import {originalNamingCulture,originalNamingCultureIds} from './native-culture/original-naming';
import {nativeAvailableNameKeys,nativeStateNameKey,nativeCityNameKey,nativeCultureSeedDistance} from './native-culture/name-pool';
import {nativePlaceName} from './native-culture/localized-name';
import {nativeCharacterName} from './native-culture/character-name';
import {nativeDefaultCulture} from './native-culture/default-culture';
import {nativeFullName,nativeNameOrder,nativeLastName,nativeFullNameCulture} from './native-culture/full-name';

export const CULTURE_NAMES:Record<string,string>={Ciestundu:'塞斯顿都',EasternFantasy:'东方架空',Leffathou:'莱法芙',Oeczea:'奥克泽雅',WesternFantasy:'西方幻想',Wristhos:'莱斯索斯'};
export const DEFAULT_CULTURES=['Ciestundu','Leffathou','Oeczea','Wristhos'];
export type PlaceName={baseCultureId:string;mapCultureId:string;key:string|null;name:string;origin:'native'|'legacy'|'custom'|'exhausted'|'province'};
export type NamingFamily={id:number;surname:string;cultureName:string};
export type RulerName={baseCultureId:string;mapCultureId:string;first:string|null;storedLast:string;gender:0|1|null;originalFamilyId:number;familyId:number;name:string;origin:'native'|'legacy'};
export type NamingState={version:1;revision:number;language:'Chinese';enabled:string[];nations:Record<string,PlaceName>;cities:Record<string,PlaceName>;rulers:Record<string,RulerName>;families:Record<string,NamingFamily>;nextFamilyId:number};
export function namingCultures(enabled:readonly string[]=DEFAULT_CULTURES):string[]{
 if(!Array.isArray(enabled)||!enabled.length||enabled.length>6||new Set(enabled).size!==enabled.length||enabled.some(id=>!originalNamingCultureIds.includes(id)))throw Error('请选择至少一种已恢复的原作文化。');
 return originalNamingCultureIds.filter(id=>enabled.includes(id));
}
const empty=(enabled:string[]):NamingState=>({version:1,revision:0,language:'Chinese',enabled,nations:{},cities:{},rulers:{},families:{},nextFamilyId:1});
export const mapCultureId=(id:string)=>'map-'+id;
const culture=(id:string)=>{const c=originalNamingCulture(id);if(!c)throw Error('命名文化缺失。');return c;};
export function nearestNamingCell(terrain:Pick<FmsDocument,'points'|'elevations'>,p:Point):Point{
 let best:Point|undefined,d=Infinity;terrain.points.forEach(([rawX,rawY],i)=>{if(terrain.elevations[i]<20)return;const x=Math.fround(rawX),y=Math.fround(rawY),next=(x-p.x)**2+(y-p.y)**2;if(next<d){d=next;best={x,y};}});if(!best)throw Error('首都缺少陆地采样。');return best;
}
function place(baseCultureId:string,key:string|null,kind:'state'|'city',origin:PlaceName['origin']='native'):PlaceName{
 const c=culture(baseCultureId),name=key===null?`Out of state Names for Culture ${baseCultureId}`:nativePlaceName(new Map([[baseCultureId,c]]),kind,baseCultureId,key,'Chinese');
 if(!name)throw Error('原名称数据没有可用显示名。');
 return {baseCultureId,mapCultureId:mapCultureId(baseCultureId),key,name,origin:key===null?'exhausted':origin};
}
/** Native seed selection/nearest-capital-cell rule, on the web's actual mesh.
 * Capitals are administrative centroids, so nearest land sample is an explicit
 * web bridge for native burg.cell. No sea paths or topology-distance invented. */
export function initialNaming(terrain:FmsDocument,capitals:Point[],owners:readonly number[],enabled?:readonly string[]):NamingState{
 const ids=namingCultures(enabled),n=empty(ids),random=seededCharacterRandom(terrain.worldId+'/culture-seeds'),available=capitals.map((_,i)=>i),seeds:number[]=[];
 if(capitals.length>ids.length)while(seeds.length<ids.length)seeds.push(available.splice(random.intRange(0,available.length),1)[0]);else seeds.push(...available);
 const cells=capitals.map(p=>nearestNamingCell(terrain,p));
 const assigned=capitals.map((_,i)=>{const own=seeds.indexOf(i);if(own>=0)return ids[own];let nearest=0,best=Infinity;seeds.forEach((seed,j)=>{const d=nativeCultureSeedDistance(cells[seed],cells[i]);if(d<best){best=d;nearest=j;}});return ids[nearest];});
 for(const id of ids){
  const c=culture(id),rng=seededCharacterRandom(terrain.worldId+'/names/'+id),states=nativeAvailableNameKeys([...c.states.keys()],[],rng.value),cities=nativeAvailableNameKeys([...c.cities.keys()],[],rng.value);let stateIndex=0,cityIndex=0;
  assigned.forEach((base,i)=>{if(base===id)n.nations['n-'+i]=place(id,nativeStateNameKey(states,stateIndex++),'state');});
  owners.forEach((owner,i)=>{if(assigned[owner]===id)n.cities['c-'+i]=place(id,nativeCityNameKey(cities,[...c.cities.keys()],cityIndex++,rng.intRange),'city');});
 }
 return n;
}
/** An old name has no invented source key. Existing snapshots and ruler names
 * survive explicit copying unchanged, including player-customized names. */
export function legacyNaming(r:{world:World;chronicle:Chronicle}):NamingState{
 const n=empty(['EasternFantasy']),baseCultureId='EasternFantasy',mapCultureIdValue=mapCultureId(baseCultureId);
 const old=(name:string):PlaceName=>({baseCultureId,mapCultureId:mapCultureIdValue,key:null,name,origin:'legacy'});
 for(const nation of r.world.nations){const familyBySurname=new Map<string,NamingFamily>();n.nations[nation.id]=old(nation.name);for(const ruler of r.chronicle.leaders[nation.id]??[]){const family=familyBySurname.get(ruler.family)??{id:n.nextFamilyId++,surname:ruler.family,cultureName:mapCultureIdValue};n.families[family.id]=family;familyBySurname.set(ruler.family,family);n.rulers[ruler.id]={baseCultureId,mapCultureId:mapCultureIdValue,first:null,storedLast:ruler.family,gender:null,originalFamilyId:family.id,familyId:family.id,name:ruler.name,origin:'legacy'};}}
 for(const city of r.world.cities)n.cities[city.id]=old(city.name);return n;
}
export function newStateName(n:NamingState,w:World,id:string,parentId:string):string{
 const parent=n.nations[parentId];if(!parent)throw Error('新国命名缺少父国文化。');const c=culture(parent.baseCultureId),rng=seededCharacterRandom(`${w.custom!.seed}/new-state/${id}`);
 const used=w.nations.filter(v=>n.nations[v.id]?.baseCultureId===parent.baseCultureId).map(v=>v.name),pool=nativeAvailableNameKeys([...c.states.keys()],used,rng.value);
 n.nations[id]=place(parent.baseCultureId,nativeStateNameKey(pool,0),'state');n.revision++;return n.nations[id].name;
}
export function newRulerName(n:NamingState,w:World,nationId:string,rulerId:string,previousRulerId?:string){
 const nation=n.nations[nationId];if(!nation)throw Error('君主命名缺少国家文化。');const c=culture(nation.baseCultureId),rng=seededCharacterRandom(`${w.custom!.seed}/native-name/${rulerId}`),gender=rng.intRange(0,2) as 0|1;
 const generated=nativeCharacterName(c,{gender,language:n.language,currentLanguage:()=>n.language,usePatronymic:false,fatherFirstName:null,defaultCulture:()=>culture(nativeDefaultCulture(n.language)),intRange:rng.intRange});
 if(!generated.first||!generated.last)throw Error('原人物词库未能产生有效姓名。');
 const previous=previousRulerId?n.rulers[previousRulerId]:undefined;
 // Retaining the incumbent dynasty is the existing web succession bridge;
 // this is not yet original kinship or candidate-selection simulation.
 let family=previous?n.families[previous.familyId]:undefined;
 if(!family){family={id:n.nextFamilyId++,surname:generated.last,cultureName:nation.mapCultureId};n.families[family.id]=family;}
 const lookup=(id:number)=>n.families[id]??null,last=nativeLastName(family.id,family.id,generated.last,lookup),fullCulture=nativeFullNameCulture(family.id,family.id,lookup,id=>{const base=Object.values(n.nations).find(v=>v.mapCultureId===id)?.baseCultureId;return base?culture(base):null;}),name=nativeFullName(generated.first,last,fullCulture?nativeNameOrder(fullCulture,()=>nativeDefaultCulture(n.language)):null);
 n.rulers[rulerId]={baseCultureId:nation.baseCultureId,mapCultureId:nation.mapCultureId,first:generated.first,storedLast:generated.last,gender,originalFamilyId:family.id,familyId:family.id,name,origin:'native'};n.revision++;
 return {name,family:last,first:generated.first};
}
/** Explicit rename changes live names only; source key stops claiming identity.
 * Province-only renames do not rename their city, and history stays a snapshot. */
export function reconcileNameEdits(n:NamingState,w:World):void{
 for(const [rows,entities]of [[n.nations,w.nations],[n.cities,w.cities]] as const)for(const entity of entities){const row=rows[entity.id];if(!row)throw Error('命名实体引用缺失。');if(row.name!==entity.name){row.name=entity.name;row.key=null;row.origin='custom';n.revision++;}}
}
