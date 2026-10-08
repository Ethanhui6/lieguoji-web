import {harborCells45,harborRoute45,inHarbor45,loiterDelay45} from './war45-harbor';
import type {World} from '../../sim/types';
import type {Fleet} from './navy';
import {NAVAL_SPEED} from './navy';
import {seaRoute,routeDistance,type SeaGraph,type Port} from './sea-path';
import {underSiege} from './occupation';
import {nationsAtWar} from './realtime-statecraft';
import type {Voyages} from './voyage24-state';
import type {ChronicleRun} from './chronicle-model';
import {nativeIdlePortWeights,nativeChooseIdlePort,nativeIdleDelay} from './native-war/naval-deployment';
export type NavalAssignment45={homePortId:string|null;assignedPortId:string|null;nextTick:number;lastWar:boolean;loiterNode:number|null;loiterUntil:number;returning:boolean;decision:'loiter'|'returning'|'resupply'|'waiting'|'assigned'|'manual'|'mission'|'engaged'|'no-port'|'no-supply'|'disabled'|'lost';decidedTick:number};
export type NavalDeployment45={version:1;schedule:'web-sim-ticks-v1';revision:number;rng:number;draws:number;fleets:Record<string,NavalAssignment45>};
type Input=Pick<ChronicleRun,'world'|'navy'|'clock'|'transports'|'maritime'>;
// At the web normal rate (3 seconds/day), 40 ticks = one displayed second.
// Unlike desktop unscaledTime, pause freezes and fast-forward speeds this up.
export const DEPLOYMENT_TICKS_PER_SECOND=40;
const atWar=(w:World,id:string)=>w.nations.some(n=>n.id!==id&&nationsAtWar(w,id,n.id));
/** Native TryGetIdleDeploymentTarget 0x41CB40: occupier must match; land
 * ownership is required only in peace. No native siege/legal-title filter.
 * The web adapter maps current land ownership to province.controller. */
export const usablePort45=(w:World,p:Port,id:string,war:boolean)=>{const land=w.provinces.find(v=>v.id===p.provinceId);return !!land&&(war||land.controller===id);};
/** Native UpdateIdle 0x426EC0: forward base is a fallback preference, then
 * receives the ordinary 1.35 weight. It is not a forced destination. */
export const preferredPort45=(assigned:string|null,current:string|null,forward:string|null,war:boolean)=>assigned??current??(war?forward:null);
// Web economy adapter: occupation of a harbor cannot fabricate local grain.
const supplyPort=(r:Input,p:Port,id:string)=>{const land=r.world.provinces.find(v=>v.id===p.provinceId),stock=r.world.statecraft?.provinces.find(v=>v.provinceId===p.provinceId);return !!land&&land.controller===id&&land.legalOwner===id&&!underSiege(r.world,land.id)&&!!stock&&stock.grain>stock.population*10;};
const hash=(text:string)=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
function random(s:NavalDeployment45){if(!Number.isSafeInteger(s.draws+1))throw Error('舰队调度随机序列已满。');s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.draws++;return ((t^(t>>>14))>>>0)/4294967296;}
function revise(s:NavalDeployment45){if(!Number.isSafeInteger(s.revision+1))throw Error('舰队调度记录已满。');s.revision++;}
const blank=(r:Input,f:Fleet,home:string|null):NavalAssignment45=>({homePortId:home,assignedPortId:null,nextTick:r.clock.tick,lastWar:atWar(r.world,f.nationId),loiterNode:null,loiterUntil:r.clock.tick,returning:false,decision:'waiting',decidedTick:r.clock.tick});
export function initialDeployment45(r:Input,copy=true):NavalDeployment45{return {version:1,schedule:'web-sim-ticks-v1',revision:0,rng:hash(`${r.world.custom!.seed}/naval45/${r.clock.tick}`),draws:0,fleets:Object.fromEntries(r.navy.fleets.map(f=>[f.id,blank(r,f,copy?null:f.dockId)]))};}
function busyReason(r:Input,v:Voyages,f:Fleet):NavalAssignment45['decision']|null{
 if(f.status==='lost')return 'lost';
 if(r.transports.cargo.some(c=>c.fleetId===f.id)||Object.values(v.missions).some(m=>m.fleetId===f.id))return 'mission';
 if(r.maritime.contacts.some(c=>c.a===f.id||c.b===f.id)||(r.maritime.retreating[f.id]??0)>r.clock.tick)return 'engaged';
 if(v.manualFleets.includes(f.id))return 'manual';if(!f.patrol)return 'disabled';return null;
}
/** Maintenance never changes a ship's position, orders, cargo or economy. */
export function reconcileDeployment45(r:Input,v:Voyages,s:NavalDeployment45){
 const live=new Set(r.navy.fleets.map(f=>f.id));for(const id of Object.keys(s.fleets))if(!live.has(id)){delete s.fleets[id];revise(s);}
 for(const f of r.navy.fleets){let a=s.fleets[f.id];if(!a){a=s.fleets[f.id]=blank(r,f,f.dockId);revise(s);}
  if(a.loiterNode!==null&&(f.route.length?f.route.at(-1)!==a.loiterNode:f.node!==a.loiterNode)){a.loiterNode=null;a.loiterUntil=r.clock.tick;if(a.decision==='loiter')a.decision=a.assignedPortId?'assigned':'waiting';revise(s);}
  const reason=busyReason(r,v,f);if(reason&&(a.decision!==reason||a.assignedPortId!==null)){a.decision=reason;a.assignedPortId=null;a.loiterNode=null;a.returning=a.returning&&f.status==='sailing'&&f.targetId===null&&f.route.length===1;a.decidedTick=r.clock.tick;revise(s);}}
}
/** Called after transport scheduling, on a private session draft. Native port
 * choice feeds the SAME saved sea-node route used by renderer and movement. */
