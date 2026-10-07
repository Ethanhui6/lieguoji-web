import type {ChronicleRun} from './chronicle-model';
import type {Voyages} from './voyage24-state';
import {nationsAtWar} from './realtime-statecraft';
import {seaRoute,routeDistance,type SeaGraph} from './sea-path';
import {NAVAL_SPEED} from './navy';
import {nativePortAttack,nativePortRecovery,nativePortTarget,nativeBestPort,type NativePortControl} from './native-war/port-occupation';
export type PortOrder39={targetId:string|null;forwardBaseId:string|null;active:boolean;lastWar:boolean;nextTick:number};
export type Ports39={version:1;revision:number;ports:Record<string,NativePortControl>;fleets:Record<string,PortOrder39>};
type Input=Pick<ChronicleRun,'world'|'navy'|'clock'|'transports'|'maritime'>;
const revise=(s:Ports39)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('海港记录已满。');s.revision++;};
const war=(r:Input,id:string)=>r.world.nations.some(n=>n.id!==id&&nationsAtWar(r.world,id,n.id));
export function initialPorts39(r:Input,g:SeaGraph):Ports39{const s:Ports39={version:1,revision:0,ports:{},fleets:{}};reconcilePorts39(r,s,g);s.revision=0;return s;}
export const portAvailable39=(s:Ports39,id:string,nation:string)=>s.ports[id]?.occupierId===nation;
const event=(r:Input,text:string,reason:string)=>{r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'system',text,reason});r.world.events=r.world.events.slice(-160);};
export function reconcilePorts39(r:Input,s:Ports39,g:SeaGraph){
 const ids=new Set(g.ports.map(p=>p.provinceId));for(const id of Object.keys(s.ports))if(!ids.has(id)){delete s.ports[id];revise(s);}
 for(const id of ids){const land=r.world.provinces.find(p=>p.id===id)!;if(!s.ports[id]){s.ports[id]={landOwnerId:land.controller,occupierId:land.controller,value:100};revise(s);}else if(s.ports[id].landOwnerId!==land.controller){Object.assign(s.ports[id],{landOwnerId:land.controller,occupierId:land.controller,value:100});revise(s);}}
 const fleets=new Set(r.navy.fleets.map(f=>f.id));for(const id of Object.keys(s.fleets))if(!fleets.has(id)){delete s.fleets[id];revise(s);}
 for(const f of r.navy.fleets){if(!s.fleets[f.id]){s.fleets[f.id]={targetId:null,forwardBaseId:null,active:false,lastWar:war(r,f.nationId),nextTick:r.clock.tick};revise(s);}const a=s.fleets[f.id];
  if(a.forwardBaseId&&s.ports[a.forwardBaseId]?.occupierId!==f.nationId){a.forwardBaseId=null;revise(s);}
  if(a.targetId&&(!s.ports[a.targetId]||!nativePortTarget(s.ports[a.targetId],f.nationId,id=>nationsAtWar(r.world,f.nationId,id)))){a.targetId=null;revise(s);}
 }
 // Control is immediately consumed by docking, daily provisioning and builds.
 for(const f of r.navy.fleets){const p=g.ports.find(p=>p.id===f.dockId);if(p&&!portAvailable39(s,p.provinceId,f.nationId)){f.dockId=null;if(f.status==='docked')f.status='anchored';}}
}
const occupied=(r:Input,v:Voyages,id:string)=>r.transports.cargo.some(c=>c.fleetId===id)||Object.values(v.missions).some(m=>m.fleetId===id);
const engaged=(r:Input,id:string)=>r.maritime.contacts.some(c=>c.a===id||c.b===id)||(r.maritime.retreating[id]??0)>r.clock.tick;
export function previewPortAssault39(r:Input,s:Ports39,v:Voyages,g:SeaGraph,id:string){
 const f=r.navy.fleets.find(f=>f.id===id),fail=(reason:string)=>({valid:false,reason,details:[] as string[],portId:null as string|null,route:[] as number[]});
 if(!f||f.status==='lost')return fail('舰队不存在或已损失。');if(f.route.length||occupied(r,v,id)||engaged(r,id))return fail('请先完成当前航行、运输或交战。');
 const node=g.nodes.get(f.node)!,enemy=(id:string)=>nationsAtWar(r.world,f.nationId,id);
 const best=nativeBestPort(g.ports.filter(p=>g.nodes.get(p.node)?.component===node.component&&s.ports[p.provinceId]).map(p=>({port:p,control:s.ports[p.provinceId],distance:Math.hypot(g.nodes.get(p.node)!.center.x-node.center.x,g.nodes.get(p.node)!.center.y-node.center.y)})),f.nationId,enemy);
 if(!best)return fail('同一海域没有可以夺回或进攻的敌方海港。');const route=seaRoute(g,f.node,best.port.node);if(!route)return fail('没有连通的实际海路。');
 const days=Math.ceil(routeDistance(g,route)/NAVAL_SPEED);if(f.food<f.crew*(days+3))return fail('余粮不足以完成航行并留三日储备。');
 const name=r.world.provinces.find(p=>p.id===best.port.provinceId)!.name;
 return {valid:true,reason:`${best.control.landOwnerId===f.nationId?'夺回':'进攻'}${name}海港`,details:[`实际海路约 ${days} 日；抵港后才开始争夺。`,'优先夺回本国海港，再选择同海域最近敌港。','夺港不改变城市和陆地归属；外域海港不会免费提供粮食。'],portId:best.port.id,route};
}
export function startPortAssault39(r:Input,s:Ports39,v:Voyages,g:SeaGraph,id:string){const p=previewPortAssault39(r,s,v,g,id);if(!p.valid)throw Error(p.reason);const f=r.navy.fleets.find(f=>f.id===id)!,port=g.ports.find(q=>q.id===p.portId)!;s.fleets[id].active=true;s.fleets[id].targetId=port.provinceId;s.fleets[id].nextTick=r.clock.tick+40;v.manualFleets=v.manualFleets.filter(x=>x!==id);v.revision++;f.patrol=true;revise(s);if(p.route.length>1){f.route=p.route.slice(1);f.progress=0;f.dockId=null;f.targetId=port.id;f.status='sailing';}event(r,p.reason,p.details.join(' '));}
export function cancelPortOrder39(s:Ports39,id:string){const a=s.fleets[id];if(a&&(a.active||a.targetId)){a.active=false;a.targetId=null;revise(s);}}
/** Native seconds mapped to 40 persisted ticks at normal web speed. Pause
 * freezes them. Presence is a single actual ocean anchor, not native portCells.
 * Combat/transport takes priority; no geography, army title or grain is forged. */
