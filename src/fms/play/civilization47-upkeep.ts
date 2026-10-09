import type {FoundingForces47} from './civilization47-forces';
import type {GameEvent} from '../../sim/types';
import {actualForces47} from './force-runtime47';
import {readArmySpace47,landHolders47,canRefill47,rationPoints47} from './army-space47';
import {armyTravelLocation47,haltArmyTravel47} from './army-travel47-state';
import {graphFor47 as graphFor46} from './sea-geography47';
import {portAvailable46} from './war46-ports';
import {nationsAtWar} from './realtime-statecraft';
import {lossRecorder} from './war27-losses';
import {forceKey47,reconcileForceContactsOwned47} from './force-motion47';
import {reconcileMilitaryClock47} from './force-tick47';
import {navalPresence47,reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {fleetRation47,LOGISTICS_DAY_FACTOR47} from './logistics-clock47';

export function dailyEvent47(r:Pick<FoundingForces47,'world'>,kind:GameEvent['kind'],text:string,reason:string){
  if(!Number.isSafeInteger(r.world.nextEventId)||r.world.nextEventId<1||r.world.nextEventId>=Number.MAX_SAFE_INTEGER)throw Error('事件记录已达上限。');
  r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind,text,reason});r.world.events=r.world.events.slice(-160);
}
const revise=(v:{revision:number})=>{if(!Number.isSafeInteger(v.revision)||v.revision<0||v.revision>=Number.MAX_SAFE_INTEGER)throw Error('日结状态修订已达上限。');v.revision++;};
/** Local arithmetic guard, not a full save validator. NaN grain must never
 * turn both a replenishment amount and the starving comparison into NaN. */
export function assertDailyResources47(r:FoundingForces47){
  const integer=(n:number,max:number)=>Number.isSafeInteger(n)&&n>=0&&n<=max,points=(n:number)=>Number.isFinite(n)&&n>=0&&n<=100;
  for(const p of r.world.statecraft!.provinces)if(!integer(p.population,2147483647)||!integer(p.grain,1_000_000_000_000))throw Error('日粮人口或粮储不是有效整数。');
  for(const a of r.world.armies)if(!integer(a.troops,Number.MAX_SAFE_INTEGER)||!points(a.supplies)||!points(a.morale))throw Error('军队日粮或兵力无效。');
  for(const f of r.navy.fleets)if(!integer(f.food,f.ships*40*60)||!integer(f.crew,f.ships*40)||f.status!=='lost'&&f.crew===0)throw Error('舰队日粮或船员无效。');
}
/** Finite existing WEB food rates. Actual stopped anchor grants supply, never
 * old dockId/node; automatic recognition at that exact owned anchor replaces
 * old movement's docking side effect. Being anywhere in a harbor is not enough. */
