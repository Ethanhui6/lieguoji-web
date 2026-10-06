import {useState} from 'react';
import type {ChronicleRun} from './chronicle-model';
import type {Chronicle} from './chronicle-records';
import {regnalLabel} from './chronicle-records';
import {previewPolitics,type PoliticsAction} from './chronicle-politics';
import type {NewsItem} from './news';
import type {EventLocation} from './observation';
export function historicalNews(c:Chronicle):NewsItem[]{return c.entries.map(e=>({key:`history-${e.id}`,day:e.day,text:e.text,reason:e.reason,priority:e.kind==='occupation'?'normal':'major',location:e.place?{kind:'province',id:e.place.id,label:`查看${e.place.name}`} as const:null}));}
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
export function ChroniclePanel({chronicle,locate}:{chronicle:Chronicle;locate:(location:EventLocation)=>void}){
  const [count,setCount]=useState(60),events=chronicle.entries.slice().reverse().slice(0,count);
  return <section className="play-chronicle" aria-label="本局史书"><h3>本局史书 · {chronicle.entries.length} 条</h3><p className="play-muted">从第 {chronicle.originDay} 日开始，保留事件当时的人名、国名与地点；与下方160条近期战报分开保存。本版上限一万条，达到后保留存档并停止新增，绝不默删历史。</p>
    {!events.length&&<p>尚无国家要闻。真实传位、起义、独立、覆亡及外交战事发生后记录。</p>}
    {events.map(e=><article className="play-event" key={e.id} data-history-id={e.id}><small>第 {e.day} 日{e.place?` · ${e.place.name}`:''}</small><p>{e.text}</p><details><summary>查看原因</summary><p>{e.reason}</p>{e.people.map(p=><small key={p.id}>{regnalLabel(p)}（{p.name}）· 第 {p.order} 任 </small>)}</details>{e.place&&<button onClick={()=>locate({kind:'province',id:e.place!.id,label:'历史事发地'})}>定位事发地 ↗</button>}</article>)}
    {count<chronicle.entries.length&&<button onClick={()=>setCount(n=>n+60)}>查看更早记录</button>}
  </section>;
}