export function advanceDeployment45(r:Input,v:Voyages,s:NavalDeployment45,g:SeaGraph,reserved:(id:string)=>boolean=()=>false,portAccess:(id:string,nation:string)=>boolean=()=>true,forwardBase:(id:string)=>string|null=()=>null){
 reconcileDeployment45(r,v,s);peaceDeployment45(r,v,s);if(r.clock.tick%12!==0)return;
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(busyReason(r,v,f)||reserved(f.id))continue;
  const war=atWar(r.world,f.nationId),changed=war!==a.lastWar;
  if(changed){a.lastWar=war;a.nextTick=0;revise(s);}
  const assigned=g.ports.find(p=>p.id===a.assignedPortId);
  if(a.assignedPortId&&(!assigned||!(usablePort45(r.world,assigned,f.nationId,war)&&portAccess(assigned.provinceId,f.nationId)))){a.assignedPortId=null;a.loiterNode=null;a.nextTick=0;a.loiterUntil=r.clock.tick;a.returning=true;a.decision='returning';stopAtNextNode(f);revise(s);}
  // Lost autonomous destinations finish only the already-entered physical edge.
  // Busy player orders/cargo/combat were excluded above and are never changed.
  if(f.route.length||f.status==='sailing')continue;
  if(f.food<f.crew*30){resupply(r,f,a,s,g,portAccess);continue;}
  if(a.loiterNode!==null){a.loiterNode=null;a.loiterUntil=r.clock.tick+Math.ceil(loiterDelay45(war,()=>random(s))*DEPLOYMENT_TICKS_PER_SECOND);revise(s);}
  if(r.clock.tick<a.loiterUntil)continue;
  if(a.assignedPortId&&r.clock.tick<a.nextTick){loiter(r,f,a,s,g,war);continue;}
  if(!a.assignedPortId&&r.clock.tick<a.nextTick&&!changed)continue;
  const component=g.nodes.get(f.node)?.component;
  const candidates=g.ports.filter(p=>usablePort45(r.world,p,f.nationId,war)&&portAccess(p.provinceId,f.nationId)&&g.nodes.get(p.node)?.component===component);
  const current=candidates.find(p=>inHarbor45(g,p.id,f))?.id??null,base=candidates.find(p=>p.provinceId===forwardBase(f.id))?.id??null,preferred=preferredPort45(a.assignedPortId,current,base,war);
  const own=r.navy.fleets.filter(n=>n.nationId===f.nationId&&n.status!=='lost');
  const weighted=nativeIdlePortWeights(candidates.map(p=>({id:p.id,present:own.filter(n=>inHarbor45(g,p.id,n)).length,assigned:own.filter(n=>s.fleets[n.id]?.assignedPortId===p.id&&!busyReason(r,v,n)).length})),war,preferred,current,a.homePortId);
  const selected=nativeChooseIdlePort(weighted,()=>random(s));
  a.nextTick=r.clock.tick+Math.ceil(nativeIdleDelay(war,()=>random(s))*DEPLOYMENT_TICKS_PER_SECOND);a.decidedTick=r.clock.tick;revise(s);
  if(!selected){a.assignedPortId=null;a.decision='no-port';continue;}
  const port=candidates.find(p=>p.id===selected.id)!,route=seaRoute(g,f.node,port.node);
  if(!route){a.assignedPortId=null;a.decision='no-port';continue;}
  const days=Math.ceil(routeDistance(g,route)/NAVAL_SPEED);
  // Web supply guard: do not send a starving ship on a new patrol. No food is
  // fabricated, and occupied foreign ports remain unable to supply the fleet.
  if(route.length>1&&f.food<f.crew*(days+3)){a.assignedPortId=null;a.decision='no-supply';continue;}
  a.assignedPortId=port.id;a.decision='assigned';a.returning=false;
  if(route.length>1){f.route=route.slice(1);f.progress=0;f.dockId=null;f.targetId=port.id;f.status='sailing';}
  else {const land=r.world.provinces.find(p=>p.id===port.provinceId)!;f.dockId=land.controller===f.nationId&&land.legalOwner===f.nationId&&!underSiege(r.world,land.id)?port.id:null;f.targetId=null;f.status=f.dockId?'docked':'anchored';}
 }
}
export function resumeDeployment45(r:Input,v:Voyages,s:NavalDeployment45,id:string){
 const f=r.navy.fleets.find(f=>f.id===id);if(!f||f.status==='lost')throw Error('舰队不存在或已损失。');
 const reason=busyReason(r,v,f);if(f.route.length||f.status==='sailing'||reason==='mission'||reason==='engaged')throw Error('请先完成航行、运输或交战，再交回港口部署。');
 v.manualFleets=v.manualFleets.filter(x=>x!==id);v.revision++;f.patrol=true;s.fleets[id]={...s.fleets[id],assignedPortId:null,nextTick:r.clock.tick,loiterNode:null,loiterUntil:r.clock.tick,returning:false,decision:'waiting',decidedTick:r.clock.tick};revise(s);
}
const stateKeys=['version','schedule','revision','rng','draws','fleets'],assignmentKeys=['homePortId','assignedPortId','nextTick','lastWar','decision','decidedTick','loiterNode','loiterUntil','returning'];
const decisions=['loiter','returning','resupply','waiting','assigned','manual','mission','engaged','no-port','no-supply','disabled','lost'];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertDeploymentSchema45(v:unknown){const s=v as NavalDeployment45|undefined;if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||s?.schedule!=null&&s.schedule!=='web-sim-ticks-v1'||record(s?.fleets)&&Object.values(s.fleets).some(a=>unknown(a,assignmentKeys)||a?.decision!=null&&!decisions.includes(a.decision)))throw Error('舰队部署含未来规则或未知字段，已锁定读写。');}
export function assertDeployment45(s:NavalDeployment45,r:Pick<Input,'clock'|'navy'|'world'>){
 assertDeploymentSchema45(s);const fail=()=>{throw Error('舰队部署记录损坏，已保留原档。');};const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||s.schedule!=='web-sim-ticks-v1'||!int(s.revision)||!int(s.rng,0,4294967295)||!int(s.draws)||!record(s.fleets)||Object.keys(s.fleets).length!==r.navy.fleets.length)return fail();
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(!record(a)||Object.keys(a).length!==assignmentKeys.length||!int(a.nextTick,0,r.clock.tick+1280)||!int(a.decidedTick,0,r.clock.tick)||!int(a.loiterUntil,0,r.clock.tick+136)||typeof a.returning!=='boolean'||(a.loiterNode!==null&&!int(a.loiterNode))||typeof a.lastWar!=='boolean'||!decisions.includes(a.decision)||(a.decision==='assigned'||a.decision==='loiter')&&a.assignedPortId===null)return fail();for(const p of [a.homePortId,a.assignedPortId])if(p!==null&&(typeof p!=='string'||!/^port-.+-\d+$/.test(p)||!r.world.provinces.some(v=>p.startsWith(`port-${v.id}-`))))return fail();}
}
export function assertDeploymentPorts45(s:NavalDeployment45,g:SeaGraph){const ids=new Set(g.ports.map(p=>p.id));for(const a of Object.values(s.fleets))for(const id of [a.homePortId,a.assignedPortId])if(id!==null&&!ids.has(id))throw Error('舰队部署港口不存在，已保留原档。');}

