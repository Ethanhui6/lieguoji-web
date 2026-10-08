import type {War45Run} from './war45-model';
import type {SeaGraph} from './sea-path';
import {shipbuildingQuote45} from './war45-shipbuilding';
export function ShipbuildingPanel45({run,graph,nationId}:{run:War45Run;graph:SeaGraph;nationId:string}){
 const q=run.shipbuilding.nations[nationId],v=shipbuildingQuote45(run,nationId,graph);if(!q)return null;
 const progress=q.totalMonths?Math.max(0,q.totalMonths-q.remaining):0;
 return <section className="play-shipbuilding" data-testid="shipbuilding" aria-label="海军造船">
  <h3>海军造船</h3><p>{v.controlled.length} 处受控海港 · 舰队 {v.active} / 自动配额 {v.quota}</p>
  {q.remaining>0?<><progress aria-label="造船进度" max={q.totalMonths||1} value={progress}/><p>{q.blocked?'船体完工 · 等待下水':`建造中 · 还需 ${q.remaining} 次月度更新`}</p></>:<p>{v.active<v.quota?'等待下次月度开工':v.controlled.length?'当前无需补建舰队':'没有可用于补建的受控海港'}</p>}
  {q.blocked&&<p role="status">{q.blocked}</p>}
  <small>新开工需 {v.months} 次月度更新{v.blocked?' · 本国海港被封锁，工期 ×2':''}。等待 {q.queued} 支，累计下水 {q.completed} 支。</small>
  <details><summary>查看造船规则</summary><p>原作配额：一港一支；其他数量每三港一支（两港时配额为零）。海洋与商业族群、现任君主的造船特性会影响新工期。国家按自己的月度更新日推进；在建船不会因换君主而重算。</p><p>当前网页版每支新舰队编成一艘船，征用40名船员和60日配粮，保留当地居民与民粮。超额已有舰队继续保留；下水受阻时保留已完成工期，等待下一月检查。</p></details>
 </section>;
}
