import {armyTravelLocation47} from '../fms/play/army-travel47-state';
import {unitProfile} from '../fms/play/military-profile';
import {FRAME_TICKS47} from '../fms/play/frame-loop47';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {wanderPoint} from '../fms/play/army-wander47';
import type {FoundingForces47} from '../fms/play/civilization47-forces';
import {monthlyArmyFees47} from '../fms/play/civilization47-fiscal';
import {courtIncome47} from '../fms/play/civilization47-offices';
import {economicEthnic47} from '../fms/play/civilization47-economy';
import {defaultPoliticalCombat} from '../fms/play/native-combat/upper-efficiency';
import {personSkills} from '../fms/play/court16-people';
import {reconcileCore} from '../fms/play/core-refresh51';

/** The simulation state the Swift engine starts from, read from a web run.
 * - provinces in the economy ledger's own order (world.statecraft.provinces), with the world province
 *   index, controller nation index, terrain, supply, capacity (finance maxPopulation), population, grain;
 * - nation provisioning policy (NationPolicy.priority) and the pairs at war;
 * - armies with nation, current land province (−1 at sea), troops, status, travel status, supplies,
 *   morale, unit type and the point the web draws an idle army at (army-wander47 wanderPoint). */
export function nativeEconomyState(run:FoundingForces47){
  const w=run.world,sc=run.scale,nationIndex=(id:string)=>w.nations.findIndex(n=>n.id===id),provinceIndex=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const forces=actualForces47(run),space=readArmySpace47(w,{...forces.spatial,positions:run.armyPositions});
  const citySpots=new Map<string,{x:number;y:number}[]>();for(const c of w.cities){const l=citySpots.get(c.provinceId)??[];l.push(c.position);citySpots.set(c.provinceId,l);}
  return {
    day:w.day,
    provinces:w.statecraft!.provinces.map(e=>{const p=w.provinces[provinceIndex.get(e.provinceId)!];return {province:provinceIndex.get(e.provinceId)!,nation:nationIndex(p.controller),terrain:p.terrain,supply:p.supply,
      capacity:run.finance.provinces[p.id].maxPopulation,population:e.population,grain:e.grain};}),
    nations:w.nations.map(n=>({priority:w.statecraft!.nations.find(v=>v.nationId===n.id)!.priority})),
    wars:w.statecraft!.relations.filter(r=>r.status==='war').map(r=>[nationIndex(r.a),nationIndex(r.b)]),
    armies:w.armies.map(a=>{const v=space.byArmy.get(a.id)!,home=v.province;
      const at=home&&v.travel.status!=='moving'?wanderPoint(home.polygon,a.id,citySpots.get(home.id)):v.point;
      return {id:a.id,name:a.name,nation:nationIndex(a.nationId),province:home?provinceIndex.get(home.id)!:-1,troops:a.troops,status:a.status,travel:v.travel.status,
        supplies:a.supplies,morale:a.morale,unit:run.units[a.id]??'Infantry',x:at.x/sc,y:at.y/sc};}),
  };
}

/** Inputs of the monthly treasury (civilization47-fiscal settleFiscalMonth47 → native settlement
 * kernels) and destiny (destiny20-state settleDestinyMonth → native destiny kernels) for every nation,
 * as the web computes them at the month boundary. */
export function monthlyInputs(r:FoundingForces47){
  reconcileCore(r.world,r.upperCombat);
  return r.world.nations.map(n=>{
    const id=n.id,u=r.upperCombat.nations[id],d=r.destiny.nations[id],court=courtIncome47(r,id),leaderId=r.people.nations[id].leaderId,leader=leaderId===null?undefined:r.people.persons[leaderId];
    const owned=r.world.provinces.filter(p=>p.controller===id),statecraft=new Map(r.world.statecraft!.provinces.map(p=>[p.provinceId,p]));
    return {
      gold:r.finance.nations[id].gold,lastMonth:r.finance.nations[id].lastMonth,ethnic:economicEthnic47(r.economy,id),goldProduction:defaultPoliticalCombat(u.polity).goldProduction,
      tax:court.tax,central:court.central,fee:monthlyArmyFees47(r,id).cost,
      provinces:u.provinceOrder.map(pid=>{const p=r.finance.provinces[pid];return {province:r.world.provinces.findIndex(v=>v.id===pid),population:statecraft.get(pid)!.population,capacity:p.maxPopulation,cells:p.cellBiomes.length,local:courtIncome47(r,id,pid).local,
        resources:p.resources.map(x=>({base:x.baseValue,probability:x.probability,affectedBy:[...x.affectedBy]}))};}),
      destiny:{destiny:d.destiny,decrease:d.decrease,manifestCount:d.manifestCount,manifest:d.manifest,seed:d.seed,lastMonth:d.lastMonth},
      ownedPopulation:owned.reduce((s,p)=>s+statecraft.get(p.id)!.population,0),ownedCapacity:owned.reduce((s,p)=>s+r.finance.provinces[p.id].maxPopulation,0),
      administrative:leader?personSkills(leader).administrative:null,
    };
  });
}

/** Army motion state for the Swift travel engine (travel.bin): the normalized→map divisor (run.scale),
 * force-clock seconds per tick, the frame length, and per army (world.armies order) its actual travel
 * cell id and point (army-travel47-state armyTravelLocation47), saved base speed and unit multiplier. */
export function nativeTravelState(run:FoundingForces47){
  const g=actualForces47(run).spatial.graph;
  return {scale:run.scale,secondsPerTick:run.forceClock.secondsPerTick,frameTicks:FRAME_TICKS47,
    armies:run.world.armies.map(a=>{const at=armyTravelLocation47(run.armyPositions.records[a.id],g);
      return {cell:at.cell.id,x:at.point.x,y:at.point.y,base:run.forceSpeed.armies[a.id].base,unitSpeed:unitProfile(run.units[a.id]).speed};})};
}
