import type {War46Run} from './war46-model';
import {graphFor46} from './war46-geography';
export function VoyagePanel46({run,nationId,busy,toggle}:{run:War46Run;nationId:string;busy:boolean;toggle:(enabled:boolean)=>void}){
 const s=run.voyages,m=s.missions[nationId],army=m?[...run.world.armies,...run.transports.cargo.map(c=>c.army)].find(a=>a.id===m.armyId):undefined,fleet=m?run.navy.fleets.find(f=>f.id===m.fleetId):undefined;
 const from=m?graphFor46(run).ports.find(p=>p.id===m.fromPortId):undefined;
 return <section className="play-expedition" aria-label="自动跨海远征" data-testid="voyage-rendezvous"><h3>跨海远征</h3><label><input type="checkbox" aria-label="自动组织远征" disabled={busy} checked={s.enabled[nationId]??false} onChange={e=>toggle(e.target.checked)}/> 自动组织远征</label><p role="status">{s.decisions[nationId]?.text??'开始时间后评估可达海岸、兵力、运力与粮储。'}</p>{m&&<dl><dt>出发港</dt><dd>{run.world.cities.find(c=>c.provinceId===from?.provinceId)?.name??run.world.provinces.find(p=>p.id===from?.provinceId)?.name}</dd><dt>阶段</dt><dd>{({assembling:fleet?.route.length?'舰队接兵 · 陆军集结':'会合与装船',outbound:'跨海航行',returning:'返港补给'})[m.phase]}</dd><dt>部队</dt><dd>{army?.name??'历史部队'} · {army?.troops.toLocaleString('zh-CN')} 人</dd><dt>载军状态</dt><dd>{run.transports.cargo.some(c=>c.army.id===m.armyId)?'已登船':m.phase==='returning'?'已登陆':'仍在陆地'}</dd><dt>舰队</dt><dd>{fleet?.name} · {fleet?.ships} 艘</dd></dl>}<small className="play-muted">现有舰队沿真实海路接兵，两方到齐并备足粮储后出航；没有合适舰队时等待月度造船。手动指挥、载军、海战和已经下达的夺港任务优先保留。关闭远征后停止新计划，载军舰队安排安全返航。</small></section>;
}

