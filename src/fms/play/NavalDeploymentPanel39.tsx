import type {War39Run} from './war39-model';
import type {SeaGraph} from './sea-path';
import {portName} from './navy';
import type {NavalAssignment39} from './war39-deployment';
const labels:Record<NavalAssignment39['decision'],string>={waiting:'等待部署',assigned:'港口驻防',manual:'玩家军令',mission:'运输任务优先',engaged:'交战或撤离', 'no-port':'无可达的本国港口','no-supply':'余粮不足，暂缓出航',disabled:'自主部署已暂停',lost:'已损失'};
export function NavalDeploymentPanel39({run,graph,nationId,busy,select,resume}:{run:War39Run;graph:SeaGraph;nationId:string;busy:boolean;select:(id:string)=>void;resume:(id:string)=>void}){
 const fleets=run.navy.fleets.filter(f=>f.nationId===nationId&&f.status!=='lost');
 return <section className="play-deployment" data-testid="naval-deployment"><h3>港口部署</h3><p className="play-muted">闲置舰队优先驻守兵力较少的本国港口，沿相通海域调动。玩家航令、运兵和交战优先。</p>{fleets.map(f=>{const a=run.navalDeployment.fleets[f.id],port=graph.ports.find(p=>p.id===a.assignedPortId),canResume=(a.decision==='manual'||a.decision==='disabled')&&!f.route.length;
  return <div className="play-deployment-row" key={f.id} data-fleet={f.id}><button className="play-deployment-name" onClick={()=>select(f.id)}>{f.name}</button><p><strong>{labels[a.decision]}</strong>{port?` · ${portName(run.world,port)}`:''}</p><small>{f.route.length?'正在沿真实海路前往目的港':a.decision==='assigned'?`下次调度约 ${Math.max(0,Math.ceil((a.nextTick-run.clock.tick)/120))} 日后`:'保留当前位置与补给记录'}</small>{canResume&&<button disabled={busy} onClick={()=>resume(f.id)}>交回港口部署</button>}</div>;
 })}{!fleets.length&&<p>本国暂无可部署舰队。</p>}</section>;
}
