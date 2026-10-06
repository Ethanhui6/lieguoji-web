import {combatEfficiency as terrainEfficiency} from './terrain13-rules';
import {terrainAt,contains,type TerrainContext} from './terrain13-context';
import {engagementPoint} from './terrain13-battle';
import {armyPosition} from './navigation';
import type {World} from '../../sim/types';
import {holdsNode,type OccupationState} from './occupation';
import {armyConsumption,nationsAtWar} from './tactics-statecraft';
import {combatEfficiency} from './tactics-rules';
import {unitProfile,type UnitAssignments} from './military-profile';
import type {BattleState} from './battle';
function nextAction(world:World,id:string,rounds:Record<string,number>,tick:number,occupation?:OccupationState){
  const a=world.armies.find(a=>a.id===id);if(!a||a.troops<=0||a.status==='destroyed'||a.status==='retreating'||rounds[id]===undefined)return null;
  const p=world.provinces.find(p=>p.id===a.provinceId)!;
  // Commands can end a contact before the next tick cleans its saved timer.
  const eligible=a.status==='fighting'||holdsNode(a)&&(nationsAtWar(world,a.nationId,p.controller)||occupation?.sieges.some(s=>s.provinceId===p.id&&s.controller===a.nationId&&s.resistance<s.maximum)||world.armies.some(b=>holdsNode(b)&&b.provinceId===p.id&&nationsAtWar(world,a.nationId,b.nationId)));
  return eligible?Math.max(0,rounds[id]-tick)/120:null;
}
export function armyReadiness(world:World,id:string,units:UnitAssignments,rounds:Record<string,number>,tick:number,battles:BattleState,occupation?:OccupationState,terrainContext?:TerrainContext){
  const a=world.armies.find(a=>a.id===id&&a.troops>0&&a.status!=='destroyed');if(!a)return null;
  const contact=battles.engagements.find(e=>e.armies.includes(a.id)),p=world.provinces.find(p=>p.id===(contact?.a??a.provinceId))!;
  const onRoad=!!contact?.b||a.progress>0,location=contact?engagementPoint(world,contact):armyPosition(world,a),actualProvince=onRoad?world.provinces.find(p=>contains(p.polygon,location))??p:p;
  const field=terrainContext&&onRoad?terrainAt(world,terrainContext,location):undefined;
  const atNode=!contact?.b&&a.progress===0,contested=world.armies.some(b=>b.provinceId===p.id&&holdsNode(b)&&nationsAtWar(world,b.nationId,p.controller));
  const canRefill=atNode&&a.status==='idle'&&p.controller===a.nationId&&!contested;
  return {unit:unitProfile(units[id]).name,efficiency:terrainContext?terrainEfficiency(world,a,units,actualProvince,atNode,terrainContext,field):combatEfficiency(world,a,units,p,atNode),land:atNode?terrainContext?.provinces[p.id]:field,atNode,supplies:a.supplies,consumption:armyConsumption(a),
    nextDays:nextAction(world,id,rounds,tick,occupation),canRefill,
    grain:atNode?world.statecraft?.provinces.find(e=>e.provinceId===p.id)?.grain:undefined,
    supplyReason:canRefill?'可按本地余粮补充，实际数量受民粮预留及其他驻军领取影响。':!atNode?'路途中无法从两端地区领取驻军补给。':a.status==='fighting'?'正在交锋，不能领取驻军补给。':p.controller!==a.nationId?'此地仍由他国控制，不能领取本国驻军补给。':contested?'地区正在争夺，驻军补给暂停。':'移动或撤退中，尚未满足驻守补给条件。'};
}
/** Read-only presentation of saved v9–v13 rules; no estimated victory date. */
export function siegeInsight(world:World,provinceId:string,units:UnitAssignments,rounds:Record<string,number>,tick:number,occupation?:OccupationState,terrainContext?:TerrainContext){
  const province=world.provinces.find(p=>p.id===provinceId);if(!province)return null;
  const forces=world.armies.filter(a=>a.provinceId===provinceId&&holdsNode(a)&&(a.nationId===province.controller||nationsAtWar(world,a.nationId,province.controller))).map(a=>({
    id:a.id,name:a.name,nationId:a.nationId,defending:a.nationId===province.controller,
    unit:unitProfile(units[a.id]).name,troops:a.troops,supplies:a.supplies,
    consumption:armyConsumption(a),daysWithoutRefill:Math.ceil(a.supplies/armyConsumption(a)),
    perPulse:10*(terrainContext?terrainEfficiency(world,a,units,province,true,terrainContext):combatEfficiency(world,a,units,province)),
    nextDays:nextAction(world,a.id,rounds,tick,occupation),
  }));
  const attack=forces.filter(a=>!a.defending),defense=forces.filter(a=>a.defending);
  return {province,forces,attack,defense,fort:Math.max(0,...world.cities.filter(c=>c.provinceId===provinceId).map(c=>c.fort))};
}