function stopAtNextNode(f:Fleet){if(!f.route.length)return;if(f.progress>0){f.route=f.route.slice(0,1);f.targetId=null;}else{f.route=[];f.progress=0;f.targetId=null;f.dockId=null;f.status='anchored';}}
/** Below half-rations, reserve no new foreign deployment. Choose the shortest
 * REAL reachable route to a controlled home port with surplus grain, leaving
 * three days' reserve. Daily navy settlement alone transfers/debits that grain.
 * This is a web supply policy, not a claimed reconstruction of native rations. */
function resupply(r:Input,f:Fleet,a:NavalAssignment45,s:NavalDeployment45,g:SeaGraph,access:(id:string,nation:string)=>boolean){
 const choices=g.ports.filter(p=>access(p.provinceId,f.nationId)&&supplyPort(r,p,f.nationId)).flatMap(port=>{const route=seaRoute(g,f.node,port.node);if(!route)return [];const distance=routeDistance(g,route);return [{port,route,distance}];}).filter(c=>c.route.length===1||f.food>=f.crew*(Math.ceil(c.distance/NAVAL_SPEED)+3)).sort((a,b)=>a.distance-b.distance||a.port.id.localeCompare(b.port.id));
 const best=choices[0];a.loiterNode=null;a.loiterUntil=r.clock.tick;a.returning=false;a.decidedTick=r.clock.tick;a.nextTick=r.clock.tick;revise(s);
 if(!best){a.assignedPortId=null;a.decision='no-supply';return;}
 a.assignedPortId=best.port.id;a.decision='resupply';
 if(best.route.length>1){f.route=best.route.slice(1);f.progress=0;f.dockId=null;f.targetId=best.port.id;f.status='sailing';}
 else{f.dockId=best.port.id;f.targetId=null;f.status='docked';}
}

