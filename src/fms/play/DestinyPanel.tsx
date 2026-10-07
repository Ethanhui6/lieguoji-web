import type {Destiny20Run} from './destiny20-model';
import {nativeDestinyThreshold} from './native-economy/destiny';
import type {DestinyEdit} from './destiny20-state';
export function DestinyPanel({run,nationId,busy,edit}:{run:Destiny20Run;nationId:string;busy:boolean;edit:(e:DestinyEdit)=>void}){
 const n=run.destiny.nations[nationId],ledger=n.ledger,active=run.world.provinces.some(p=>p.controller===nationId);
 return <section className="play-destiny" aria-label="国运变迁"><h3>国运变迁 <span data-testid="destiny-value">{n.destiny.toFixed(2)}</span></h3><p>{n.manifest?'天命眷顾':'自然国运'} · {active?`下次结算第 ${(Math.floor(run.world.day/30)+1)*30} 日`:'国家覆亡，国运暂存'}</p><details><summary>变化原因与国运特性</summary>
 {ledger?<><p>第 {ledger.day} 日：{ledger.before.toFixed(2)} → {ledger.after.toFixed(2)}{ledger.reset?' · 触底重抽':''}</p><p>人口 / 容量 {(ledger.populationRatio*100).toFixed(1)}% · 结算后国库 {ledger.gold.toLocaleString('zh-CN')}{ledger.administrative===null?' · 低国运自然变化':` · 君主行政 ${ledger.administrative.toFixed(1)}`}</p>{ledger.clearedRecent&&<p>本次清空近期动员记录；上次动员的冷却时间保持。</p>}</>:<p>国运已记录；首次月度变化后可在这里查看原因。</p>}
 <p>下降系数 {n.decrease.toFixed(4)} · 触底阈值 {nativeDestinyThreshold(n.manifestCount).toFixed(1)}{n.manifest?` · 特性计数 ${n.manifestCount}`:''}</p><button disabled={busy||!active} onClick={()=>edit({nationId,manifest:!n.manifest})}>{n.manifest?'预览取消天命眷顾':'预览启用天命眷顾'}</button>
 <small>每 30 日统一结算。国运变化即时影响战力，财政沿用当月已结算记录。此处的天命眷顾来自原作国运特性。</small></details></section>;
}
