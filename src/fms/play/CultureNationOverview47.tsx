import {officeTitle47} from './official-title-presets47';
import {officeHolder47,centralIncome47,type OfficeRun47} from './civilization47-offices';
import {memo} from 'react';
import {stateTrait47,ACTIVE_STATE_TRAITS47} from './state-traits47';
import type {FoundingForces47} from './civilization47-forces';
import {nationAge47} from './civilization47-origins';
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
/** Original StateInfoUI.UpdateBasicInfoSection rows, in the original order:
 * 国家 · 存在时间 · (行政首脑 · 财政主管 · 常备军统帅) · 首都 · 人口 · 人口上限 · 国库/亏空 · 军队数量 · 战舰数量 ·
 * 行省数量 · 国家特性. 腐化度、三公官职和区域数量 are not simulated on the web yet and are
 * left out rather than shown as placeholders. */
export const CultureNationOverview47=memo(function CultureNationOverview47({run,id,polity}:{run:FoundingForces47;id:string;polity:string}){
 const v=nationOverview47(run,id),nation=run.world.nations.find(n=>n.id===id)!;
 const traits=(run as unknown as {stateTraits47?:Record<string,string[]>}).stateTraits47?.[id]??null;
 return <details open className="c47-overview" aria-label="基本信息" data-population={v.population} data-regions={v.regions} data-gold={v.gold}><summary>基本信息</summary>
  <dl className="c47-province-rows c47-nation-stats">
   <div><dt>国家</dt><dd>{nation.name} · {polity}{v.extinct?'（已覆亡）':''}</dd></div>
   <div><dt>存在时间</dt><dd>{v.years>0?`${v.years} 年`:`${run.world.day} 日`}</dd></div>
   {(run as unknown as OfficeRun47).offices47&&(['Chancellor','Steward','Marshal'] as const).map(office=>{const holder=officeHolder47(run as unknown as OfficeRun47,id,office,run.people.nations[id]?.id??0);return <div key={office} data-office={office}><dt>{officeTitle47(run.civilization.nations[id].cultureId,run.civilization.nations[id].polity,office)}</dt><dd>{holder?holder.identity.name:'空缺'}</dd></div>;})}
   <div className="c47-capital-line"><dt>首都</dt><dd className={v.extinct||!v.capitalHeld?'is-lost':''}>{v.capital??'无'}{v.capital&&!v.extinct&&!v.capitalHeld?'（失守）':''}</dd></div>
   <div><dt>人口</dt><dd>{number(v.population)}</dd></div>
   <div><dt>人口上限</dt><dd>{number(v.capacity)}</dd></div>
   <div><dt>{v.gold<0?'亏空':'国库'}</dt><dd>{number(Math.abs(v.gold))}</dd></div>
   <div><dt>国运</dt><dd>{run.destiny.nations[id].destiny.toFixed(1)}</dd></div>
   <div><dt>中央官员收入倍率</dt><dd>{centralIncome47(run as unknown as OfficeRun47,id).toFixed(3)} ×</dd></div>
   <div><dt>财政战力倍率</dt><dd>{run.finance.nations[id].goldBattleModifier.toFixed(3)} ×</dd></div>
   <div><dt>军队数量</dt><dd>{number(v.armies)} · {number(v.troops)} 人</dd></div>
   <div><dt>战舰数量</dt><dd>{number(v.ships)}</dd></div>
   <div><dt>行省数量</dt><dd>{number(v.regions)}</dd></div>
   {traits&&<div className="c47-state-traits"><dt>国家特性</dt><dd>{traits.length?traits.map(t=>{const d=stateTrait47(t);return d&&<span key={t} title={d.description} data-trait={t}>{d.label}{ACTIVE_STATE_TRAITS47.includes(t)?'':'（效果待还原）'}</span>;}):'无'}</dd></div>}
  </dl>
 </details>;
});
/** Moving forces and sieges, shown inside the 战争 section. */
export const CultureNationActivity47=memo(function CultureNationActivity47({run,id}:{run:FoundingForces47;id:string}){
 const armies=run.world.armies.filter(a=>a.nationId===id&&a.troops>0&&a.status!=='destroyed'),fleets=run.navy.fleets.filter(f=>f.nationId===id&&f.status!=='lost'&&run.maritime.hulls[f.id]>0);
 const moving=armies.filter(a=>run.armyPositions.records[a.id]?.status==='moving').length,sailing=fleets.filter(f=>run.fleetPositions.records[f.id]?.status==='moving').length;
 const keys=new Set([...armies.map(a=>forceKey47({kind:'army',id:a.id})),...fleets.map(f=>forceKey47({kind:'fleet',id:f.id}))]),contacts=new Set(run.forceContacts.pairs.filter(p=>keys.has(p.a)||keys.has(p.b)).map(p=>p.area)).size;
 const activeActivities=nationForceActivities47(run,id).filter(activity=>activity.active),activeSieges=new Set(activeActivities.flatMap(activity=>activity.siege?[activity.siege.provinceId]:[]));
 if(!activeActivities.length)return null;
 return <div className="c47-activity" data-moving-armies={moving} data-moving-fleets={sailing} data-contact-areas={contacts} data-active-sieges={activeSieges.size}><small>{moving} 支行军 · {sailing} 支出航{contacts?` · ${contacts} 处交锋`:''}{activeSieges.size?` · ${activeSieges.size} 处围城`:''}</small><ol className="c47-force-activity">{activeActivities.slice(0,3).map(activity=><li key={`${activity.kind}/${activity.id}`} data-force-id={activity.id}><strong>{activity.name} · {activity.decisionLabel}</strong><span>{activity.location.label}{activity.target?` → ${activity.target.label}`:''}</span>{activity.siege&&<small>{activity.siege.provinceName}城防 {Math.round((1-activity.siege.progress)*100)}%</small>}</li>)}</ol>{activeActivities.length>3&&<small className="c47-activity-more">另有 {activeActivities.length-3} 支部队正在行动</small>}</div>;
});
