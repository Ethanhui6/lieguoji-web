import {waterRegions47} from './geography-content47';
import type {MilitaryRun47} from './force-tick47';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47} from './army-travel47-state';
import {assertForceContacts47,forceKey47,reconcileForceContactsOwned47} from './force-motion47';
import type {HarborLayout46} from './war46-geography';
import {graphFor47 as graphFor46} from './sea-geography47';
import {harborCells46} from './war46-harbor';
import {assertPorts46} from './war46-ports';
import {nationsAtWar} from './realtime-statecraft';
import {nativePortAttack,nativePortRecovery,nativePortTarget,nativePortPeace} from './native-war/port-occupation';
import type {SeaGraph} from './sea-path';

type PortRun47=MilitaryRun47&{harbors:HarborLayout46};
const revise=(r:PortRun47)=>{if(!Number.isSafeInteger(r.portControl.revision)||r.portControl.revision<0||r.portControl.revision>=Number.MAX_SAFE_INTEGER)throw Error('海港控制修订已达上限。');r.portControl.revision++;};
/** Read the true travel/region contact state, including neutral observers held
 * inside a contested sea region. Does not install or mutate contact state. */
export function navalPresence47(r:PortRun47,sea:SeaGraph=graphFor46(r)){
 const {spatial,forces}=actualForces47(r),regions=waterRegions47(r.diplomaticGeography),region=(face:number)=>regions.get(face)!;
 assertForceContacts47(r.forceContacts,forces,spatial.graph,region);
 const contact=reconcileForceContactsOwned47(forces,spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),region);
 const fleets=r.navy.fleets.filter(f=>f.status!=='lost').map(f=>({fleet:f,at:armyTravelLocation47(r.fleetPositions.records[f.id],spatial.graph)}));
 return {spatial,sea,held:contact.held,fleets,atPort:(id:string)=>fleets.filter(v=>harborCells46(sea,id).has(v.at.cell.face))};
}
/** Zero-time land title synchronization. No obsolete node/dock/route reader,
 * no repair dt, no harbor construction, and no change to the land itself. */
export function reconcilePortLandOwnersOwned47(r:PortRun47,sea:SeaGraph=graphFor46(r)):undefined{
 for(const port of sea.ports){const p=r.portControl.ports[port.provinceId],land=r.world.provinces.find(p=>p.id===port.provinceId);if(!p||!land)throw Error('实际海港缺少控制记录。');
  if(p.landOwnerId!==land.controller){Object.assign(p,{landOwnerId:land.controller,occupierId:land.controller,value:100});revise(r);}
 }
 return undefined;
}
/** Original float32 port kernels, evaluated over the actual positive military
 * segment [from,to). Presence/hull/contact are from its START; a fleet arriving
 * at its end earns no preceding time. Recovery then stable fleet-order attacks
 * is a WEB scheduling policy, not a recovered native callback order. */
export function advancePortIntervalOwned47(before:PortRun47,after:PortRun47,from:number,to:number,sea:SeaGraph=graphFor46(before)):undefined{
 const seconds=(to-from)*before.forceClock.secondsPerTick;
 if(!Number.isFinite(from)||!Number.isFinite(to)||from<before.clock.tick||to>Math.floor(from)+1||to<=from||!Number.isFinite(seconds)||seconds<=0||after.forceClock.secondsPerTick!==before.forceClock.secondsPerTick)throw Error('港湾推进时间段无效。');
 if(before.transports.cargo.length)throw Error('旧承运记录不能进入实际舰队港湾结算。');
 assertPorts46(before.portControl,before,sea);
 const view=navalPresence47(before,sea),original=JSON.stringify(after.portControl),s=after.portControl;
 for(const port of view.sea.ports){const p=s.ports[port.provinceId],present=view.atPort(port.id);
  nativePortRecovery(p,p.landOwnerId,present.some(v=>v.fleet.nationId===p.occupierId),present.some(v=>v.fleet.nationId!==p.landOwnerId),seconds);
 }
 for(const {fleet:f,at} of view.fleets){
  if(view.held.has(forceKey47({kind:'fleet',id:f.id}))||before.maritime.retreating[f.id]>from)continue;
  const hull=before.maritime.hulls[f.id];if(!Number.isFinite(hull)||hull<0||hull>f.ships*100||f.ships<1)throw Error('舰体强度无效。');
  for(const port of view.sea.ports){if(!harborCells46(view.sea,port.id).has(at.cell.face))continue;const p=s.ports[port.provinceId],enemy=(id:string)=>nationsAtWar(before.world,f.nationId,id);
   if(!nativePortTarget(p,f.nationId,enemy)||!nativePortAttack(p,f.nationId,hull/(f.ships*100),seconds,enemy))continue;
   const order=s.fleets[f.id];order.forwardBaseId=port.provinceId;order.targetId=null;
   if(!Number.isSafeInteger(after.world.nextEventId)||after.world.nextEventId<1||after.world.nextEventId>=Number.MAX_SAFE_INTEGER)throw Error('海港事件记录已达上限。');
   const name=after.world.cities.find(c=>c.provinceId===port.provinceId)?.name??after.world.provinces.find(p=>p.id===port.provinceId)!.name;
   after.world.events.push({id:after.world.nextEventId++,day:after.world.day,kind:'system',text:`${f.name}控制${name}海港`,reason:'舰队实际处于港湾内并完成争夺；仅海港控制变化，城市和陆地不随之吞并。'});after.world.events=after.world.events.slice(-160);
  }
 }
 if(JSON.stringify(s)!==original)revise(after);
 assertPorts46(s,after,view.sea);return undefined;
}
/** Call at a real war-end transaction, after updating current diplomacy. Other
 * active wars still prevent return. This owns no politics or daily timer. */
export function settlePortPeaceOwned47(r:PortRun47,participants:Set<string>):undefined{
 for(const p of Object.values(r.portControl.ports))if(nativePortPeace(p,participants,(a,b)=>nationsAtWar(r.world,a,b)))revise(r);
 return undefined;
}
