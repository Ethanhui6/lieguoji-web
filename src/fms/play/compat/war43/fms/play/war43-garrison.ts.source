import type {ChronicleRun} from './chronicle-model';
import type {Voyages} from './voyage24-state';
import type {SeaGraph} from './sea-path';
import type {MilitaryAccess43} from './war43-access';
import {nationsAtWar} from './realtime-statecraft';
import {nativeChooseIdleArmy,nativeIdleArmyPools} from './native-war/army-deployment';
type Input=Pick<ChronicleRun,'world'|'clock'|'tactics'|'reorganization'|'battles'|'transports'>;
export type GarrisonAssignment43={provinceId:string|null;decision:'waiting'|'assigned'|'manual'|'busy'|'lost'|'rest'|'no-route';nextTick:number;lastWar:boolean};
export type Garrison43={version:1;revision:number;rng:number;draws:number;armies:Record<string,GarrisonAssignment43>};
const atWar=(r:Input,id:string)=>r.world.nations.some(n=>n.id!==id&&nationsAtWar(r.world,id,n.id));
const blank=(r:Input,id:string):GarrisonAssignment43=>({provinceId:null,decision:'waiting',nextTick:r.clock.tick,lastWar:atWar(r,id)});
export function initialGarrison43(r:Input):Garrison43{let rng=2166136261;for(const c of `${r.world.custom!.seed}/army43`)rng=Math.imul(rng^c.charCodeAt(0),16777619);return {version:1,revision:0,rng:rng>>>0,draws:0,armies:Object.fromEntries(r.world.armies.map(a=>[a.id,blank(r,a.nationId)]))};}
function revise(s:Garrison43){if(!Number.isSafeInteger(s.revision+1))throw Error('驻防记录已满。');s.revision++;}
function random(s:Garrison43){if(!Number.isSafeInteger(s.draws+1))throw Error('驻防随机序列已满。');s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.draws++;return ((t^(t>>>14))>>>0)/4294967296;}
function reserved(r:Input,v:Voyages,id:string){return !!r.battles.plans[id]||!!r.reorganization.active[id]||r.transports.cargo.some(c=>c.army.id===id)||Object.values(v.missions).some(m=>m.armyId===id);}
/** Bookkeeping only: never move, cancel an accepted order or synthesize food. */
export function reconcileGarrison43(r:Input,v:Voyages,s:Garrison43){
 const ids=new Set(r.world.armies.map(a=>a.id));for(const id of Object.keys(s.armies))if(!ids.has(id)){delete s.armies[id];revise(s);}
 for(const a of r.world.armies){let p=s.armies[a.id];if(!p){p=s.armies[a.id]=blank(r,a.nationId);revise(s);}
  const reason=a.status==='destroyed'?'lost':v.manualArmies.includes(a.id)?'manual':reserved(r,v,a.id)||a.status==='fighting'||a.status==='retreating'?'busy':null;
  if(reason&&(p.decision!==reason||p.provinceId!==null)){p.provinceId=null;p.decision=reason;revise(s);}
  if(p.provinceId&&!r.world.provinces.some(n=>n.id===p.provinceId&&n.controller===a.nationId)){p.provinceId=null;p.decision='waiting';p.nextTick=r.clock.tick;revise(s);}
 }
}
/** Daily fallback AFTER attack/rescue/transport decisions. Native Idle retains
 * a valid assignment. Web: real land adjacency + actual diplomatic passage;
 * no water crossing without the independent transport system. */
