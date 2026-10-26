import {memo,useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {leaderAchievements47,type LeaderRun47} from './leader-history47';

const PAGE=3;
/** Original StateInfoUI.UpdateLeaderHistorySection: every reign of the state, newest first,
 * a page at a time, each with State.GetLeaderAchievementsText. */
export const CultureLeaderHistory47=memo(function CultureLeaderHistory47({run,id}:{run:FoundingForces47;id:string}){
 const [page,setPage]=useState(0),reigns=[...(run.chronicle.leaders[id]??[])].reverse(),pages=Math.max(1,Math.ceil(reigns.length/PAGE)),pg=Math.min(page,pages-1);
 return <details className="c47-leader-history" aria-label="领导人历史"><summary>领导人历史{reigns.length?` · ${reigns.length}`:''}</summary>
  {reigns.length?<ol className="c47-leader-records">{reigns.slice(pg*PAGE,pg*PAGE+PAGE).map(reign=>{
   const [head,name,...rest]=leaderAchievements47(run as unknown as LeaderRun47,id,reign,run.civilization.rulers[reign.id]?.titleAtAccession??'');
   return <li key={reign.id} data-reign-id={reign.id}><small>{head}</small><strong>{name}</strong>{rest.map(line=><p key={line}>{line}</p>)}</li>;
  })}</ol>:<p className="c47-menu-hint">暂无领导人历史记录</p>}
  {pages>1&&<div className="c47-office-pages"><button disabled={pg===0} onClick={()=>setPage(pg-1)}>上一页</button><span>第 {pg+1}/{pages} 页</span><button disabled={pg>=pages-1} onClick={()=>setPage(pg+1)}>下一页</button></div>}
 </details>;
});
