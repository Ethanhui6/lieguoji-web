import {assertFmsDocument,type FmsDocument} from '../model';
import type {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import type {Population47} from './civilization47-population-types';
import {assertPopulation47} from './civilization47-population-validation';
import {editCivilization47,type CivilizationEdit47,type WorldCultureSetup47} from './civilization47-names';
import {createCivilizationWorld47} from './civilization47-world';
import {buildTerrainContext,type TerrainContext} from './settlement25-terrain';
import {buildProvinceCells} from './settlement25-cells';
import {buildProvinceCombat} from './settlement25-combat';
import {reconcileCore,type UpperCombat,traitProjection} from './upper14-state';
import {initializedArmyBase} from './native-combat/state-traits';
import {nativeInitialPopulation} from './native-economy/population';
import {nativeInitialResources} from './native-economy/resources';
import {nativeProvinceIncome,nativeGoldSettlement,type GoldSettlementInput} from './native-economy/settlement';
import {defaultPoliticalCombat,type NativePolity} from './native-combat/upper-efficiency';
import {nativeDestinyDefaults,nativeRandomDestiny,type DestinyRandom} from './native-economy/destiny';
import {f} from './native-economy/numeric';
import {courtIncome} from './court16-people';
import type {DestinyState} from './destiny20-state';
import type {FiscalState} from './restoration19-state';
import {initialEconomy47,economicEthnic47,validateEconomySetup47,type Economy47,type EconomySetup47} from './civilization47-economy';
import {emptyTactics47,musterFoundingArmies47,type InitialMuster47,type Recruitment47} from './civilization47-muster';
import {initialArmyPositions47,type ArmyPositions47} from './army-presence47';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {geographyBinding} from './war30-geography';
import {assertGovernmentOpening47} from './civilization47-government-validation';

export type GovernmentInput47=Population47&{terrain:FmsDocument;scale:number};
export type Opening47={version:1;rule:'population-muster-first-gold-v1';population:Record<string,number>;recruitments:Recruitment47[];accounts:Record<string,{polity:NativePolity;destiny:0;input:GoldSettlementInput}>};
export type Government47=GovernmentInput47&InitialMuster47&{terrainContext:TerrainContext;upperCombat:UpperCombat;finance:FiscalState;economy:Economy47;destiny:DestinyState;armyPositions:ArmyPositions47;governmentOpening:Opening47};
const seedFor=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
/** Existing web streams are explicit deterministic bridges, not Unity RNG. */
export function governmentRandom47(seed:string){let h=seedFor(seed);return()=>{h=(h+0x6d2b79f5)|0;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
export function openingPopulation47(seed:string,nationId:string,provinceId:string,cellBiomes:readonly number[]){
  return nativeInitialPopulation({cellBiomes,perCellFactor:100,growthRate:1.002,statePercentage:f(.7+governmentRandom47(`${seed}/population/${nationId}`)()*.2),provinceRandom:f(.9+governmentRandom47(`${seed}/population/${provinceId}`)()*.15),atWarInProvince:false,oldPopulation:0,oldMaxPopulation:0,maxLocked:false});
}
/** Narrow copy of the recovered dynasty-era new-state bridge. Only original
 * inputs are supplied; no fake Restoration19Run or old culture identifiers. */
export function openingDestiny47(r:Pick<Government47,'world'|'upperCombat'|'tactics'>):DestinyState{
  const out:DestinyState={version:1,schedule:'web-30-day-v1',revision:0,nations:{}};
  const random=(s:{seed:number}):DestinyRandom=>{const draw=()=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};return {intRange:(min,max)=>min+Math.floor(draw()*(max-min)),floatRange:(min,max)=>f(min+(max-min)*draw())};};
  for(const n of r.world.nations){const stream={seed:seedFor(`${r.world.custom!.seed}/destiny20/${n.id}`)},base=nativeDestinyDefaults(random(stream)),value={...base,seed:stream.seed,initializedDay:0,lastMonth:0,restorations:0,resets:0,ledger:null},change=nativeRandomDestiny(value,true,random(value));
    Object.assign(value,change.state);if(change.clearEmergencyMobilizations)r.tactics.mobilizations[n.id].recent=[];r.upperCombat.nations[n.id].destiny=value.destiny;out.nations[n.id]=value;out.revision++;
  }return out;
}
/** One atomic creation path: real population/resources -> actual Army records
 * and debit -> first treasury settlement with destiny=0 -> native destiny.
 * No current save calls this; full47 must attach its remaining runtime layers. */
export function attachGovernment47<T extends GovernmentInput47>(input:T,setup:EconomySetup47={}):T&Government47{
  assertPopulation47(input);assertFmsDocument(input.terrain);validateEconomySetup47(setup,input.world.nations.map(n=>n.id));
  if(input.world.day!==0||input.clock.tick!==0||input.world.armies.length||['governmentOpening','upperCombat','finance','economy','destiny','tactics','units','armyPositions','terrainContext'].some(k=>k in input)||input.scale!==1000/Math.max(input.terrain.width,input.terrain.height))throw Error('国家财政与征募只能在全新创建候选初始化一次。');
  const r=structuredClone(input),seed=r.world.custom!.seed,terrainContext=buildTerrainContext(r.terrain,r.world,r.scale),cells=buildProvinceCells(r.terrain,r.world,r.scale);
  const upperCombat:UpperCombat={version:1,initialization:'native-combat-web-inputs-v1',nations:Object.fromEntries(r.world.nations.map(n=>[n.id,{polity:r.civilization.nations[n.id].polity,traits:[],destiny:0,coreThreshold:2,coreYear:0,provinceOrder:[]}])),armies:{},provinces:buildProvinceCombat(r.terrain,r.world,r.scale,terrainContext)};
  reconcileCore(r.world,upperCombat);
  const finance:FiscalState={version:1,initialization:'native-fiscal-web-cells-v1',provinces:{},nations:{}},governmentOpening:Opening47={version:1,rule:'population-muster-first-gold-v1',population:{},recruitments:[],accounts:{}};
  for(const p of r.world.provinces){const data=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!,next=openingPopulation47(seed,p.controller,p.id,cells[p.id].cellBiomes);
    finance.provinces[p.id]={...cells[p.id],maxPopulation:next.maxPopulation,resources:nativeInitialResources(cells[p.id].cellBiomes,cells[p.id].seaNeighbor,governmentRandom47(`${seed}/resources/${p.id}`))};
    governmentOpening.population[p.id]=next.population;data.population=next.population;data.grain=next.population*20;
  }
  const economy=initialEconomy47(r.world,cells,setup),initial={...r,units:{},tactics:emptyTactics47(r.world)};
  governmentOpening.recruitments=musterFoundingArmies47(initial);
  for(const army of initial.world.armies)upperCombat.armies[army.id]={base:initializedArmyBase(traitProjection(upperCombat.nations[army.nationId].traits)),initializedTick:0};
  for(const n of r.world.nations){const polity=r.civilization.nations[n.id].polity,ethnic=economicEthnic47(economy,n.id),owned=upperCombat.nations[n.id].provinceOrder,court=courtIncome(r.people,r.world,n.id);
    const provinceIncome=owned.map(id=>{const p=finance.provinces[id],population=r.world.statecraft!.provinces.find(p=>p.provinceId===id)!.population;return nativeProvinceIncome({population,maxPopulation:p.maxPopulation,cellCount:p.cellBiomes.length,resources:p.resources,ethnic,destiny:0,nationProvinceCount:owned.length,worldProvinceCount:r.world.provinces.length,localIncomeMultiplier:courtIncome(r.people,r.world,n.id,id).local});});
    // Every new Army is idle at its own home; no attack/reorganization fee.
    const value:GoldSettlementInput={gold:0,provinceIncome,leaderTaxMultiplier:court.tax,centralIncomeMultiplier:court.central,armyCostGold:0,goldProductionModifier:defaultPoliticalCombat(polity).goldProduction,ethnic},out=nativeGoldSettlement(value);
    governmentOpening.accounts[n.id]={polity,destiny:0,input:structuredClone(value)};
    finance.nations[n.id]={gold:out.gold,goldPerMonth:out.goldPerMonth,armyCostGold:0,goldBattleModifier:out.goldBattleModifier,initializedDay:0,lastMonth:0,ledger:{...out,day:0,openingGold:0,reorganizationCost:0,distanceSuspended:owned.some(id=>!upperCombat.provinces[id].connected)}};
  }
  const destiny=openingDestiny47({...initial,upperCombat}),graph=buildArmyTravelGraph47(r.terrain,r.world),armyPositions=initialArmyPositions47(r.world.armies.map(a=>({armyId:a.id,provinceId:a.provinceId,point:r.world.provinces.find(p=>p.id===a.provinceId)!.center})),graph,geographyBinding(r));
  const result={...initial,terrainContext,upperCombat,finance,economy,destiny,armyPositions,governmentOpening};assertGovernmentOpening47(result);return result;
}
export function createGovernmentWorld47(terrain:FmsDocument,count:number,cityCount:number,relations:'peace'|'war',culture:WorldCultureSetup47,economy:EconomySetup47={},settlementAlgorithm?:typeof SETTLEMENT47_ALGORITHM){
  return attachGovernment47(createCivilizationWorld47(terrain,count,cityCount,relations,culture,settlementAlgorithm),economy);
}
/** The run47 command owner must use this synchronized projection. Reforms do
 * not repeat initial recruitment or retroactively rewrite credited gold. */
export function editGovernmentIdentity47<T extends Government47>(r:T,edit:CivilizationEdit47,revision:number):T{
  assertGovernmentOpening47(r);const next=editCivilization47(r,edit,revision);
  if(edit.kind==='nation')next.upperCombat.nations[edit.id].polity=next.civilization.nations[edit.id].polity;
  assertGovernmentOpening47(next);return next;
}
