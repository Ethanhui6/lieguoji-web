import type {LossSink} from './war27-losses';
import type {MaritimeRun,SeaContact} from './maritime';
import {transportBase,SEA_RANGE,SEA_ROUND} from './maritime';
import type {ExpeditionRun} from './transport';
import {fleetPosition,type Fleet} from './navy';
import type {SeaGraph} from './sea-path';
import {nationsAtWar} from './realtime-statecraft';
const event=(r:MaritimeRun,text:string,reason:string)=>{r.world={...r.world,events:[...r.world.events,{id:r.world.nextEventId,day:r.world.day,kind:'system',text,reason}],nextEventId:r.world.nextEventId+1};r.world.events=r.world.events.slice(-160);};
const alive=(f:Fleet)=>f.status!=='lost';
const close=(g:SeaGraph,a:Fleet,b:Fleet)=>{
  // Positions must share a wet triangle or the same wet edge; geographic
  // proximity across a headland never creates a combat connection.
  if(!(a.node===b.node||(a.route[0]===b.node&&b.route[0]===a.node)))return false;
  const p=fleetPosition(g,a),q=fleetPosition(g,b);return Math.hypot(p.x-q.x,p.y-q.y)<=SEA_RANGE;
};
function reconcileMaritime(r:MaritimeRun):MaritimeRun{
  const fs=new Map(r.navy.fleets.map(f=>[f.id,f]));
  return {...r,maritime:{version:1,hulls:Object.fromEntries(r.navy.fleets.map(f=>[f.id,alive(f)?r.maritime.hulls[f.id]??f.ships*100:0])),contacts:r.maritime.contacts.filter(c=>{const a=fs.get(c.a),b=fs.get(c.b);return a&&b&&alive(a)&&alive(b)&&nationsAtWar(r.world,a.nationId,b.nationId);}),retreating:Object.fromEntries(Object.entries(r.maritime.retreating).filter(([id,t])=>fs.has(id)&&alive(fs.get(id)!)&&t>r.clock.tick))}};
}
function contacts(r:MaritimeRun,g:SeaGraph):SeaContact[]{
  const fs=r.navy.fleets.filter(alive).sort((a,b)=>a.id.localeCompare(b.id)),out:SeaContact[]=[];
  for(let i=0;i<fs.length;i++)for(let j=i+1;j<fs.length;j++){const a=fs[i],b=fs[j];if(!nationsAtWar(r.world,a.nationId,b.nationId)||!close(g,a,b))continue;const old=r.maritime.contacts.find(c=>c.a===a.id&&c.b===b.id);out.push(old?{...old}:{a:a.id,b:b.id,started:r.clock.tick,pulse:r.clock.tick});}
  return out;
}
export function advanceTacticsSeaTick(run:MaritimeRun,g:SeaGraph,landStep:(r:ExpeditionRun,g:SeaGraph)=>ExpeditionRun,losses?:LossSink):MaritimeRun{
  const clean=reconcileMaritime(run),pairs=contacts(clean,g),held=new Set(pairs.flatMap(c=>[c.a,c.b]).filter(id=>!clean.maritime.retreating[id]));
  const base=transportBase(clean),old=new Map(base.navy.fleets.map(f=>[f.id,f]));
  // Freeze combat movement only inside this atomic tick. The ordinary kernel
  // still charges rations and runs land simulation. Restore real sea position
  // before validation; no temporary anchored/route combination can be saved.
  base.navy={...base.navy,fleets:base.navy.fleets.map(f=>held.has(f.id)?{...f,status:'anchored',patrol:false,dockId:null}:f)};
  const moved=landStep(base,g);
  moved.navy.fleets=moved.navy.fleets.map(f=>{const prev=old.get(f.id);return prev&&held.has(f.id)&&alive(f)?{...f,node:prev.node,route:prev.route,progress:prev.progress,dockId:prev.dockId,targetId:prev.targetId,status:prev.status,patrol:false}:f;});
  let n:MaritimeRun={...moved,version:8,rules:'fms-maritime-1',engine:__FMS_PLAY_ENGINE__,maritime:structuredClone(clean.maritime)};
  n=reconcileMaritime(n);n.maritime.contacts=contacts({...n,maritime:{...n.maritime,contacts:pairs}},g);
  for(const c of n.maritime.contacts)if(!clean.maritime.contacts.some(p=>p.a===c.a&&p.b===c.b))event(n,'舰队在海上接敌','敌对舰队在连通水域进入射程，持续交锋；撤离可继续航行，但脱离射程前仍会受损。');
  const sources=new Map<string,string[]>(),combatSunk=new Set<string>(),incoming=new Map<string,number>(),rounds=n.maritime.contacts.filter(c=>n.clock.tick-c.pulse>=SEA_ROUND);
  for(const c of rounds){c.pulse=n.clock.tick;for(const [a,b] of [[c.a,c.b],[c.b,c.a]]){const f=n.navy.fleets.find(f=>f.id===a)!;const targets=n.maritime.contacts.filter(c=>c.a===a||c.b===a).length;const damage=Math.max(1,Math.round(8*f.ships*(f.crew/(40*f.ships))/targets));incoming.set(b,(incoming.get(b)??0)+damage);sources.set(b,[...(sources.get(b)??[]),f.nationId]);}}
  for(const [id,damage] of incoming){const f=n.navy.fleets.find(f=>f.id===id)!;const crew=f.crew,before=n.maritime.hulls[id],after=Math.max(0,before-damage);n.maritime.hulls[id]=after;f.crew=Math.min(f.crew,Math.ceil(after/(f.ships*100)*f.ships*40));if(!after){f.crew=0;combatSunk.add(id);losses?.(f.nationId,'ships',f.ships,sources.get(id));f.status='lost';f.patrol=false;event(n,`${f.name}沉没`,'舰体在持续海战中耗尽；舰队与载军损失已同步结算。');}else event(n,`${f.name}中弹，舰体余 ${after}/${f.ships*100}`,`本轮实际舰体损失 ${before-after}；船员余 ${f.crew} 人。`);losses?.(f.nationId,'hull',before-after,sources.get(id));losses?.(f.nationId,'crew',crew-f.crew,sources.get(id));}
  // A carrier can sink between daily rations. Remove passengers immediately,
  // without charging a second day's supplies or creating a duplicate army.
  const lost=n.transports.cargo.filter(c=>n.navy.fleets.find(f=>f.id===c.fleetId)?.status==='lost');
  if(lost.length){for(const c of lost)if(combatSunk.has(c.fleetId))losses?.(c.army.nationId,'cargo',c.army.troops,sources.get(c.fleetId));n.transports={...n.transports,cargo:n.transports.cargo.filter(c=>!lost.includes(c))};n.world={...n.world,armies:[...n.world.armies,...lost.map(c=>({...c.army,troops:0,morale:0,status:'destroyed' as const}))]};n.units={...n.units,...Object.fromEntries(lost.map(c=>[c.army.id,c.unit]))};for(const c of lost)event(n,`${c.army.name}随运输舰损失`,'承载舰队沉没；军团已记为损失，不会在出发地重新出现。');}
  return reconcileMaritime(n);
}
