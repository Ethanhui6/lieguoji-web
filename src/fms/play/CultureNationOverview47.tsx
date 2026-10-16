import {memo} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {nationAge47} from './civilization47-origins';
import {PlayIcon} from './PlayIcon';
import {forceKey47} from './force-motion47';
import {nationForceActivities47} from './force-activity47';

export function nationFamily47(run:FoundingForces47,id:string){
 const family=Object.values(run.kin.families).find(f=>f.nationId===id);
 return {family,members:family?[...family.memberIds,...family.collateralMemberIds].map(pid=>run.kin.persons[pid]):[]};
}

/** Read the same accounts used by the simulation. No synthetic corruption,
 * family influence or duplicate administrative levels are presented here. */
export function nationOverview47(run:FoundingForces47,id:string){
 const nation=run.world.nations.find(n=>n.id===id)!;
 const provinces=run.world.provinces.filter(p=>p.controller===id),owned=new Set(provinces.map(p=>p.id));
 const capital=run.world.cities.find(c=>c.id===nation.capitalId);
 const armies=run.world.armies.filter(a=>a.nationId===id&&a.troops>0&&a.status!=='destroyed');
 const fleets=run.navy.fleets.filter(f=>f.nationId===id&&f.status!=='lost'&&f.ships>0&&run.maritime.hulls[f.id]>0);
 const population=run.world.statecraft!.provinces.filter(p=>owned.has(p.provinceId)).reduce((n,p)=>n+p.population,0);
 return {extinct:Object.hasOwn(run.chronicle.ended,id),years:nationAge47(run,id).years,capital:capital?.name??null,capitalHeld:!!capital&&owned.has(capital.provinceId),population,capacity:provinces.reduce((n,p)=>n+run.finance.provinces[p.id].maxPopulation,0),gold:run.finance.nations[id].gold,regions:provinces.length,cities:run.world.cities.filter(c=>owned.has(c.provinceId)).length,armies:armies.length,troops:armies.reduce((n,a)=>n+a.troops,0),fleets:fleets.length,ships:fleets.reduce((n,f)=>n+f.ships,0)};
}
const number=(n:number)=>Math.round(n).toLocaleString('zh-CN');
// Worker snapshots replace run rather than mutating the displayed snapshot.
// Parent busy/advancing changes must not rebuild the same force activity graph;
// a new run reference or selected nation still recomputes every live value.
export const CultureNationOverview47=memo(function CultureNationOverview47({run,id}:{run:FoundingForces47;id:string}){
 const v=nationOverview47(run,id);
 const armies=run.world.armies.filter(a=>a.nationId===id&&a.troops>0&&a.status!=='destroyed'),fleets=run.navy.fleets.filter(f=>f.nationId===id&&f.status!=='lost'&&run.maritime.hulls[f.id]>0);
 const moving=armies.filter(a=>run.armyPositions.records[a.id]?.status==='moving').length,sailing=fleets.filter(f=>run.fleetPositions.records[f.id]?.status==='moving').length;
 const keys=new Set([...armies.map(a=>forceKey47({kind:'army',id:a.id})),...fleets.map(f=>forceKey47({kind:'fleet',id:f.id}))]),contacts=new Set(run.forceContacts.pairs.filter(p=>keys.has(p.a)||keys.has(p.b)).map(p=>p.area)).size;
 const activities=nationForceActivities47(run,id),activeActivities=activities.filter(activity=>activity.active),activeSieges=new Set(activeActivities.flatMap(activity=>activity.siege?[activity.siege.provinceId]:[]));
 return <section className="c47-overview" aria-label="国家实况" data-population={v.population} data-regions={v.regions} data-gold={v.gold}>
  <div className="c47-capital-line"><PlayIcon name="city" size={17}/><div><small>{v.extinct?'原首都':'首都'}</small><strong>{v.capital??'无'}</strong></div><span className={v.extinct||!v.capitalHeld?'is-lost':''}>{v.extinct?'已覆亡':v.capitalHeld?'本国控制':'失守'}</span></div>
  <dl className="c47-nation-stats">
   <div><dt>实控人口</dt><dd>{number(v.population)}</dd><small>容量 {number(v.capacity)}</small></div>
   <div><dt>国库</dt><dd>{number(v.gold)}</dd><small>已结账金币</small></div>
   <div><dt>军团</dt><dd>{number(v.armies)}</dd><small>{number(v.troops)} 人</small></div>
   <div><dt>舰队</dt><dd>{number(v.fleets)}</dd><small>{number(v.ships)} 艘编制舰</small></div>
   <div><dt>实控地区</dt><dd>{number(v.regions)}</dd><small>{number(v.cities)} 座城市</small></div>
   <div><dt>建国至今</dt><dd>{v.years>0?`${v.years} 年`:`${run.world.day} 日`}</dd><small>{v.extinct?'历史仍保留':run.origins?'始于开篇之前':'按本局历法'}</small></div>
  </dl>
  <details className="c47-activity" data-moving-armies={moving} data-moving-fleets={sailing} data-contact-areas={contacts} data-active-sieges={activeSieges.size}><summary>当前动向 · {moving} 支行军 · {sailing} 支出航{contacts?` · ${contacts} 处交锋`:''}{activeSieges.size?` · ${activeSieges.size} 处围城`:''}</summary>{activeActivities.length?<ol className="c47-force-activity">{activeActivities.slice(0,3).map(activity=><li key={`${activity.kind}/${activity.id}`} data-force-id={activity.id}><strong>{activity.name} · {activity.decisionLabel}</strong><span>{activity.location.label}{activity.target?` → ${activity.target.label}`:''}</span>{activity.siege&&<small>{activity.siege.provinceName}城防 {Math.round((1-activity.siege.progress)*100)}%</small>}<small>{activity.provisions.label} {Math.round(activity.provisions.current).toLocaleString('zh-CN')} · {activity.reason}</small></li>)}</ol>:<p>当前没有需要报告的行军、围城或海上行动。</p>}{activeActivities.length>3&&<small className="c47-activity-more">另有 {activeActivities.length-3} 支部队正在行动，可在军事面板查看。</small>}</details>
 </section>;
});
