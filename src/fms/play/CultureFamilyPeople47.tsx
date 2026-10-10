import type {FoundingForces47} from './civilization47-forces';
import {isoPlusDays} from './civilization47-iso-calendar';

/** Real registered people only. Dates come from birth records, not estimated ages. */
export function CultureFamilyPeople47({run,ids,leaderId}:{run:FoundingForces47;ids:number[];leaderId?:number}){
 const [living,dead]=[true,false].map(alive=>ids.map(id=>run.kin.persons[id]).filter(p=>p?.isAlive===alive).sort((a,b)=>a.age-b.age||a.id-b.id));
 return <ul className="c47-family c47-family-people">{[...living,...dead].map(p=>{
  const birth=run.generations?.births.find(b=>b.personId===p.id),date=birth&&isoPlusDays(run.life.startDate,birth.day),father=run.kin.persons[p.fatherId],mother=run.kin.persons[p.motherId],spouse=run.kin.persons[p.spouseId];
  return <li key={p.id} data-person-id={p.id}><strong>{p.identity.name}<small>{p.isAlive?(p.id===leaderId?'现任领袖':p.age<18?'未成年':'成年'):'已故'} · {p.age} 岁</small></strong>
   {date&&<small>生于 {date.year} 年 {date.month} 月 {date.day} 日</small>}
   {(father||mother)&&<small>父母 · {[father?.identity.name,mother?.identity.name].filter(Boolean).join(' / ')}</small>}
   {spouse&&<small>配偶 · {spouse.identity.name}{spouse.isAlive?'':'（已故）'}</small>}
   {!!p.childrenIds.length&&<small>子女 · {p.childrenIds.map(id=>run.kin.persons[id]?.identity.name).join('、')}</small>}
  </li>;
 })}</ul>;
}
