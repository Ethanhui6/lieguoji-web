import type {Destiny20Run} from './destiny20-model';
import type {Restoration19Run} from './restoration19-model';
import type {Naming18Run} from './naming18-model';
import type {Culture17Run} from './culture17-model';
import {useState} from 'react';
import type {Court16Run} from './court16-model';
import {COURT_OFFICES,courtHolder,courtIncome,personSkills,personTraits,previewAppointment,type Appointment,type CourtOffice} from './court16-people';
import {nativeTraitType} from './native-economy/character-generation';
const names:Record<string,string>={Genius:'天才',Brave:'勇敢',Charismatic:'富有魅力',Administrator:'善于行政',Diplomatic:'善于外交',Just:'公正',Strategist:'战略家',Merciful:'仁慈',Patient:'耐心',Craven:'怯懦',Cruel:'残酷',Incompetent:'无能',Greedy:'贪婪',Paranoid:'多疑',Wrathful:'暴躁',Ambitious:'雄心勃勃',SocialButterfly:'长袖善舞',Hawkish:'主战',Dovish:'主和',Unifier:'统一之志',BattleHardened:'久经战阵',WarWeary:'厌战',NavalMastery:'海战专长',ShipMaster:'造舰专长',Reformer:'改革者',NaturalLeader:'天生领袖',Unconvincing:'缺乏号召'};
const skills={administrative:'行政',military:'军略',diplomatic:'外交',charisma:'魅力'} as const;
export function PeoplePanel({run,nationId,provinceId,busy,appoint}:{run:Court16Run|Culture17Run|Naming18Run|Restoration19Run|Destiny20Run;nationId:string;provinceId:string|null;busy:boolean;appoint:(a:Appointment)=>void}){
 const nation=run.people.nations[nationId],persons=Object.values(run.people.persons).filter(p=>p.nationId===nationId),[personId,setPersonId]=useState(nation?.leaderId??persons[0]?.id??0),[office,setOffice]=useState<CourtOffice>('Chancellor');
 const person=run.people.persons[personId],current=person&&person.nationId===nationId?person:persons[0],values=current?personSkills(current):null,input=courtIncome(run.people,run.world,nationId,provinceId??undefined);
 const action:Appointment={nationId,office,provinceId:office==='Governor'?provinceId:null,personId:current?.id??null},preview=previewAppointment(run,action),holder=courtHolder(run.people,run.world,action),province=run.world.provinces.find(p=>p.id===provinceId);
 return <section className="play-people" aria-label="人物与任职"><h3>人物与任职 <small>{persons.length} 人已记载</small></h3>
 <p className="play-people-income">君主税赋 ×{input.tax.toFixed(3)} · 中央官职 ×{input.central.toFixed(3)}{province&&<> · 当地总督 ×{input.local.toFixed(3)}</>}</p>
 <details><summary>查看人物与安排官职</summary>{persons.length?<>
 <label>人物<select aria-label="查看人物" value={current?.id??0} disabled={busy} onChange={e=>setPersonId(Number(e.target.value))}>{persons.map(p=><option key={p.id} value={p.id}>{p.name}{p.id===nation.leaderId?' · 现任君主':' · 曾任君主'}{p.alive?'':' · 已故'}</option>)}</select></label>
 {current&&values&&<article key={current.id} className="play-person-card"><strong>{current.name}</strong><small>第 {current.recordedDay} 日起记载 · {current.id===nation.leaderId?'现任君主':'已离任，生死独立记录'}</small><dl className="play-stats">{Object.entries(skills).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{values[key as keyof typeof values].toFixed(1)}</dd></div>)}</dl><div className="play-person-traits">{personTraits(current).map(t=><span key={t.name} data-tone={nativeTraitType(t)} title={`行政 ${t.administrativeModifier} · 军略 ${t.militaryModifier} · 外交 ${t.diplomaticModifier} · 魅力 ${t.charismaModifier} · 税赋 ${(t.taxEfficiencyModifier*100).toFixed(0)}%`}>{names[t.name]??t.name}</span>)}</div></article>}
 <label>官职<select aria-label="安排官职" disabled={busy} value={office} onChange={e=>setOffice(e.target.value as CourtOffice)}>{Object.entries(COURT_OFFICES).map(([key,label])=><option key={key} value={key}>{label}{key==='Governor'?` · ${province?.name??'先选择地方'}`:''}</option>)}</select></label>
 <p data-testid="office-holder">现任：{holder?run.people.persons[holder.id].name:'空缺'}</p><div className="play-row"><button disabled={busy||!preview.valid} title={preview.reason} onClick={()=>appoint(action)}>预览任命</button><button disabled={busy||!holder||!previewAppointment(run,{...action,personId:null}).valid} onClick={()=>appoint({...action,personId:null})}>预览罢免</button></div>
 </>:<p>该国没有已观察到的现任人物。恢复统治后开始记录。</p>}<p className="play-muted">能力与特性使用已恢复的原作数值和抽样规则。任职按存活、所属国与范围校验，从下次结算影响收入。传位保留前任档案；年龄、死亡、亲属和朝廷自动任官尚未接入。</p></details></section>;
}
