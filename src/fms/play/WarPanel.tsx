import type {World} from '../../sim/types';
import {useEffect,useRef} from 'react';
import {nationColor} from './politics';
import {warSummary,type WarNavy,type WarSite} from './war-view';
const count=(n:number)=>Math.round(n).toLocaleString('zh-CN');

export function WarPanel({world,sites,selected,naval,tick,choose,army,fleet}:{world:World;sites:WarSite[];selected:string[];naval?:WarNavy;tick:number;choose:(ids:string[])=>void;army:(id:string)=>void;fleet:(id:string)=>void}){
  const current=sites.filter(s=>selected.includes(s.id)),summary=warSummary(world,current,naval);
  const section=useRef<HTMLElement>(null),selection=selected.join('/');
  useEffect(()=>{const panel=section.current?.closest('.play-panel');if(panel)panel.scrollTop=0;},[selection]);
  return <section ref={section} className="play-war" aria-label="战役总览">
    {!current.length&&<p className="play-muted">全图仅突出大型战役，放大后显示局部交锋。这里列出全部正在发生的交战与围攻。</p>}
    {current.length>0?<div className="play-war-focus" key={current.map(s=>s.id).join('/')}>
      <span className="play-eyebrow">当前战况 · {summary.sides.length} 国参战</span>
      <h2>{current.length===1?current[0].name:`${current[0].name}周边战役`}</h2>
      <p>{current.length} 处交战 · 已持续 {((tick-Math.min(...current.map(s=>s.started)))/120).toFixed(1)} 日</p>
      <div className="play-war-balance" aria-label="在场兵员占比">{summary.sides.map(s=>{const nation=world.nations.find(n=>n.id===s.nationId)!;return <span key={s.nationId} title={`${nation.name} ${count(s.troops+s.crew)} 人`} style={{flex:s.troops+s.crew,background:nationColor(nation)}}/>;})}</div>
      <div className="play-war-comparison" aria-label="参战国家兵力对比">{summary.sides.map(s=>{const nation=world.nations.find(n=>n.id===s.nationId)!;return <div key={s.nationId}><span className="play-nation-name"><i style={{background:nationColor(nation)}}/>{nation.name}</span><strong>{s.armyIds.length?`${count(s.troops)} 人`:s.fleetIds.length?`${s.ships} 艘 · ${count(s.crew)} 人`:'无在场部队'}</strong></div>;})}</div>
      {summary.sides.map(s=>{const nation=world.nations.find(n=>n.id===s.nationId)!;return <article className="play-war-country" key={s.nationId}>
        <h3 className="play-nation-name"><i style={{background:nationColor(nation)}}/>{nation.name}</h3>
        <dl className="play-stats">
          {s.armyIds.length>0&&<><div><dt>在场陆军</dt><dd>{count(s.troops)} 人</dd></div><div><dt>交锋记录损失</dt><dd>{s.lossRecorded?`${count(s.losses)} 人`:'暂无记录'}</dd></div><div><dt>兵力加权士气</dt><dd>{Math.round(s.morale)}</dd></div><div><dt>兵力加权军粮</dt><dd>{Math.round(s.supplies)}</dd></div></>}
          {s.fleetIds.length>0&&<><div><dt>舰船 / 船员</dt><dd>{s.ships} 艘 / {count(s.crew)} 人</dd></div><div><dt>舰体总完整度</dt><dd>{Math.round(s.hull/Math.max(1,s.ships*100)*100)}%</dd></div></>}
        </dl>
        {!s.armyIds.length&&!s.fleetIds.length&&<p className="play-muted">本国当前没有在场部队；所属地区仍在围攻中。</p>}
        {(s.armyIds.length>0||s.fleetIds.length>0)&&<details><summary>查看参战部队（{s.armyIds.length+s.fleetIds.length} 支）</summary><div className="play-army-shortcuts">{s.armyIds.map(id=><button key={id} onClick={()=>army(id)}>{world.armies.find(a=>a.id===id)!.name}</button>)}{s.fleetIds.map(id=><button key={id} onClick={()=>fleet(id)}>{naval!.navy.fleets.find(f=>f.id===id)!.name}</button>)}</div></details>}
      </article>;})}
      {current.filter(s=>s.resistance).map(s=><div className="play-war-siege" key={s.id}><label>{s.name} · 抵抗削减 {Math.round((1-s.resistance!.remaining/s.resistance!.maximum)*100)}%<progress aria-label={`${s.name}围攻进度`} max={s.resistance!.maximum} value={s.resistance!.maximum-s.resistance!.remaining}/></label></div>)}
      <p className="play-muted">兵员按真实在场单位去重。损失仅统计仍在场陆军的当前交锋记录；不代表整场战争的历史总伤亡。不同国家分别列出，不自动视为同盟。</p>
    </div>:<p className="play-war-empty">{selected.length?'选中的交战已结束或接触已解除。':'点击地图上的战役标记，或选择下方正在发生的交战。'}</p>}
    <h3>正在发生 · {sites.length} 处</h3>
    <div className="play-war-list">{sites.map(s=>{const summary=warSummary(world,[s],naval);return <button key={s.id} aria-pressed={selected.includes(s.id)} onClick={()=>choose([s.id])}><span>{s.name}</span><small>{summary.sides.length} 国 · {summary.troops?`${count(summary.troops)} 陆军`:''}{summary.ships?`${summary.ships} 艘舰船`:''}</small></button>;})}</div>
    {!sites.length&&<p>目前没有实际交锋。宣战与战场接触是两件事，军队沿可达路线相遇后才会列在这里。</p>}
  </section>;
}
