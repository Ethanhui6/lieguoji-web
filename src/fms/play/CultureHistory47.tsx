import {useEffect,useMemo,useRef,useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import type {HistoricalEntry} from './chronicle-records';
import {isoPlusDays,type IsoDate} from './native-economy/iso-calendar';
import {historyKinds} from './chronicle-query';
import {PlayIcon} from './PlayIcon';

export const historyDate47=(start:IsoDate,day:number)=>isoPlusDays(start,day);
/** Existing records do not retain a name-to-ID map at the time of the event.
 * Current names can be exchanged between countries, so never infer historical
 * attribution from them. ID-bound chips below the sentence carry current colors. */
export function CultureHistoryText47({text}:{text:string;nations:{id:string;name:string;color:string}[]}){
 return <>{text}</>;
}
export function CultureHistory47({run,focusId,selectNation}:{run:FoundingForces47;focusId:number|null;selectNation:(id:string)=>void}){
 const entries=useMemo(()=>run.chronicle.entries.filter(e=>e.kind!=='occupation').slice().reverse(),[run.chronicle.entries]);
 const yearOf=(e:HistoricalEntry)=>historyDate47(run.life.startDate,e.day).year;
 const years=[...new Set(entries.map(yearOf))],focus=entries.find(e=>e.id===focusId),focusYear=focus?yearOf(focus):null;
 const [year,setYear]=useState<number|null>(focus?yearOf(focus):null),[count,setCount]=useState(40);
 const list=useRef<HTMLOListElement>(null),entryRef=useRef(entries);entryRef.current=entries;
 useEffect(()=>{if(focusId===null||focusYear===null)return;setYear(focusYear);setCount(Math.max(40,entryRef.current.findIndex(e=>e.id===focusId)+1));},[focusId,focusYear]);
 useEffect(()=>{if(focusId!==null)list.current?.querySelector(`[data-history-id="${focusId}"]`)?.scrollIntoView({block:'nearest'});},[focusId,year,count]);
 const matches=entries.filter(e=>year===null||yearOf(e)===year),shown=matches.slice(0,count);
 return <section className="c47-chronicle" aria-label="文化世界史书"><h2><PlayIcon name="book"/>大事记</h2>
  <div className="c47-history-toolbar"><span>{entries.length} 条要闻</span><label>年份<select aria-label="大事记年份" value={year??'all'} onChange={e=>{setYear(e.target.value==='all'?null:Number(e.target.value));setCount(40);}}><option value="all">全部年份</option>{years.map(y=><option key={y} value={y}>{y} 年</option>)}</select></label></div>
  <ol ref={list} className="c47-history">{shown.map((e,i)=>{const date=historyDate47(run.life.startDate,e.day),related=run.world.nations.filter(n=>e.nationIds.includes(n.id)),first=i===0||yearOf(shown[i-1])!==date.year;return <li key={e.id} data-history-id={e.id} data-focused={focusId===e.id}>
   {first&&<h3>{date.year} 年</h3>}<article><div className="c47-history-meta"><time dateTime={`${String(date.year).padStart(4,'0')}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`}>{date.month}月{date.day}日</time><span>{historyKinds[e.kind]}</span></div>
   <p><CultureHistoryText47 text={e.text} nations={related}/></p><div className="c47-history-nations" aria-label="相关国家（现名）">{related.map(n=><button key={n.id} onClick={()=>selectNation(n.id)} title="查看当前国家信息"><i style={{background:n.color}}/>{n.name}</button>)}</div>
   <details open={focusId===e.id||undefined}><summary>缘由与人物</summary><p>{e.reason}</p>{e.people.map(p=><small key={p.id}>{p.name} · 第 {p.order} 任</small>)}{e.place&&<small>{e.place.name}</small>}<small>第 {e.day} 日</small></details>
   </article></li>;})}</ol>
  {!entries.length&&<p className="c47-empty-history">新的王朝与战事将在这里留下记录。</p>}{matches.length>shown.length&&<button onClick={()=>setCount(v=>v+40)}>更早的记录</button>}
 </section>;
}
