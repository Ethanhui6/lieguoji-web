import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import type {Culture47Action} from './culture47-session';
import {houseLands47,previewHouseGrant47} from './civilization47-houses';

export function CultureHouses47({run,id,busy,act,pause}:{run:FoundingForces47;id:string;busy:boolean;act:(a:Culture47Action)=>void;pause:()=>void}){
 const families=Object.values(run.kin.families).filter(f=>f.nationId===id),main=families.find(f=>f.id===f.stateId)!;
 const candidates=Object.values(run.kin.persons).filter(p=>p.familyId===main.id&&p.isAlive&&p.age>=18&&p.id!==main.headId&&!p.roles.some(r=>r.nativeKind==='leader'));
 const capital=run.world.cities.find(c=>c.id===run.world.nations.find(n=>n.id===id)!.capitalId)?.provinceId;
 const lands=houseLands47(run,main.id).filter(p=>p.id!==capital);
 const [person,setPerson]=useState(''),[province,setProvince]=useState(''),[preview,setPreview]=useState<ReturnType<typeof previewHouseGrant47>|null>(null),[error,setError]=useState('');
 return <details className="c47-houses"><summary>家族与分封 · {families.length} 家</summary><ul className="c47-family">{families.map(f=>{
  const grant=run.houses?.grants.find(g=>g.familyId===f.id),land=houseLands47(run,f.id),population=run.world.statecraft!.provinces.filter(p=>land.some(l=>l.id===p.provinceId)).reduce((s,p)=>s+p.population,0);
  return <li key={f.id} data-family-id={f.id}><strong>{f.surname}氏{grant?' · '+(run.world.provinces.find(p=>p.id===grant.provinceId)?.name??'')+'支系':' · 主家'}</strong><small>族长 {run.kin.persons[f.headId]?.identity.name??'暂缺'} · {f.memberIds.filter(p=>run.kin.persons[p].isAlive).length} 位在世</small><small>{land.length} 处实控封地 · 人口 {Math.round(population).toLocaleString('zh-CN')}{grant&&!land.length?' · 封地已失控，保留历史权属':''}</small></li>;
 })}</ul>
 <form onSubmit={e=>{e.preventDefault();pause();try{setPreview(previewHouseGrant47(run,{nationId:id,personId:Number(person||candidates[0]?.id),provinceId:province||lands[0]?.id}));setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>
  <label>支系家主<select aria-label="支系家主" value={person||String(candidates[0]?.id??'')} onChange={e=>{setPerson(e.target.value);setPreview(null);}}>{candidates.map(p=><option key={p.id} value={p.id}>{p.identity.name} · {p.age} 岁</option>)}</select></label>
  <label>分封辖区<select aria-label="分封辖区" value={province||lands[0]?.id||''} onChange={e=>{setProvince(e.target.value);setPreview(null);}}>{lands.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <button disabled={busy||!candidates.length||!lands.length}>预览分封</button>
 </form>{error&&<p role="alert">{error}</p>}{preview&&<div role="group" aria-label="确认家族分封"><p>{run.kin.persons[preview.personId].identity.name}及其家庭共 {preview.memberIds.length} 人分出，获得 {run.world.provinces.find(p=>p.id===preview.provinceId)?.name}。国界与军队归属不变。</p><button disabled={busy} onClick={()=>{act({kind:'family',intent:{nationId:id,personId:preview.personId,provinceId:preview.provinceId},expected:preview.expected});setPreview(null);setPerson('');setProvince('');}}>确认分封</button><button onClick={()=>setPreview(null)}>取消</button></div>}
 </details>;
}
