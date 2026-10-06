import {useState} from 'react';
import {type MaritimeRun,type MaritimeAction} from './maritime';
import {portName} from './navy';
import {nationsAtWar} from './realtime-statecraft';
import type {SeaGraph} from './sea-path';
export function MaritimePanel({run,graph,fleetId,busy,act}:{run:MaritimeRun;graph:SeaGraph;fleetId:string|null;busy:boolean;act:(a:MaritimeAction)=>void}){
  const [target,setTarget]=useState(''),[home,setHome]=useState('');const f=run.navy.fleets.find(f=>f.id===fleetId);if(!f)return null;
  const opponents=run.maritime.contacts.filter(c=>c.a===f.id||c.b===f.id).map(c=>run.navy.fleets.find(v=>v.id===(c.a===f.id?c.b:c.a))!),hull=run.maritime.hulls[f.id];
  const own=graph.ports.filter(p=>run.world.provinces.some(v=>v.id===p.provinceId&&v.controller===f.nationId&&v.legalOwner===f.nationId)),enemy=graph.ports.filter(p=>run.world.provinces.some(v=>v.id===p.provinceId&&nationsAtWar(run.world,v.controller,f.nationId)));
  return <section className="play-maritime"><h3>海上作战</h3><div className="play-hull"><span>舰体 {hull} / {f.ships*100}</span><meter aria-label="舰体完整度" min={0} max={f.ships*100} value={hull}/></div><p role="status">{f.status==='lost'?'舰队已沉没':opponents.length?`正在与${opponents.map(f=>f.name).join('、')}交锋`:'尚未接敌'}{run.maritime.retreating[f.id]?' · 正在脱离':''}</p><p className="play-muted">近距交锋时停止前进，每轮扣除真实舰体与船员。撤离后可继续航行，脱离射程前仍会受袭。</p><label>敌方海岸<select aria-label="海战目标海岸" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择当前敌国海岸</option>{enemy.map(p=><option key={p.id} value={p.id}>{portName(run.world,p)}</option>)}</select></label><button disabled={busy||!target||f.status==='lost'} onClick={()=>act({type:'raid',fleetId:f.id,portId:target})}>预览驶向敌岸</button><label>撤离港口<select aria-label="海军撤离港口" value={home} onChange={e=>setHome(e.target.value)}><option value="">选择本国港口</option>{own.map(p=><option key={p.id} value={p.id}>{portName(run.world,p)}</option>)}</select></label><button disabled={busy||!home||f.status==='lost'} onClick={()=>act({type:'retreat',fleetId:f.id,portId:home})}>预览撤离航线</button><small>驶抵敌岸不会直接占领；载军登陆需要另行确认。自动跨海远征与港口封锁仍未接入。</small></section>;
}
