import {useState} from 'react';
import type {Dynasty23Run} from './dynasty23-model';
import {isKnownKin,kinName,kinHeir} from './dynasty23-state';
import {nativeGetDate} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {lifeDateLabel} from './life22-state';
import './family.css';
export function FamilyPanel({run,nationId}:{run:Dynasty23Run;nationId:string}){
 const leaderId=run.people.nations[nationId]?.leaderId,leader=leaderId?run.kin.persons[leaderId]:undefined,family=isKnownKin(leader)?run.kin.families[leader.familyId]:undefined;
 const [selected,setSelected]=useState<number|null>(null),candidate=selected?run.kin.persons[selected]:undefined,person=isKnownKin(candidate)&&candidate.familyId===family?.id?candidate:isKnownKin(leader)?leader:null,heir=leaderId?kinHeir(run.kin,leaderId):null;
 const relation=(id:number,empty:string)=>{const p=run.kin.persons[id];return isKnownKin(p)?<button type="button" onClick={()=>setSelected(id)}>{kinName(run,p)} <small>{p.age} 岁</small></button>:<span>{empty}</span>;};
 return <section className="play-family" aria-label="王室家谱"><h3>王室家谱 <small>{family?`${family.memberIds.length} 位成员`:'关系未记录'}</small></h3>
 {!family||!person?<p>这位君主的亲属关系尚无记录。旧世界的家谱保持未知；全新世界会生成配偶、子女和其他家族成员。</p>:<details><summary>查看{family.surname}家族</summary>
 <p className="play-family-heir" data-testid="family-heir">继承候选：{heir?<button onClick={()=>setSelected(heir.id)}>{kinName(run,heir)} · {heir.age} 岁</button>:'暂无已知候选'}</p>
 <label>家族成员<select aria-label="查看家族成员" value={person.id} onChange={e=>setSelected(Number(e.target.value))}>{family.memberIds.map(id=>{const p=run.kin.persons[id];return isKnownKin(p)?<option key={id} value={id}>{kinName(run,p)} · {p.age} 岁{id===leaderId?' · 君主':id===heir?.id?' · 继承候选':''}</option>:null;})}</select></label>
 <article key={person.id} className="play-family-person" data-testid="family-person" data-person-id={person.id}><strong>{kinName(run,person)}</strong><small>{person.gender===0?'男':'女'} · {person.age} 岁 · {person.id===leaderId?'在位君主':run.people.persons[person.id]?'曾任君主':'家族成员'}</small>
 <p>生日：{lifeDateLabel(nativeGetDate(person.birthTime,run.life.secondsPerDay,createNativeIsoCalendar(run.life.startDate)))}</p>
 <dl className="play-stats">{([['administrative','行政'],['military','军略'],['diplomatic','外交'],['charisma','魅力']] as const).map(([key,label])=><div key={key}><dt>{label}基础</dt><dd>{person.base[key].toFixed(1)}</dd></div>)}</dl>
 <dl className="play-family-links"><div><dt>配偶</dt><dd>{relation(person.spouseId,'未婚')}</dd></div><div><dt>父亲</dt><dd>{relation(person.fatherId,'未记录')}</dd></div><div><dt>母亲</dt><dd>{relation(person.motherId,'未记录')}</dd></div><div><dt>子女</dt><dd>{person.childrenIds.length?person.childrenIds.map(id=><span key={id}>{relation(id,'未记录')}</span>):'无已记录子女'}</dd></div></dl></article>
 <p className="play-muted">按子女、旁系名单和其余成员逐层选择；本家采用原作默认的男性优先评分，女儿仍可继承。亲属年龄在月初更新，传位保留人物身份。开局后婚育、自然死亡和家族领地尚未接入。</p></details>}</section>;
}
