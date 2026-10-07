import type {War40Run} from './war40-model';
import {previewPortAssault40,navalRoleLabel40} from './war40-ports';
import type {SeaGraph} from './sea-path';
export function PortControlPanel40({run,graph,nationId,fleetId,busy,assault,focus}:{run:War40Run;graph:SeaGraph;nationId:string;fleetId:string|null;busy:boolean;assault:(id:string)=>void;focus:(id:string)=>void}){
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id,place=(id:string)=>run.world.cities.find(c=>c.provinceId===id)?.name??run.world.provinces.find(p=>p.id===id)?.name??id;
 const fleet=run.navy.fleets.find(f=>f.id===fleetId),order=fleet&&run.portControl.fleets[fleet.id],preview=fleet&&previewPortAssault40(run,run.portControl,run.voyages,graph,fleet.id);
 const ports=Object.entries(run.portControl.ports).filter(([,p])=>p.landOwnerId===nationId||p.occupierId===nationId);
 return <section className="play-port-control" aria-label="海港控制"><h3>海港与前进据点</h3><p className="play-muted">夺港只改变海港控制。城市仍归陆地控制方；撤舰后控制逐步衰退，停战后归还。</p>{fleet&&<><p>{navalRoleLabel40(run,run.portControl,run.voyages,run.navalDeployment,graph,fleet.id)}{order?.targetId?` · 目标 ${place(order.targetId)}海港`:''}{order?.forwardBaseId?` · 前进据点 ${place(order.forwardBaseId)}`:''}</p><button disabled={busy||!preview?.valid} onClick={()=>assault(fleet.id)}>预览自主夺港</button>{preview&&!preview.valid&&<p className="play-muted">{preview.reason}</p>}</>}
 <details open><summary>本国相关海港 · {ports.length}</summary>{ports.map(([id,p])=><div key={id} className="play-port-row" data-port-province={id}><button onClick={()=>focus(id)}>{place(id)}海港</button><span>陆地：{name(p.landOwnerId)} · 海港：{name(p.occupierId)}</span><progress aria-label={`${place(id)}海港控制`} value={p.value} max={100}/><small>控制稳固度 {Math.round(p.value)}%{p.occupierId!==p.landOwnerId?' · 舰队占领':''}</small></div>)}</details></section>;
}
