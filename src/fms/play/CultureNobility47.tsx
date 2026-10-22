import type {FoundingForces47} from './civilization47-forces';
import type {Culture47Action} from './culture47-session';
import type {NobilityRun47} from './civilization47-nobility';
import {familyRelation47} from './civilization47-nobility-relations';
import {familyRebellionBlocker47,civilWarBlocker47} from './civilization47-rebellion';
import {politicalStamp47} from './civilization47-political-owner';
import type {FoundingRun47} from './civilization47-founding';
import type {PoliticalRun47} from './civilization47-diplomatic-world';

/** Original FamilyPanelUI for original-family worlds: each family of the
 * state with its patriarch, influence, territory, members and relation to the
 * ruling family; a non-ruling family with land can be made to rebel
 * (FamilyManager.DebugTriggerFamilyRebellion). */
export function CultureNobility47({run,id,busy,act,pause}:{run:FoundingForces47;id:string;busy:boolean;act:(a:Culture47Action)=>void;pause:()=>void}){
  const r=run as unknown as NobilityRun47,n=r.nobility!;
  const ids=Object.keys(n.families).filter(v=>n.families[v].nationId===id).sort((a,b)=>Number(n.families[b].ruling)-Number(n.families[a].ruling)||n.families[b].influence-n.families[a].influence);
  const ruling=ids.find(v=>n.families[v].ruling),civilBlocked=civilWarBlocker47(run as unknown as FoundingRun47,id);
  return <details className="c47-houses c47-nobility"><summary>家族 · {ids.length} 家</summary>
    <ul className="c47-family">{ids.map(v=>{
      const fam=n.families[v],k=r.kin.families[v],head=r.kin.persons[k.headId],alive=k.memberIds.filter(p=>r.kin.persons[p]?.isAlive).length;
      const relation=ruling&&ruling!==v?Math.round(familyRelation47(r,v,ruling)):null,blocked=familyRebellionBlocker47(run as unknown as FoundingRun47,v);
      return <li key={v} data-family-id={v}>
        <strong>{k.surname}家族{fam.ruling?' · 统治家族':''}</strong>
        <small>族长 {head?.isAlive?head.identity.name:'暂缺'} · 影响力 {Math.round(fam.influence)} · 领地 {fam.controlledProvinces.length} · 在世成员 {alive} · 旁支 {k.collateralMemberIds.length}{relation===null?'':` · 对统治家族 ${relation>0?'+':''}${relation}`}</small>
        {!fam.ruling&&<button disabled={busy||!!blocked} title={blocked??undefined} onClick={()=>{pause();act({kind:'family-rebellion',familyId:v,expected:politicalStamp47(run as PoliticalRun47)});}}>发动家族叛乱</button>}
      </li>;
    })}</ul>
    <button disabled={busy||!!civilBlocked} title={civilBlocked??'多个家族联合发动不同形式的内战'} onClick={()=>{pause();act({kind:'civil-war',nationId:id,expected:politicalStamp47(run as PoliticalRun47)});}}>发动内战</button>
    {civilBlocked&&<small>{civilBlocked}</small>}
  </details>;
}
