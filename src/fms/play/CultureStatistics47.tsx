import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {STATISTICS_CATEGORIES47,statistics47,type StatisticsCategory47} from './statistics47';
import {PlayIcon} from './PlayIcon';

/** Original StatisticsInfoUI as a sheet: the category button becomes a segmented control,
 * each category a ranked list (refreshed with every accepted world update). */
export function CultureStatistics47({run,selectNation}:{run:FoundingForces47;selectNation:(id:string)=>void}){
  const [category,setCategory]=useState<StatisticsCategory47>('power');
  const rows=statistics47(run,category),max=Math.max(1,...rows.map(r=>Math.abs(r.value)));
  return <section className="c47-stats" aria-label="统计类别">
    <h2><PlayIcon name="ranking"/>统计</h2>
    <div className="c47-segment" role="tablist" aria-label="统计类别">
      {STATISTICS_CATEGORIES47.map(c=><button key={c.id} role="tab" aria-selected={category===c.id} onClick={()=>setCategory(c.id)}>{c.label}</button>)}
    </div>
    {rows.length?<ol className="c47-rank" key={category}>
      {rows.map((row,i)=>{const body=<><span className="c47-rank-n">{i+1}</span>{row.color&&<i style={{background:row.color}} aria-hidden="true"/>}<span className="c47-rank-name">{row.name}</span><span className="c47-rank-v">{row.text}</span><b style={{width:`${Math.max(2,Math.abs(row.value)/max*100)}%`,background:row.color??'var(--accent)'}} aria-hidden="true"/></>;
        return <li key={row.key} style={{animationDelay:`${Math.min(i,12)*22}ms`}}>{row.nationId?<button onClick={()=>selectNation(row.nationId!)}>{body}</button>:<div>{body}</div>}</li>;})}
    </ol>:<p className="c47-menu-hint">{category==='war'?'当前没有进行中的战争':'暂无数据'}</p>}
  </section>;
}
