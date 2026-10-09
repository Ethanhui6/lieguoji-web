import type {FoundingForces47} from './civilization47-forces';
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
/** A single fixed military window. Never persisted or used across a command,
 * daily settlement or arbitrary callback. Skip observations, not time or RNG.
 * Every unchanged tick still advances the original ledger revision. */
export function createSessionNavalObserver47(){
 let observed:string|undefined,next=0;
 return (r:FoundingForces47,weights:ArmyRouteWeights47,sea:SeaGraph):boolean=>{
  if(!isOwnedTravelWindow47())throw Error('海军观察复用仅允许私有同步推演。');
  const s=r.navalAutonomy,now=r.clock.tick;
  assertNavalAutonomy47(r);
  if(now===s.lastTick)return false;
  if(now!==s.lastTick+1||now>Number.MAX_SAFE_INTEGER-1280||s.revision>=Number.MAX_SAFE_INTEGER)throw Error('海军自主部署必须接续整 tick。');
  const current=signature(r);
  if(observed===current&&now<next){s.lastTick=now;s.revision++;assertNavalAutonomy47(r);return false;}
  issueAutonomousNavalOrders47(r,weights,sea);
  observed=signature(r);next=s.nextRoleTick;
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
