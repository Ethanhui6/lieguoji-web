import type {Ports45} from './war45-ports';
import {landAttackMultiplier45,provinceDamage45} from './war45-blockade';
import type {TerrainContext} from './fiscal15-state';
import {reconcileCore} from './upper14-state';
/** v14 upper combat contributes to siege; v12 timers and resistance ordering remain. */
import type {World,Army} from '../../sim/types';
import {nationsAtWar,transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {holdsNode,reconcileOccupation,resistanceCapacity,type OccupationState} from './occupation';
import type {UnitAssignments} from './military-profile';
import {combatEfficiency,combatInterval,TACTICS_SECOND} from './fiscal15-rules';
import type {TacticsState} from './tactics-model';
function stationed(w:World){const index=new Map<string,Army[]>();for(const a of w.armies)if(holdsNode(a)){const group=index.get(a.provinceId)??[];group.push(a);index.set(a.provinceId,group);}return index;}
const log=(w:World,kind:'battle'|'occupation',text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind,text,reason});w.events=w.events.slice(-160);};
/** Each army has its own persisted timer; an animation never deals damage. */
export function dueCombatRounds(w:World,s:TacticsState,tick:number,occupation:OccupationState){
  const due=new Set<string>(),eligible=new Set<string>(),local=stationed(w),provinces=new Map(w.provinces.map(p=>[p.id,p]));
  for(const a of w.armies){if(a.troops<=0||a.status==='destroyed'||a.status==='retreating')continue;
    const p=provinces.get(a.provinceId)!;
    const engaged=a.status==='fighting'||holdsNode(a)&&(nationsAtWar(w,a.nationId,p.controller)||occupation.sieges.some(v=>v.provinceId===p.id&&v.controller===a.nationId&&v.resistance<v.maximum)||(local.get(p.id)??[]).some(b=>nationsAtWar(w,a.nationId,b.nationId)));
    if(!engaged)continue;eligible.add(a.id);if(s.rounds[a.id]===undefined)s.rounds[a.id]=tick+2*TACTICS_SECOND;
    if(tick>=s.rounds[a.id]){due.add(a.id);s.rounds[a.id]=tick+combatInterval(a.id,tick);}
  }
  for(const id of Object.keys(s.rounds))if(!eligible.has(id))delete s.rounds[id];return due;
}
export function occupationForces(w:World,id:string,units:UnitAssignments,due?:Set<string>,stationedArmies?:Army[],terrain?:TerrainContext,ports?:Ports45){
  const p=w.provinces.find(p=>p.id===id)!,armies=stationedArmies??w.armies.filter(a=>holdsNode(a)&&a.provinceId===id),powers=new Map<string,number>();let defense=0;
  for(const a of armies){if(due&&!due.has(a.id))continue;const e=combatEfficiency(w,a,units,p,true,terrain)*landAttackMultiplier45(w,ports,p.id,a.nationId);if(a.nationId===p.controller)defense+=e;else if(nationsAtWar(w,a.nationId,p.controller))powers.set(a.nationId,(powers.get(a.nationId)??0)+e);}
  const rank=[...powers].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));return {attacker:rank[0]?.[0]??null,attack:rank[0]?.[1]??0,defense};
}
export function advanceTacticsOccupation(world:World,state:OccupationState,units:UnitAssignments,tick:number,due:Set<string>,unopposed:TacticsState['unopposed'],terrain:TerrainContext,ports?:Ports45){
  const w=structuredClone({...world,provinces:[]}) as World;w.provinces=world.provinces.map(p=>({...p}));const s=structuredClone(reconcileOccupation(w,state).occupation),local=stationed(w);
  for(const p of w.provinces){const group=local.get(p.id)??[];let siege=s.sieges.find(v=>v.provinceId===p.id);if(!siege&&!group.some(a=>nationsAtWar(w,a.nationId,p.controller)))continue;const forces=occupationForces(w,p.id,units,undefined,group,terrain,ports);if(!forces.attacker&&!siege)continue;
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
      const damage=provinceDamage45(10*combatEfficiency(w,a,units,p,true,terrain),landAttackMultiplier45(w,ports,p.id,a.nationId));
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
