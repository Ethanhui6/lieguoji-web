import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {wanderPoint} from '../fms/play/army-wander47';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

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
