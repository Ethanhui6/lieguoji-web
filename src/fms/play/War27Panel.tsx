import {war26View,type War27Run} from './war27-model';
import {War26Panel} from './War26Panel';
import type {LossCounts} from './war27-losses';
import type {World} from '../../sim/types';

function Counts({value}:{value:LossCounts}){
 return <dl className="play-loss-counts">
  <div><dt>直接交锋减员</dt><dd>{value.combat.toLocaleString()}</dd></div>
  <div><dt>撤退追击损失</dt><dd>{value.pursuit.toLocaleString()}</dd></div>
  <div><dt>无退路溃散</dt><dd>{value.rout.toLocaleString()}</dd></div>
  <div><dt>陆上断粮减员</dt><dd>{value.starvation.toLocaleString()}</dd></div>
  <div><dt>海战船员损失</dt><dd>{value.crew.toLocaleString()}</dd></div>
  <div><dt>沉船载军损失</dt><dd>{value.cargo.toLocaleString()}</dd></div>
  <div><dt>舰体损伤</dt><dd>{value.hull.toLocaleString()} 点</dd></div>
  <div><dt>战沉船只</dt><dd>{value.ships.toLocaleString()} 艘</dd></div>
 </dl>;
}
export function War27Panel({run,world,locate}:{run:War27Run;world:World;locate:(id:string)=>void}){
 const names=new Map(world.nations.map(n=>[n.id,n.name]));
 return <><War26Panel run={war26View(run)} world={world} locate={locate}/>
 <section className="play-war-overview" aria-label="战损记录" data-testid="war-loss-ledger">
 <h3>战损记录</h3><p className="play-muted">自第 {Math.floor(run.losses.originTick/120)} 日开始记录{run.losses.source==='copy'?'；复制之前的损失未知':'；直接记录实际扣减'}。结束交锋、补员与重新编组不会抹去累计损失。</p>
 <h4>各国累计</h4>{world.nations.map(n=><details key={n.id} className="play-loss-country"><summary>{n.name} · 交锋减员 {run.losses.nations[n.id].total.combat.toLocaleString()}</summary><Counts value={run.losses.nations[n.id].total}/><details><summary>查看未归属单场战争的损失</summary><Counts value={run.losses.nations[n.id].unassigned}/></details></details>)}
 <h4>最近战争</h4>{!run.warfare.campaigns.length&&<p>当前还没有战争记录。</p>}{[...run.warfare.campaigns].reverse().slice(0,20).map(c=>{const row=run.losses.campaigns[c.id];return <details key={c.id} className="play-loss-country"><summary>{names.get(c.a)} · {names.get(c.b)} · {c.endedTick===null?'交战中':'已结束'}</summary><p className="play-muted">{row.history==='unknown'?'这场战争结束于启用记录之前，历史战损未知。':row.history==='since-copy'?'仅包含复制之后、归属明确的损失；此前未知。':'下列仅包含归属明确的损失。'}</p>{row.history!=='unknown'&&[c.a,c.b].map(id=><div key={id}><strong>{names.get(id)}</strong><Counts value={row.losses[id]}/></div>)}</details>;})}
 <p className="play-muted">多人混战与无法确定来源的小数伤害只计入各国累计，不重复分给每场战争。无退路溃散不等于阵亡。记录不含海上断粮、非战斗运输损失及编制调整；不同单位不相加，也不据此冒充原作击杀数、战争分或厌战。</p>
 </section></>;
}
