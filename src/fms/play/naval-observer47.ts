import type {FoundingForces47} from './civilization47-forces';
import {frameTicks47} from './frame-loop47';
import type {ArmyRouteWeights47} from './army-commands47';
import type {SeaGraph} from './sea-path';
import {issueAutonomousNavalOrders47} from './civilization47-naval-ai';
import {assertNavalAutonomy47} from './civilization47-naval-ai-state';
import {isOwnedTravelWindow47} from './owned-travel47';
import type {ArmyTravel47} from './army-travel47-state';

// Only inputs observed by naval decisions. Same-cell moving offset and port
// resistance are integrated by the unchanged motion/port owners; neither is a
// decision invalidation. An endpoint/status or cell change is an invalidation.
const place=(p:ArmyTravel47)=>[p.nodes[p.leg+(p.crossed?1:0)],p.status];
function signature(r:FoundingForces47):string {
 return JSON.stringify([
  r.world.nations.map(n=>n.id),r.world.statecraft!.relations.map(v=>[v.a,v.b,v.status]),
  r.world.provinces.map(p=>[p.id,p.controller,p.legalOwner]),r.world.statecraft!.provinces.map(p=>[p.provinceId,p.grain,p.population]),
  r.world.armies.map(a=>[a.id,a.nationId,a.troops,a.status,place(r.armyPositions.records[a.id])]),
  r.navy.fleets.map(f=>[f.id,f.nationId,f.ships,f.crew,f.food,f.status,f.patrol,r.maritime.hulls[f.id],place(r.fleetPositions.records[f.id])]),
  r.forceContacts.pairs.map(p=>[p.a,p.b,p.cellA,p.cellB,p.area]),r.maritime.retreating,r.voyages.manualFleets,
  Object.entries(r.portControl.ports).map(([id,p])=>[id,p.landOwnerId,p.occupierId]),r.portControl.fleets,r.portControl.attackFleetIds,
  r.navalAutonomy.fleets,r.navalAutonomy.rng,
 ]);
}
/** Primitive parts of signature() in order, plus the JSON of its object parts.
 * When every primitive is identical (===) and that JSON is identical, the full
 * signature text is necessarily identical, so the previous text is reused.
 * Any difference (or NaN/null forms) falls back to the full JSON. */
function precheck(r:FoundingForces47):{flat:unknown[];json:string}{
 const flat:unknown[]=[r.world.nations.length];
 for(const n of r.world.nations)flat.push(n.id);
 flat.push(r.world.statecraft!.relations.length);for(const v of r.world.statecraft!.relations)flat.push(v.a,v.b,v.status);
 flat.push(r.world.provinces.length);for(const p of r.world.provinces)flat.push(p.id,p.controller,p.legalOwner);
 flat.push(r.world.statecraft!.provinces.length);for(const p of r.world.statecraft!.provinces)flat.push(p.provinceId,p.grain,p.population);
 flat.push(r.world.armies.length);for(const a of r.world.armies){const t=place(r.armyPositions.records[a.id]);flat.push(a.id,a.nationId,a.troops,a.status,t[0],t[1]);}
 flat.push(r.navy.fleets.length);for(const f of r.navy.fleets){const t=place(r.fleetPositions.records[f.id]);flat.push(f.id,f.nationId,f.ships,f.crew,f.food,f.status,f.patrol,r.maritime.hulls[f.id],t[0],t[1]);}
 flat.push(r.forceContacts.pairs.length);for(const p of r.forceContacts.pairs)flat.push(p.a,p.b,p.cellA,p.cellB,p.area);
 const ports=Object.entries(r.portControl.ports);flat.push(ports.length);for(const [id,p]of ports)flat.push(id,p.landOwnerId,p.occupierId);
 return {flat,json:JSON.stringify([r.maritime.retreating,r.voyages.manualFleets,r.portControl.fleets,r.portControl.attackFleetIds,r.navalAutonomy.fleets,r.navalAutonomy.rng])};
}
const samePrecheck=(a:{flat:unknown[];json:string}|undefined,b:{flat:unknown[];json:string})=>!!a&&a.json===b.json&&a.flat.length===b.flat.length&&a.flat.every((v,i)=>v===b.flat[i]);
/** A single fixed military window. Never persisted or used across a command,
 * daily settlement or arbitrary callback. Skip observations, not time or RNG.
 * Every unchanged tick still advances the original ledger revision. */
export function createSessionNavalObserver47(){
 let observed:string|undefined,observedParts:{flat:unknown[];json:string}|undefined,next=0;
 return (r:FoundingForces47,weights:ArmyRouteWeights47,sea:SeaGraph):boolean=>{
  if(!isOwnedTravelWindow47())throw Error('海军观察复用仅允许私有同步推演。');
  const s=r.navalAutonomy,now=r.clock.tick;
  assertNavalAutonomy47(r);
  if(now===s.lastTick)return false;
  if(now!==s.lastTick+(frameTicks47(r)??1)||now>Number.MAX_SAFE_INTEGER-1280||s.revision>=Number.MAX_SAFE_INTEGER)throw Error('海军自主部署必须接续整 tick。');
  const parts=precheck(r),current=samePrecheck(observedParts,parts)?observed:signature(r);
  if(observed===current&&now<next){s.lastTick=now;s.revision++;assertNavalAutonomy47(r);return false;}
  issueAutonomousNavalOrders47(r,weights,sea);
  observedParts=precheck(r);observed=signature(r);next=s.nextRoleTick;
  for(const f of r.navy.fleets){const row=s.fleets[f.id];
   // A historical 'busy' note may survive the end of combat until the next
   // cooldown. It must not suppress that deadline. Only live opt-outs count.
   if(f.status==='lost'||r.voyages.manualFleets.includes(f.id)||!f.patrol)continue;
   // Original low-food/no-route behavior retries EVERY tick. This optimization
   // must not silently introduce a backoff or skip its repeated decisions.
   const retry=f.food<f.crew*30&&row.decision!=='resupply';
   next=Math.min(next,retry?now+1:Math.max(now+1,row.nextTick));
  }
  return true;
 };
}
