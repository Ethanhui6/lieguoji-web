import type {World} from '../../sim/types';
import type {Fleet} from './navy';
import {NAVAL_SPEED} from './navy';
import {seaRoute,routeDistance,type SeaGraph,type Port} from './sea-path';
import {underSiege} from './occupation';
import {nationsAtWar} from './realtime-statecraft';
import type {Voyages} from './voyage24-state';
import type {ChronicleRun} from './chronicle-model';
import {nativeIdlePortWeights,nativeChooseIdlePort,nativeIdleDelay} from './native-war/naval-deployment';
export type NavalAssignment39={homePortId:string|null;assignedPortId:string|null;nextTick:number;lastWar:boolean;decision:'waiting'|'assigned'|'manual'|'mission'|'engaged'|'no-port'|'no-supply'|'disabled'|'lost';decidedTick:number};
export type NavalDeployment39={version:1;schedule:'web-sim-ticks-v1';revision:number;rng:number;draws:number;fleets:Record<string,NavalAssignment39>};
type Input=Pick<ChronicleRun,'world'|'navy'|'clock'|'transports'|'maritime'>;
// At the web normal rate (3 seconds/day), 40 ticks = one displayed second.
// Unlike desktop unscaledTime, pause freezes and fast-forward speeds this up.
export const DEPLOYMENT_TICKS_PER_SECOND=40;
const atWar=(w:World,id:string)=>w.nations.some(n=>n.id!==id&&nationsAtWar(w,id,n.id));
const usable=(w:World,p:Port,id:string,war:boolean)=>{const land=w.provinces.find(v=>v.id===p.provinceId);return !!land&&land.controller===id&&(war||land.legalOwner===id)&&!underSiege(w,land.id);};
const hash=(text:string)=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
function random(s:NavalDeployment39){if(!Number.isSafeInteger(s.draws+1))throw Error('舰队调度随机序列已满。');s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.draws++;return ((t^(t>>>14))>>>0)/4294967296;}
function revise(s:NavalDeployment39){if(!Number.isSafeInteger(s.revision+1))throw Error('舰队调度记录已满。');s.revision++;}
const blank=(r:Input,f:Fleet,home:string|null):NavalAssignment39=>({homePortId:home,assignedPortId:null,nextTick:r.clock.tick,lastWar:atWar(r.world,f.nationId),decision:'waiting',decidedTick:r.clock.tick});
export function initialDeployment39(r:Input,copy=true):NavalDeployment39{return {version:1,schedule:'web-sim-ticks-v1',revision:0,rng:hash(`${r.world.custom!.seed}/naval39/${r.clock.tick}`),draws:0,fleets:Object.fromEntries(r.navy.fleets.map(f=>[f.id,blank(r,f,copy?null:f.dockId)]))};}
function busyReason(r:Input,v:Voyages,f:Fleet):NavalAssignment39['decision']|null{
 if(f.status==='lost')return 'lost';
 if(r.transports.cargo.some(c=>c.fleetId===f.id)||Object.values(v.missions).some(m=>m.fleetId===f.id))return 'mission';
 if(r.maritime.contacts.some(c=>c.a===f.id||c.b===f.id)||(r.maritime.retreating[f.id]??0)>r.clock.tick)return 'engaged';
 if(v.manualFleets.includes(f.id))return 'manual';if(!f.patrol)return 'disabled';return null;
}
/** Maintenance never changes a ship's position, orders, cargo or economy. */
export function reconcileDeployment39(r:Input,v:Voyages,s:NavalDeployment39){
 const live=new Set(r.navy.fleets.map(f=>f.id));for(const id of Object.keys(s.fleets))if(!live.has(id)){delete s.fleets[id];revise(s);}
 for(const f of r.navy.fleets){let a=s.fleets[f.id];if(!a){a=s.fleets[f.id]=blank(r,f,f.dockId);revise(s);}const reason=busyReason(r,v,f);if(reason&&(a.decision!==reason||a.assignedPortId!==null)){a.decision=reason;a.assignedPortId=null;a.decidedTick=r.clock.tick;revise(s);}}
}
/** Called after transport scheduling, on a private session draft. Native port
 * choice feeds the SAME saved sea-node route used by renderer and movement. */
