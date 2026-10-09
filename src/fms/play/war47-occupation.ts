import type {Ports46} from './war46-ports';
import {landAttackMultiplier46,provinceDamage46} from './war46-blockade';
import type {TerrainContext} from './fiscal15-state';
import {reconcileCore} from './upper14-state';
/** v47 uses entered land cells for occupation; frozen v46 keeps its province-anchor rules. */
import type {World,Army,Province} from '../../sim/types';
import {nationsAtWar,transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {reconcileOccupation,resistanceCapacity,type OccupationState} from './occupation';
import {readArmySpace47,landHolders47,type ArmySpace47,type ArmySpaceInput47} from './army-space47';
import type {UnitAssignments} from './military-profile';
import {combatEfficiency,combatInterval,TACTICS_SECOND} from './fiscal15-rules';
import type {TacticsState} from './tactics-model';
function stationed(space:ArmySpace47){return new Map([...space.land.keys()].map(id=>[id,landHolders47(space,id)]));}
const log=(w:World,kind:'battle'|'occupation',text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind,text,reason});w.events=w.events.slice(-160);};
/** Each army has its own persisted timer; an animation never deals damage. */
export function dueCombatRounds47(w:World,s:TacticsState,tick:number,occupation:OccupationState,spatial:ArmySpaceInput47,seaConflictFaces:ReadonlySet<number>){
  const space=readArmySpace47(w,spatial),due=new Set<string>(),eligible=new Set<string>(),local=stationed(space);
  for(const {army:a,province:p,seaFace} of space.byArmy.values()){if(a.status==='retreating')continue;
    // Sea combat supplies its real face conflict set; a stale land anchor or
    // fighting label cannot create a land resistance attack while at sea.
    const engaged=p ? a.status==='fighting'||nationsAtWar(w,a.nationId,p.controller)||occupation.sieges.some(v=>v.provinceId===p.id&&v.controller===a.nationId&&v.resistance<v.maximum)||(local.get(p.id)??[]).some(b=>nationsAtWar(w,a.nationId,b.nationId)) : seaConflictFaces.has(seaFace!);
    if(!engaged)continue;eligible.add(a.id);if(s.rounds[a.id]===undefined)s.rounds[a.id]=tick+2*TACTICS_SECOND;
    if(tick>=s.rounds[a.id]){due.add(a.id);s.rounds[a.id]=tick+combatInterval(a.id,tick);}
  }
  for(const id of Object.keys(s.rounds))if(!eligible.has(id))delete s.rounds[id];return due;
}
export type ProvinceCombat47=(army:Army,province:Province)=>{efficiency:number;damageToProvince:number};
function forcesFromGroup(w:World,id:string,units:UnitAssignments,armies:Army[],terrain:TerrainContext,ports?:Ports46,due?:Set<string>,combat?:ProvinceCombat47){
  const p=w.provinces.find(p=>p.id===id)!,powers=new Map<string,number>();let defense=0;
  for(const a of armies){if(due&&!due.has(a.id))continue;const e=(combat?combat(a,p).efficiency:combatEfficiency(w,a,units,p,true,terrain))*landAttackMultiplier46(w,ports,p.id,a.nationId);if(a.nationId===p.controller)defense+=e;else if(nationsAtWar(w,a.nationId,p.controller))powers.set(a.nationId,(powers.get(a.nationId)??0)+e);}
  const rank=[...powers].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));return {attacker:rank[0]?.[0]??null,attack:rank[0]?.[1]??0,defense};
}
export function occupationForces47(w:World,id:string,units:UnitAssignments,spatial:ArmySpaceInput47,terrain:TerrainContext,ports?:Ports46,due?:Set<string>,combat?:ProvinceCombat47){
  return forcesFromGroup(w,id,units,landHolders47(readArmySpace47(w,spatial),id),terrain,ports,due,combat);
}
/** World is copied here; terrain.upper belongs to the caller's candidate
 * transaction and is reconciled on capture, just as in v46. The session must
 * clone world/upper/positions together before invoking this operation. */
