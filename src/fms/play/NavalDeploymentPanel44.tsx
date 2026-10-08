import {harborCells44} from './war44-harbor';
import {navalRoleLabel44,autoAttack44} from './war44-ports';
import type {War44Run} from './war44-model';
import type {SeaGraph} from './sea-path';
import {portName} from './navy';
import type {NavalAssignment44} from './war44-deployment';
const labels:Record<NavalAssignment44['decision'],string>={loiter:'港湾游弋',returning:'撤回待调度',resupply:'回港补给',waiting:'等待部署',assigned:'港口驻防',manual:'玩家军令',mission:'运输任务优先',engaged:'交战或撤离', 'no-port':'无可用的连通海港','no-supply':'余粮不足，暂缓出航',disabled:'自主部署已暂停',lost:'已损失'};
export function NavalDeploymentPanel44({run,graph,nationId,busy,select,resume}:{run:War44Run;graph:SeaGraph;nationId:string;busy:boolean;select:(id:string)=>void;resume:(id:string)=>void}){
 const fleets=run.navy.fleets.filter(f=>f.nationId===nationId&&f.status!=='lost');
 return <section className="play-deployment" data-testid="naval-deployment"><h3>舰队分工</h3><p className="play-muted">战时自动分配进攻舰队，其余舰队守备海港；优先前线母港与较强舰队。港内沿真实海格游弋，和平时短暂停留；已夺海港可作为战时据点；低粮回本国有余粮的港口补给。玩家航令、运兵和交战优先。</p>{fleets.map(f=>{const a=run.navalDeployment.fleets[f.id],port=graph.ports.find(p=>p.id===a.assignedPortId),canResume=(a.decision==='manual'||a.decision==='disabled')&&!f.route.length;
  return <div className="play-deployment-row" key={f.id} data-fleet={f.id}><button className="play-deployment-name" onClick={()=>select(f.id)}>{f.name}</button><p><strong>{navalRoleLabel44(run,run.portControl,run.voyages,run.navalDeployment,graph,f.id)}</strong>{autoAttack44(run,run.portControl,run.navalDeployment,graph,f.id)?'':port?` · ${portName(run.world,port)}`:` · ${labels[a.decision]}`}</p><small>{a.returning?'目的港失效或战争结束，驶出当前海段后重新驻防':a.decision==='resupply'?'返抵本国码头后，从当地余粮补给':a.loiterNode!==null?`港湾游弋 · ${port?harborCells44(graph,port.id).size:0} 个连通海格`:f.route.length?'正在沿真实海路前往目的港':a.decision==='assigned'?`下次调度约 ${Math.max(0,Math.ceil((a.nextTick-run.clock.tick)/120))} 日后`:'保留当前位置与补给记录'}</small>{canResume&&<button disabled={busy} onClick={()=>resume(f.id)}>交回自主分工</button>}</div>;
 })}{!fleets.length&&<p>本国暂无可部署舰队。</p>}</section>;
}
