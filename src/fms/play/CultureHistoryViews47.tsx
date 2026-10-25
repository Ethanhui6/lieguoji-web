import {useMemo,useRef,useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import type {HistoricalEntry} from './chronicle-records';
import {isoPlusDays} from './civilization47-iso-calendar';
import {halfYear47,halfYearLabel47,historyType47,type HistoryType47} from './history-view47';

type Item={entry:HistoricalEntry;type:HistoryType47;half:number};
export function historyItems47(run:FoundingForces47,entries:readonly HistoricalEntry[]):Item[]{
  const deaths=new Set((run.kin.lifecycle?.deaths??[]).map(d=>d.deathHistoryId));
  return entries.map(entry=>({entry,type:historyType47(entry,deaths.has(entry.id)),half:halfYear47(run.life.startDate,entry.day)}));
}
/** Type filter chips (HistoryTimelineUI event-type toggles), only for types present. */
function Filters({items,off,setOff}:{items:readonly Item[];off:ReadonlySet<string>;setOff:(s:Set<string>)=>void}){
  const types=[...new Map(items.map(i=>[i.type.key,i.type])).values()];
  if(types.length<2)return null;
  return <div className="c47-history-filters" role="group" aria-label="事件显示">{types.map(t=>{const on=!off.has(t.key);return <button key={t.key} aria-pressed={on} onClick={()=>{const n=new Set(off);if(on)n.add(t.key);else n.delete(t.key);setOff(n);}}><i style={{background:t.color}}/>{t.label}</button>;})}</div>;
}
function Entry({run,item,selectNation}:{run:FoundingForces47;item:Item;selectNation:(id:string)=>void}){
  const d=isoPlusDays(run.life.startDate,item.entry.day),related=run.world.nations.filter(n=>item.entry.nationIds.includes(n.id));
  return <article className="c47-history-card" style={{['--type' as string]:item.type.color}}>
    <header><span className="c47-history-type">{item.type.label}</span><time>{d.month}月{d.day}日</time></header>
    <p>{item.entry.text}</p>
    {related.length>0&&<div className="c47-history-nations">{related.map(n=><button key={n.id} onClick={()=>selectNation(n.id)}><i style={{background:n.color}}/>{n.name}</button>)}</div>}
  </article>;
}

/** Original HistoryInfoPanel: one half-year at a time, a time slider over the whole history,
 * 前半年 / 后半年 buttons and a year field. */
export function HistoryYears47({run,entries,selectNation}:{run:FoundingForces47;entries:readonly HistoricalEntry[];selectNation:(id:string)=>void}){
  const items=useMemo(()=>historyItems47(run,entries),[run,entries]);
  const first=items.length?Math.min(...items.map(i=>i.half)):halfYear47(run.life.startDate,0),last=halfYear47(run.life.startDate,run.world.day);
  const [picked,setPicked]=useState<number|null>(null),[off,setOff]=useState<Set<string>>(new Set()),[yearText,setYearText]=useState('');
  const half=Math.min(last,Math.max(first,picked??last));
  const shown=items.filter(i=>i.half===half&&!off.has(i.type.key)).sort((a,b)=>a.entry.day-b.entry.day||a.entry.id-b.entry.id);
  const go=(h:number)=>setPicked(Math.min(last,Math.max(first,h)));
  return <div className="c47-history-years">
    <div className="c47-history-period"><strong>{halfYearLabel47(half)}</strong>{picked!==null&&half!==last&&<button onClick={()=>setPicked(null)}>回到当前</button>}</div>
    <input type="range" aria-label="历史时间" min={first} max={last} step={1} value={half} onChange={e=>go(Number(e.target.value))} disabled={first===last}/>
    <div className="c47-history-nav">
      <button disabled={half<=first} onClick={()=>go(half-1)}>前半年</button>
      <form onSubmit={e=>{e.preventDefault();const y=Number(yearText);if(Number.isFinite(y))go(Math.round(y)*2);}}><input aria-label="跳转年份" inputMode="numeric" placeholder="年份" value={yearText} onChange={e=>setYearText(e.target.value.replace(/[^0-9-]/g,''))}/></form>
      <button disabled={half>=last} onClick={()=>go(half+1)}>后半年</button>
    </div>
    <Filters items={items} off={off} setOff={setOff}/>
    <div className="c47-history-cards" key={half}>{shown.length?shown.map(i=><Entry key={i.entry.id} run={run} item={i} selectNation={selectNation}/>):<p className="c47-empty-history">这半年没有记载的大事。</p>}</div>
  </div>;
}

/** Original HistoryTimelineUI: a horizontal time axis with event nodes; drag (native scroll)
 * to move, +/− to zoom. Events closer than a node apart merge into one node coloured by the
 * dominant type (GetDominantEventColor), sized by its count; tapping a node lists its events.
 * The default zoom fits the whole history to the width. */
export function historyClusters47<T extends {type:HistoryType47}>(items:readonly (T&{left:number})[],gap:number){
  const out:{left:number;items:(T&{left:number})[];color:string}[]=[];
  for(const i of [...items].sort((a,b)=>a.left-b.left)){const last=out.at(-1);if(last&&i.left-last.left<gap){last.items.push(i);}else out.push({left:i.left,items:[i],color:i.type.color});}
  for(const c of out){const count=new Map<string,number>();for(const i of c.items)count.set(i.type.color,(count.get(i.type.color)??0)+1);c.color=[...count].sort((a,b)=>b[1]-a[1])[0][0];c.left=c.items.reduce((n,i)=>n+i.left,0)/c.items.length;}
  return out;
}
export function HistoryTimeline47({run,entries,selectNation}:{run:FoundingForces47;entries:readonly HistoricalEntry[];selectNation:(id:string)=>void}){
  const items=useMemo(()=>historyItems47(run,entries),[run,entries]);
  const [zoom,setZoom]=useState(1),[off,setOff]=useState<Set<string>>(new Set()),[active,setActive]=useState<number|null>(null);
  const scroller=useRef<HTMLDivElement>(null);
  const start=run.life.startDate,lastDay=Math.max(1,run.world.day),years=Math.max(1,lastDay/365);
  const fit=Math.max(12,280/years),perYear=fit*zoom,width=Math.max(320,Math.ceil(years*perYear)+48),x=(day:number)=>24+day/365*perYear;
  const visible=items.filter(i=>!off.has(i.type.key)).map(i=>({...i,left:x(i.entry.day)}));
  const clusters=historyClusters47(visible,16);
  const ticks:number[]=[];const step=perYear>=40?1:perYear>=12?5:perYear>=4?10:50;const y0=isoPlusDays(start,0).year;for(let y=Math.ceil(y0/step)*step;(y-y0)*365<=lastDay+365;y+=step)ticks.push(y);
  const zoomTo=(z:number)=>{const el=scroller.current,center=el?(el.scrollLeft+el.clientWidth/2)/width:0;setZoom(z);setActive(null);requestAnimationFrame(()=>{if(el)el.scrollLeft=center*Math.max(320,Math.ceil(years*fit*z)+48)-el.clientWidth/2;});};
  const chosen=active===null?null:clusters[active]??null;
  return <div className="c47-timeline">
    <div className="c47-timeline-bar"><span>{visible.length} 件</span><button aria-label="缩小时间轴" disabled={zoom<=1} onClick={()=>zoomTo(zoom/2)}>−</button><button aria-label="放大时间轴" disabled={zoom>=32} onClick={()=>zoomTo(zoom*2)}>＋</button></div>
    <Filters items={items} off={off} setOff={setOff}/>
    <div className="c47-timeline-scroll" ref={scroller} role="group" aria-label="世界历史时间轴">
      <div className="c47-timeline-track" style={{width,height:96}}>
        <div className="c47-timeline-axis"/>
        {ticks.map(y=><span key={y} className="c47-timeline-tick" style={{left:x((y-y0)*365)}}>{y}</span>)}
        {clusters.map((c,k)=>{const size=Math.min(26,10+Math.sqrt(c.items.length)*4);return <button key={c.items[0].entry.id} className="c47-timeline-node" aria-label={c.items.length>1?`${c.items.length} 件事件`:`${c.items[0].type.label}：${c.items[0].entry.text}`} aria-pressed={active===k} style={{left:c.left,bottom:44,width:size,height:size,background:c.color}} onClick={()=>setActive(active===k?null:k)}>{c.items.length>1?<b>{c.items.length}</b>:null}</button>;})}
      </div>
    </div>
    {chosen?<div className="c47-history-cards">{chosen.items.map(i=><Entry key={i.entry.id} run={run} item={i} selectNation={selectNation}/>)}</div>:<p className="c47-menu-hint">点时间轴上的圆点查看事件；左右拖动浏览，＋/− 缩放。</p>}
  </div>;
}