export function advancePorts39(r:Input,s:Ports39,v:Voyages,g:SeaGraph){
 reconcilePorts39(r,s,g);const before=JSON.stringify(s),dt=1/40;
 for(const [id,p]of Object.entries(s.ports)){const anchors=new Set(g.ports.filter(q=>q.provinceId===id).map(q=>q.node));const present=r.navy.fleets.filter(f=>f.status!=='lost'&&!f.route.length&&f.progress===0&&anchors.has(f.node));nativePortRecovery(p,p.landOwnerId,present.some(f=>f.nationId===p.occupierId),present.some(f=>f.nationId!==p.landOwnerId),dt);}
 for(const f of r.navy.fleets){const a=s.fleets[f.id],atWar=war(r,f.nationId);
  if(a.lastWar&&!atWar){a.active=false;a.targetId=null;a.forwardBaseId=null;a.nextTick=r.clock.tick+40;}a.lastWar=atWar;
  if(f.status==='lost'||occupied(r,v,f.id)||engaged(r,f.id)||f.route.length||f.progress>0)continue;
  for(const port of g.ports.filter(p=>p.node===f.node)){const p=s.ports[port.provinceId];if(!p)continue;
   // Idle ships can contest an enemy anchorage after a real raid, even if the
   // player retains command. Neutral presence never grants an attack.
   if(nativePortTarget(p,f.nationId,id=>nationsAtWar(r.world,f.nationId,id))&&nativePortAttack(p,f.nationId,(r.maritime.hulls[f.id]??f.ships*100)/(f.ships*100),dt,id=>nationsAtWar(r.world,f.nationId,id))){a.forwardBaseId=port.provinceId;a.targetId=null;a.nextTick=r.clock.tick+40;event(r,`${f.name}控制${r.world.provinces.find(q=>q.id===port.provinceId)!.name}海港`,'海港已成为前进据点，城市和陆地归属未变。撤舰后控制会衰退。');}
  }
  if(!a.active||!f.patrol||v.manualFleets.includes(f.id)||r.clock.tick<a.nextTick)continue;
  const target=a.targetId&&s.ports[a.targetId];if(target&&nativePortTarget(target,f.nationId,id=>nationsAtWar(r.world,f.nationId,id)))continue;
  const next=previewPortAssault39(r,s,v,g,f.id);a.nextTick=r.clock.tick+40;if(next.valid)startPortAssault39(r,s,v,g,f.id);else{a.active=false;a.targetId=null;}
 }
 if(JSON.stringify(s)!==before)revise(s);reconcilePorts39(r,s,g);
}
/** Called ONLY when live relation transitions from war to peace; another
 * still-active war keeps nationsAtWar true, so its occupied ports survive. */
