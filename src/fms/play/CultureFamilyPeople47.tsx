import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {isoPlusDays} from './civilization47-iso-calendar';
import {FAMILY_ACTIONS47,familyEditBlocker47,type FamilyEdit47} from './civilization47-family-edit';

/** Real registered people only. Dates come from birth records, not estimated ages.
 * With `onAction`, a person can be selected for the original FamilyTreeUI actions. */
export function CultureFamilyPeople47({run,ids,leaderId,busy,onAction}:{run:FoundingForces47;ids:number[];leaderId?:number;busy?:boolean;onAction?:(edit:FamilyEdit47)=>void}){
 const [selected,setSelected]=useState<number|null>(null),[confirm,setConfirm]=useState<FamilyEdit47['type']|null>(null);
 const [living,dead]=[true,false].map(alive=>ids.map(id=>run.kin.persons[id]).filter(p=>p?.isAlive===alive).sort((a,b)=>a.age-b.age||a.id-b.id));
 return <ul className="c47-family c47-family-people">{[...living,...dead].map(p=>{
  const birth=run.generations?.births.find(b=>b.personId===p.id),date=birth&&isoPlusDays(run.life.startDate,birth.day),father=run.kin.persons[p.fatherId],mother=run.kin.persons[p.motherId],spouse=run.kin.persons[p.spouseId];
  const family=run.kin.families[p.familyId],badges=[family?.headId===p.id&&'族长',family?.heirId===p.id&&'继承人'].filter(Boolean) as string[];
  const open=onAction&&selected===p.id;
  const body=<><strong>{p.identity.name}{badges.map(b=><em key={b} className="c47-person-badge">{b}</em>)}<small>{p.isAlive?(p.id===leaderId?'现任领袖':p.age<18?'未成年':'成年'):'已故'} · {p.age} 岁</small></strong>
   {date&&<small>生于 {date.year} 年 {date.month} 月 {date.day} 日</small>}
   {(father||mother)&&<small>父母 · {[father?.identity.name,mother?.identity.name].filter(Boolean).join(' / ')}</small>}
   {spouse&&<small>配偶 · {spouse.identity.name}{spouse.isAlive?'':'（已故）'}</small>}
   {!!p.childrenIds.length&&<small>子女 · {p.childrenIds.map(id=>run.kin.persons[id]?.identity.name).join('、')}</small>}</>;
  return <li key={p.id} data-person-id={p.id} aria-current={open||undefined}>
   {onAction?<button className="c47-person-pick" aria-expanded={!!open} onClick={()=>{setSelected(open?null:p.id);setConfirm(null);}}>{body}</button>:body}
   {open&&<div className="c47-family-actions" role="group" aria-label="家族行为">
    {confirm?<><p>{FAMILY_ACTIONS47.find(a=>a.type===confirm)!.confirm}</p><button className="is-danger" disabled={busy} onClick={()=>{onAction!({type:confirm,personId:p.id});setConfirm(null);setSelected(null);}}>确定</button><button onClick={()=>setConfirm(null)}>取消</button></>
     :FAMILY_ACTIONS47.map(a=>{const reason=familyEditBlocker47(run,{type:a.type,personId:p.id});return <button key={a.type} className={a.type==='kill'?'is-danger':undefined} disabled={busy||!!reason} title={reason??undefined} onClick={()=>a.confirm?setConfirm(a.type):onAction!({type:a.type,personId:p.id})}>{a.label}</button>;})}
   </div>}
  </li>;
 })}</ul>;
}
