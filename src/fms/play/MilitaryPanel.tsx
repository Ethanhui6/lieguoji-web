import { useState } from 'react';
import type { World } from '../../sim/types';
import { unitProfiles, type UnitKey } from './military-profile';
import type { MilitaryAction } from './military-actions';
import icons from './military-icons.json';

export function MilitaryPanel({world,nationId,busy,act}:{world:World;nationId:string;busy:boolean;act:(action:MilitaryAction)=>void}){
  const cities=world.cities.filter(c=>{const p=world.provinces.find(p=>p.id===c.provinceId)!;return p.controller===nationId&&p.legalOwner===nationId;});
  const [chosen,setChosen]=useState(''),[unit,setUnit]=useState<UnitKey>('Infantry'),[troops,setTroops]=useState(300);
  const city=cities.find(c=>c.id===chosen)??cities[0],capital=world.nations.find(n=>n.id===nationId)!.capitalId;
  return <section className="play-intervene"><h3>征募与迁都</h3>
    <label>本国城市<select aria-label="征募或迁都城市" value={city?.id??''} onChange={e=>setChosen(e.target.value)}>{!cities.length&&<option value="">没有可用城市</option>}{cities.map(c=><option value={c.id} key={c.id}>{c.name}{c.id===capital?' · 首都':''}</option>)}</select></label>
    <div className="play-unit-picker">{unitProfiles.map(p=><button key={p.key} aria-pressed={unit===p.key} className={unit===p.key?'is-active':''} onClick={()=>setUnit(p.key)}><img src={icons[p.key]} alt=""/>{p.name}</button>)}</div>
    <label>征募人数<select aria-label="征募人数" value={troops} onChange={e=>setTroops(Number(e.target.value))}>{[100,300,500,1000,2000,3000].map(n=><option key={n}>{n}</option>)}</select></label>
    <div className="play-row"><button disabled={busy||!city} onClick={()=>city&&act({type:'recruit',nationId,cityId:city.id,unit,troops})}>预览征募</button><button disabled={busy||!city||city.id===capital} onClick={()=>city&&act({type:'relocate-capital',nationId,cityId:city.id})}>预览迁都</button></div>
  </section>;
}
