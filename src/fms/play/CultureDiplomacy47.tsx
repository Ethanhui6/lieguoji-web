import {useState} from 'react';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {PoliticalCommand47} from './civilization47-political-owner';
import type {Culture47Snapshot} from './culture47.worker';
export function CultureDiplomacy47({run,id,busy,preview,sequence,onPreview,onConfirm,onCancel}:{run:PoliticalRun47;id:string;busy:boolean;preview:Culture47Snapshot['politicalPreview']|null;sequence:number;onPreview:(a:PoliticalCommand47)=>void;onConfirm:()=>void;onCancel:()=>void}){
  const [target,setTarget]=useState(run.world.nations.find(n=>n.id!==id)?.id??'');
  const rel=run.world.statecraft!.relations.find(r=>[r.a,r.b].includes(id)&&[r.a,r.b].includes(target)),atWar=rel?.status==='war';
  const selected=preview?.action.nationId===id&&preview.action.targetNationId===target?preview:null,stale=selected&&selected.sequence!==sequence;
  const wars=run.nativeWars.campaigns.filter(w=>w.endedTick===null&&[...w.participants,...w.destroyedParticipants].some(p=>p.stateId===run.people.nations[id].id));
  return <details open className="c47-diplomacy"><summary>外交 · {wars.length?`${wars.length} 场战争`:'和平'}</summary>
    <label>往来国家<select aria-label="外交目标国家" value={target} onChange={e=>{setTarget(e.target.value);onCancel();}}>{run.world.nations.filter(n=>n.id!==id).map(n=><option value={n.id} key={n.id}>{n.name}{Object.hasOwn(run.chronicle.ended,n.id)?'（已覆亡）':''}</option>)}</select></label>
    <button disabled={busy||!target} onClick={()=>onPreview({type:atWar?'make-peace':'declare-war',nationId:id,targetNationId:target})}>{atWar?'暂停并预览停战':'暂停并预览宣战'}</button>
    {selected&&<div className="c47-diplomatic-preview" role="group" aria-label="外交预览"><strong>{selected.reason}</strong><ul>{selected.details.map((t,i)=><li key={i}>{t}</li>)}</ul>{stale&&<p>局势已变化，请重新预览。确认时仍会重验局势。</p>}{selected.valid&&!stale&&<button disabled={busy} onClick={onConfirm}>确认{selected.action.type==='declare-war'?'宣战':'停战'}</button>}{stale&&<button disabled={busy} onClick={()=>onPreview(selected.action)}>重新预览</button>}<button onClick={onCancel}>取消外交操作</button></div>}
    <small>自主外交按各国的月度日程与原作宣战门槛评估，并非每天随机开战。</small>
    {wars.map(w=><article key={w.id}><strong>{w.nations.map(id=>run.world.nations.find(n=>n.id===id)!.name).join(' — ')}</strong><small>{w.history==='complete'?`第 ${Math.floor(w.openedTick/120)} 日宣战 · ${w.goals.length} 项目标`:'开局战争：宣战者与目标未知'}</small></article>)}
  </details>;
}
