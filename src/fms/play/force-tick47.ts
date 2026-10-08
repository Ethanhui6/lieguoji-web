import type {War46Run} from './war46-model';
import type {ArmyRouteWeights47} from './army-commands47';
import {advanceActualForces47,actualForces47,type ForceRun47} from './force-runtime47';
import {assertForceContacts47,forceKey47,reconcileForceContactsOwned47} from './force-motion47';
import {assertForceClock47,reconcileAttackClock47,rescheduleAttack47,type ForceClock47} from './force-clock47';
import {assertForceDamage47,type ForceDamage47} from './force-losses47';
import {applyAccountedVolley47} from './force-accounting47';
import {nationsAtWar} from './realtime-statecraft';
import {readArmySpace47} from './army-space47';
import {advanceTacticsOccupation47} from './war47-occupation';
import {TICKS_PER_DAY} from './clock';
import type {War28World} from './war47-wars';

export type MilitaryRun47 = ForceRun47 & Pick<War46Run,'units'|'occupation'|'tactics'|'terrainContext'|'upperCombat'|'finance'|'losses'|'warfare'|'nativeWars'|'people'|'portControl'> & Pick<War28World,'life'> & {forceClock:ForceClock47;forceDamage:ForceDamage47};
type Rules<T extends MilitaryRun47> = {
  speed: Parameters<typeof advanceActualForces47<T>>[3];
  combat: (snapshot:T)=>Parameters<typeof applyAccountedVolley47>[2];
};
function frame(r:MilitaryRun47) {
  const {spatial,forces}=actualForces47(r),regions=new Map(r.diplomaticGeography.water.flatMap(p=>p.faces.map(face=>[face,p.id] as const)));
  assertForceContacts47(r.forceContacts,forces,spatial.graph,face=>regions.get(face)!);
  const contact=reconcileForceContactsOwned47(forces,spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),face=>regions.get(face)!);
  r.forceContacts=contact.contacts;
  const space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),eligible=new Set<string>();
  for(const f of forces) {
    if(f.withdrawing)continue;const key=forceKey47(f),p=f.kind==='army'?space.byArmy.get(f.id)?.province:null;
    if(contact.held.has(key) || p && (nationsAtWar(r.world,f.nationId,p.controller) || r.occupation.sieges.some(s=>s.provinceId===p.id&&s.controller===f.nationId&&s.resistance<s.maximum))) eligible.add(key);
  }
  return {spatial,eligible,forces};
}
function occupy<T extends MilitaryRun47>(r:T,now:number,due:ReadonlySet<string>) {
  const f=frame(r),armyDue=new Set(f.forces.filter(v=>v.kind==='army'&&due.has(forceKey47(v))).map(v=>v.id));
  const out=advanceTacticsOccupation47(r.world,r.occupation,r.units,Math.floor(now),armyDue,r.tactics.unopposed,{...r.terrainContext,upper:r.upperCombat,finance:r.finance},{...f.spatial,positions:r.armyPositions},r.portControl);
  r.world=out.world;r.occupation=out.occupation;
}
/** Atomic military window for a future full47 session. Whole public ticks give
 * stable partition/reload behavior; within each tick, stop at every real gate,
 * center or attack deadline, process that event, then consume the remainder.
 * Seconds in the travel phase are web tick units here; speed supplies matching
 * world-units/tick. No old v46 movement, Navy pulse or Army timer runs beside it.
 * At a day boundary, the returned candidate NEEDS daily settlement before it
 * can be exposed/saved. This is not a complete session or an enabled old save. */
export function advanceMilitaryWindow47<T extends MilitaryRun47>(input:T,ticks:number,weights:ArmyRouteWeights47,rules:Rules<T>) {
  const untilDay=(input.world.day+1)*TICKS_PER_DAY;
  if(!Number.isSafeInteger(ticks)||ticks<1||input.clock.tick<0||Math.floor(input.clock.tick/TICKS_PER_DAY)!==input.world.day||input.clock.tick+ticks>untilDay) throw Error('军事推进必须在当前日界内；先完成日结再推进。');
  const initial=actualForces47(input);
  assertForceClock47(input.forceClock,input.clock.tick,new Set(initial.forces.map(forceKey47)));
  assertForceDamage47(input.forceDamage,new Set([...input.world.armies.map(a=>forceKey47({kind:'army',id:a.id})),...input.navy.fleets.map(f=>forceKey47({kind:'fleet',id:f.id}))]));
  const {terrain,...mutable}=input;let r={...structuredClone(mutable),terrain} as T;
  const volleys:{at:number;due:string[];hits:number;losses:number}[]=[];
  let now=input.clock.tick,eventCount=0;
  for(let tick=input.clock.tick+1;tick<=input.clock.tick+ticks;tick++) {
    for(;;) {
      if(++eventCount>100000)throw Error('军事事件超出预算，原进度未提交。');
      occupy(r,now,new Set());
      reconcileAttackClock47(r.forceClock,frame(r).eligible,now);
      const due=new Set(Object.keys(r.forceClock.deadlines).filter(k=>r.forceClock.deadlines[k]<=now).sort());
      if(due.size) {
        // Draw before casualties; every due unit fires from the same snapshot.
        for(const key of due)rescheduleAttack47(r.forceClock,key,now);
        const out=applyAccountedVolley47(r,due,rules.combat(r));r=out.run;
        volleys.push({at:now,due:[...due],hits:out.nativeHits.length,losses:out.casualties.reduce((n,c)=>n+c.strength+c.cargo,0)});
        // Web simultaneous-unit policy: even dying units fired the volley;
        // only surviving real holders attack/repair resistance or change flags.
        occupy(r,now,due);
        reconcileAttackClock47(r.forceClock,frame(r).eligible,now);
      }
      if(now===tick)break;
      const stop=Math.min(tick,...Object.values(r.forceClock.deadlines));
      const moved=advanceActualForces47(r,stop-now,weights,rules.speed,true);r=moved.run;
      // Assign an exact known endpoint when the interval was consumed; avoid
      // arithmetic residue causing a phantom delayed/missed attack at save.
      now=moved.unusedSeconds===0?stop:now+moved.elapsed;
    }
    for(const [id,until] of Object.entries(r.maritime.retreating))if(until<=tick)delete r.maritime.retreating[id];
    r.clock.tick=tick;r.forceClock.now=tick;
    // Expiry/peace/death can change attack eligibility without moving a point.
    reconcileAttackClock47(r.forceClock,frame(r).eligible,tick);
    assertForceClock47(r.forceClock,tick,new Set(actualForces47(r).forces.map(forceKey47)));
  }
  return {run:r,volleys,eventCount,dailyPending:r.clock.tick===untilDay};
}
