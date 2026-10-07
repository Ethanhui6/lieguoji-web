import {useState} from 'react';
import type {Upper14Run} from './upper14-model';
import {POLITIES,TRAITS,type CombatTrait,type UpperCombat,provinceDefense} from './upper14-state';
import {POLITY_NAMES,TRAIT_LABELS,TRAIT_HELP,type CombatEdit,type CombatStamp} from './upper14-edit';
import {defaultPoliticalCombat,type NativePolity} from './native-combat/upper-efficiency';

export function CombatGovernmentPanel({run,nationId,busy,preview,onCancel,dynamicDestiny=false}:{run:Upper14Run;nationId:string;busy:boolean;preview:(edit:CombatEdit,stamp:CombatStamp,runId:string)=>void;onCancel:()=>void;dynamicDestiny?:boolean}){
 const [initial]=useState(()=>({runId:run.id,stamp:{day:run.world.day,nextEventId:run.world.nextEventId,tick:run.clock.tick}}));
 const [polity,setPolity]=useState(run.upperCombat.nations[nationId].polity),[traits,setTraits]=useState<CombatTrait[]>([...run.upperCombat.nations[nationId].traits]),[destiny,setDestiny]=useState(String(run.upperCombat.nations[nationId].destiny));
 const values=defaultPoliticalCombat(polity),valid=(dynamicDestiny?destiny.trim()!==''&&Number.isFinite(Number(destiny))&&Number(destiny)>=0:/^\d{1,3}$/.test(destiny))&&Number(destiny)<=100;
 return <form className="play-government-editor" aria-label="国家制度与战力设置" onSubmit={e=>{e.preventDefault();if(valid)preview({nationId,polity,traits,destiny:Number(destiny)},initial.stamp,initial.runId);}}>
  <h3>国家制度与战力</h3><p className="play-muted">世界已暂停。先预览变化，再决定是否应用。</p>
  <label>政体<select aria-label="国家政体" disabled={busy} value={polity} onChange={e=>setPolity(e.target.value as NativePolity)}>{POLITIES.map(p=><option value={p} key={p}>{POLITY_NAMES[p]}</option>)}</select></label>
  <p>政体攻势 ×{values.attack.toFixed(2)} · 守势 ×{values.defense.toFixed(2)}</p>
  <label>国运<input aria-label="国家国运" type="number" inputMode={dynamicDestiny?'decimal':'numeric'} min={0} max={100} step={dynamicDestiny?'any':1} disabled={busy} value={destiny} onChange={e=>setDestiny(e.target.value)}/></label><small>0—100；30为基础战力。{dynamicDestiny?'国运会随月结变化，也可在这里干预；保留未编辑的精确数值。':'本版国运保持不变，可在这里干预。'}</small>
  <fieldset disabled={busy}><legend>国家特性</legend>{TRAITS.map(t=><label className="play-government-trait" key={t}><input type="checkbox" checked={traits.includes(t)} onChange={e=>setTraits(old=>e.target.checked?[...old,t]:old.filter(k=>k!==t))}/><span>{TRAIT_LABELS[t]}<small>{TRAIT_HELP[t]}</small></span></label>)}</fieldset>
  <div className="play-row"><button type="submit" className="play-primary" disabled={busy||!valid}>预览国家变更</button><button type="button" disabled={busy} onClick={onCancel}>取消编辑</button></div>
 </form>;
}

export function CombatGovernmentSummary({upper,nationId,provinceId}:{upper:UpperCombat;nationId:string;provinceId:string|null}){
 const n=upper.nations[nationId],p=provinceId?upper.provinces[provinceId]:undefined;
 if(!n)return null;
 const values=defaultPoliticalCombat(n.polity),core=n.provinceOrder.filter(id=>upper.provinces[id].distance!==2147483647&&upper.provinces[id].distance<=n.coreThreshold).length;
 return <section className="play-government-summary" aria-label="国家制度与战力"><h3>{POLITY_NAMES[n.polity]} · 国运 {Number.isInteger(n.destiny)?n.destiny:n.destiny.toFixed(2)}</h3><p>政体攻势 ×{values.attack.toFixed(2)} · 守势 ×{values.defense.toFixed(2)}<br/>核心领土 {core} / {n.provinceOrder.length} 区</p><p>{n.traits.length?n.traits.map(t=>TRAIT_LABELS[t]).join(' · '):'暂无战斗特性'}</p>{p&&provinceId&&n.provinceOrder.includes(provinceId)&&<p>所选地方：{p.distance!==2147483647&&p.distance<=n.coreThreshold?'核心领土':'非核心领土'} · 通用防御 ×{provinceDefense(upper,provinceId).toFixed(2)}</p>}</section>;
}
