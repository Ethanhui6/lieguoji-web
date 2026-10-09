import type {FoundingForces47} from './civilization47-forces';
import {assertFamilyCalendar47,advanceFamilyCalendar47} from './civilization47-calendar';
import {advanceMilitaryWindow47,type PreviousOwnership47} from './force-tick47';
import type {ArmyRouteWeights47} from './army-commands47';
import {assertForceSpeed47,actualForceSpeed47} from './force-speed47';
import {TICKS_PER_DAY} from './clock';
import {assertDailyEconomy47} from './civilization47-daily';
import {assertCombatPersonnel47} from './civilization47-combat-state';
import {combatReader47,ownedOccupationCombatReader47} from './civilization47-combat';
import {advancePortIntervalOwned47,advanceSessionPortInterval47,reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {advanceSessionActualForces47,contactFrameFromSessionActual47} from './force-runtime47';
import {isOwnedTravelWindow47} from './owned-travel47';
import {issueAutonomousNavalOrders47} from './civilization47-naval-ai';
import {graphFor47 as graphFor46} from './sea-geography47';
import type {ForceMotionObserver47} from './force-display-trace47';
import {createSessionNavalObserver47} from './naval-observer47';
import {occupationObservationKey47} from './occupation-observer47';
import {recordPoliticalOccupation47,finishPoliticalTick47} from './civilization47-political-owner';

/** Fixed real47 military/calendar/personnel owner. No scalar combat override;
 * callers cannot omit calendar or choose fake speed/leadership/damage.
 * This returns PRIVATE dailyPending state, not a complete tick/save session. */
export function advanceCivilizationMilitary47<T extends FoundingForces47>(input:T,ticks:number,weights:ArmyRouteWeights47,ownership?:(candidate:T,previous:PreviousOwnership47)=>void,politicalTick?:(candidate:T)=>void,observeMotion?:ForceMotionObserver47){
  assertFamilyCalendar47(input);assertDailyEconomy47(input);assertForceSpeed47(input.forceSpeed,input.world,input.clock.tick);
  assertCombatPersonnel47(input.combatPersonnel,input.world,input.clock.tick,input);
  // Validate live ruler/projection links once at entry even when every army
  // is on friendly land and there is no occupation work in this window.
  combatReader47(input);
  if(input.forceClock.secondsPerTick!==input.life.secondsPerDay/TICKS_PER_DAY)throw Error('军事与人物时间单位不一致，原世界保留。');
  // Geometry is immutable throughout this window. Reuse its sea graph across
  // private state clones; controllers, contacts and resources still read live.
  const sea=graphFor46(input);
  // Callback identity matters: a private window alone cannot certify arbitrary
  // caller hooks. Only the fixed session combination (or no hook) may skip.
  const fixed=isOwnedTravelWindow47()&&(!ownership||ownership===recordPoliticalOccupation47)&&(!politicalTick||politicalTick===finishPoliticalTick47);
  const navalObserver=fixed?createSessionNavalObserver47():undefined;
  let observedPolitics:string|undefined;
  const observeTick=(r:T,pending:boolean):'reuse'|'refresh'=>{
    advanceFamilyCalendar47(r,r.clock.tick,pending);let politicalWork=false;
    if(!pending&&politicalTick){
      const key=JSON.stringify([r.world.provinces.map(p=>[p.id,p.controller,p.legalOwner]),r.world.nations.map(n=>[n.id,n.capitalId]),r.world.statecraft!.relations,r.nativeWars,r.chronicle.ended,r.people.nations]);
      if(key!==observedPolitics){politicalTick(r);observedPolitics=key;politicalWork=true;}
    }
    const navalWork=navalObserver!(r,weights,sea);
    return politicalWork||navalWork?'refresh':'reuse';
  };
  const out=advanceMilitaryWindow47(input,ticks,weights,{observeMotion,sessionOccupationKey:fixed?occupationObservationKey47:undefined,sessionAfterTick:fixed?observeTick:undefined,speed:actualForceSpeed47,combat:r=>combatReader47(r).volley,occupation:(r,_w,space)=>ownedOccupationCombatReader47(r,space),afterOccupation:r=>reconcilePortLandOwnersOwned47(r,sea),afterOwnership:ownership,portInterval:(before,after,from,to)=>advancePortIntervalOwned47(before,after,from,to,sea),sessionInterval:isOwnedTravelWindow47()?(before,start,from,stop)=>{
    const moved=advanceSessionActualForces47(before,start,stop-from,weights,actualForceSpeed47,observeMotion?(forces,graph,elapsed)=>observeMotion(forces,graph,elapsed===stop-from?stop:from+elapsed):undefined);
    const end=moved.unusedSeconds===0?stop:from+moved.elapsed;
    if(end>from)advanceSessionPortInterval47(before,moved.run,from,end,sea,start);
    const {endActual,...result}=moved;return {...result,endFrame:contactFrameFromSessionActual47(moved.run,endActual)};
  }:undefined,afterTick:fixed?undefined:(r,pending)=>{advanceFamilyCalendar47(r,r.clock.tick,pending);if(!pending)politicalTick?.(r);issueAutonomousNavalOrders47(r,weights,sea);}});
  assertFamilyCalendar47(out.run,out.dailyPending);assertForceSpeed47(out.run.forceSpeed,out.run.world,out.run.clock.tick);return out;
}