export function advanceGarrison43(r:Input,v:Voyages,s:Garrison43,g:SeaGraph,access:MilitaryAccess43,allied:(a:string,b:string)=>boolean){
 reconcileGarrison43(r,v,s);if(r.clock.tick%120!==0)return;
 const places=new Map(r.world.provinces.map(p=>[p.id,p])),coasts=new Set(g.ports.map(p=>p.provinceId));
 for(const a of r.world.armies){const p=s.armies[a.id];if(a.status!=='idle'||a.route.length||v.manualArmies.includes(a.id)||reserved(r,v,a.id))continue;
  const war=atWar(r,a.nationId);if(p.lastWar!==war){p.lastWar=war;if(!war){p.provinceId=null;p.nextTick=r.clock.tick;}revise(s);}
  if(places.get(a.provinceId)?.controller!==a.nationId)continue;
  if(a.supplies<35||a.morale<50||a.troops<=180){if(p.decision!=='rest'){p.decision='rest';revise(s);}continue;}
  if(r.world.armies.some(b=>b.status!=='destroyed'&&b.provinceId===a.provinceId&&nationsAtWar(r.world,a.nationId,b.nationId)))continue;
  if(r.clock.tick<p.nextTick)continue;
  const parent=new Map<string,string|null>([[a.provinceId,null]]),queue=[a.provinceId];
  for(let i=0;i<queue.length;i++)for(const id of places.get(queue[i])!.neighbors){const n=places.get(id);if(n&&!parent.has(id)&&access(r.world,a.nationId,n.controller)&&!r.world.armies.some(b=>b.status!=='destroyed'&&b.provinceId===id&&nationsAtWar(r.world,a.nationId,b.nationId))){parent.set(id,queue[i]);queue.push(id);}}
  if(!p.provinceId){
   const own=r.world.provinces.filter(n=>n.controller===a.nationId),capital=r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===a.nationId)?.capitalId),cp=capital?places.get(capital.provinceId):undefined;
   const area=new Set(cp?.controller===a.nationId?[cp.id,...cp.neighbors.filter(id=>places.get(id)?.controller===a.nationId)]:[]);
   const inputs=own.map(n=>{const neighbors=n.neighbors.map(id=>places.get(id)!);return {id:n.id,capitalArea:area.has(n.id),border:coasts.has(n.id)||neighbors.some(b=>b.controller!==a.nationId),land:true,coastal:coasts.has(n.id),allyNeighbor:neighbors.some(b=>b.controller!==a.nationId&&allied(a.nationId,b.controller)),foreignLandNeighbor:neighbors.some(b=>b.controller!==a.nationId),targeting:r.world.armies.filter(b=>b.status!=='destroyed'&&(b.route.at(-1)??s.armies[b.id]?.provinceId)===n.id).length};});
   const home=r.tactics.forces[a.id]?.homeId;
   // Native chooses before finding a path. Keep failed choices for a one-day
   // retry interval instead of silently filtering/reweighting its pools.
   p.provinceId=nativeChooseIdleArmy(nativeIdleArmyPools(inputs),own.some(n=>n.id===home)?home:null,own.map(n=>n.id),()=>random(s));revise(s);
  }
  if(!p.provinceId||!parent.has(p.provinceId)){p.decision='no-route';p.nextTick=r.clock.tick+120;revise(s);continue;}
  p.decision='assigned';p.nextTick=r.clock.tick;revise(s);
  if(p.provinceId===a.provinceId)continue;
  const route:string[]=[];for(let id:string|null=p.provinceId;id!==null;id=parent.get(id)??null)route.push(id);route.reverse();
  a.route=route.slice(1);a.originId=a.provinceId;a.progress=0;a.status='marching';
 }
}
export function resumeGarrison43(r:Input,v:Voyages,s:Garrison43,id:string){const a=r.world.armies.find(a=>a.id===id);if(!a||a.status!=='idle'||a.route.length||reserved(r,v,id))throw Error('请先完成行军、交战、运输或整编，再交回驻防。');v.manualArmies=v.manualArmies.filter(n=>n!==id);v.revision++;s.armies[id]=blank(r,a.nationId);revise(s);}
const rootKeys=['version','revision','rng','draws','armies'],itemKeys=['provinceId','decision','nextTick','lastWar'],decisions=['waiting','assigned','manual','busy','lost','rest','no-route'];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertGarrisonSchema43(v:unknown){const s=v as Garrison43|undefined;if(unknown(s,rootKeys)||s?.version!=null&&s.version!==1||record(s?.armies)&&Object.values(s.armies).some(a=>unknown(a,itemKeys)||a?.decision!=null&&!decisions.includes(a.decision)))throw Error('驻防记录含未来规则或未知字段，已锁定读写。');}
export function assertGarrison43(s:Garrison43,r:Input){assertGarrisonSchema43(s);const fail=()=>{throw Error('驻防记录损坏，已保留原档。');};const int=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
 if(!record(s)||Object.keys(s).length!==rootKeys.length||s.version!==1||!int(s.revision)||!int(s.rng,4294967295)||!int(s.draws)||!record(s.armies)||Object.keys(s.armies).length!==r.world.armies.length)return fail();
 for(const a of r.world.armies){const p=s.armies[a.id];if(!record(p)||Object.keys(p).length!==itemKeys.length||!decisions.includes(p.decision)||typeof p.lastWar!=='boolean'||!int(p.nextTick,r.clock.tick+120)||p.provinceId!==null&&(typeof p.provinceId!=='string'||!r.world.provinces.some(n=>n.id===p.provinceId))||p.decision==='assigned'&&p.provinceId===null)return fail();}
}
