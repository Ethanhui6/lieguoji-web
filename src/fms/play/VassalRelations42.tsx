import {useState} from 'react';
import type {War42Run} from './war42-model';
import {overlord42} from './war42-vassals';

export function VassalRelations42({run,nationId,busy,declare,release}:{run:War42Run;nationId:string;busy:boolean;declare:(target:string)=>void;release:()=>void}){
 const lord=overlord42(run,nationId),live=new Set(run.world.provinces.map(p=>p.controller));
 const [target,setTarget]=useState('');
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)!.name;
 const dependents=run.vassals.records.filter(v=>v.overlordId===nationId&&v.endedTick===null);
 return <section data-testid="vassal-relations"><h3>宗属关系</h3>
  <p>{lord?`附庸国 · 宗主 ${name(lord)}`:'独立国家'}</p>
  {dependents.length>0&&<p>附庸：{dependents.map(v=>name(v.vassalId)).join('、')}</p>}
  {lord?<><p className="play-muted">保留本国领土、首都和政府；停止自主发动普通外战。</p><button disabled={busy} onClick={release}>预览解除附庸</button></>:live.has(nationId)&&<>
   <label>附庸战争目标<select aria-label="附庸战争目标" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">选择国家</option>{run.world.nations.filter(n=>n.id!==nationId&&live.has(n.id)&&!overlord42(run,n.id)).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
   <button disabled={busy||!target} onClick={()=>declare(target)}>预览附庸战争</button>
   <p className="play-muted">需要相邻土地或可通航海域；实际战局满足和约后建立宗属关系。</p>
  </>}
 </section>;
}
