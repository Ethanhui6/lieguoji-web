import type {War46Run} from './war46-model';
import type {ArmyRouteWeights47} from './army-commands47';
import {advanceActualForces47,advanceOwnedActualForces47,actualForces47,actualContactFrame47,type ForceRun47} from './force-runtime47';
import {forceKey47} from './force-motion47';
import {assertForceClock47,reconcileAttackClock47,rescheduleAttack47,type ForceClock47} from './force-clock47';
import {assertForceDamage47,type ForceDamage47} from './force-losses47';
import {applyAccountedVolley47} from './force-accounting47';
import {nationsAtWar} from './realtime-statecraft';
import {advanceOwnedTacticsOccupation47,type ProvinceCombat47} from './war47-occupation';
import type {Province,World} from '../../sim/types';
import {TICKS_PER_DAY} from './clock';
import type {War28World} from './war47-wars';
import {cloneMilitaryCandidate47} from './geography-content47';
import type {ForceMotionObserver47} from './force-display-trace47';
import type {ArmySpace47} from './army-space47';

export type MilitaryRun47 = ForceRun47 & Pick<War46Run,'units'|'occupation'|'tactics'|'terrainContext'|'upperCombat'|'finance'|'losses'|'warfare'|'nativeWars'|'people'|'portControl'> & Pick<War28World,'life'> & {forceClock:ForceClock47;forceDamage:ForceDamage47};
export type PreviousOwnership47={provinces:readonly Pick<Province,'id'|'controller'>[]};
export type MilitaryRules47<T extends MilitaryRun47> = {
  speed: Parameters<typeof advanceActualForces47<T>>[3];
  combat: (snapshot:T)=>Parameters<typeof applyAccountedVolley47>[2];
  occupation?: (snapshot:T,world:World,space:ArmySpace47)=>ProvinceCombat47;
  /** Owned candidate only. The real47 owner fixes this to its family calendar;
   * the generic military primitive also supports isolated no-family fixtures. */
  afterTick?: (candidate:T,dailyPending:boolean)=>void;
  afterOccupation?: (candidate:T)=>undefined;
  afterOwnership?: (candidate:T,previousWorld:PreviousOwnership47)=>void;
  portInterval?: (before:T,after:T,from:number,to:number)=>undefined;
  observeMotion?:ForceMotionObserver47;
};
function frame(r:MilitaryRun47) {
  const {spatial,forces,contact}=actualContactFrame47(r);
  r.forceContacts=contact.contacts;
  const space=spatial.space,eligible=new Set<string>();
  for(const f of forces) {
    if(f.withdrawing)continue;const key=forceKey47(f),p=f.kind==='army'?space.byArmy.get(f.id)?.province:null;
    if(contact.held.has(key) || p && (nationsAtWar(r.world,f.nationId,p.controller) || r.occupation.sieges.some(s=>s.provinceId===p.id&&s.controller===f.nationId&&s.resistance<s.maximum))) eligible.add(key);
  }
  return {spatial,eligible,forces};
}
/** Candidate owner uses this after reconciling deaths/contacts outside a
 * military window; surviving eligible forces retain their exact deadlines. */
export function reconcileMilitaryClock47(r:MilitaryRun47,now:number){
  const current=frame(r);
  reconcileAttackClock47(r.forceClock,current.eligible,now);
  assertForceClock47(r.forceClock,now,new Set(current.forces.map(forceKey47)));
}
function occupy<T extends MilitaryRun47>(r:T,now:number,due:ReadonlySet<string>,rules:MilitaryRules47<T>,known?:ReturnType<typeof frame>) {
  const f=known??frame(r),armyDue=new Set(f.forces.filter(v=>v.kind==='army'&&due.has(forceKey47(v))).map(v=>v.id));
  // There is no occupation transaction when no siege exists and no real
  // non-retreating army holds hostile land. Movement/contact validation above
  // still runs; the full47 owner validates personnel before entering a window.
  // In this case copying every city, family-era world event and economy ledger
  // twice per tick cannot change a flag or resistance value.
  if(!r.occupation.sieges.length&&![...f.spatial.space.byArmy.values()].some(v=>v.province&&v.army.status!=='retreating'&&nationsAtWar(r.world,v.army.nationId,v.province.controller)))return f;
  const previous={provinces:r.world.provinces.map(p=>({id:p.id,controller:p.controller}))};
  const out=advanceOwnedTacticsOccupation47(r.world,r.occupation,r.units,Math.floor(now),armyDue,r.tactics.unopposed,{...r.terrainContext,upper:r.upperCombat,finance:r.finance},{...f.spatial,positions:r.armyPositions},r.portControl,rules.occupation?w=>rules.occupation!(r,w,f.spatial.space):undefined);
  r.world=out.world;r.occupation=out.occupation;
  if(rules.afterOccupation?.(r)!==undefined)throw Error('地权同步必须同步完成，原进度未提交。');
  rules.afterOwnership?.(r,previous);
}
/** Atomic military window for a future full47 session. Whole public ticks give
 * stable partition/reload behavior; within each tick, stop at every real gate,
 * center or attack deadline, process that event, then consume the remainder.
 * Seconds in the travel phase are web tick units here; speed supplies matching
 * world-units/tick. No old v46 movement, Navy pulse or Army timer runs beside it.
 * At a day boundary, the returned candidate NEEDS daily settlement before it
 * can be exposed/saved. This is not a complete session or an enabled old save. */
