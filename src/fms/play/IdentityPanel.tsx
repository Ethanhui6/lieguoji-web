import { useState } from 'react';
import type { FmsRun } from './world';
import { namedWorld } from './names';
import { nationColor, originalStatePalette } from './politics';
import {currentCapital} from './capital-view';
import type { IdentityEdit } from './customization';
import type { PlayVersion } from './session';

export function IdentityPanel({run,nationId,provinceId,busy,apply,onCancel}:{run:FmsRun;nationId:string;provinceId:string|null;busy:boolean;apply:(edits:IdentityEdit[],expected:PlayVersion,runId:string)=>void;onCancel:()=>void}){
  const world=namedWorld(run.world),nation=world.nations.find(n=>n.id===nationId)!,capital=currentCapital(world,nationId);
  const [edits,setEdits]=useState<IdentityEdit[]>(()=>[
    {kind:'world',id:run.id,name:world.custom!.name},
    {kind:'nation',id:nation.id,name:nation.name,color:nationColor(nation)},
    ...world.provinces.filter(p=>p.id===provinceId).map(p=>({kind:'province' as const,id:p.id,name:p.name})),
    ...world.cities.filter(c=>c.id===capital?.id||c.provinceId===provinceId).map(c=>({kind:'city' as const,id:c.id,name:c.name})),
  ]);
  const [initial]=useState(edits),[stamp]=useState(()=>({runId:run.id,expected:{day:run.world.day,nextEventId:run.world.nextEventId,...(run.version>=4?{tick:(run as Extract<FmsRun,{version:4|5|6|7|8}>).clock.tick}:{})}}));
  const label=(e:IdentityEdit)=>e.kind==='world'?'世界名称':e.kind==='nation'?'国家名称':e.kind==='province'?'地区名称':e.id===capital?.id?'首都名称':'城市名称';
  const invalidName=edits.some((e,i)=>e.name!==initial[i].name&&(!e.name.trim()||Array.from(e.name.trim()).length>24));
  return <form className="play-identity" onSubmit={e=>{e.preventDefault();apply(edits.flatMap((v,i)=>v.name===initial[i].name&&v.color===initial[i].color?[]:[{kind:v.kind,id:v.id,name:v.name,...(v.color!==initial[i].color?{color:v.color}:{})}]),stamp.expected,stamp.runId);}}>
    <p>时间已暂停。名称可用 1—24 个字；保存后刷新仍保留。</p>
    {edits.map((edit,i)=><label key={`${edit.kind}/${edit.id}`}>{label(edit)}<input aria-label={label(edit)} value={edit.name} required maxLength={48} disabled={busy} onChange={e=>setEdits(old=>old.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/></label>)}
    <fieldset disabled={busy}><legend>国家颜色</legend><div className="play-swatches">{originalStatePalette.map(color=><button type="button" key={color} aria-label={`国色 ${color}`} aria-pressed={edits[1].color===color} style={{background:color}} onClick={()=>setEdits(old=>old.map((e,i)=>i===1?{...e,color}:e))}>{edits[1].color===color?'✓':''}</button>)}</div></fieldset>
    {invalidName&&<p role="alert">名称需要 1—24 个字，请缩短过长的名称。</p>}
    <div className="play-row"><button className="play-primary" disabled={busy||invalidName}>应用自定义</button><button type="button" disabled={busy} onClick={onCancel}>取消编辑</button></div>
  </form>;
}