export function settleFleetFood47(r:FoundingForces47){
  assertDailyResources47(r);
  if(r.transports.cargo.length)throw Error('旧承运军队需先明确转换，不能重复扣独立跨海军队口粮。');
  const {spatial,held}=navalPresence47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),sea=graphFor46(r),loss=lossRecorder(r.losses,r.warfare);
  // Only the land-ownership reconciliation, no old Navy role/motion readers.
  reconcilePortLandOwnersOwned47(r);
  for(const fleet of r.navy.fleets){
    if(fleet.status==='lost')continue;
    if(!Number.isSafeInteger(fleet.crew)||fleet.crew<1||!Number.isSafeInteger(fleet.food)||fleet.food<0)throw Error('活动舰队的船员或粮储无效。');
    const travel=r.fleetPositions.records[fleet.id],at=armyTravelLocation47(travel,spatial.graph),key=forceKey47({kind:'fleet',id:fleet.id});
    const port=['arrived','halted'].includes(travel.status)&&!held.has(key)&&!(r.maritime.retreating[fleet.id]>r.clock.tick)?sea.ports.find(p=>{
      const anchor=sea.nodes.get(p.node)!.center,land=r.world.provinces.find(q=>q.id===p.provinceId)!;
      return at.cell.face===p.node&&Math.hypot(at.point.x-anchor.x,at.point.y-anchor.y)<=1e-8&&land.controller===fleet.nationId&&land.legalOwner===fleet.nationId&&portAvailable46(r.portControl,p.provinceId,fleet.nationId)&&!landHolders47(space,p.provinceId).some(a=>nationsAtWar(r.world,a.nationId,fleet.nationId));
    }):undefined;
    if(port){const stock=r.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!,amount=Math.max(0,Math.min(fleet.crew*60-fleet.food,stock.grain-stock.population*10));stock.grain-=amount;fleet.food+=amount;}
    const ration=fleetRation47(fleet.crew),starving=fleet.food<ration;fleet.food=Math.max(0,fleet.food-ration);if(!starving)continue;
    const lost=Math.min(fleet.crew,Math.max(1,Math.floor(fleet.crew*.05)));fleet.crew-=lost;loss(fleet.nationId,'crew',lost);
    dailyEvent47(r,'supply',`${fleet.name}断粮损失${lost}名船员`,'只有实际停在安全本国港口锚点才能补粮；不足一日粮按当前船员5%向下取整、至少1人减员。');
    if(fleet.crew)continue;
    loss(fleet.nationId,'hull',r.maritime.hulls[fleet.id]);loss(fleet.nationId,'ships',fleet.ships);r.maritime.hulls[fleet.id]=0;
    fleet.status='lost';fleet.patrol=false;fleet.dockId=null;fleet.targetId=null;fleet.route=[];fleet.progress=0;
    r.fleetPositions.records[fleet.id]=haltArmyTravel47(travel,spatial.graph);delete r.maritime.retreating[fleet.id];
    const order=r.portControl.fleets[fleet.id];if(!order)throw Error('损失舰队缺少港口角色记录。');Object.assign(order,{active:false,targetId:null,forwardBaseId:null});r.portControl.attackFleetIds=r.portControl.attackFleetIds.filter(id=>id!==fleet.id);revise(r.portControl);
  }
}
/** Called AFTER actual daily Army grain consumption/refill. No second ration
 * deduction and no old 55%-speed message: new speed does not use that rule. */
export function settleArmyFoodConsequences47(r:FoundingForces47){
  const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),loss=lossRecorder(r.losses,r.warfare);
  for(const v of space.byArmy.values()){
    const a=v.army;if(a.supplies>0){if(canRefill47(v)&&v.province!.controller===a.nationId&&!landHolders47(space,v.province!.id).some(other=>nationsAtWar(r.world,a.nationId,other.nationId)))a.morale=Math.min(100,a.morale+3);continue;}
    const lost=Math.min(a.troops,Math.max(1,Math.ceil(a.troops*.018)));a.troops-=lost;a.morale=Math.max(0,a.morale-6);loss(a.nationId,'starvation',lost);
    dailyEvent47(r,'supply',`${a.name}断粮减员${lost}`,`本日口粮${rationPoints47(v,LOGISTICS_DAY_FACTOR47)}点已在日粮账扣除；兵力损失1.8%、士气下降6。实际海上部队不能从历史陆地锚点补粮。`);
    if(a.troops)continue;
    a.status='destroyed';a.morale=0;a.supplies=0;a.route=[];a.progress=0;r.armyPositions.records[a.id]=haltArmyTravel47(v.travel,spatial.graph);
    delete r.battles.plans[a.id];delete r.reorganization.active[a.id];delete r.tactics.rounds[a.id];
  }
}
/** All death/retirement/roster changes finish in the daily candidate before
 * the next tick validates contacts and deadlines. Keep history/damage carry. */
export function finishDailyForces47(r:FoundingForces47,commitPositions=false){
  const {spatial,forces}=actualForces47(r),regions=new Map(r.diplomaticGeography.water.flatMap(p=>p.faces.map(face=>[face,p.id] as const)));
  const next=reconcileForceContactsOwned47(forces,spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),face=>regions.get(face)!);r.forceContacts=next.contacts;
  for(const a of r.world.armies)if(a.status==='fighting'&&!next.held.has(forceKey47({kind:'army',id:a.id})))a.status='idle';
  reconcileMilitaryClock47(r,r.clock.tick);
  for(const [id,m] of Object.entries(r.voyages.missions))if(!r.navy.fleets.some(f=>f.id===m.fleetId&&f.status!=='lost')||!r.world.armies.some(a=>a.id===m.armyId&&a.troops>0&&a.status!=='destroyed')){
    delete r.voyages.missions[id];r.voyages.nextCheck[id]=r.clock.tick+1200;r.voyages.decisions[id]={atTick:r.clock.tick,text:'远征部队已损失，保留历史，等待重新评估。'};revise(r.voyages);
  }
  if(commitPositions){revise(r.armyPositions);revise(r.fleetPositions);}
}
