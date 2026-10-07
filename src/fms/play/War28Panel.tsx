import type {War28Run} from './war28-model';
import {nativeWar28,war28Months} from './war28-state';
import {war28Queries} from './war28-query';
import {war28Policy} from './war28-policy';
import {nativeWarScoreParts,nativeGoalProgress} from './native-war/score';
import {nativeWarWeariness} from './native-war/weariness';
import {WAR28_PEACE_LABELS} from './war28-settlement';
const GOALS:Record<number,string>={0:'指定地区',1:'割让地区',2:'占领地区',3:'吞并',4:'附庸',6:'战争赔款',11:'改宗'};
export function War28Panel({run,locate}:{run:War28Run;locate:(id:string)=>void}){
 const q=war28Queries(run,run.nativeWars,war28Policy(run)),name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
 const campaigns=[...run.nativeWars.campaigns].reverse().sort((a,b)=>Number(a.endedTick!==null)-Number(b.endedTick!==null)).slice(0,20);
 return <section className="play-war-overview" aria-label="战争目标与和约" data-testid="native-war-overview"><h3>战争目标与和约</h3>
  {!campaigns.length&&<p>当前没有战争。宣战后可查看固定目标、双方战局与结束原因。</p>}
  {campaigns.map(c=>{const live=c.endedTick===null,w=c.history==='complete'?nativeWar28(c):null,score=live&&w?nativeWarScoreParts(w,q):null;return <article key={c.id} className="play-war-country">
   <h4>{c.nations.map(name).join(' · ')}</h4><p>{live?'交战中':c.settlement?`已停战 · ${WAR28_PEACE_LABELS[c.settlement.reason]}`:'已结束'}{live&&c.startTime!==null?` · ${war28Months(run,c.startTime)} 个月`:''}</p>
   {c.history==='unknown'?<p className="play-muted">这场战争缺少开战快照，保留已有战况；战争分与自动和约不可追溯补算。</p>:<>
    {score&&w&&<><label>战局 · {score.score>0?'进攻方占优':score.score<0?'防守方占优':'相持'} <strong>{score.score.toFixed(1)}</strong><meter aria-label={`战争 ${c.id} 战争分`} min={-100} max={100} value={score.score}/></label><p className="play-muted">进攻方：{name(c.attacker!)}。战争分综合领土、目标与原始交锋伤害，不等于已确定胜负。</p><dl className="play-stats"><div><dt>{name(c.attacker!)}厌战</dt><dd>{(nativeWarWeariness(w,w.primaryAttackerId,q)*100).toFixed(0)}%</dd></div><div><dt>{name(c.defender!)}厌战</dt><dd>{(nativeWarWeariness(w,w.primaryDefenderId,q)*100).toFixed(0)}%</dd></div></dl></>}
    {c.goals.map(g=><div key={g.id}><strong>{GOALS[g.type]}{live&&w?` · ${(nativeGoalProgress(w,g,q)*100).toFixed(0)}%`:c.settlement?.enforcedGoals.includes(g.id)?' · 已执行':''}</strong>{g.scope?.provinceIds?.length?<details><summary>涉及 {g.scope.provinceIds.length} 处地区{g.type===2?` · 需控制 ${g.scope.requiredCount} 处`:''}</summary><div className="play-army-shortcuts">{g.scope.provinceIds.map(pid=>{const id=run.nativeWars.provinceIds[pid-1],p=run.world.provinces.find(p=>p.id===id)!;return <button key={pid} onClick={()=>locate(id)}>{p.name}</button>;})}</div></details>:null}</div>)}
    {c.settlement&&<p>和约记录：{c.settlement.transfers.length} 处转地，{c.settlement.confirmedOwnership.length} 处实控归属确认，{c.settlement.effects.filter(e=>e.status===0).length} 项效果执行。{c.settlement.effects.filter(e=>e.status===2).map(e=>e.reason).join('；')}</p>}
   </>}
  </article>;})}
  <details><summary>各国交锋累计损失</summary>{run.world.nations.map(n=><p key={n.id}>{n.name}：{run.losses.nations[n.id].total.combat.toLocaleString()} 人</p>)}<p className="play-muted">人数来自实际兵员扣减，与战争分采用的原始伤害分开记录。</p></details>
 </section>;
}
