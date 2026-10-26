import {memo,useState} from 'react';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {allianceOf46} from './war46-alliance';
import {isoPlusDays} from './civilization47-iso-calendar';
import {nationColor} from './politics';

/** Original AllianceInfoUI (联盟信息 / 联盟行为): the alliance's name, founding date and members with
 * their population (GetStateInternalPopulation), strongest first; 联盟行为 removes a chosen member
 * (OnKickMemberButtonClicked). Renaming and recolouring the alliance are not on the web yet. */
export const CultureAlliance47=memo(function CultureAlliance47({run,nationId,busy,onKick}:{run:PoliticalRun47;nationId:string;busy:boolean;onKick:(memberId:string)=>void}){
  const alliance=allianceOf46(run,nationId),[kick,setKick]=useState<string|null>(null);
  if(!alliance)return null;
  const population=(id:string)=>{const owned=new Set(run.world.provinces.filter(p=>p.controller===id).map(p=>p.id));return run.world.statecraft!.provinces.filter(p=>owned.has(p.provinceId)).reduce((n,p)=>n+p.population,0);};
  const members=alliance.members.map(id=>({id,nation:run.world.nations.find(n=>n.id===id)!,population:population(id)})).filter(m=>m.nation).sort((a,b)=>b.population-a.population);
  const date=isoPlusDays(run.life.startDate,Math.floor(alliance.startedTick/120));
  return <details className="c47-alliance" aria-label="联盟信息"><summary>联盟信息 · {alliance.name}</summary>
    <dl className="c47-province-rows"><div><dt>建立时间</dt><dd>{date.year} 年 {date.month} 月 {date.day} 日</dd></div><div><dt>成员</dt><dd>{members.length} 国</dd></div></dl>
    <ul className="c47-alliance-members">{members.map(m=><li key={m.id}><button aria-pressed={kick===m.id} disabled={m.id===nationId} onClick={()=>setKick(kick===m.id?null:m.id)}><i style={{background:nationColor(m.nation)}}/>{m.nation.name}<small>{Math.round(m.population).toLocaleString('zh-CN')} 人</small></button></li>)}</ul>
    <strong>联盟行为</strong>
    <div className="c47-office-buttons"><button className="is-danger" disabled={busy||!kick} onClick={()=>{if(kick){onKick(kick);setKick(null);}}}>{kick?`将${run.world.nations.find(n=>n.id===kick)?.name}移出联盟`:'选择要移出的成员'}</button></div>
  </details>;
});
