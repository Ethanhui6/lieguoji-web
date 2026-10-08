import type {FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {readArmySpace47} from './army-space47';
import {forceKey47} from './force-motion47';
import {nationsAtWar} from './realtime-statecraft';
import {reconcileCore} from './upper14-state';
import {economicEthnic47} from './civilization47-economy';
import {courtIncome} from './court16-people';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {nativeProvinceIncome,nativeMonthlyArmyCost,nativeGoldSettlement,type NativeFeeProvince,type NativeFeeArmy} from './native-economy/settlement';

/** Narrow running-account guard, not the pending full47 save validator. */
export function assertMonthlyAccounts47(r:FoundingForces47){
  const ids=r.world.nations.map(n=>n.id),month=Math.floor(r.world.day/30),integer=(v:number,min:number,max:number)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  for(const records of [r.finance.nations,r.destiny.nations])if(Object.keys(records).length!==ids.length||ids.some(id=>!Object.hasOwn(records,id)))throw Error('月账缺少已有国家或含未知国家。');
  for(const id of ids){const f=r.finance.nations[id],d=r.destiny.nations[id];
    if(!integer(f.lastMonth,0,month)||!integer(d.lastMonth,0,month)||!integer(f.gold,-2147483648,2147483647)||!Number.isFinite(f.goldBattleModifier)||!Number.isFinite(d.destiny)||d.destiny<0||d.destiny>100)throw Error('月账月份、国库或国运无效。');
  }
  for(const p of r.world.provinces)if(!integer(r.finance.provinces[p.id]?.maxPopulation,1,2147483647))throw Error('月账人口容量无效。');
}

/** Resolved current-position bridge. Sea remains a real untaxed face, never
 * the last Army.provinceId. No sea sovereignty exists in this version yet.
 * Native Attacking includes friendly marching; the web bridge excludes a
 * retreat, and uses actual held contact/hostile garrison for stationary Army. */
export function monthlyArmyFees47(r:FoundingForces47,nationId:string){
  const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),ids=new Map(r.world.provinces.map((p,i)=>[p.id,i+1]));
  const provinces:NativeFeeProvince[]=r.world.provinces.map(p=>({id:ids.get(p.id)!,owner:p.controller,land:true,distance:r.upperCombat.provinces[p.id].distance===2147483647?0:r.upperCombat.provinces[p.id].distance,neighbors:p.neighbors.map(id=>ids.get(id)!)}));
  const seaIds=new Map<number,number>(),armies:NativeFeeArmy[]=[],held=new Set(r.forceContacts.pairs.flatMap(c=>[c.a,c.b]));
  for(const v of space.byArmy.values()){
    const a=v.army;if(a.nationId!==nationId)continue;
    const active=v.travel.status==='moving'||v.travel.status==='blocked'||held.has(forceKey47({kind:'army',id:a.id}))||!!v.province&&nationsAtWar(r.world,nationId,v.province.controller);
    const state=r.reorganization.active[a.id]?'Reorganization':a.status!=='retreating'&&active?'Attacking':'Other';if(state==='Other')continue;
    let provinceId=v.province?ids.get(v.province.id)!:seaIds.get(v.seaFace!);
    if(provinceId===undefined){provinceId=r.world.provinces.length+1+v.seaFace!;seaIds.set(v.seaFace!,provinceId);provinces.push({id:provinceId,owner:null,land:false,distance:0,neighbors:[]});}
    armies.push({state,provinceId});
  }
  const distanceSuspended=r.upperCombat.nations[nationId].provinceOrder.some(id=>!r.upperCombat.provinces[id].connected);
  return {cost:nativeMonthlyArmyCost(nationId,armies,provinces),distanceSuspended};
}
/** Private daily candidate only. Monthly tax precedes that month's muster
 * and destiny update; lastMonth prevents repeated credit. Extinct accounts
 * remain, and this never invents a new/restoration opening grant. */
export function settleFiscalMonth47(r:FoundingForces47){
  if(r.world.day%30!==0)return;
  reconcileCore(r.world,r.upperCombat);const month=Math.floor(r.world.day/30);
  for(const nation of r.world.nations){
    const id=nation.id,n=r.finance.nations[id],u=r.upperCombat.nations[id];if(!n||!u)throw Error('月税缺少已有国库或国家规则。');
    if(n.lastMonth>=month||!u.provinceOrder.length)continue;
    const ethnic=economicEthnic47(r.economy,id),fees=monthlyArmyFees47(r,id),court=courtIncome(r.people,r.world,id),openingGold=n.gold;
    const provinceIncome=u.provinceOrder.map(pid=>{const p=r.finance.provinces[pid],data=r.world.statecraft!.provinces.find(p=>p.provinceId===pid)!;return nativeProvinceIncome({population:data.population,maxPopulation:p.maxPopulation,cellCount:p.cellBiomes.length,resources:p.resources,ethnic,destiny:r.destiny.nations[id].destiny,nationProvinceCount:u.provinceOrder.length,worldProvinceCount:r.world.provinces.length,localIncomeMultiplier:courtIncome(r.people,r.world,id,pid).local});});
    const out=nativeGoldSettlement({gold:openingGold,provinceIncome,leaderTaxMultiplier:court.tax,centralIncomeMultiplier:court.central,armyCostGold:fees.cost,goldProductionModifier:defaultPoliticalCombat(u.polity).goldProduction,ethnic});
    Object.assign(n,{gold:out.gold,goldPerMonth:out.goldPerMonth,armyCostGold:out.armyCostGold,goldBattleModifier:out.goldBattleModifier,lastMonth:month,ledger:{...out,day:r.world.day,openingGold,reorganizationCost:0,distanceSuspended:fees.distanceSuspended}});
  }
}
