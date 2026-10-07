import {useState} from 'react';
import type {TacticsRun} from './tactics-model';
import {previewMuster,tacticsCapacity,type MusterAction} from './tactics-muster';
import {unitProfiles,type UnitKey} from './military-profile';
import icons from './military-icons.json';
export function TacticsMusterPanel({run,nationId,provinceId,busy,selectNation,act,preview:rules}:{run:TacticsRun;nationId:string;provinceId:string|null;busy:boolean;selectNation:(id:string)=>void;act:(a:MusterAction)=>void;preview?:(a:MusterAction)=>ReturnType<typeof previewMuster>}){
  const [chosen,setChosen]=useState(''),[count,setCount]=useState(3),[unit,setUnit]=useState<UnitKey>('Infantry');
  const owned=run.world.provinces.filter(p=>p.controller===nationId&&p.legalOwner===nationId),place=owned.find(p=>p.id===(chosen||provinceId))??owned[0],cap=tacticsCapacity(run,nationId),emergency=rules?rules({type:'mobilize',nationId}):previewMuster(run,{type:'mobilize',nationId});
  const placement=place?{type:'place' as const,nationId,provinceId:place.id,count,unit}:null,preview=placement?previewMuster(run,placement):null;
  return <section className="play-muster-tools" aria-label="布兵与动员"><h3>军备与动员</h3>
    <label>指挥国家<select aria-label="布兵国家" value={nationId} onChange={e=>{setChosen('');selectNation(e.target.value);}}>{run.world.nations.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <p>常备／人工 {cap.active} 支 · 常备目标 {cap.target} 支<br/>应急军 {cap.emergency} 支 · 下次月检第 {cap.nextDay} 日</p>
    <p className="play-muted">常备军按月在空缺驻地征集。{rules?'敌国接近核心领土时，按国运与君主特性检查紧急动员；应急军不占常备名额。':'敌国与本国接壤时，可以紧急动员；应急军不占常备名额。'}</p>
    <button disabled={busy||!emergency.valid} onClick={()=>act({type:'mobilize',nationId})}>预览紧急动员</button><small>{emergency.reason}</small>
    <details><summary>上帝布兵 · 批量建立军团</summary>
      <label>放置地区<select aria-label="布兵地区" value={place?.id??''} onChange={e=>setChosen(e.target.value)}>{owned.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="play-unit-picker">{unitProfiles.map(u=><button key={u.key} aria-pressed={unit===u.key} onClick={()=>setUnit(u.key)}><img src={icons[u.key]} alt=""/>{u.name}</button>)}</div>
      <label>军团数量<input type="number" aria-label="布兵数量" min={1} max={20} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
      <small>直接放置满编军团，不扣人口与粮储。也可以先点地图上的本国地区，再打开军事页。</small>
      <button disabled={busy||!preview?.valid} onClick={()=>placement&&act(placement)}>预览布兵</button>{preview&&!preview.valid&&<p role="status">{preview.reason}</p>}
    </details>
    <details><summary>占领规则 · {run.tactics.unopposed==='takeover'?'空城接管':'原作抵抗'}</summary><p>空城接管是网页沙盒扩展；原作默认会消耗地区抵抗，即使当地没有军队。</p><button disabled={busy} onClick={()=>act({type:'occupation-rule',nationId,mode:run.tactics.unopposed==='takeover'?'resistance':'takeover'})}>{run.tactics.unopposed==='takeover'?'切换原作抵抗':'切换空城接管'}</button></details>
  </section>;
}