export function advanceMilitaryWindow47<T extends MilitaryRun47>(input:T,ticks:number,weights:ArmyRouteWeights47,rules:MilitaryRules47<T>) {
  const untilDay=(input.world.day+1)*TICKS_PER_DAY;
  if(!Number.isSafeInteger(ticks)||ticks<1||input.clock.tick<0||Math.floor(input.clock.tick/TICKS_PER_DAY)!==input.world.day||input.clock.tick+ticks>untilDay) throw Error('军事推进必须在当前日界内；先完成日结再推进。');
  const initial=actualForces47(input);
  assertForceClock47(input.forceClock,input.clock.tick,new Set(initial.forces.map(forceKey47)));
  assertForceDamage47(input.forceDamage,new Set([...input.world.armies.map(a=>forceKey47({kind:'army',id:a.id})),...input.navy.fleets.map(f=>forceKey47({kind:'fleet',id:f.id}))]));
  let r=cloneMilitaryCandidate47(input);
  const volleys:{at:number;due:string[];hits:number;losses:number}[]=[];
  let now=input.clock.tick,eventCount=0;
  let known:ReturnType<typeof frame>|undefined;
  for(let tick=input.clock.tick+1;tick<=input.clock.tick+ticks;tick++) {
    for(;;) {
      if(++eventCount>100000)throw Error('军事事件超出预算，原进度未提交。');
      const occupied=occupy(r,now,new Set(),rules,known);known=occupied??frame(r);
      reconcileAttackClock47(r.forceClock,known.eligible,now);
      const due=new Set(Object.keys(r.forceClock.deadlines).filter(k=>r.forceClock.deadlines[k]<=now).sort());
      if(due.size) {
        // Draw before casualties; every due unit fires from the same snapshot.
        for(const key of due)rescheduleAttack47(r.forceClock,key,now);
        const out=applyAccountedVolley47(r,due,rules.combat(r));r=out.run;
        volleys.push({at:now,due:[...due],hits:out.nativeHits.length,losses:out.casualties.reduce((n,c)=>n+c.strength+c.cargo,0)});
        // Web simultaneous-unit policy: even dying units fired the volley;
        // only surviving real holders attack/repair resistance or change flags.
        const occupiedAfterVolley=occupy(r,now,due,rules);
        known=occupiedAfterVolley??frame(r);reconcileAttackClock47(r.forceClock,known.eligible,now);
      }
      if(now===tick)break;
      const stop=Math.min(tick,...Object.values(r.forceClock.deadlines));
      const moved=advanceOwnedActualForces47(r,stop-now,weights,rules.speed,true,rules.observeMotion?(forces,graph,elapsed)=>rules.observeMotion!(forces,graph,elapsed===stop-now?stop:now+elapsed):undefined);
      // Assign an exact known endpoint when the interval was consumed; avoid
      // arithmetic residue causing a phantom delayed/missed attack at save.
      const end=moved.unusedSeconds===0?stop:now+moved.elapsed;
      if(end>now&&rules.portInterval?.(r,moved.run,now,end)!==undefined)throw Error('港湾结算必须同步完成，原进度未提交。');
      r=moved.run;now=end;known=undefined;
    }
    for(const [id,until] of Object.entries(r.maritime.retreating))if(until<=tick)delete r.maritime.retreating[id];
    r.clock.tick=tick;r.forceClock.now=tick;
    rules.afterTick?.(r,tick===untilDay);
    // Expiry/peace/death can change attack eligibility without moving a point.
    const current=frame(r);known=current;
    reconcileAttackClock47(r.forceClock,current.eligible,tick);
    assertForceClock47(r.forceClock,tick,new Set(current.forces.map(forceKey47)));
  }
  return {run:r,volleys,eventCount,dailyPending:r.clock.tick===untilDay};
}
