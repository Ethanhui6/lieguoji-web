import {useEffect,useMemo,useRef,useState} from 'react';
import type {ChronicleRun} from './chronicle-model';
import type {Chronicle} from './chronicle-records';
import {regnalLabel} from './chronicle-records';
import {previewPolitics,type PoliticsAction} from './chronicle-politics';
import type {NewsItem} from './news';
import type {EventLocation} from './observation';
import {historyKinds,queryHistory,type HistoryQuery} from './chronicle-query';
import type {HistoricalEntry} from './chronicle-records';
export function historicalNews(c:Chronicle):NewsItem[]{return c.entries.map(e=>({key:`history-${e.id}`,historyId:e.id,day:e.day,text:e.text,reason:e.reason,priority:e.kind==='occupation'?'normal':'major',location:e.place?{kind:'province',id:e.place.id,label:`查看${e.place.name}`} as const:null}));}
export function CourtPanel({run,nationId,provinceId,busy,act}:{run:ChronicleRun;nationId:string;provinceId:string|null;busy:boolean;act:(a:PoliticsAction)=>void}){
  const c=run.chronicle,ruler=c.leaders[nationId]?.at(-1),ended=Object.hasOwn(c.ended,nationId),province=run.world.provinces.find(p=>p.id===provinceId);
  const [regnalName,setRegnalName]=useState(ruler?.regnalName??'');
  const accession:PoliticsAction={type:'succession',nationId,regnalName:regnalName.trim()},preview=previewPolitics(run,accession);
  const action=(type:'uprising'|'independence'):PoliticsAction=>({type,nationId,provinceId:provinceId??''});
  return <section className="play-court" aria-label="君主与地方政治"><h3>王室与政局</h3>
    <p className="play-ruler">{ended?'政府已失去全部领土':ruler?<><strong>{regnalLabel(ruler)}</strong><span>{ruler.name} · 第 {ruler.order} 任君主</span></>:'本版暂无统治者记录'}</p>
    <p className="play-muted">自第 {c.originDay} 日开始记载。王号世数与国家任次分别累计，复用旧王号会接续它的世数。</p>
    <label className="play-regnal">继任者王号<input aria-label="继任者王号" maxLength={12} value={regnalName} onChange={e=>setRegnalName(e.target.value)} placeholder="例如：景明（不填世数）" disabled={busy||ended}/></label>
    <button disabled={busy||ended||!preview.valid} title={preview.reason} onClick={()=>act(accession)}>预览传位</button>
    {province&&<><h4>{province.name} · 地方干预</h4><p className="play-muted">地方压力 {Math.round(c.unrest[province.id]?.pressure??0)} / 100</p><div className="play-row">{(['uprising','independence'] as const).map(type=>{const p=previewPolitics(run,action(type));return <button key={type} title={p.reason} disabled={busy||!p.valid} onClick={()=>act(action(type))}>{type==='uprising'?'预览地方起义':'预览宣布独立'}</button>;})}</div><small className="play-muted">{previewPolitics(run,action('independence')).reason}</small></>}
  </section>;
}
function HistoryEntry({entry:e,focused=false,locate}:{entry:HistoricalEntry;focused?:boolean;locate:(location:EventLocation)=>void}){
  return <article className={`play-event${focused?' play-history-focused':''}`} data-history-id={e.id} data-focused={focused}>
    <small>第 {e.day} 日 · {historyKinds[e.kind]}{e.place?` · ${e.place.name}`:''}</small><p>{e.text}</p>
    <details open={focused?true:undefined}><summary>查看原因</summary><p>{e.reason}</p>{e.people.map(p=><small key={p.id}>{regnalLabel(p)}（{p.name}）· 第 {p.order} 任 </small>)}</details>
    {e.place&&<button onClick={()=>locate({kind:'province',id:e.place!.id,label:'历史事发地'})}>定位事发地 ↗</button>}
  </article>;
}
export function ChroniclePanel({chronicle,nations,focusId,locate}:{chronicle:Chronicle;nations:{id:string;name:string}[];focusId?:number;locate:(location:EventLocation)=>void}){
  const section=useRef<HTMLElement>(null);
  useEffect(()=>{if(focusId!==undefined){const panel=section.current?.closest('.play-panel');if(panel)panel.scrollTop=0;}},[focusId]);
  const [count,setCount]=useState(60),[query,setQuery]=useState<HistoryQuery>({text:'',kind:'',nationId:''}),[focused,setFocused]=useState(focusId);
  const matches=useMemo(()=>queryHistory(chronicle.entries,query),[chronicle.entries,query]);
  const chosen=chronicle.entries.find(e=>e.id===focused),events=matches.filter(e=>e.id!==chosen?.id).slice(0,count);
  const change=(value:Partial<HistoryQuery>)=>{setQuery(q=>({...q,...value}));setCount(60);};
  return <section ref={section} className="play-chronicle" aria-label="本局史书"><h3>本局史书 · {chronicle.entries.length} 条</h3>
    {chosen&&<div className="play-history-selection"><div className="play-row"><strong>当前要闻</strong><button onClick={()=>setFocused(undefined)}>收起要闻</button></div><HistoryEntry entry={chosen} focused locate={locate}/></div>}
    {focused!==undefined&&!chosen&&<p role="status">此条要闻已不在当前世界中，请查阅本局记录。</p>}
    <div className="play-history-tools" role="group" aria-label="史书筛选">
      <label>搜索史书<input type="search" aria-label="搜索史书" placeholder="国名、地名、王号或原因" maxLength={120} value={query.text} onChange={e=>change({text:e.target.value})}/></label>
      <div><label>事件类别<select aria-label="史书类别" value={query.kind} onChange={e=>change({kind:e.target.value as HistoryQuery['kind']})}><option value="">全部类别</option>{Object.entries(historyKinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label>涉及国家<select aria-label="史书国家" value={query.nationId} onChange={e=>change({nationId:e.target.value})}><option value="">全部国家</option>{nations.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label></div>
      {(query.text||query.kind||query.nationId)&&<button onClick={()=>change({text:'',kind:'',nationId:''})}>清除筛选</button>}
    </div>
    <p className="play-muted" role="status">匹配 {matches.length} 条 / 全部 {chronicle.entries.length} 条{chosen?' · 当前要闻单独展开':''}</p>
    <details className="play-history-help"><summary>史书记载范围</summary><p>从第 {chronicle.originDay} 日开始保存当时的人名、国名、地点和原因。国家选项使用现名，按同一国家的身份检索；旧记录保留旧名。与下方160条近期战报分开保存，上限一万条，达到后停止新增并保留存档。</p></details>
    {!chronicle.entries.length?<p>尚无国家要闻。真实传位、起义、独立、覆亡及外交战事发生后记录。</p>:!matches.length&&<p>没有匹配记录。试试旧地名、王号，或清除筛选。</p>}
    {events.map(e=><HistoryEntry key={e.id} entry={e} locate={locate}/>)}
    {events.length<matches.filter(e=>e.id!==chosen?.id).length&&<button onClick={()=>setCount(n=>n+60)}>查看更早记录</button>}
  </section>;
}
