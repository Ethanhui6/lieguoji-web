import type {FoundingForces47} from './civilization47-forces';
import {assertNavalAutonomy47,drawNaval47,NAVAL_SCHEDULE_TICKS47,type NavalDecision47} from './civilization47-naval-ai-state';
import {navalPresence47,reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {nativeAttackFleets,nativeNavalAttacking} from './native-war/naval-roles';
import {nativeIdlePortWeights,nativeChooseIdlePort,nativeIdleDelay} from './native-war/naval-deployment';
import {nativePortTarget,nativeBestPort} from './native-war/port-occupation';
import {nationsAtWar} from './realtime-statecraft';
import {landHolders47} from './army-space47';
import {forceKey47} from './force-motion47';
import {createFleetCommandSearch47,previewFleetCommand47,issueFleetOrderOwned47,type FleetCommand47} from './fleet-commands47';
import type {ArmyRouteWeights47} from './army-commands47';
import {actualForceSpeed47} from './force-speed47';
import {TICKS_PER_DAY} from './clock';
import {graphFor47 as graphFor46} from './sea-geography47';
import {fleetRation47} from './logistics-clock47';
import type {SeaGraph} from './sea-path';

/** Real owned military candidate, once per whole tick. Native role quota,
 * reclaim priority and idle weighting are reused. Safe ration budgeting,
 * stable water geometry, and the 40-tick unscaled schedule are WEB bridges.
 * Does not move, heal, create ships, supply, seize land, or transport Armies. */
export function issueAutonomousNavalOrders47(r:FoundingForces47,weights:ArmyRouteWeights47,sea:SeaGraph=graphFor46(r)):undefined{
 assertNavalAutonomy47(r);const s=r.navalAutonomy,now=r.clock.tick;
 if(now===s.lastTick)return undefined;
 if(now!==s.lastTick+1||now>Number.MAX_SAFE_INTEGER-1280||s.revision>=Number.MAX_SAFE_INTEGER)throw Error('海军自主部署必须接续整 tick。');
 reconcilePortLandOwnersOwned47(r,sea);
 const view=navalPresence47(r,sea),space=view.spatial.space,portBefore=JSON.stringify(r.portControl);
 // These dependencies do not change while issuing this tick's fleet orders.
 // Never retain the queries across ticks: peace, lost ports, grain and actual
 // land holders can change without a position-book revision.
 const firstIndex=<T,>(rows:readonly T[],id:(row:T)=>string)=>{const out=new Map<string,T>();for(const row of rows)if(!out.has(id(row)))out.set(id(row),row);return out;};
 const landById=firstIndex(r.world.provinces,p=>p.id),stockById=firstIndex(r.world.statecraft!.provinces,p=>p.provinceId),portById=firstIndex(view.sea.ports,p=>p.id);
 const wars=new Map<string,boolean>(),war=(id:string)=>{if(!wars.has(id))wars.set(id,r.world.nations.some(n=>nationsAtWar(r.world,id,n.id)));return wars.get(id)!;};
 const portsByComponent=new Map<number,typeof sea.ports>(),safeByNation=new Map<string,typeof sea.ports>();
 const candidatesIn=(component:number)=>{if(!portsByComponent.has(component))portsByComponent.set(component,view.sea.ports.filter(p=>view.sea.nodes.get(p.node)!.component===component));return portsByComponent.get(component)!;};
 const safeIn=(nationId:string,component:number,low:boolean)=>{const key=JSON.stringify([nationId,component,low]);if(!safeByNation.has(key))safeByNation.set(key,candidatesIn(component).filter(p=>{const land=landById.get(p.provinceId)!,stock=stockById.get(p.provinceId)!;return land.controller===nationId&&land.legalOwner===nationId&&r.portControl.ports[p.provinceId].occupierId===nationId&&!landHolders47(space,p.provinceId).some(a=>nationsAtWar(r.world,nationId,a.nationId))&&(!low||stock.grain>stock.population*10);}));return safeByNation.get(key)!;};
 if(now>=s.nextRoleTick){
  r.portControl.attackFleetIds=r.world.nations.flatMap(n=>!war(n.id)?[]:nativeAttackFleets(view.fleets.filter(v=>v.fleet.nationId===n.id).map(({fleet:f})=>{
   const home=portById.get(s.fleets[f.id].homePortId!),p=home&&landById.get(home.provinceId);
   const frontline=!!p&&(landHolders47(space,p.id).some(a=>nationsAtWar(r.world,n.id,a.nationId))||p.neighbors.some(id=>nationsAtWar(r.world,n.id,landById.get(id)!.controller)));
   return {id:f.id,ordinal:r.navy.fleets.findIndex(v=>v.id===f.id),frontline,strength:Math.fround(r.maritime.hulls[f.id]/(f.ships*100))};
  })));
  s.nextRoleTick=now+NAVAL_SCHEDULE_TICKS47;
 }
 for(const f of r.navy.fleets){
  const row=s.fleets[f.id],order=r.portControl.fleets[f.id],enemy=(id:string)=>nationsAtWar(r.world,f.nationId,id),atWar=war(f.nationId),actual=view.fleets.find(v=>v.fleet.id===f.id);
  const note=(decision:NavalDecision47['decision'],reason:string)=>{row.decision=decision;row.reason=reason;};
  if(order.forwardBaseId&&r.portControl.ports[order.forwardBaseId]?.occupierId!==f.nationId)order.forwardBaseId=null;
  if(order.targetId&&!nativePortTarget(r.portControl.ports[order.targetId],f.nationId,enemy))order.targetId=null;
  if(order.lastWar&&!atWar){order.active=false;order.targetId=null;order.forwardBaseId=null;row.nextTick=now;}order.lastWar=atWar;
  if(!actual){note('lost','舰队已经损失，保留部署历史。');row.assignedPortId=null;order.active=false;order.targetId=null;continue;}
  if(r.voyages.manualFleets.includes(f.id)||!f.patrol){row.assignedPortId=null;order.active=false;order.targetId=null;note('manual','保留玩家军令；恢复自主指挥后再重新评估。');continue;}
  if(view.held.has(forceKey47({kind:'fleet',id:f.id}))||r.maritime.retreating[f.id]>now){note('busy','实际海战或撤离尚未结束，保留当前航向。');continue;}
  const current=r.fleetPositions.records[f.id],moving=current.status==='moving',component=view.sea.nodes.get(actual.at.cell.face)!.component;
  const candidates=candidatesIn(component),low=f.food<f.crew*30,safe=safeIn(f.nationId,component,low);
  const goal=row.assignedPortId&&candidates.find(p=>p.id===row.assignedPortId),goalAttack=goal&&order.targetId===goal.provinceId&&nativePortTarget(r.portControl.ports[goal.provinceId],f.nationId,enemy),goalHome=goal&&safe.some(p=>p.id===goal.id);
  // Invalidated destinations and new supply emergencies bypass idle reroll
  // cooldown. The old cooldown must never send a ship into a newly lost port.
  if(row.assignedPortId&&!goalAttack&&!goalHome||low&&row.decision!=='resupply')row.nextTick=now;
  if(now<row.nextTick)continue;
  row.nextTick=now+NAVAL_SCHEDULE_TICKS47;
  // A still-valid route survives repeated decisions. Low food can interrupt
  // an offensive route, but never resets a valid resupply route every tick.
  if(moving&&(goalHome||goalAttack&&!low||!row.assignedPortId&&!low))continue;
  if(!moving&&goalAttack&&!low&&view.atPort(goal!.id).some(v=>v.fleet.id===f.id)){note('attacking','已在目标港湾，按实际存在时间争夺海港。');continue;}
  if(moving){issueFleetOrderOwned47(r,{type:'fleet-halt',fleetId:f.id},weights,'autonomous');row.assignedPortId=null;order.targetId=null;}
  const atAnchor=(p:typeof candidates[number])=>p.node===actual.at.cell.face&&Math.hypot(actual.at.point.x-view.sea.nodes.get(p.node)!.center.x,actual.at.point.y-view.sea.nodes.get(p.node)!.center.y)<=1e-8;
  const search=createFleetCommandSearch47(r,weights,f.id);
  const action=(id:string):FleetCommand47=>({type:'fleet-sail',fleetId:f.id,target:{kind:'port',id}});
  const start=(id:string,decision:NavalDecision47['decision'],reason:string)=>{issueFleetOrderOwned47(r,action(id),weights,'autonomous',search);row.assignedPortId=id;row.issuedTick=now;note(decision,reason);};
  const here=safe.find(atAnchor);
  if(low&&here){row.assignedPortId=here.id;order.targetId=null;note('resupply','实际停在安全本国锚点，等待日结从当地粮储补给。');continue;}
  const home=candidates.find(p=>p.id===row.homePortId),homeLost=!!home&&r.portControl.ports[home.provinceId].occupierId!==f.nationId;
  const force={kind:'fleet' as const,id:f.id,nationId:f.nationId,withdrawing:false,travel:r.fleetPositions.records[f.id]},speed=actualForceSpeed47(r,force,actual.at.cell),ration=fleetRation47(f.crew),affordable=(distance:number)=>f.food>=ration*(Math.ceil(distance/speed/TICKS_PER_DAY)+3);
  if(!low&&nativeNavalAttacking(atWar,r.portControl.attackFleetIds.includes(f.id),homeLost,!!goalAttack)){
   // Use the actual path/speed for ration budget; no old NAVAL_SPEED=35 and
   // no claim of native voyage duration until the map-unit scale is measured.
   const options=candidates.filter(p=>nativePortTarget(r.portControl.ports[p.provinceId],f.nationId,enemy)).flatMap(port=>{
    if(atAnchor(port))return [{port,control:r.portControl.ports[port.provinceId],distance:0}];
    // Keep the 30-day return threshold plus three days at the destination.
    // Safe-port return uses its separate best-effort/three-day budget below.
    const p=previewFleetCommand47(r,action(port.id),weights,search);return p.valid&&f.food>=ration*(Math.ceil(p.distance/speed/TICKS_PER_DAY)+3)+f.crew*30?[{port,control:r.portControl.ports[port.provinceId],distance:p.distance}]:[];
   });
   const best=nativeBestPort(options,f.nationId,enemy);
   if(best){order.targetId=best.port.provinceId;if(atAnchor(best.port)){row.assignedPortId=best.port.id;note('attacking','在实际敌港等待争夺完成。');}else start(best.port.id,'attacking',best.control.landOwnerId===f.nationId?'先夺回本国海港；沿真实海路航行。':'前往可在余粮范围内抵达的敌港。');continue;}
  }
  // Low-food return is explicitly best-effort to the nearest reachable safe
  // port. Routine redeployment must budget the complete route plus reserve.
  const available=safe.flatMap(port=>{const p=atAnchor(port)?null:previewFleetCommand47(r,action(port.id),weights,search);return p===null||p.valid&&(low||affordable(p.distance))?[{port,distance:p?.distance??0}]:[];});
  let chosen:typeof available[number]|undefined;
  if(low)chosen=available.sort((a,b)=>a.distance-b.distance)[0];
  else {const rows=nativeIdlePortWeights(available.map(v=>({id:v.port.id,present:view.atPort(v.port.id).filter(v=>v.fleet.nationId===f.nationId).length,assigned:view.fleets.filter(({fleet:other})=>other.nationId===f.nationId&&other.patrol&&!r.voyages.manualFleets.includes(other.id)&&!view.held.has(forceKey47({kind:'fleet',id:other.id}))&&!(r.maritime.retreating[other.id]>now)&&s.fleets[other.id].decision==='guarding'&&s.fleets[other.id].assignedPortId===v.port.id).length})),atWar,row.assignedPortId,here?.id??null,row.homePortId),pick=nativeChooseIdlePort(rows,()=>drawNaval47(s));chosen=available.find(v=>v.port.id===pick?.id);}
  order.targetId=null;
  if(!chosen){row.assignedPortId=null;note('no-route',low?'同一海域没有有余粮且可达的安全本国海港；保留实际位置。':'当前没有满足海路与余粮条件的敌港或本国驻泊港。');continue;}
  row.nextTick=now+Math.ceil(nativeIdleDelay(atWar,()=>drawNaval47(s))*NAVAL_SCHEDULE_TICKS47);
  if(atAnchor(chosen.port)){row.assignedPortId=chosen.port.id;note(low?'resupply':'guarding',low?'等待实际日粮补给。':'在本国锚点驻防。');}
  else start(chosen.port.id,low?'resupply':'guarding',low?'余粮不足，沿真实海路返回最近可补粮港口。':'按原作港口拥挤权重重新部署。');
 }
 if(JSON.stringify(r.portControl)!==portBefore){if(r.portControl.revision>=Number.MAX_SAFE_INTEGER)throw Error('海港部署修订已满。');r.portControl.revision++;}
 s.lastTick=now;s.revision++;assertNavalAutonomy47(r);return undefined;
}
