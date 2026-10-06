import type {FmsRun} from './world';
import {transportFingerprint} from './military-registry';
import {advanceTransportTick} from './transport-runtime';
import {fleetPosition,NAVAL_SPEED,portName,type Fleet} from './navy';
import {seaRoute,routeDistance,type SeaGraph} from './sea-path';
import {nationsAtWar} from './realtime-statecraft';
import {underSiege} from './occupation';
import type {PlayVersion} from './session';

export type MaritimeRun=Extract<FmsRun,{version:8}>;
export type SeaContact={a:string;b:string;started:number;pulse:number};
export type MaritimeState={version:1;hulls:Record<string,number>;contacts:SeaContact[];retreating:Record<string,number>};
export type MaritimeAction={type:'raid'|'retreat';fleetId:string;portId:string};
// Web balance units: 100 hull per ship; a damage round every quarter day.
// Original sea-area targeting/timed damage is evidence, these are not Unity units.
export const SEA_ROUND=30,SEA_RANGE=5;
const event=(r:MaritimeRun,text:string,reason:string)=>{r.world={...r.world,events:[...r.world.events,{id:r.world.nextEventId,day:r.world.day,kind:'system',text,reason}],nextEventId:r.world.nextEventId+1};r.world.events=r.world.events.slice(-160);};
export function transportBase(r:MaritimeRun):Extract<FmsRun,{version:7}>{const {maritime,...base}=r;void maritime;return {...base,version:7,rules:'fms-transport-1',engine:transportFingerprint};}
export function withMaritime(r:Extract<FmsRun,{version:7}>,copy=false):MaritimeRun{
  const n=structuredClone(r);if(copy){n.id='fms-'+crypto.randomUUID();n.world.custom!.id=n.id;}
  return {...n,version:8,rules:'fms-maritime-1',engine:__FMS_PLAY_ENGINE__,maritime:{version:1,hulls:Object.fromEntries(n.navy.fleets.map(f=>[f.id,f.status==='lost'?0:f.ships*100])),contacts:[],retreating:{}}};
}
const alive=(f:Fleet)=>f.status!=='lost';
const close=(g:SeaGraph,a:Fleet,b:Fleet)=>{
  // Positions must share a wet triangle or the same wet edge; geographic
  // proximity across a headland never creates a combat connection.
  if(!(a.node===b.node||(a.route[0]===b.node&&b.route[0]===a.node)))return false;
  const p=fleetPosition(g,a),q=fleetPosition(g,b);return Math.hypot(p.x-q.x,p.y-q.y)<=SEA_RANGE;
};
export function reconcileMaritime(r:MaritimeRun):MaritimeRun{
  const fs=new Map(r.navy.fleets.map(f=>[f.id,f]));
  return {...r,maritime:{version:1,hulls:Object.fromEntries(r.navy.fleets.map(f=>[f.id,alive(f)?r.maritime.hulls[f.id]??f.ships*100:0])),contacts:r.maritime.contacts.filter(c=>{const a=fs.get(c.a),b=fs.get(c.b);return a&&b&&alive(a)&&alive(b)&&nationsAtWar(r.world,a.nationId,b.nationId);}),retreating:Object.fromEntries(Object.entries(r.maritime.retreating).filter(([id,t])=>fs.has(id)&&alive(fs.get(id)!)&&t>r.clock.tick))}};
}
function contacts(r:MaritimeRun,g:SeaGraph):SeaContact[]{
  const fs=r.navy.fleets.filter(alive).sort((a,b)=>a.id.localeCompare(b.id)),out:SeaContact[]=[];
  for(let i=0;i<fs.length;i++)for(let j=i+1;j<fs.length;j++){const a=fs[i],b=fs[j];if(!nationsAtWar(r.world,a.nationId,b.nationId)||!close(g,a,b))continue;const old=r.maritime.contacts.find(c=>c.a===a.id&&c.b===b.id);out.push(old?{...old}:{a:a.id,b:b.id,started:r.clock.tick,pulse:r.clock.tick});}
  return out;
}
export function advanceMaritimeTick(run:MaritimeRun,g:SeaGraph):MaritimeRun{
  const clean=reconcileMaritime(run),pairs=contacts(clean,g),held=new Set(pairs.flatMap(c=>[c.a,c.b]).filter(id=>!clean.maritime.retreating[id]));
  const base=transportBase(clean),old=new Map(base.navy.fleets.map(f=>[f.id,f]));
  // Freeze combat movement only inside this atomic tick. The ordinary kernel
  // still charges rations and runs land simulation. Restore real sea position
  // before validation; no temporary anchored/route combination can be saved.
  base.navy={...base.navy,fleets:base.navy.fleets.map(f=>held.has(f.id)?{...f,status:'anchored',patrol:false,dockId:null}:f)};
  const moved=advanceTransportTick(base,g);
  moved.navy.fleets=moved.navy.fleets.map(f=>{const prev=old.get(f.id);return prev&&held.has(f.id)&&alive(f)?{...f,node:prev.node,route:prev.route,progress:prev.progress,dockId:prev.dockId,targetId:prev.targetId,status:prev.status,patrol:false}:f;});
  let n:MaritimeRun={...moved,version:8,rules:'fms-maritime-1',engine:__FMS_PLAY_ENGINE__,maritime:structuredClone(clean.maritime)};
  n=reconcileMaritime(n);n.maritime.contacts=contacts({...n,maritime:{...n.maritime,contacts:pairs}},g);
  for(const c of n.maritime.contacts)if(!clean.maritime.contacts.some(p=>p.a===c.a&&p.b===c.b))event(n,'舰队在海上接敌','敌对舰队在连通水域进入射程，持续交锋；撤离可继续航行，但脱离射程前仍会受损。');
  const incoming=new Map<string,number>(),rounds=n.maritime.contacts.filter(c=>n.clock.tick-c.pulse>=SEA_ROUND);
  for(const c of rounds){c.pulse=n.clock.tick;for(const [a,b] of [[c.a,c.b],[c.b,c.a]]){const f=n.navy.fleets.find(f=>f.id===a)!;const targets=n.maritime.contacts.filter(c=>c.a===a||c.b===a).length;const damage=Math.max(1,Math.round(8*f.ships*(f.crew/(40*f.ships))/targets));incoming.set(b,(incoming.get(b)??0)+damage);}}
  for(const [id,damage] of incoming){const f=n.navy.fleets.find(f=>f.id===id)!;const before=n.maritime.hulls[id],after=Math.max(0,before-damage);n.maritime.hulls[id]=after;f.crew=Math.min(f.crew,Math.ceil(after/(f.ships*100)*f.ships*40));if(!after){f.crew=0;f.status='lost';f.patrol=false;event(n,`${f.name}沉没`,'舰体在持续海战中耗尽；舰队与载军损失已同步结算。');}else event(n,`${f.name}中弹，舰体余 ${after}/${f.ships*100}`,`本轮实际舰体损失 ${before-after}；船员余 ${f.crew} 人。`);}
  // A carrier can sink between daily rations. Remove passengers immediately,
  // without charging a second day's supplies or creating a duplicate army.
  const lost=n.transports.cargo.filter(c=>n.navy.fleets.find(f=>f.id===c.fleetId)?.status==='lost');
  if(lost.length){n.transports={...n.transports,cargo:n.transports.cargo.filter(c=>!lost.includes(c))};n.world={...n.world,armies:[...n.world.armies,...lost.map(c=>({...c.army,troops:0,morale:0,status:'destroyed' as const}))]};n.units={...n.units,...Object.fromEntries(lost.map(c=>[c.army.id,c.unit]))};for(const c of lost)event(n,`${c.army.name}随运输舰损失`,'承载舰队沉没；军团已记为损失，不会在出发地重新出现。');}
  return reconcileMaritime(n);
}
export function previewMaritime(r:MaritimeRun,g:SeaGraph,a:MaritimeAction){
  const reject=(reason:string)=>({valid:false,reason,details:[] as string[],route:[] as number[],progress:0,node:0,days:0});
  if(!a||!['raid','retreat'].includes(a.type))return reject('海军命令无效。');
  const f=r.navy.fleets.find(f=>f.id===a.fleetId&&alive(f)),p=g.ports.find(p=>p.id===a.portId);if(!f||!p)return reject('舰队或目的海岸已不存在。');
  const province=r.world.provinces.find(v=>v.id===p.provinceId)!;
  if(a.type==='retreat'?(province.controller!==f.nationId||province.legalOwner!==f.nationId||underSiege(r.world,province.id)):!nationsAtWar(r.world,f.nationId,province.controller))return reject(a.type==='retreat'?'撤离目的地必须是未被围攻的本国港口。':'只能驶向当前交战国家的海岸，和平国家不开放军事通行。');
  const candidates:{route:number[];node:number;progress:number;distance:number}[]=[];
  if(!f.route.length||f.progress===0){const route=seaRoute(g,f.node,p.node);if(route)candidates.push({route,node:f.node,progress:0,distance:routeDistance(g,route)});}
  else {const next=f.route[0],length=g.nodes.get(f.node)!.links.find(l=>l.to===next)!.distance;
    const forward=seaRoute(g,next,p.node);if(forward&&!forward.includes(f.node)){const route=[f.node,...forward];candidates.push({route,node:f.node,progress:f.progress,distance:routeDistance(g,route)-f.progress});}
    const reverse=seaRoute(g,f.node,p.node);if(reverse&&!reverse.includes(next)){const route=[next,...reverse];candidates.push({route,node:next,progress:length-f.progress,distance:routeDistance(g,route)-(length-f.progress)});}
  }
  const best=candidates.sort((a,b)=>a.distance-b.distance)[0];if(!best)return reject('两地水域不连通，没有可行海路。');
  const days=Math.max(1,Math.ceil(best.distance/NAVAL_SPEED));if(f.food<f.crew*(days+3))return reject(`舰队余粮不足：航路约 ${days} 日，另需三日储备。`);
  return {valid:true,reason:`${a.type==='retreat'?'脱离交锋，返回':'驶向敌岸'}${portName(r.world,p)}。`,details:[`真实海路 ${Math.round(best.distance)} 单位，预计 ${days} 日；保留当前位置。`,'海战持续扣除舰体和船员，沉没时载军一并损失。撤离期间仍会受袭；抵岸后登陆需另行确认。'],...best,days};
}
export function applyMaritime(r:MaritimeRun,g:SeaGraph,a:MaritimeAction,expected:PlayVersion):MaritimeRun{
  if(expected.day!==r.world.day||expected.nextEventId!==r.world.nextEventId||expected.tick!==r.clock.tick)throw Error('模拟时刻已变化，请重新预览。');
  const p=previewMaritime(r,g,a);if(!p.valid)throw Error(p.reason);const n=structuredClone(r),f=n.navy.fleets.find(f=>f.id===a.fleetId)!;
  Object.assign(f,{node:p.node,route:p.route.slice(1),progress:p.progress,dockId:null,targetId:a.portId,status:'sailing',patrol:false});
  const cargo=n.transports.cargo.find(c=>c.fleetId===f.id);if(cargo)cargo.targetPortId=a.portId;
  if(a.type==='retreat')n.maritime.retreating[f.id]=n.clock.tick+120;else delete n.maritime.retreating[f.id];event(n,p.reason,p.details.join(' '));return n;
}
export function assertMaritime(value:unknown,r:MaritimeRun):asserts value is MaritimeState{
  const m=value as MaritimeState,exact=(o:object,ks:string[])=>!!o&&typeof o==='object'&&Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k));
  const fail=()=>{throw Error('海战数据或舰队引用损坏，已保留原档。');};
  if(!exact(m,['version','hulls','contacts','retreating'])||m.version!==1||!m.hulls||!m.retreating||Array.isArray(m.hulls)||Array.isArray(m.retreating)||!Array.isArray(m.contacts)||m.contacts.length>19900)fail();
  if(Object.keys(m.hulls).length!==r.navy.fleets.length)fail();
  for(const f of r.navy.fleets){const h=m.hulls[f.id];if(!Number.isInteger(h)||h<0||h>f.ships*100||(h===0)!==(f.status==='lost'))fail();}
  const seen=new Set<string>();for(const c of m.contacts){const a=r.navy.fleets.find(f=>f.id===c.a),b=r.navy.fleets.find(f=>f.id===c.b),key=c.a+'/'+c.b;if(!exact(c,['a','b','started','pulse'])||!a||!b||a.id.localeCompare(b.id)>=0||!alive(a)||!alive(b)||!nationsAtWar(r.world,a.nationId,b.nationId)||seen.has(key)||!Number.isSafeInteger(c.started)||!Number.isSafeInteger(c.pulse)||c.started<0||c.pulse<c.started||c.pulse>r.clock.tick)fail();seen.add(key);}
  for(const [id,t] of Object.entries(m.retreating))if(!r.navy.fleets.some(f=>f.id===id&&alive(f))||!Number.isSafeInteger(t)||t<=r.clock.tick||t>r.clock.tick+120)fail();
}
