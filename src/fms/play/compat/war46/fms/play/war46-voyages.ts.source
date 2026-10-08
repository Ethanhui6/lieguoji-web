import type {PortAccess46} from './war46-navy';
import type {World} from '../../sim/types';
import {reconcileWar26,war26Distances,type War26State} from './war26-state';
import {war26SeaRoutes} from './war26-sea';
import {war26Strength} from './war26-strength';
import type {ChronicleRun} from './chronicle-model';
import type {TerrainContext} from './restoration19-state';
import {seaRoute,routeDistance,type SeaGraph,type Port} from './sea-path';
import {NAVAL_SPEED,previewNaval,applyNaval} from './war46-navy';
import {ownAccess46,type MilitaryAccess46} from './war46-access';
import {previewTransport,applyTransport,type TransportAction} from './transport';
import {transportBase,previewMaritime,applyMaritime} from './maritime';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './chronicle-model';
import {createMilitaryCore} from './war46-core';
import {nationsAtWar} from './realtime-statecraft';
import {underSiege} from './occupation';
import {landComponents,coastalContact} from './voyage24-geography';
import {applyVoyageDiplomacy,previewVoyageDiplomacy} from './voyage24-diplomacy';
import {reconcileVoyages,voyageDecision,yieldVoyages,type Voyages,type VoyageMission} from './voyage24-state';
/** Player takeover releases the unclaimed rendezvous partner, without
 * cancelling or teleporting its already entered sea leg. */
export function yieldRendezvous46(s:Voyages,r:ChronicleRun,command:Parameters<typeof yieldVoyages>[2]){
 const before=Object.entries(s.missions);yieldVoyages(s,r,command);
 for(const [id,m] of before)if(m.phase==='assembling'&&!s.missions[id]&&!s.manualFleets.includes(m.fleetId)&&!r.transports.cargo.some(c=>c.fleetId===m.fleetId)){
  const f=r.navy.fleets.find(f=>f.id===m.fleetId);if(f&&f.status!=='lost')f.patrol=true;
 }
}
const stamp=(r:ChronicleRun)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const sea=(r:ChronicleRun)=>maritimeView(tacticsView(campaignView(r)));
const base=(r:ChronicleRun)=>transportBase(sea(r));
const safe=(r:ChronicleRun,p:Port,nationId:string,portAccess:PortAccess46)=>portAccess(p.provinceId,nationId)&&r.world.provinces.some(v=>v.id===p.provinceId&&v.controller===nationId&&v.legalOwner===nationId)&&!underSiege(r.world,p.provinceId);
const opposed=(r:ChronicleRun,p:Port,nationId:string,portAccess:PortAccess46)=>portAccess(p.provinceId,nationId)&&r.world.armies.some(a=>a.provinceId===p.provinceId&&a.troops>0&&a.status!=='destroyed'&&nationsAtWar(r.world,nationId,a.nationId));
function transport(r:ChronicleRun,g:SeaGraph,a:TransportAction){const p=previewTransport(base(r),g,a);if(!p.valid)return false;const moved=applyTransport(base(r),g,a,stamp(r));
 if(a.type==='voyage'){const f=moved.navy.fleets.find(f=>f.id===a.fleetId)!;if(!f.route.length){f.status='anchored';f.targetId=null;}}
 r.world=moved.world;r.navy=moved.navy;r.units=moved.units;r.transports=moved.transports;r.battles=moved.battles;return true;}
