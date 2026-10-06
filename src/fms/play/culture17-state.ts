import {nationEthnic,type CultureState} from './culture17-culture';
import type {World} from '../../sim/types';
import type {Upper14Run} from './upper14-model';
import {courtIncome,type CourtPeople} from './court16-people';
import {allCombatArmies,reconcileCore,contains,type TerrainContext as UpperContext} from './upper14-state';
import {buildProvinceCells} from './fiscal15-geography';
import {nativeInitialPopulation} from './native-economy/population';
import {nativeInitialResources} from './native-economy/resources';
import {nativeProvinceIncome,nativeGoldSettlement,nativeMonthlyArmyCost,type EconomicResource,type GoldSettlement,type NativeFeeProvince,type NativeFeeArmy} from './native-economy/settlement';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {f,iadd,int32,truncInt} from './native-economy/numeric';
import {sourceLegionStrength} from './tactics-muster';
import {nationsAtWar} from './tactics-statecraft';
export type ProvinceCells={cellBiomes:number[];seaNeighbor:boolean};
export type FiscalProvince=ProvinceCells&{maxPopulation:number;resources:EconomicResource[]};
export type FiscalLedger=GoldSettlement&{day:number;openingGold:number;reorganizationCost:number;distanceSuspended:boolean};
export type FiscalNation={gold:number;goldPerMonth:number;armyCostGold:number;goldBattleModifier:number;initializedDay:number;lastMonth:number;ledger:FiscalLedger|null};
export type FiscalState={version:1;initialization:'native-fiscal-web-cells-v1';provinces:Record<string,FiscalProvince>;nations:Record<string,FiscalNation>};
export type TerrainContext=UpperContext&{finance:FiscalState;people:CourtPeople;culture:CultureState};
export type FiscalWorld=Pick<Upper14Run,'world'|'clock'|'upperCombat'|'reorganization'|'battles'|'transports'|'navy'>&{people:CourtPeople;culture:CultureState};
/** Independent web streams; not Unity.Random sequence parity. */
function random(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h=(h+0x6d2b79f5)|0;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
const live=(a:{status:string;troops:number})=>a.status!=='destroyed'&&a.troops>0;
const blank=(day:number):FiscalNation=>({gold:0,goldPerMonth:0,armyCostGold:0,goldBattleModifier:1,initializedDay:day,lastMonth:Math.floor(day/30),ledger:null});

/** Copy preserves real population/food/armies. Only a new world initializes
 * them from the recovered cell-capacity kernel. Both use one capacity table. */
export function initializeFiscal(r:Upper14Run&{people:CourtPeople;culture:CultureState},copy:boolean):FiscalState{
 const cells=buildProvinceCells(r.terrain,r.world,r.scale),provinces:Record<string,FiscalProvince>={},seed=String(r.world.custom?.seed??'');
 const shares=Object.fromEntries(r.world.nations.map(n=>[n.id,f(.7+random(`${seed}/population/${n.id}`)()*.2)]));
 for(const p of r.world.provinces){
  const input=cells[p.id],data=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!;
  const next=nativeInitialPopulation({...input,perCellFactor:100,growthRate:1.002,statePercentage:shares[p.controller],provinceRandom:f(.9+random(`${seed}/population/${p.id}`)()*.15),atWarInProvince:false,oldPopulation:0,oldMaxPopulation:0,maxLocked:false});
  provinces[p.id]={...input,maxPopulation:copy?Math.max(next.maxPopulation,data.population):next.maxPopulation,resources:nativeInitialResources(input.cellBiomes,input.seaNeighbor,random(`${seed}/resources/${p.id}`))};
  if(!copy){data.population=next.population;data.grain=next.population*20;}
 }
 if(!copy){
  const pop=r.world.statecraft!.provinces.map(p=>p.population).sort((a,b)=>a-b),m=pop.length>>1,median=pop.length%2?pop[m]:(pop[m-1]+pop[m])/2,costs:Record<string,number>={};
  for(const a of allCombatArmies(r)){const force=r.tactics.forces[a.id];if(force){const home=r.world.statecraft!.provinces.find(p=>p.provinceId===force.homeId)!;force.fullStrength=sourceLegionStrength(home.population,median);a.troops=force.fullStrength;if(force.kind==='regular'){const cost=Math.round(a.troops/10);if(home.population<cost)throw Error('新局兵源不足，保留原世界。');home.population-=cost;costs[a.nationId]=(costs[a.nationId]??0)+cost;}}}
  // Creation-only reconciliation: replace the provisional old-population
  // recruitment amounts before this new world is ever returned or saved.
  for(const n of r.world.nations)for(const event of r.world.events)if(event.text.startsWith(n.name+'新编')&&event.reason.includes('本次扣内部人口')){event.reason=event.reason.replace(/本次扣内部人口\d+/,`本次扣内部人口${costs[n.id]??0}`);for(const entry of r.chronicle.entries)if(entry.sourceEventId===event.id)entry.reason=event.reason;}
 }
 const finance:FiscalState={version:1,initialization:'native-fiscal-web-cells-v1',provinces,nations:{}};
 reconcileFiscal(r,finance,copy);return finance;
}
export function provinceIncome(w:World,u:UpperContext['upper'],finance:FiscalState,id:string,people:CourtPeople,culture:CultureState,destiny?:number):number{
 const p=w.provinces.find(p=>p.id===id)!,n=u.nations[p.controller],data=finance.provinces[id];
 return nativeProvinceIncome({population:w.statecraft!.provinces.find(p=>p.provinceId===id)!.population,maxPopulation:data.maxPopulation,cellCount:data.cellBiomes.length,resources:data.resources,ethnic:nationEthnic(culture,p.controller),destiny:destiny??n.destiny,nationProvinceCount:n.provinceOrder.length,worldProvinceCount:w.provinces.length,localIncomeMultiplier:courtIncome(people,w,p.controller,id).local});
}
/** Explicit state/position bridge. Native RTSMoveToProvince sets Attacking
 * even for friendly transit; include marching, contact and hostile garrisons.
 * Cargo has no active land order. Sea/fleet fees remain unresolved. */
export function monthlyArmyFees(r:FiscalWorld,nationId:string){
 const w=r.world,ids=new Map(w.provinces.map((p,i)=>[p.id,i+1])),suspended=r.upperCombat.nations[nationId].provinceOrder.some(id=>r.upperCombat.provinces[id].distance===2147483647);
 const provinces:NativeFeeProvince[]=w.provinces.map(p=>({id:ids.get(p.id)!,owner:p.controller,land:true,distance:r.upperCombat.provinces[p.id].distance===2147483647?0:r.upperCombat.provinces[p.id].distance,neighbors:p.neighbors.map(id=>ids.get(id)!)}));
 const engaged=new Set(r.battles.engagements.flatMap(b=>b.armies)),armies:NativeFeeArmy[]=[];
 for(const a of w.armies){
  if(a.nationId!==nationId||!live(a))continue;
  const node=w.provinces.find(p=>p.id===a.provinceId)!;
  const state=r.reorganization.active[a.id]?'Reorganization':a.status==='marching'||engaged.has(a.id)||a.progress===0&&a.status!=='retreating'&&nationsAtWar(w,a.nationId,node.controller)?'Attacking':'Other';
  if(state==='Other')continue;
  // On-road contact belongs to the polygon at its actual point, not origin.
  const target=w.provinces.find(p=>p.id===a.route[0])??node,point={x:node.center.x+(target.center.x-node.center.x)*a.progress,y:node.center.y+(target.center.y-node.center.y)*a.progress},here=a.progress>0?w.provinces.find(p=>contains(p.polygon,point)):node;
  // Exact boundary can be in neither polygon: unresolved position is not billed.
  if(here)armies.push({state,provinceId:ids.get(here.id)!});
 }
 return {cost:nativeMonthlyArmyCost(nationId,armies,provinces),distanceSuspended:suspended};
}
function settleNation(r:FiscalWorld,finance:FiscalState,id:string,initialDestiny?:number){
 const n=finance.nations[id],combat=r.upperCombat.nations[id],fees=monthlyArmyFees(r,id),openingGold=n.gold;
 const input=courtIncome(r.people,r.world,id);
 const out=nativeGoldSettlement({gold:n.gold,provinceIncome:combat.provinceOrder.map(p=>provinceIncome(r.world,r.upperCombat,finance,p,r.people,r.culture,initialDestiny)),leaderTaxMultiplier:input.tax,centralIncomeMultiplier:input.central,armyCostGold:fees.cost,goldProductionModifier:defaultPoliticalCombat(combat.polity).goldProduction,ethnic:nationEthnic(r.culture,id)});
 Object.assign(n,{gold:out.gold,goldPerMonth:out.goldPerMonth,armyCostGold:out.armyCostGold,goldBattleModifier:out.goldBattleModifier,lastMonth:Math.floor(r.world.day/30),ledger:{...out,day:r.world.day,openingGold,reorganizationCost:0,distanceSuspended:fees.distanceSuspended}});
}
/** New IDs initialize once. Extinct countries retain their account; restored
 * IDs do not receive a fabricated repeat grant. Native Start(false) on full
 * family restoration is not yet represented by the web politics system. */
export function reconcileFiscal(r:FiscalWorld,finance:FiscalState,copy=false){
 for(const n of r.world.nations)if(!finance.nations[n.id]){finance.nations[n.id]=blank(r.world.day);if(r.upperCombat.nations[n.id].provinceOrder.length)settleNation(r,finance,n.id,copy?undefined:0);}
}
export function settleFiscalMonth(r:FiscalWorld,finance:FiscalState){
 reconcileCore(r.world,r.upperCombat);const month=Math.floor(r.world.day/30);
 if(r.world.day%30!==0)return;
 for(const n of r.world.nations)if(finance.nations[n.id]&&finance.nations[n.id].lastMonth<month&&r.upperCombat.nations[n.id].provinceOrder.length)settleNation(r,finance,n.id);
}
/** Army.ReorganizationUpdate 0x34F7D0: one charge at completion, not entry.
 * The caller detects a completed-counter increment inside its transaction. */
export function reorganizationFee(gold:number,goldPerMonth:number,destiny:number){
 int32(gold);int32(goldPerMonth);let cost=truncInt(f(f(f(100-f(destiny))*500)/100));
 const abs=gold===-2147483648?gold:Math.abs(gold);
 if(gold<0&&abs>(goldPerMonth<<3))cost=truncInt(f(f(cost)*f(.1)));
 return cost;
}
export function chargeReorganizations(before:Record<string,number>,r:FiscalWorld,finance:FiscalState){
 for(const [id,count]of Object.entries(r.reorganization.completed))if(count>(before[id]??0)){
  const army=r.world.armies.find(a=>a.id===id);if(!army)throw Error('重编完成军团丢失，取消本次推进。');const n=finance.nations[army.nationId];
  const cost=reorganizationFee(n.gold,n.goldPerMonth,r.upperCombat.nations[army.nationId].destiny);n.gold=iadd(n.gold,-cost);
  if(n.ledger)n.ledger.reorganizationCost=iadd(n.ledger.reorganizationCost,cost);
 }
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const nationKeys=['gold','goldPerMonth','armyCostGold','goldBattleModifier','initializedDay','lastMonth','ledger'];
const ledgerKeys=['gold','goldPerMonth','armyCostGold','goldBattleModifier','baseIncome','inventoryFactor','goldBeforeArmyCost','day','openingGold','reorganizationCost','distanceSuspended'];
export function assertFiscalSchema(v:unknown){
 const c=v as FiscalState|undefined;
 if(unknown(c,['version','initialization','provinces','nations'])||c?.version!=null&&c.version!==1||c?.initialization!=null&&c.initialization!=='native-fiscal-web-cells-v1'||record(c?.nations)&&Object.values(c.nations).some(n=>unknown(n,nationKeys)||unknown(n?.ledger,ledgerKeys))||record(c?.provinces)&&Object.values(c.provinces).some(p=>unknown(p,['cellBiomes','seaNeighbor','maxPopulation','resources'])||Array.isArray(p?.resources)&&p.resources.some(r=>unknown(r,['name','baseValue','probability','affectedBy'])||Array.isArray(r?.affectedBy)&&r.affectedBy.some(e=>!['FishAndHunting','Agriculture','Nomadic','Maritime','Commercial'].includes(e)))))throw Error('财政存档含未来规则或未知字段，已锁定读写。');
}
export function assertFiscal(finance:FiscalState,r:FiscalWorld){
 assertFiscalSchema(finance);const fail=()=>{throw Error('财政存档损坏，已保留原档。');},num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,integer=(v:unknown,min=-2147483648,max=2147483647)=>Number.isInteger(v)&&num(v,min,max);
 if(!finance||finance.version!==1||finance.initialization!=='native-fiscal-web-cells-v1'||!record(finance.nations)||!record(finance.provinces))return fail();
 const exact=(table:object,ids:string[])=>Object.keys(table).length===ids.length&&ids.every(id=>Object.hasOwn(table,id));
 if(!exact(finance.nations,r.world.nations.map(n=>n.id))||!exact(finance.provinces,r.world.provinces.map(p=>p.id)))fail();
 for(const [id,p]of Object.entries(finance.provinces)){
  if(!record(p)||!integer(p.maxPopulation,1)||typeof p.seaNeighbor!=='boolean'||!Array.isArray(p.cellBiomes)||!p.cellBiomes.length||p.cellBiomes.length>50000||p.cellBiomes.some(b=>!integer(b,0,12))||!Array.isArray(p.resources)||p.resources.length>60)return fail();
  const counts=Array(13).fill(0) as number[];for(const b of p.cellBiomes)counts[b]++;if(counts.some((n,i)=>n!==r.upperCombat.provinces[id].biomeCounts[i]))fail();
  if(new Set(p.resources.map(v=>v.name)).size!==p.resources.length)fail();
  for(const resource of p.resources)if(!record(resource)||typeof resource.name!=='string'||!resource.name||resource.name.length>80||!integer(resource.baseValue,0)||!num(resource.probability,0,1)||!Array.isArray(resource.affectedBy))fail();
  if(p.resources.length&&Math.abs(p.resources.reduce((s,v)=>s+v.probability,0)-1)>1e-5)fail();
 }
 for(const n of Object.values(finance.nations)){
  if(!record(n)||!integer(n.gold)||!integer(n.goldPerMonth)||!integer(n.armyCostGold,0)||!num(n.goldBattleModifier,0,100)||!integer(n.initializedDay,0,r.world.day)||!integer(n.lastMonth,0,Math.floor(r.world.day/30)))return fail();
  if(n.ledger===null)continue;const l=n.ledger;
  if(!record(l)||['gold','goldPerMonth','armyCostGold','baseIncome','goldBeforeArmyCost','openingGold','reorganizationCost'].some(k=>!integer(l[k]))||!integer(l.day,n.initializedDay,r.world.day)||!num(l.inventoryFactor,0,1)||!num(l.goldBattleModifier,0,100)||typeof l.distanceSuspended!=='boolean')fail();
 }
}
