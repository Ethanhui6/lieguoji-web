import {useState} from 'react';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {GlobalOrder47} from './civilization47-global-orders';

/** Original EditPanelUI "AI全局配置" (ApplyAIGlobalSettingsAndSaveIfNeeded):
 * nine rule toggles and six interval sliders. Only rules the live world
 * actually runs are enabled; the rest are listed but marked unrestored. */
const PENDING:readonly string[]=['允许叛乱','允许附庸叛乱','协助盟友占领土地','自动放弃孤立行省','允许内战','允许家族叛乱','开启附庸'];
const PENDING_SLIDERS:readonly string[]=['行省叛乱最小间隔','家族叛乱最小间隔','内战最小间隔','主动发起战争最小间隔','被动卷入战争后主动发起战争的间隔'];
export function CultureAIGlobal47({run,busy,onOrder,onClose}:{run:PoliticalRun47;busy:boolean;onOrder:(order:GlobalOrder47)=>void;onClose:()=>void}){
  const [months,setMonths]=useState(run.diplomacy.maximumMonths);
  return <section className="c47-ai-global" role="dialog" aria-label="AI全局配置">
    <header><strong>AI全局配置</strong><button aria-label="关闭AI全局配置" onClick={onClose}>×</button></header>
    <label className="c47-check"><input type="checkbox" aria-label="允许自主外交" checked={run.diplomacy.worldAuto} disabled={busy} onChange={e=>onOrder({kind:'diplomacy',edit:{scope:'world',enabled:e.target.checked}})}/>允许自主外交</label>
    <label className="c47-check"><input type="checkbox" aria-label="允许联盟" checked={run.alliances.enabled} disabled={busy} onChange={e=>onOrder({kind:'alliance',edit:{type:'automatic',enabled:e.target.checked}})}/>允许联盟</label>
    {PENDING.map(label=><label className="c47-check is-pending" key={label}><input type="checkbox" disabled/>{label}<small>尚未还原</small></label>)}
    <label className="c47-slider">常规战争最长持续时间<output>{months?`${months} 个月`:'不限'}</output>
      <input type="range" aria-label="常规战争最长持续时间" min={0} max={480} step={12} value={months} disabled={busy} onChange={e=>setMonths(Number(e.target.value))} onPointerUp={()=>{if(months!==run.diplomacy.maximumMonths)onOrder({kind:'diplomacy',edit:{scope:'duration',months}});}} onKeyUp={()=>{if(months!==run.diplomacy.maximumMonths)onOrder({kind:'diplomacy',edit:{scope:'duration',months}});}}/></label>
    <small>仅限制常规战争；每月首日检查，到期按实际战局结算。</small>
    {PENDING_SLIDERS.map(label=><label className="c47-slider is-pending" key={label}>{label}<small>尚未还原</small></label>)}
    <small>设置记录在本世界存档中，可随存档恢复。</small>
  </section>;
}
