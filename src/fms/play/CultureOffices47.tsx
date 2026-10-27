import {CharacterAttributes47} from './CharacterAttributes47';
import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import type {NobilityRun47} from './civilization47-nobility';
import {officeCandidates47,officeManageBlocker47,officeSlots47,officeTenureMonths47,type OfficeManage47,type OfficeRun47,type OfficeSlot47} from './civilization47-offices';
import {culture47} from './civilization47-catalog';
import {TITLE_PRESETS47,officeTitle47,titlePreset47} from './official-title-presets47';

/** Original GovernmentOfficeManagementPanel (官员任用 → 官职与将领). Texts are the original
 * localization (GovernmentOffice*). District governors are not on the web yet (no districts). */
const SOURCE:Record<number,string>={0:'AI',1:'玩家',2:'系统',3:'紧急任命'};
const POLITY:Record<string,string>={Kingdom:'王国',Empire:'帝国',Federation:'联邦',Republic:'共和国',Tribal:'部落',Theocracy:'神权'};
const PAGE=8;
export function CultureOffices47({run,nationId,busy,onManage,onBack}:{run:FoundingForces47;nationId:string;busy:boolean;onManage:(edit:OfficeManage47)=>void;onBack:()=>void}){
  const r=run as unknown as NobilityRun47,o=(run as unknown as OfficeRun47).offices47;
  const [picking,setPicking]=useState<OfficeSlot47|null>(null),[chosen,setChosen]=useState<number|null>(null),[confirm,setConfirm]=useState<OfficeSlot47|null>(null),[page,setPage]=useState(0);
  const nation=run.world.nations.find(n=>n.id===nationId),identity=run.civilization.nations[nationId];
  if(!o||!nation||!identity)return <p className="c47-menu-hint">这个世界没有启用官职系统。</p>;
  const slots=officeSlots47(r,nationId),central=slots.filter(s=>s.scopeKind===0),wars=slots.filter(s=>s.scopeKind===2),local=slots.filter(s=>s.scopeKind===1);
  const filled=slots.filter(s=>s.holder).length,manual=!!o.nations[nationId]?.manual,pages=Math.max(1,Math.ceil(local.length/PAGE)),pg=Math.min(page,pages-1);
  const T=(office:OfficeSlot47['officeId'])=>officeTitle47(identity.cultureId,identity.polity,office);
  const enemyOf=(scopeId:number)=>run.world.nations.find(n=>run.people.nations[n.id]?.id===scopeId)?.name??'';
  const label=(s:OfficeSlot47)=>s.scopeKind===0?T(s.officeId):s.scopeKind===2?`对${enemyOf(s.scopeId)}的战争 · ${T('WarCommander')}`:`${run.world.provinces.find(p=>p.id===s.provinceId)?.name??''} · ${T('Governor')}`;
  const tenure=(s:OfficeSlot47)=>{if(!s.assignment)return '';const m=Math.max(0,officeTenureMonths47(r,s.assignment.startTime));return `任期：${Math.floor(m/12)} 年 ${m%12} 个月`;};
  const send=(edit:OfficeManage47)=>{onManage(edit);};
  const row=(s:OfficeSlot47)=><li key={s.officeId+s.scopeId} className="c47-office-row">
    <div><strong>{label(s)}</strong><span>{s.holder?s.holder.identity.name:<em>空缺</em>}</span>
      {s.assignment&&s.holder&&<small>{tenure(s)} · 任命来源：{SOURCE[s.assignment.source]} · {s.assignment.locked?'已锁定':'可换届'}</small>}</div>
    <div className="c47-office-buttons">
      <button disabled={busy} onClick={()=>{setPicking(s);setChosen(null);}}>{s.holder?'更换':'任命'}</button>
      {s.assignment&&<button disabled={busy} onClick={()=>send({type:'lock',nationId,officeId:s.officeId,scopeId:s.scopeId,locked:!s.assignment!.locked})}>{s.assignment.locked?'允许换届':'锁定任命'}</button>}
      {s.assignment&&<button className="is-danger" disabled={busy} onClick={()=>setConfirm(s)}>撤职</button>}
    </div>
  </li>;
  if(picking){
    const list=officeCandidates47(r,nationId,picking.officeId,picking.scopeId),person=list.find(c=>c.person.id===chosen);
    return <section className="c47-offices" aria-label="选择任职人选">
      <h2>选择任职人选</h2><p className="c47-menu-hint">{label(picking)} · 任命{T(picking.officeId)} · 符合条件的候选人：{list.length}</p>
      {list.length?<ol className="c47-candidates">{list.map(c=><li key={c.person.id}><button aria-pressed={chosen===c.person.id} onClick={()=>setChosen(c.person.id)}>
        <span>{c.person.identity.name}<small>{c.person.age} 岁 · {c.person.identity.house}</small><CharacterAttributes47 person={{base:c.person.base,traits:c.person.traits??[]}}/></span><b title="AI 评分综合能力、年龄、文化与宗教、家族等因素">适任度 {Math.round(c.score)}</b></button></li>)}</ol>
        :<p>没有符合{T(picking.officeId)}任职条件的人物。</p>}
      <p className="c47-menu-hint">{person?`已选择：${person.person.identity.name}。确认后立即任命。`:'请选择一名候选人以继续。'}</p>
      <div className="c47-office-buttons"><button className="c47-primary" disabled={busy||!person||!!officeManageBlocker47(r,{type:'appoint',nationId,officeId:picking.officeId,scopeId:picking.scopeId,holderId:chosen??0})} onClick={()=>{send({type:'appoint',nationId,officeId:picking.officeId,scopeId:picking.scopeId,holderId:chosen!});setPicking(null);}}>确认任命</button><button onClick={()=>setPicking(null)}>返回总览</button></div>
    </section>;
  }
  return <section className="c47-offices" aria-label="官职与将领">
    <h2>{nation.name} · 官职与将领</h2>
    <p className="c47-menu-hint">文化：{culture47(identity.cultureId).label} · 政体：{POLITY[identity.polity]??identity.polity} · 官职称谓：{TITLE_PRESETS47[titlePreset47(identity.cultureId)].label} · 已任命 {filled}/{slots.length} · 空缺 {slots.length-filled}</p>
    <div className="c47-office-buttons"><button disabled={busy} aria-pressed={!manual} onClick={()=>send({type:'auto',nationId,enabled:manual})}>{manual?'启用 AI 自动任命':'关闭 AI 自动任命'}</button><button disabled={busy||filled===slots.length} onClick={()=>send({type:'fill',nationId})}>补齐空缺</button></div>
    <small className="c47-office-hint">{manual?'AI 自动任命已关闭：空缺需要手动任命。':'启用后，AI 会补齐空缺，并定期复核现任官员。'}任免操作会立即生效。</small>
    {confirm&&<div className="c47-family-actions" role="alertdialog" aria-label="确认撤职"><p>确定解除 {confirm.holder?.identity.name} 的{T(confirm.officeId)}职务吗？管辖范围：{label(confirm)}</p><button className="is-danger" disabled={busy} onClick={()=>{send({type:'dismiss',nationId,officeId:confirm.officeId,scopeId:confirm.scopeId});setConfirm(null);}}>撤职</button><button onClick={()=>setConfirm(null)}>取消</button></div>}
    <h3>中央官员</h3><small className="c47-office-hint">管理三类常设中央官员的任免。</small>
    <ul className="c47-office-list">{central.map(row)}</ul>
    <h3>战争将领</h3><small className="c47-office-hint">每场进行中的战争可任命一名临时将领，战争结束自动卸任；战斗指挥按 {T('WarCommander')} → {T('Marshal')} → 君主 依次取用。</small>
    {wars.length?<ul className="c47-office-list">{wars.map(row)}</ul>:<p className="c47-menu-hint">当前没有需要任命战争将领的进行中战争。</p>}
    <h3>地方官员 <small>已任命 {local.filter(s=>s.holder).length}/{local.length} 个行省</small></h3><small className="c47-office-hint">为每个行省分别任命一名地方官。</small>
    <ul className="c47-office-list">{local.slice(pg*PAGE,pg*PAGE+PAGE).map(row)}</ul>
    {pages>1&&<div className="c47-office-pages"><button disabled={pg===0} onClick={()=>setPage(pg-1)}>上一页</button><span>第 {pg+1}/{pages} 页</span><button disabled={pg>=pages-1} onClick={()=>setPage(pg+1)}>下一页</button></div>}
    <button onClick={onBack}>返回国家</button>
  </section>;
}