/** Native war-to-peace resets attack/idle targets. Preserve an already-travelled
 * edge until its next wet center (web adapter), never teleport or finish the
 * entire obsolete attack route. Player orders, cargo and battle remain prior. */
export function peaceDeployment45(r:Input,v:Voyages,s:NavalDeployment45){
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(!a)continue;
  // Attack/transport reservation must not hide the war transition from idle
  // deployment; these fleets also need a return after their final war ends.
  if(atWar(r.world,f.nationId)){if(!a.lastWar){a.lastWar=true;a.nextTick=0;revise(s);}continue;}
  if(!a.lastWar||busyReason(r,v,f))continue;
  a.lastWar=false;a.assignedPortId=null;a.loiterNode=null;a.loiterUntil=r.clock.tick;a.returning=true;a.decision='returning';a.decidedTick=r.clock.tick;
  a.nextTick=r.clock.tick+Math.ceil((1+3*random(s))*DEPLOYMENT_TICKS_PER_SECOND);
  if(f.route.length){if(f.progress>0){f.route=f.route.slice(0,1);f.targetId=null;}else{f.route=[];f.progress=0;f.targetId=null;f.dockId=null;f.status='anchored';}}
  revise(s);
 }
}
function loiter(r:Input,f:Fleet,a:NavalAssignment45,s:NavalDeployment45,g:SeaGraph,war:boolean){
 const port=g.ports.find(p=>p.id===a.assignedPortId);if(!port)return;
 // A ship outside its harbor goes back via the ordinary connected sea route.
 let route:number[]|null;
 if(!inHarbor45(g,port.id,f))route=seaRoute(g,f.node,port.node);
 else {
  // Web supplies are still physical daily dock debits. Below half-rations,
  // return to the real dock and wait for its next daily settlement.
  const resupply=f.food<f.crew*30;
  if(resupply&&f.node===port.node){a.decision='assigned';return;}
  const choices=[...harborCells45(g,port.id)].filter(id=>id!==f.node);
  const target=resupply?port.node:choices[Math.min(choices.length-1,Math.floor(random(s)*choices.length))];
  if(target===undefined){a.loiterUntil=r.clock.tick+120;return;}
  route=harborRoute45(g,port.id,f.node,target);
 }
 if(!route||route.length<2)return;
 const days=Math.ceil(routeDistance(g,route)/NAVAL_SPEED);
 if(f.food<f.crew*(days+3)){a.decision='no-supply';return;}
 f.route=route.slice(1);f.progress=0;f.dockId=null;f.targetId=port.id;f.status='sailing';
 a.loiterNode=route.at(-1)!;a.decision='loiter';a.decidedTick=r.clock.tick;revise(s);void war;
}
