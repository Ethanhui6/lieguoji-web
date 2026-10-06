import type {Army, Point, World} from '../../sim/types';
import type {Terrain13Run} from './terrain13-model';
import {contains, type TerrainContext as LandContext, type ProvinceTerrain} from './terrain13-context';
import {nativeCoreDistances,advanceCoreThreshold} from './native-combat/core-distance';
import {projectCombatTraits,initializedArmyBase} from './native-combat/state-traits';
import {nativeProvinceDefense,type NativePolity} from './native-combat/upper-efficiency';
export {contains};
export const POLITIES:NativePolity[]=['Kingdom','Empire','Federation','Republic','Tribal','Theocracy'];
export const TRAITS=['WellTrained','CoreDefense','HomelandDefense','Conqueror','StrengthenCore'] as const;
export type CombatTrait=typeof TRAITS[number];
export type NationCombat={polity:NativePolity;traits:CombatTrait[];destiny:number;coreThreshold:number;coreYear:number;provinceOrder:string[]};
export type ProvinceCombat={biomeCounts:number[];biomeOrder:number[];storedDefense:number;locked:boolean;manualSet:boolean;manualFortress:boolean;distance:number;connected:boolean};
export type UpperCombat={version:1;initialization:'native-combat-web-inputs-v1';nations:Record<string,NationCombat>;armies:Record<string,{base:number;initializedTick:number}>;provinces:Record<string,ProvinceCombat>};
export type TerrainContext=LandContext&{upper:UpperCombat};
export type UpperWorld=Pick<Terrain13Run,'world'|'clock'|'transports'|'reorganization'>;
export function traitProjection(traits:readonly CombatTrait[]){
 const fields={WellTrained:'IsWellTrained',CoreDefense:'CoreDefenseEfficiencyBoost',HomelandDefense:'IsHomelandDefense',Conqueror:'IsConqueror',StrengthenCore:'CoreProvinceRate'};
 return projectCombatTraits(traits.map(key=>({effects:[{key:fields[key],isBool:!['CoreDefense','StrengthenCore'].includes(key),value:key==='CoreDefense'?1.5:key==='StrengthenCore'?.3:1}]})));
}
/** Stable web PRNG seed bridge; native ordinary initialization is Range(10,90). */
function initialIndex(w:World,id:string,key:string,count:number){let h=2166136261;for(const c of `${w.custom?.seed??''}/${key}/${id}`)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)%count;}
export function allCombatArmies(r:UpperWorld):Army[]{return [...r.world.armies,...r.transports.cargo.map(c=>c.army)];}
/** Command/tick reconciliation mutates only the caller's private transaction copy.
 * Old army bases survive owner transfer and transport; explicit reorganization
 * is the only refresh besides initialization of a genuinely new army ID. */