function finish(r:ChronicleRun,s:Voyages,nationId:string,text:string){delete s.missions[nationId];s.nextCheck[nationId]=r.clock.tick+600;s.revision++;voyageDecision(s,nationId,r.clock.tick,text);}
function goHome(r:ChronicleRun,s:Voyages,g:SeaGraph,nationId:string,m:VoyageMission,portAccess:PortAccess46){
 const f=r.navy.fleets.find(f=>f.id===m.fleetId)!;
 const ports=g.ports.filter(p=>safe(r,p,nationId,portAccess)).sort((a,b)=>Math.hypot(g.nodes.get(f.node)!.center.x-a.shore.x,g.nodes.get(f.node)!.center.y-a.shore.y)-Math.hypot(g.nodes.get(f.node)!.center.x-b.shore.x,g.nodes.get(f.node)!.center.y-b.shore.y)||a.id.localeCompare(b.id));
 for(const p of ports){
  if(!f.route.length&&f.node===p.node){f.progress=0;f.dockId=p.id;f.targetId=null;f.status='docked';m.toPortId=p.id;m.phase='returning';const cargo=r.transports.cargo.find(c=>c.fleetId===f.id);if(cargo)cargo.targetPortId=p.id;s.revision++;return true;}
  const action={type:'retreat' as const,fleetId:f.id,portId:p.id},preview=previewMaritime(sea(r),g,action);if(!preview.valid)continue;
  const moved=applyMaritime(sea(r),g,action,stamp(r));r.world=moved.world;r.navy=moved.navy;r.maritime=moved.maritime;r.transports=moved.transports;m.toPortId=p.id;m.phase='returning';s.revision++;return true;
 }
 voyageDecision(s,nationId,r.clock.tick,'远征等待安全返航港：没有满足当前海路与船粮要求的本国港口。');return false;
}
function progress(r:ChronicleRun,s:Voyages,g:SeaGraph,nationId:string,m:VoyageMission,strategy:War26State,portAccess:PortAccess46){
 let f=r.navy.fleets.find(f=>f.id===m.fleetId)!;const from=g.ports.find(p=>p.id===m.fromPortId)!,to=g.ports.find(p=>p.id===m.toPortId)!;
 if(r.maritime.contacts.some(c=>c.a===f.id||c.b===f.id)){voyageDecision(s,nationId,r.clock.tick,'远征舰队正在海上交战，运输队等待脱离接触。');return;}
 const controller=r.world.provinces.find(p=>p.id===to.provinceId)!.controller,allowed=m.phase==='returning'||(controller===nationId||nationsAtWar(r.world,nationId,controller))&&war26Distances(r.world,strategy,nationId).has(to.provinceId);
 if(m.phase==='assembling'){
  if(!s.enabled[nationId]||!allowed||!safe(r,from,nationId,portAccess)||opposed(r,from,nationId,portAccess)||r.clock.tick-m.startedTick>4320){f.patrol=true;finish(r,s,nationId,'集结取消：出发港不安全、目标已和平、调度关闭或长期无法完成集结。');return;}
  const a=r.world.armies.find(a=>a.id===m.armyId)!;
  const portName=r.world.cities.find(c=>c.provinceId===from.provinceId)?.name??r.world.provinces.find(p=>p.id===from.provinceId)!.name;
  const armyReady=a.status==='idle'&&!a.progress&&!a.route.length&&a.provinceId===from.provinceId;
  const fleetReady=!f.route.length&&!f.progress&&f.node===from.node&&f.dockId===from.id;
  if(!armyReady||!fleetReady){
   voyageDecision(s,nationId,r.clock.tick,`${armyReady?`${a.name}已在${portName}候船`:`${a.name}正在前往${portName}集结`}；${fleetReady?`${f.name}已靠港`:`${f.name}沿海路前来接兵`}。`);return;
  }
  const path=seaRoute(g,from.node,to.node),days=path?Math.max(1,Math.ceil(routeDistance(g,path)/NAVAL_SPEED)):Infinity;
  // Recheck actual supplies on arrival, not only when the plan was created.
  if(!Number.isFinite(days)||a.supplies<(days+3)*6){f.patrol=true;finish(r,s,nationId,'集结部队粮食不足，暂缓跨海出征。');return;}
  if(f.food<f.crew*(days*2+6)){voyageDecision(s,nationId,r.clock.tick,`${f.name}已抵达${portName}，等待港口补足往返船粮后再装兵。`);return;}
  if(!transport(r,g,{type:'embark',fleetId:f.id,armyId:a.id}))return;
  if(!transport(r,g,{type:'voyage',fleetId:f.id,portId:to.id})){transport(r,g,{type:'land',fleetId:f.id});r.navy.fleets.find(v=>v.id===f.id)!.patrol=true;finish(r,s,nationId,'航前重验未通过，部队留在出发港。');return;}
  m.phase='outbound';s.revision++;voyageDecision(s,nationId,r.clock.tick,`${a.name}已装船，沿真实海路前往${r.world.provinces.find(p=>p.id===to.provinceId)!.name}。`);return;
 }
 if(m.phase==='outbound'&&(!allowed||!s.enabled[nationId])){if(goHome(r,s,g,nationId,m,portAccess))voyageDecision(s,nationId,r.clock.tick,'目标已和平、港口易主或停止远征，载军舰队正在返航。');return;}
 if(m.phase==='returning'&&!safe(r,to,nationId,portAccess)){goHome(r,s,g,nationId,m,portAccess);return;}
 if(f.route.length||f.progress)return;
 const cargo=r.transports.cargo.find(c=>c.fleetId===f.id);
 if(cargo&&!transport(r,g,{type:'land',fleetId:f.id})){voyageDecision(s,nationId,r.clock.tick,'已到岸，等待符合当前外交和位置的登陆条件。');return;}
 f=r.navy.fleets.find(v=>v.id===f.id)!;
 if(m.phase==='returning'){f.patrol=true;finish(r,s,nationId,'舰队已返回本国港口，载军身份与余粮保持。');return;}
 voyageDecision(s,nationId,r.clock.tick,'远征军已登陆，进入当地实际交战与占领；舰队返回补给。');
 // The army is released to ordinary land tactics. The empty fleet returns.
 m.phase='returning';if(!goHome(r,s,g,nationId,m,portAccess))finish(r,s,nationId,'远征军已登陆；舰队暂在港外等待可行返航补给。');
}
function begin(r:ChronicleRun,s:Voyages,g:SeaGraph,context:TerrainContext,nationId:string,strategy:War26State,portAccess:PortAccess46,reserved:(id:string)=>boolean,access:MilitaryAccess46){
 const w=r.world,lands=landComponents(w,g),routes=war26SeaRoutes(w,g,nationId,strategy,id=>nationsAtWar(w,nationId,id));
 if(!routes.length){voyageDecision(s,nationId,r.clock.tick,'本次目标没有可由外海与合法陆路抵达的登陆点，维持沿岸防务。');return;}
 const core=createMilitaryCore(r.units,true,true,context,undefined,undefined,undefined,undefined,()=>false,access);
 let suitableArmy=false;
 for(const route of routes){
  if(!safe(r,route.from,nationId,portAccess)||opposed(r,route.from,nationId,portAccess))continue;const days=Math.max(1,Math.ceil(route.distance/NAVAL_SPEED));
  const armies=w.armies.filter(a=>a.nationId===nationId&&a.status==='idle'&&!a.route.length&&!a.progress&&a.troops>0&&a.troops<=5000&&a.morale>=55&&a.supplies>=(days+3)*6&&!s.manualArmies.includes(a.id)&&!r.battles.plans[a.id]&&!r.reorganization.active[a.id]&&lands.get(a.provinceId)===lands.get(route.from.provinceId)&&w.provinces.some(p=>p.id===a.provinceId&&p.controller===nationId)).sort((a,b)=>Number(b.provinceId===route.from.provinceId)-Number(a.provinceId===route.from.provinceId)||a.troops-b.troops||a.id.localeCompare(b.id));
  for(const a of armies){
   const order={armyId:a.id,targetId:route.from.provinceId,kind:'march' as const};if(a.provinceId!==route.from.provinceId&&!core.previewOrder(w,order).valid)continue;
   suitableArmy=true;
   // Monthly State.UpdateNavy is the automatic construction authority. This
   // web transport adapter may rendezvous with an existing fleet, never mint
   // a demand-built ship or divert an active assault, passenger or player order.
   const candidates=r.navy.fleets.filter(f=>f.nationId===nationId&&f.status!=='lost'&&!f.route.length&&!f.progress&&f.patrol&&f.ships*1000>=a.troops&&!s.manualFleets.includes(f.id)&&!reserved(f.id)&&!r.transports.cargo.some(c=>c.fleetId===f.id)&&!r.maritime.contacts.some(c=>c.a===f.id||c.b===f.id)&&(r.maritime.retreating[f.id]??0)<=r.clock.tick).flatMap(f=>{
    const path=seaRoute(g,f.node,route.from.node);if(!path)return [];
    const distance=routeDistance(g,path),pickupDays=Math.ceil(distance/NAVAL_SPEED);
    if(f.food<f.crew*(pickupDays+days*2+6))return [];
    return [{fleet:f,distance}];
   }).sort((a,b)=>a.distance-b.distance||a.fleet.ships-b.fleet.ships||a.fleet.id.localeCompare(b.fleet.id));
   const candidate=candidates[0];if(!candidate)continue;let fleet=candidate.fleet;
   if(fleet.dockId!==route.from.id){
    const sail={type:'sail' as const,fleetId:fleet.id,portId:route.from.id},p=previewNaval(r.world,r.navy,g,sail,portAccess);if(!p.valid)continue;
    const moved=applyNaval(r.world,r.navy,g,sail,stamp(r),portAccess);r.world=moved.world;r.navy=moved.navy;fleet=r.navy.fleets.find(f=>f.id===fleet.id)!;
    // Same water node can serve distinct port anchors. Resolve only that
    // zero-distance leg; no movement position or food is fabricated.
    if(!fleet.route.length){fleet.dockId=route.from.id;fleet.targetId=null;fleet.status='docked';}
   }
   fleet.patrol=false;
   if(a.provinceId!==route.from.provinceId)r.world=core.issueOrder(r.world,order);
   s.missions[nationId]={armyId:a.id,fleetId:fleet.id,fromPortId:route.from.id,toPortId:route.to.id,phase:'assembling',startedTick:r.clock.tick};s.revision++;
   voyageDecision(s,nationId,r.clock.tick,`${fleet.name}${candidate.distance>0?'正在驶来接兵':'已在港口候兵'}，与${a.name}会合后跨海前往${w.provinces.find(p=>p.id===route.to.provinceId)!.name}。`);return;
  }
 }
 voyageDecision(s,nationId,r.clock.tick,suitableArmy?'等候舰队：需有空闲、运力与船粮充足的现有舰队；自动造船按月度计划进行，远征不会临时生成舰队。':'暂缓远征：没有能抵达安全港口、未被玩家接管且军粮足够的集结部队。');
}
function diplomacy(r:ChronicleRun,s:Voyages,g:SeaGraph,context:TerrainContext,nationId:string,declared:(world:World,attacker:string,defender:string,tick:number,forces:Pick<ChronicleRun,'navy'|'transports'>)=>void){
 const w=r.world,report=createMilitaryCore(r.units,true,true,context).nationReports(w).find(n=>n.nationId===nationId)!;
 if(report.priority==='civilian'||report.territoryCount===0||w.statecraft!.relations.some(v=>(v.a===nationId||v.b===nationId)&&v.status==='war'))return r;
 const militarist=report.priority==='military',observation=militarist?7:14,advantage=militarist?1.3:2,reserve=militarist?10:20;
 if(report.grain<(report.civilianNeedPerDay+report.militaryNeedPerDay)*reserve)return r;
 const strength=(id:string)=>[...w.armies,...r.transports.cargo.map(c=>c.army)].filter(a=>a.nationId===id&&a.status!=='destroyed').reduce((n,a)=>n+a.troops*Math.max(.1,a.morale/100)*Math.max(.1,a.supplies/100),0);
 const targets=w.nations.filter(n=>n.id!==nationId&&coastalContact(w,g,nationId,n.id)&&strength(nationId)>strength(n.id)*advantage&&previewVoyageDiplomacy(w,g,{type:'declare-war',nationId,targetNationId:n.id}).valid&&w.statecraft!.relations.some(v=>[v.a,v.b].includes(nationId)&&[v.a,v.b].includes(n.id)&&w.day-v.sinceDay>=observation)).sort((a,b)=>strength(a.id)-strength(b.id)||a.id.localeCompare(b.id));
 if(!targets.length)return r;const n=applyVoyageDiplomacy(r,g,{type:'declare-war',nationId,targetNationId:targets[0].id},stamp(r));declared(n.world,nationId,targets[0].id,n.clock.tick,n);voyageDecision(s,nationId,r.clock.tick,`经${observation}日观察，军力超过${advantage}倍、粮储充足且海域相通，自主向${targets[0].name}宣战。`);return n;
}
/** The bridge schedules real web transports. Native Army pathfinding uses
 * combined land/sea province routes; no claim that these planners are its AI. */
export function advanceWar46Voyages(input:ChronicleRun,s:Voyages,g:SeaGraph,context:TerrainContext,strategy:War26State,declared:(world:World,attacker:string,defender:string,tick:number,forces:Pick<ChronicleRun,'navy'|'transports'>)=>void,canAutoDeclare:(id:string)=>boolean,portAccess:PortAccess46,reserved:(id:string)=>boolean,access:MilitaryAccess46=ownAccess46):ChronicleRun{
 let r=input;reconcileVoyages(r,s);if(r.clock.tick%12!==0)return r;
 for(const n of r.world.nations){
  const m=s.missions[n.id];if(m){progress(r,s,g,n.id,m,strategy,portAccess);continue;}
  if(!s.enabled[n.id]||r.clock.tick<s.nextCheck[n.id])continue;s.nextCheck[n.id]=r.clock.tick+120;s.revision++;
  if(canAutoDeclare(n.id))r=diplomacy(r,s,g,context,n.id,declared);reconcileWar26(r.world,strategy,g,r.clock.tick,(w,id)=>war26Strength(w,r,id));begin(r,s,g,context,n.id,strategy,portAccess,reserved,access);
 }
 reconcileVoyages(r,s);return r;
}