export function settlePorts39(r:Input,s:Ports39,wasEnemies:(a:string,b:string)=>boolean){
 for(const p of Object.values(s.ports))if(p.occupierId!==p.landOwnerId&&wasEnemies(p.landOwnerId,p.occupierId)&&!nationsAtWar(r.world,p.landOwnerId,p.occupierId)){p.occupierId=p.landOwnerId;p.value=100;revise(s);}
 for(const f of r.navy.fleets){const a=s.fleets[f.id];if(a?.lastWar&&!war(r,f.nationId)){a.active=false;a.targetId=null;a.forwardBaseId=null;a.lastWar=false;a.nextTick=r.clock.tick+40;revise(s);}}
}
const keys=['version','revision','ports','fleets'],pk=['landOwnerId','occupierId','value'],fk=['targetId','forwardBaseId','active','lastWar','nextTick'];
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,k:string[])=>obj(v)&&Object.keys(v).some(x=>!k.includes(x));
export function assertPortsSchema39(v:unknown){const s=v as Ports39|undefined;if(unknown(s,keys)||s?.version!=null&&s.version!==1||obj(s?.ports)&&Object.values(s.ports).some(p=>unknown(p,pk))||obj(s?.fleets)&&Object.values(s.fleets).some(p=>unknown(p,fk)))throw Error('海港控制含未来规则或未知字段，已锁定读写。');}
export function assertPorts39(s:Ports39,r:Input,g?:SeaGraph){assertPortsSchema39(s);const fail=()=>{throw Error('海港控制记录损坏，已保留原档。');};const int=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;if(!obj(s)||Object.keys(s).length!==keys.length||s.version!==1||!int(s.revision)||!obj(s.ports)||!obj(s.fleets))return fail();
 const nations=new Set(r.world.nations.map(n=>n.id));for(const [id,p]of Object.entries(s.ports))if(!obj(p)||Object.keys(p).length!==pk.length||!r.world.provinces.some(v=>v.id===id&&v.controller===p.landOwnerId)||!nations.has(p.landOwnerId)||!nations.has(p.occupierId)||!Number.isFinite(p.value)||p.value<0||p.value>100)return fail();
 if(Object.keys(s.fleets).length!==r.navy.fleets.length)return fail();for(const f of r.navy.fleets){const a=s.fleets[f.id];if(!obj(a)||Object.keys(a).length!==fk.length||typeof a.active!=='boolean'||typeof a.lastWar!=='boolean'||!int(a.nextTick)||a.nextTick>r.clock.tick+40)return fail();for(const id of [a.targetId,a.forwardBaseId])if(id!==null&&(typeof id!=='string'||!s.ports[id]))return fail();}
 if(g){const ids=new Set(g.ports.map(p=>p.provinceId));if(ids.size!==Object.keys(s.ports).length||Object.keys(s.ports).some(id=>!ids.has(id)))return fail();}
}