export function advanceDeployment39(r:Input,v:Voyages,s:NavalDeployment39,g:SeaGraph,reserved:(id:string)=>boolean=()=>false,portAccess:(id:string,nation:string)=>boolean=()=>true){
 reconcileDeployment39(r,v,s);if(r.clock.tick%12!==0)return;
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(busyReason(r,v,f)||reserved(f.id))continue;
  const war=atWar(r.world,f.nationId),changed=war!==a.lastWar;
  if(changed){a.lastWar=war;a.nextTick=0;revise(s);}
  const assigned=g.ports.find(p=>p.id===a.assignedPortId);
  if(a.assignedPortId&&(!assigned||!(usable(r.world,assigned,f.nationId,war)&&portAccess(assigned.provinceId,f.nationId)))){a.assignedPortId=null;a.nextTick=0;revise(s);}
  // Finish the current physical voyage. Never snap or overwrite an accepted
  // order; a lost destination is reevaluated at its actual arrival node.
  if(f.route.length||f.status==='sailing')continue;
  if(a.assignedPortId&&r.clock.tick<a.nextTick)continue;
  if(!a.assignedPortId&&r.clock.tick<a.nextTick&&!changed)continue;
  const component=g.nodes.get(f.node)?.component;
  const candidates=g.ports.filter(p=>usable(r.world,p,f.nationId,war)&&portAccess(p.provinceId,f.nationId)&&g.nodes.get(p.node)?.component===component);
  const current=candidates.find(p=>p.node===f.node)?.id??null,preferred=a.assignedPortId??current;
  const own=r.navy.fleets.filter(n=>n.nationId===f.nationId&&n.status!=='lost');
  const weighted=nativeIdlePortWeights(candidates.map(p=>({id:p.id,present:own.filter(n=>n.node===p.node).length,assigned:own.filter(n=>s.fleets[n.id]?.assignedPortId===p.id&&!busyReason(r,v,n)).length})),war,preferred,current,a.homePortId);
  const selected=nativeChooseIdlePort(weighted,()=>random(s));
  a.nextTick=r.clock.tick+Math.ceil(nativeIdleDelay(war,()=>random(s))*DEPLOYMENT_TICKS_PER_SECOND);a.decidedTick=r.clock.tick;revise(s);
  if(!selected){a.assignedPortId=null;a.decision='no-port';continue;}
  const port=candidates.find(p=>p.id===selected.id)!,route=seaRoute(g,f.node,port.node);
  if(!route){a.assignedPortId=null;a.decision='no-port';continue;}
  const days=Math.ceil(routeDistance(g,route)/NAVAL_SPEED);
  // Web supply guard: do not send a starving ship on a new patrol. No food is
  // fabricated, and occupied foreign ports remain unable to supply the fleet.
  if(route.length>1&&f.food<f.crew*(days+3)){a.assignedPortId=null;a.decision='no-supply';continue;}
  a.assignedPortId=port.id;a.decision='assigned';
  if(route.length>1){f.route=route.slice(1);f.progress=0;f.dockId=null;f.targetId=port.id;f.status='sailing';}
  else {const land=r.world.provinces.find(p=>p.id===port.provinceId)!;f.dockId=land.legalOwner===f.nationId?port.id:null;f.targetId=null;f.status=f.dockId?'docked':'anchored';}
 }
}
export function resumeDeployment39(r:Input,v:Voyages,s:NavalDeployment39,id:string){
 const f=r.navy.fleets.find(f=>f.id===id);if(!f||f.status==='lost')throw Error('舰队不存在或已损失。');
 const reason=busyReason(r,v,f);if(f.route.length||f.status==='sailing'||reason==='mission'||reason==='engaged')throw Error('请先完成航行、运输或交战，再交回港口部署。');
 v.manualFleets=v.manualFleets.filter(x=>x!==id);v.revision++;f.patrol=true;s.fleets[id]={...s.fleets[id],assignedPortId:null,nextTick:r.clock.tick,decision:'waiting',decidedTick:r.clock.tick};revise(s);
}
const stateKeys=['version','schedule','revision','rng','draws','fleets'],assignmentKeys=['homePortId','assignedPortId','nextTick','lastWar','decision','decidedTick'];
const decisions=['waiting','assigned','manual','mission','engaged','no-port','no-supply','disabled','lost'];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertDeploymentSchema39(v:unknown){const s=v as NavalDeployment39|undefined;if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||s?.schedule!=null&&s.schedule!=='web-sim-ticks-v1'||record(s?.fleets)&&Object.values(s.fleets).some(a=>unknown(a,assignmentKeys)||a?.decision!=null&&!decisions.includes(a.decision)))throw Error('舰队部署含未来规则或未知字段，已锁定读写。');}
export function assertDeployment39(s:NavalDeployment39,r:Pick<Input,'clock'|'navy'|'world'>){
 assertDeploymentSchema39(s);const fail=()=>{throw Error('舰队部署记录损坏，已保留原档。');};const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||s.schedule!=='web-sim-ticks-v1'||!int(s.revision)||!int(s.rng,0,4294967295)||!int(s.draws)||!record(s.fleets)||Object.keys(s.fleets).length!==r.navy.fleets.length)return fail();
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(!record(a)||Object.keys(a).length!==assignmentKeys.length||!int(a.nextTick,0,r.clock.tick+1280)||!int(a.decidedTick,0,r.clock.tick)||typeof a.lastWar!=='boolean'||!decisions.includes(a.decision)||a.decision==='assigned'&&a.assignedPortId===null)return fail();for(const p of [a.homePortId,a.assignedPortId])if(p!==null&&(typeof p!=='string'||!/^port-.+-\d+$/.test(p)||!r.world.provinces.some(v=>p.startsWith(`port-${v.id}-`))))return fail();}
}
export function assertDeploymentPorts39(s:NavalDeployment39,g:SeaGraph){const ids=new Set(g.ports.map(p=>p.id));for(const a of Object.values(s.fleets))for(const id of [a.homePortId,a.assignedPortId])if(id!==null&&!ids.has(id))throw Error('舰队部署港口不存在，已保留原档。');}
