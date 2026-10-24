import {useState,type ReactNode} from 'react';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {PoliticalCommand47} from './civilization47-political-owner';
import type {Culture47Snapshot} from './culture47.worker';
import {campaignCardsForNation47} from './campaign-card47';
export function CultureDiplomacy47({run,id,activeSiegeIds,busy,preview,sequence,onPreview,onConfirm,onCancel,children}:{children?:ReactNode;run:PoliticalRun47;id:string;activeSiegeIds:readonly string[];busy:boolean;preview:Culture47Snapshot['politicalPreview']|null;sequence:number;onPreview:(a:PoliticalCommand47)=>void;onConfirm:()=>void;onCancel:()=>void}){
  const [target,setTarget]=useState(run.world.nations.find(n=>n.id!==id)?.id??'');
  const rel=run.world.statecraft!.relations.find(r=>[r.a,r.b].includes(id)&&[r.a,r.b].includes(target)),atWar=rel?.status==='war';
  const selected=preview?.action.nationId===id&&preview.action.targetNationId===target?preview:null,stale=selected&&selected.sequence!==sequence;
 const wars=campaignCardsForNation47(run,id,activeSiegeIds),sieges=wars[0]?.globalActiveSieges??0;
 return <details className="c47-diplomacy"><summary>战争{wars.length?` · ${wars.length} 场${sieges?` · ${sieges} 处围城`:''}`:''}</summary>{children}{!wars.length&&<p>没有进行中的战争</p>}
    <label>往来国家<select aria-label="外交目标国家" value={target} onChange={e=>{setTarget(e.target.value);onCancel();}}>{run.world.nations.filter(n=>n.id!==id).map(n=><option value={n.id} key={n.id}>{n.name}{Object.hasOwn(run.chronicle.ended,n.id)?'（已覆亡）':''}</option>)}</select></label>
    <button disabled={busy||!target} onClick={()=>onPreview({type:atWar?'make-peace':'declare-war',nationId:id,targetNationId:target})}>{atWar?'暂停并预览停战':'暂停并预览宣战'}</button>
    {selected&&<div className="c47-diplomatic-preview" role="group" aria-label="外交预览"><strong>{selected.reason}</strong><ul>{selected.details.map((t,i)=><li key={i}>{t}</li>)}</ul>{stale&&<p>局势已变化，请重新预览。确认时仍会重验局势。</p>}{selected.valid&&!stale&&<button disabled={busy} onClick={onConfirm}>确认{selected.action.type==='declare-war'?'宣战':'停战'}</button>}{stale&&<button disabled={busy} onClick={()=>onPreview(selected.action)}>重新预览</button>}<button onClick={onCancel}>取消外交操作</button></div>}
    {wars.map(w=><article className="c47-campaign-card" data-campaign-id={w.id} key={w.id}><header><strong>{w.sides.map(side=>`${side.label}：${side.nationNames.join('、')||'无现存国家'}`).join(' · ')}</strong><small>{w.durationLabel} · {w.goalCount?`${w.goalCount} 项目标`:'原始目标未记录'}</small></header><p>{w.declarationReason?`宣战理由：${w.declarationReason}`:'开局战争：原始宣战理由未记录'}</p><dl><div><dt>累计军力损失（原作战分）</dt><dd>{w.sides.map(side=>`${side.label} ${Math.round(side.recordedLoss*100)/100}`).join(' / ')}</dd></div><div><dt>当前有效围城</dt><dd>全世界 {w.globalActiveSieges} 处</dd></div></dl>{w.departedNationIds.length>0&&<small>历史离场成员：{w.departedNationIds.map(nationId=>run.world.nations.find(nation=>nation.id===nationId)?.name??'未记录国家').join('、')}</small>}<details><summary>目标与战况</summary><p>{w.details}</p><small>{w.territoryLedgerNote}</small></details></article>)}
  </details>;
}