export function reconcileCore(w:World,u:UpperCombat){
 const year=Math.floor(w.day/360),nationIds=new Set(w.nations.map(n=>n.id));
 for(const id of Object.keys(u.nations))if(!nationIds.has(id))delete u.nations[id];
 for(const n of w.nations){
  let s=u.nations[n.id];
  if(!s)s=u.nations[n.id]={polity:POLITIES[initialIndex(w,n.id,'native-no-culture-polity',6)],traits:[],destiny:10+initialIndex(w,n.id,'native-destiny',80),coreThreshold:2,coreYear:year,provinceOrder:[]};
  const owned=new Set(w.provinces.filter(p=>p.controller===n.id).map(p=>p.id));
  s.provinceOrder=s.provinceOrder.filter(id=>owned.has(id));const existing=new Set(s.provinceOrder);
  for(const p of w.provinces)if(owned.has(p.id)&&!existing.has(p.id))s.provinceOrder.push(p.id);
  const capital=w.cities.find(c=>c.id===n.capitalId),capitalId=capital&&owned.has(capital.provinceId)?capital.provinceId:undefined;
  // Lost/absent valid capital is an explicit web boundary: no core until a
  // real capital is designated, never treat the first remaining city as one.
  const distances=capitalId?nativeCoreDistances(w.provinces.map(p=>({id:p.id,stateRef:p.controller,neighbors:p.neighbors})),n.id,capitalId,s.provinceOrder):null;
  for(const id of s.provinceOrder){u.provinces[id].distance=distances?.[id].distance??2147483647;u.provinces[id].connected=distances?.[id].connected??false;}
 }
}
export function reconcileUpper(r:UpperWorld,u:UpperCombat,reorganized:readonly string[]=[]){
 const w=r.world,year=Math.floor(w.day/360);reconcileCore(w,u);
 for(const s of Object.values(u.nations)){
  // A 360-day web year bridges the native annual callback. Missing/lost
  // capital suspends core growth; no default city is silently installed.
  if(s.provinceOrder.some(id=>u.provinces[id].distance===0))for(let y=s.coreYear;y<year;y++)s.coreThreshold=advanceCoreThreshold(s.coreThreshold,s.provinceOrder.filter(id=>u.provinces[id].distance<=s.coreThreshold).length,s.provinceOrder.length,traitProjection(s.traits).CoreProvinceRate);
  s.coreYear=year;
 }
 const armies=allCombatArmies(r),ids=new Set(armies.map(a=>a.id)),reset=new Set(reorganized);
 for(const id of Object.keys(u.armies))if(!ids.has(id))delete u.armies[id];
 for(const a of armies)if(!u.armies[a.id]||reset.has(a.id)){const state=u.nations[a.nationId];if(!state)throw Error('军队国家战力输入缺失。');u.armies[a.id]={base:initializedArmyBase(traitProjection(state.traits)),initializedTick:r.clock.tick};}
}
export function terrainAt(world:World,context:TerrainContext,point:Point):ProvinceTerrain|undefined{const p=world.provinces.find(p=>contains(p.polygon,point));return p?context.provinces[p.id]:undefined;}
export function provinceDefense(u:UpperCombat,id:string){const p=u.provinces[id];if(!p)throw Error('省防御输入缺失。');return nativeProvinceDefense(p.storedDefense,p.locked,p.manualSet,p.manualFortress);}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function assertUpperSchema(v:unknown){
 const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
 const c=v as UpperCombat|undefined;
 if(unknown(c,['version','initialization','nations','armies','provinces'])||c?.version!=null&&c.version!==1||c?.initialization!=null&&c.initialization!=='native-combat-web-inputs-v1'||record(c?.nations)&&Object.values(c.nations).some(n=>unknown(n,['polity','traits','destiny','coreThreshold','coreYear','provinceOrder'])||n?.polity!=null&&!POLITIES.includes(n.polity)||Array.isArray(n?.traits)&&n.traits.some(t=>!TRAITS.includes(t)))||record(c?.armies)&&Object.values(c.armies).some(a=>unknown(a,['base','initializedTick']))||record(c?.provinces)&&Object.values(c.provinces).some(p=>unknown(p,['biomeCounts','biomeOrder','storedDefense','locked','manualSet','manualFortress','distance','connected'])))throw Error('战力存档含未来规则或未知字段，已锁定读写。');
}
export function assertUpper(u:UpperCombat,r:UpperWorld){
 assertUpperSchema(u);const fail=()=>{throw Error('战力输入损坏，保留原存档。');},finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max,integer=(n:unknown,min:number,max:number)=>Number.isInteger(n)&&finite(n,min,max);
 if(!u||u.version!==1||u.initialization!=='native-combat-web-inputs-v1'||!record(u.nations)||!record(u.armies)||!record(u.provinces))return fail();
 const exact=(table:object,ids:string[])=>Object.keys(table).length===ids.length&&ids.every(id=>Object.hasOwn(table,id));
 if(!exact(u.nations,r.world.nations.map(n=>n.id))||!exact(u.provinces,r.world.provinces.map(p=>p.id))||!exact(u.armies,allCombatArmies(r).map(a=>a.id)))fail();
 for(const [id,n]of Object.entries(u.nations)){if(!record(n)||!POLITIES.includes(n.polity)||!Array.isArray(n.traits)||new Set(n.traits).size!==n.traits.length||n.traits.some(t=>!TRAITS.includes(t))||!finite(n.destiny,0,100)||!integer(n.coreThreshold,-2147483648,2147483647)||!integer(n.coreYear,0,Math.floor(r.world.day/360))||!Array.isArray(n.provinceOrder)||new Set(n.provinceOrder).size!==n.provinceOrder.length||n.provinceOrder.length!==r.world.provinces.filter(p=>p.controller===id).length||n.provinceOrder.some(p=>!r.world.provinces.some(v=>v.id===p&&v.controller===id)))fail();}
 for(const a of Object.values(u.armies))if(!record(a)||!finite(a.base,0,100)||!integer(a.initializedTick,0,r.clock.tick))fail();
 for(const p of Object.values(u.provinces))if(!record(p)||!Array.isArray(p.biomeCounts)||p.biomeCounts.length!==13||p.biomeCounts.some(n=>!integer(n,0,1_000_000))||p.biomeCounts.reduce((s,n)=>s+n,0)<1||!Array.isArray(p.biomeOrder)||new Set(p.biomeOrder).size!==p.biomeOrder.length||p.biomeOrder.some(n=>!integer(n,0,12)||!p.biomeCounts[n])||p.biomeOrder.length!==p.biomeCounts.filter(n=>n>0).length||!finite(p.storedDefense,1,10)||![p.locked,p.manualSet,p.manualFortress,p.connected].every(v=>typeof v==='boolean')||!integer(p.distance,0,2147483647))fail();
}
