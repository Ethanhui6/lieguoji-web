import {useEffect,useMemo,useRef,useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import type {HistoricalEntry} from './chronicle-records';
import {isoPlusDays,type IsoDate} from './civilization47-iso-calendar';
import {historyKinds,isMajorHistory} from './chronicle-query';
import {PlayIcon} from './PlayIcon';

export const historyDate47=(start:IsoDate,day:number)=>isoPlusDays(start,day);
export type HistoryScope47='important'|'all';
/** The complete ledger retains every real transfer. The default view stays
 * intentionally quiet so routine front movement cannot disguise a declaration,
 * succession, independence, or peace as an equally important headline. */
export const historyEntries47=(entries:readonly HistoricalEntry[],scope:HistoryScope47)=>entries.filter(entry=>scope==='all'||isMajorHistory(entry)).slice().reverse();
/** Presentation only: the engine-bound historical record stays unchanged.
 * Recognize the existing muster formats, not names or inferred participants. */
export function historyPresentation47(e:Pick<HistoricalEntry,'kind'|'text'|'reason'|'day'>&Partial<Pick<HistoricalEntry,'people'>>,death=false){
 if(death)return {kind:'领袖去世',reason:'领袖自然去世，任期结束。其身份与家族记录保留，国家按当前政体确定接任者。'};
 if(e.kind==='diplomacy'){
  if(/紧急动员，征召\d+支军队$/.test(e.text))return {kind:'紧急动员',reason:'国家核心地区面临战争威胁，征召应急部队加强防御。连续动员受到年度与五年冷却限制。'};
  if(/新编\d+支常备军$/.test(e.text))return {kind:'征募',reason:'在本土城镇征集常备部队，补充各地编制。'+(e.reason.match(/本次扣内部人口(\d+)/)?.[1]?`本次征募消耗人口${e.reason.match(/本次扣内部人口(\d+)/)![1]}。`:'')};
  if(/遣散\d+支应急军$/.test(e.text))return {kind:'遣散',reason:'战事平息，已返回本国并停驻的应急部队解除编制；尚在途中或海外的部队继续保留。'};
  if(/的孩子.+出生$/.test(e.text))return {kind:'出生',reason:e.reason};
  if(/与.+成婚$/.test(e.text))return {kind:'成婚',reason:e.reason};
  if(e.text.includes('宣战：'))return {kind:'宣战',reason:e.reason};
  if(e.text.includes('的战争结束：'))return {kind:'战争结束',reason:e.reason};
 }
 return {kind:e.kind==='accession'?(e.day===0&&!e.people?.some(p=>p.order>1)?(e.text.includes('开篇：')?'开篇在位':'开国就任'):'领袖继任'):historyKinds[e.kind],reason:e.reason};
}
/** Existing records do not retain a name-to-ID map at the time of the event.
 * Current names can be exchanged between countries, so never infer historical
 * attribution from them. ID-bound chips below the sentence carry current colors. */
export function CultureHistoryText47({text}:{text:string;nations:{id:string;name:string;color:string}[]}){
 return <>{text}</>;
}
export function CultureHistory47({run,focusId,selectNation}:{run:FoundingForces47;focusId:number|null;selectNation:(id:string)=>void}){
 const allEntries=run.chronicle.entries;
 const yearOf=(e:HistoricalEntry)=>historyDate47(run.life.startDate,e.day).year;
 const initialFocus=allEntries.find(e=>e.id===focusId),[scope,setScope]=useState<HistoryScope47>(()=>initialFocus?.kind==='occupation'?'all':'important');
 const entries=useMemo(()=>historyEntries47(allEntries,scope),[allEntries,scope]);
 const years=[...new Set(entries.map(yearOf))],focus=entries.find(e=>e.id===focusId),focusYear=focus?yearOf(focus):null;
 const [year,setYear]=useState<number|null>(initialFocus?yearOf(initialFocus):null),[count,setCount]=useState(40);
 const list=useRef<HTMLOListElement>(null),entryRef=useRef(entries);entryRef.current=entries;
 useEffect(()=>{const selected=allEntries.find(e=>e.id===focusId);if(selected?.kind==='occupation')setScope('all');},[allEntries,focusId]);
 useEffect(()=>{if(focusId===null||focusYear===null)return;setYear(focusYear);setCount(Math.max(40,entryRef.current.findIndex(e=>e.id===focusId)+1));},[focusId,focusYear]);
 useEffect(()=>{if(focusId!==null)list.current?.querySelector(`[data-history-id="${focusId}"]`)?.scrollIntoView({block:'nearest'});},[focusId,year,count]);
 const matches=entries.filter(e=>year===null||yearOf(e)===year),shown=matches.slice(0,count);
 return <section className="c47-chronicle" aria-label="文化世界史书"><h2><PlayIcon name="book"/>大事记</h2>
  <div className="c47-history-toolbar"><span>{entries.length} 条{scope==='important'?'要闻':'记录'}</span><label>范围<select aria-label="大事记范围" value={scope} onChange={e=>{setScope(e.target.value as HistoryScope47);setCount(40);}}><option value="important">重要大事</option><option value="all">全部记录（含领土易手）</option></select></label><label>年份<select aria-label="大事记年份" value={year??'all'} onChange={e=>{setYear(e.target.value==='all'?null:Number(e.target.value));setCount(40);}}><option value="all">全部年份</option>{years.map(y=><option key={y} value={y}>{y} 年</option>)}</select></label></div>
  <ol ref={list} className="c47-history">{shown.map((e,i)=>{const date=historyDate47(run.life.startDate,e.day),related=run.world.nations.filter(n=>e.nationIds.includes(n.id)),first=i===0||yearOf(shown[i-1])!==date.year,presentation=historyPresentation47(e,run.kin.lifecycle?.deaths.some(d=>d.deathHistoryId===e.id));return <li key={e.id} data-history-id={e.id} data-focused={focusId===e.id}>
   {first&&<h3>{date.year} 年</h3>}<article><div className="c47-history-meta"><time dateTime={`${String(date.year).padStart(4,'0')}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`}>{date.month}月{date.day}日</time><span>{presentation.kind}</span></div>
   <p><CultureHistoryText47 text={e.text} nations={related}/></p><div className="c47-history-nations" aria-label="相关国家（现名）">{related.map(n=><button key={n.id} onClick={()=>selectNation(n.id)} title="查看当前国家信息"><i style={{background:n.color}}/>{n.name}</button>)}</div>
   <details open={focusId===e.id||undefined}><summary>缘由与人物</summary><p>{presentation.reason}</p>{e.sourceEventId!==null&&<small data-event-id={e.sourceEventId}>事件 {e.sourceEventId}</small>}{e.people.map(p=><small key={p.id}>{p.name} · {run.origins?'本局记载第':'第'} {p.order} 任</small>)}{e.place&&<small>{e.place.name}</small>}</details>
   </article></li>;})}</ol>
  {!entries.length&&<p className="c47-empty-history">新的王朝与战事将在这里留下记录。</p>}{matches.length>shown.length&&<button onClick={()=>setCount(v=>v+40)}>更早的记录</button>}
 </section>;
}
