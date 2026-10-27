import {CharacterAttributes47} from './CharacterAttributes47';
import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {isoPlusDays} from './civilization47-iso-calendar';
import {FAMILY_ACTIONS47,familyEditBlocker47,type FamilyEdit47} from './civilization47-family-edit';

type Step47={kind:'confirm';type:FamilyEdit47['type']}|{kind:'age';text:string;error:string|null}|{kind:'spouse'};
/** Real registered people only. Dates come from birth records, not estimated ages.
 * With `onAction`, a person can be selected for the original FamilyTreeUI actions. */
export function CultureFamilyPeople47({run,ids,leaderId,busy,onAction}:{run:FoundingForces47;ids:number[];leaderId?:number;busy?:boolean;onAction?:(edit:FamilyEdit47)=>void}){
 const [selected,setSelected]=useState<number|null>(null),[step,setStep]=useState<Step47|null>(null);
 const [living,dead]=[true,false].map(alive=>ids.map(id=>run.kin.persons[id]).filter(p=>p?.isAlive===alive).sort((a,b)=>a.age-b.age||a.id-b.id));
 const done=(edit:FamilyEdit47)=>{onAction!(edit);setStep(null);setSelected(null);};
 return <ul className="c47-family c47-family-people">{[...living,...dead].map(p=>{
  const birth=run.generations?.births.find(b=>b.personId===p.id),date=birth&&isoPlusDays(run.life.startDate,birth.day),father=run.kin.persons[p.fatherId],mother=run.kin.persons[p.motherId],spouse=run.kin.persons[p.spouseId];
  const family=run.kin.families[p.familyId],badges=[family?.headId===p.id&&'族长',family?.heirId===p.id&&'继承人'].filter(Boolean) as string[];
  const open=onAction&&selected===p.id;
  const body=<><strong>{p.identity.name}{badges.map(b=><em key={b} className="c47-person-badge">{b}</em>)}<small>{p.isAlive?(p.id===leaderId?'现任领袖':p.age<18?'未成年':'成年'):'已故'} · {p.age} 岁</small></strong>
   <CharacterAttributes47 person={{base:p.base,traits:p.traits??[]}}/>{date&&<small>生于 {date.year} 年 {date.month} 月 {date.day} 日</small>}
   {(father||mother)&&<small>父母 · {[father?.identity.name,mother?.identity.name].filter(Boolean).join(' / ')}</small>}
   {spouse&&<small>配偶 · {spouse.identity.name}{spouse.isAlive?'':'（已故）'}</small>}
   {!!p.childrenIds.length&&<small>子女 · {p.childrenIds.map(id=>run.kin.persons[id]?.identity.name).join('、')}</small>}</>;
  // FamilyTreeUI.HandleSetAgeInputSubmitted: an integer within 0–200.
  const submitAge=(text:string)=>{const t=text.trim();if(!/^-?\d+$/.test(t))return setStep({kind:'age',text,error:'年龄输入无效，请输入整数'});const age=Number(t);if(age<0||age>200)return setStep({kind:'age',text,error:'年龄超出范围（0-200）'});done({type:'age',personId:p.id,age});};
  const edit=(type:FamilyEdit47['type']):FamilyEdit47=>type==='age'?{type,personId:p.id,age:p.age}:{type,personId:p.id};
  const pick=(type:FamilyEdit47['type'])=>{const a=FAMILY_ACTIONS47.find(a=>a.type===type)!;if(a.confirm)setStep({kind:'confirm',type});else if(type==='age')setStep({kind:'age',text:String(p.age),error:null});else if(type==='spouse')setStep({kind:'spouse'});else done(edit(type));};
  return <li key={p.id} data-person-id={p.id} aria-current={open||undefined}>
   {onAction?<button className="c47-person-pick" aria-expanded={!!open} onClick={()=>{setSelected(open?null:p.id);setStep(null);}}>{body}</button>:body}
   {open&&<div className="c47-family-actions" role="group" aria-label="家族行为">
    {step?.kind==='confirm'?<><p>{FAMILY_ACTIONS47.find(a=>a.type===step.type)!.confirm}</p><button className="is-danger" disabled={busy} onClick={()=>done(edit(step.type))}>确定</button><button onClick={()=>setStep(null)}>取消</button></>
     :step?.kind==='age'?<form className="c47-family-age" onSubmit={e=>{e.preventDefault();submitAge(step.text);}}>
       <input inputMode="numeric" aria-label="年龄" placeholder="输入年龄（岁）" value={step.text} autoFocus onChange={e=>setStep({kind:'age',text:e.target.value,error:null})}/>
       <button type="submit" className="c47-primary" disabled={busy}>确定</button><button type="button" onClick={()=>setStep(null)}>取消</button>
       {step.error&&<p role="alert">{step.error}</p>}</form>
     :step?.kind==='spouse'?<><p>选择配偶来源</p><button className="c47-primary" disabled={busy} onClick={()=>done({type:'spouse',personId:p.id})}>生成新配偶（随机）</button><button onClick={()=>setStep(null)}>取消</button></>
     :FAMILY_ACTIONS47.map(a=>{const reason=familyEditBlocker47(run,edit(a.type));return <button key={a.type} className={a.type==='kill'?'is-danger':undefined} disabled={busy||!!reason} title={reason??undefined} onClick={()=>pick(a.type)}>{a.label}</button>;})}
   </div>}
  </li>;
 })}</ul>;
}
