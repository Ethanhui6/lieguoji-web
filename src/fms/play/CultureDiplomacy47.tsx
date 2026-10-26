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
    {wars.map(w=>{const mine=w.sides.find(side=>side.nationIds.includes(id));return <article className="c47-campaign-card" data-campaign-id={w.id} key={w.id}>
      <strong>{w.sides[0].nationNames[0]??'—'} → {w.sides[1].nationNames[0]??'—'}</strong>
      <dl className="c47-province-rows">
        <div><dt>战争类型</dt><dd>{w.warType}</dd></div>
        <div><dt>我方阵营</dt><dd>{mine?(mine.side===0?'发起方':'防御方'):'中立'}</dd></div>
        {w.goalTexts.length>0&&<div><dt>战争目标</dt><dd>{w.goalTexts.join('、')}</dd></div>}
        {mine&&<div><dt>阵亡</dt><dd>{Math.round(mine.recordedLoss)}</dd></div>}
        <div><dt>持续时间</dt><dd>{Math.floor(w.months/12)} 年 {w.months%12} 月</dd></div>
        <div><dt>{w.history==='complete'?'发起方':w.sides[0].label}</dt><dd>{w.sides[0].nationNames.join(', ')||'—'}</dd></div>
        <div><dt>{w.history==='complete'?'防御方':w.sides[1].label}</dt><dd>{w.sides[1].nationNames.join(', ')||'—'}</dd></div>
      </dl></article>;})}
    <label>往来国家<select aria-label="外交目标国家" value={target} onChange={e=>{setTarget(e.target.value);onCancel();}}>{run.world.nations.filter(n=>n.id!==id).map(n=><option value={n.id} key={n.id}>{n.name}{Object.hasOwn(run.chronicle.ended,n.id)?'（已覆亡）':''}</option>)}</select></label>
    <button disabled={busy||!target} onClick={()=>onPreview({type:atWar?'make-peace':'declare-war',nationId:id,targetNationId:target})}>{atWar?'暂停并预览停战':'暂停并预览宣战'}</button>
    {selected&&<div className="c47-diplomatic-preview" role="group" aria-label="外交预览"><strong>{selected.reason}</strong><ul>{selected.details.map((t,i)=><li key={i}>{t}</li>)}</ul>{stale&&<p>局势已变化，请重新预览。确认时仍会重验局势。</p>}{selected.valid&&!stale&&<button disabled={busy} onClick={onConfirm}>确认{selected.action.type==='declare-war'?'宣战':'停战'}</button>}{stale&&<button disabled={busy} onClick={()=>onPreview(selected.action)}>重新预览</button>}<button onClick={onCancel}>取消外交操作</button></div>}

  </details>;
}
