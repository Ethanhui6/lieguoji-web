import type {Upper14Run} from './upper14-model';
import type {CourtPeople} from './court16-people';
import type {CultureState} from './naming18-culture';
import {allCombatArmies} from './upper14-state';
import {buildProvinceCells} from './settlement25-cells';
import {nativeInitialPopulation} from './native-economy/population';
import {nativeInitialResources} from './native-economy/resources';
import {f} from './native-economy/numeric';
import {sourceLegionStrength} from './tactics-muster';
import {reconcileFiscal,type FiscalProvince,type FiscalState} from './naming18-state';
function random(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h=(h+0x6d2b79f5)|0;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
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
