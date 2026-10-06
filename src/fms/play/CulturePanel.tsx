import {useState} from 'react';
import type {Culture17Run} from './culture17-model';
import {ETHNIC_LABELS,previewCultureEdit,type CultureEdit} from './culture17-culture';
import {NATIVE_ETHNIC_NAMES,type NativeEthnicName} from './native-economy/ethnic-generation';
export function CulturePanel({run,nationId,busy,edit}:{run:Culture17Run;nationId:string;busy:boolean;edit:(a:CultureEdit)=>void}){
 const record=run.culture.nations[nationId],map=run.culture.maps[record.mapCultureId];
 const [ethnic,setEthnic]=useState<NativeEthnicName>(record.ethnic),action={nationId,ethnic},preview=previewCultureEdit(run,action);
 const count=run.world.provinces.filter(p=>p.controller===nationId&&run.finance.provinces[p.id].resources.some(r=>r.affectedBy.includes(record.ethnic))).length;
 return <section className="play-culture" aria-label="文化与族群"><h3>文化与族群</h3><p><strong>{map.name}</strong> · <span data-testid="nation-ethnic">{ETHNIC_LABELS[record.ethnic]}</span></p><p>当前 {count} 个辖区拥有匹配资源，其资源项计算值 ×1.2；最终收入按人口、国运等计算并取整。</p>
 <details><summary>查看族群与调整</summary><p>第 {record.recordedDay} 日建立记录。{record.origin==='secession'?'文化承接母国，族群在建国时抽取。':record.origin==='explicit-copy'?'本副本从当日补建文化，不改写此前历史。':'当前东方命名世界按原权重生成族群，并持续保存。'}</p><label>族群特点<select aria-label="调整族群" value={ethnic} disabled={busy} onChange={e=>setEthnic(e.target.value as NativeEthnicName)}>{NATIVE_ETHNIC_NAMES.map(n=><option key={n} value={n}>{ETHNIC_LABELS[n]}</option>)}</select></label><button disabled={busy||!preview.valid} title={preview.reason} onClick={()=>edit(action)}>预览族群调整</button><p className="play-muted">资源收入与财政战力在下次月结重算；已有金币、已结算战力和所有名称保持。其他文化的完整命名、文化同化与信仰尚未接入。</p></details></section>;
}
