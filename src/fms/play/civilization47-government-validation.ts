import {assertFmsDocument} from '../model';
import {assertPopulation47} from './civilization47-population-validation';
import {assertEconomy47,economicEthnic47} from './civilization47-economy';
import {governmentRandom47,openingPopulation47,openingDestiny47,type Government47} from './civilization47-government';
import {buildProvinceCells} from './settlement25-cells';
import {buildProvinceCombat} from './settlement25-combat';
import {buildTerrainContext} from './settlement25-terrain';
import {nativeInitialResources} from './native-economy/resources';
import {nativeGoldSettlement,nativeProvinceIncome} from './native-economy/settlement';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {POLITIES47} from './civilization47-catalog';
import {courtIncome} from './court16-people';
import {reconcileCore,traitProjection,type UpperCombat} from './upper14-state';
import {initializedArmyBase} from './native-combat/state-traits';
import {emptyTactics47,musterFoundingArmies47} from './civilization47-muster';
import {initialArmyPositions47} from './army-presence47';
import {armyGeographyFor47} from './army-geography47';

import {geographyBinding} from './war30-geography';

const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
/** Object property order is not identity; array order is native input order. */
function equal(a:unknown,b:unknown):boolean{
  if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Object.keys(a).length===a.length&&Object.keys(b).length===b.length&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)&&Object.hasOwn(b,i)&&equal(a[i],b[i])).every(Boolean);
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;return Object.keys(aa).length===Object.keys(bb).length&&Object.keys(aa).every(k=>Object.hasOwn(bb,k)&&equal(aa[k],bb[k]));
}
/** Creation receipt verifier, NOT a full47 live/save validator. It deliberately
 * accepts only tick-zero before movement/monthly finance. Every source value
 * is replayed from actual geography/population and selected economic inputs.
 * Later runtime must preserve receipts while validating its evolving states. */
export function assertGovernmentOpening47(r:Government47){
  const fail=()=>{throw Error('新局国家、财政、征募或地理凭据不一致，原世界未改动。');};
  assertPopulation47(r);assertFmsDocument(r.terrain);
  if(r.clock.tick!==0||r.world.day!==0||r.scale!==1000/Math.max(r.terrain.width,r.terrain.height)||!exact(r.governmentOpening,['version','rule','population','recruitments','accounts'])||r.governmentOpening.version!==1||r.governmentOpening.rule!=='population-muster-first-gold-v1'||!exact(r.governmentOpening.accounts,r.world.nations.map(n=>n.id))||!exact(r.finance,['version','initialization','provinces','nations'])||r.finance.version!==1||r.finance.initialization!=='native-fiscal-web-cells-v1'||!exact(r.finance.provinces,r.world.provinces.map(p=>p.id))||!exact(r.finance.nations,r.world.nations.map(n=>n.id)))return fail();
  const cells=buildProvinceCells(r.terrain,r.world,r.scale),land=buildTerrainContext(r.terrain,r.world,r.scale),populations:Record<string,number>={},seed=r.world.custom!.seed;
  assertEconomy47(r.economy,r.world,cells);
  const expectedUpper:UpperCombat={version:1,initialization:'native-combat-web-inputs-v1',nations:Object.fromEntries(r.world.nations.map(n=>[n.id,{polity:r.civilization.nations[n.id].polity,traits:[],destiny:0,coreThreshold:2,coreYear:0,provinceOrder:[]}])),armies:{},provinces:buildProvinceCombat(r.terrain,r.world,r.scale,land)};
  reconcileCore(r.world,expectedUpper);
  const preMuster=structuredClone(r.world);preMuster.armies=[];
  for(const p of r.world.provinces){
    if(p.controller!==p.legalOwner)return fail();const row=r.economy.nations[p.controller];if(!row.provinceIds.includes(p.id))return fail();
    const initial=openingPopulation47(seed,p.controller,p.id,cells[p.id].cellBiomes);populations[p.id]=initial.population;
    const expected={...cells[p.id],maxPopulation:initial.maxPopulation,resources:nativeInitialResources(cells[p.id].cellBiomes,cells[p.id].seaNeighbor,governmentRandom47(`${seed}/resources/${p.id}`))};
    if(!equal(r.finance.provinces[p.id],expected))return fail();
    const data=preMuster.statecraft!.provinces.find(v=>v.provinceId===p.id)!;data.population=initial.population;
    if(data.grain!==initial.population*20)return fail();
  }
  if(!equal(r.governmentOpening.population,populations)||!equal(r.terrainContext,land))return fail();
  const replay={world:preMuster,units:{},tactics:emptyTactics47(preMuster)},receipts=musterFoundingArmies47(replay);
  // City/player labels may change after creation; military identity/numbers do not.
  const armyData=(a:Government47['world']['armies'][number])=>({...a,name:''});
  if(!equal(r.governmentOpening.recruitments,receipts)||!equal(r.units,replay.units)||!equal(r.tactics,replay.tactics)||!equal(r.world.armies.map(armyData),replay.world.armies.map(armyData)))return fail();
  for(const p of r.world.statecraft!.provinces)if(p.population!==preMuster.statecraft!.provinces.find(v=>v.provinceId===p.provinceId)!.population)return fail();
  for(const a of r.world.armies)expectedUpper.armies[a.id]={base:initializedArmyBase(traitProjection(expectedUpper.nations[a.nationId].traits)),initializedTick:0};
  const destiny=openingDestiny47({world:preMuster,upperCombat:expectedUpper,tactics:replay.tactics});
  if(!equal(r.upperCombat,expectedUpper)||!equal(r.destiny,destiny))return fail();
  const graph=armyGeographyFor47(r).graph,positions=initialArmyPositions47(r.world.armies.map(a=>({armyId:a.id,provinceId:a.provinceId,point:r.world.provinces.find(p=>p.id===a.provinceId)!.center})),graph,geographyBinding(r));
  if(!equal(r.armyPositions,positions))return fail();
  for(const n of r.world.nations){
    const account=r.governmentOpening.accounts[n.id],ethnic=economicEthnic47(r.economy,n.id),owned=expectedUpper.nations[n.id].provinceOrder;
    if(!exact(account,['polity','destiny','input'])||!POLITIES47.includes(account.polity)||account.destiny!==0)return fail();
    const court=courtIncome(r.people,r.world,n.id),income=owned.map(id=>{const p=r.finance.provinces[id];return nativeProvinceIncome({population:r.world.statecraft!.provinces.find(p=>p.provinceId===id)!.population,maxPopulation:p.maxPopulation,cellCount:p.cellBiomes.length,resources:p.resources,ethnic,destiny:0,nationProvinceCount:owned.length,worldProvinceCount:r.world.provinces.length,localIncomeMultiplier:courtIncome(r.people,r.world,n.id,id).local});});
    const value={gold:0,provinceIncome:income,leaderTaxMultiplier:court.tax,centralIncomeMultiplier:court.central,armyCostGold:0,goldProductionModifier:defaultPoliticalCombat(account.polity).goldProduction,ethnic};
    if(!equal(account.input,value))return fail();const out=nativeGoldSettlement(value),expected={gold:out.gold,goldPerMonth:out.goldPerMonth,armyCostGold:0,goldBattleModifier:out.goldBattleModifier,initializedDay:0,lastMonth:0,ledger:{...out,day:0,openingGold:0,reorganizationCost:0,distanceSuspended:owned.some(id=>!expectedUpper.provinces[id].connected)}};
    if(!equal(r.finance.nations[n.id],expected))return fail();
  }
}