export function advanceTacticsOccupation47(world:World,state:OccupationState,units:UnitAssignments,tick:number,due:Set<string>,unopposed:TacticsState['unopposed'],terrain:TerrainContext,spatial:ArmySpaceInput47,ports?:Ports46,combatFactory?:(world:World)=>ProvinceCombat47){
  const w=structuredClone({...world,provinces:[]}) as World;w.provinces=world.provinces.map(p=>({...p}));
  return advanceOwnedTacticsOccupation47(w,structuredClone(state),units,tick,due,unopposed,terrain,spatial,ports,combatFactory);
}
/** Only a military window's already isolated candidate may use this form.
 * Reconciliation and every sequential capture still run; a later failure is
 * rolled back by discarding the outer candidate, including upper and economy. */
export function advanceOwnedTacticsOccupation47(w:World,state:OccupationState,units:UnitAssignments,tick:number,due:Set<string>,unopposed:TacticsState['unopposed'],terrain:TerrainContext,spatial:ArmySpaceInput47,ports?:Ports46,combatFactory?:(world:World)=>ProvinceCombat47){
  const s=reconcileOccupation(w,state).occupation,local=stationed(readArmySpace47(w,spatial));
  const combat=combatFactory?.(w);
  for(const p of w.provinces){const group=local.get(p.id)??[];let siege=s.sieges.find(v=>v.provinceId===p.id);if(!siege&&!group.some(a=>nationsAtWar(w,a.nationId,p.controller)))continue;const forces=forcesFromGroup(w,p.id,units,group,terrain,ports,undefined,combat);if(!forces.attacker&&!siege)continue;
    const attackers=group.filter(a=>a.nationId===forces.attacker);
    const defenders=group.filter(a=>a.nationId!==forces.attacker&&!!forces.attacker&&nationsAtWar(w,a.nationId,forces.attacker));
    // User's explicit empty-town rule. Native resistance mode stays available
    // for comparison; neither mode annexes the rest of the country.
    const immediate=unopposed==='takeover'&&attackers.length>0&&defenders.length===0;
    if(!siege&&forces.attacker){const maximum=resistanceCapacity(w,p);siege={provinceId:p.id,controller:p.controller,attacker:forces.attacker,maximum,resistance:maximum,started:tick,pulse:tick};s.sieges.push(siege);
      if(!immediate)log(w,'battle',`${p.name}${w.cities.some(c=>c.provinceId===p.id)?'争夺城防':'争夺地区'}`,'对军交锋和地区抵抗分别结算；每军独立计时，守军同时回补抵抗。');}
    if(!siege)continue;if(forces.attacker)siege.attacker=forces.attacker;
    let conqueror=immediate?forces.attacker:null;if(immediate)siege.resistance=0;
    else for(const a of group.filter(a=>due.has(a.id)).sort((a,b)=>a.id.localeCompare(b.id))){
      const resolved=combat?.(a,p),damage=provinceDamage46(resolved?Math.fround(resolved.damageToProvince*resolved.efficiency):10*combatEfficiency(w,a,units,p,true,terrain),landAttackMultiplier46(w,ports,p.id,a.nationId));
      if(a.nationId===p.controller)siege.resistance=Math.min(siege.maximum,siege.resistance+damage);
      else if(nationsAtWar(w,a.nationId,p.controller)){siege.attacker=a.nationId;siege.resistance=Math.max(0,siege.resistance-damage);}
      siege.pulse=tick;if(siege.resistance===0){conqueror=a.nationId;break;}
    }
    if(siege.resistance===0&&conqueror){const old=p.controller,next=conqueror;transferEconomy(w,p.id,old,next);p.controller=next;
      // The loop observes sequential captures. Refresh ownership and distances
      // before later provinces or daily AI consume the new owner's core boost.
      reconcileCore(w,terrain.upper);
      log(w,'occupation',`${w.nations.find(n=>n.id===next)!.name}${immediate?'接管':'攻下'}${p.name}`,immediate?'驻军已实际抵达，本地区没有敌军，按空城接管规则立即换旗；只改变本地区实控，不吞并全国。':'实际军队攻击耗尽地区抵抗；只改变本地区实控，法理归属和其他领土保留。');s.sieges=s.sieges.filter(v=>v!==siege);
    }else if(!forces.attacker&&siege.resistance===siege.maximum)s.sieges=s.sieges.filter(v=>v!==siege);
  }return {world:w,occupation:s};
}
