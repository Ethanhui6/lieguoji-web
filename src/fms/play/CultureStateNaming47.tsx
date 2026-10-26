import {useState} from 'react';
import type {Civilization47} from './civilization47-names';
import {CUSTOM_NAME_SEPARATOR47,customNaming47,fullNameTemplateError47,nationName47,stateBaseName47} from './civilization47-names';
import {stateTitle47} from './civilization47-catalog';
import type {CivilizationEdit47} from './civilization47-names';

/** Original StateCustomNamingPanelUI (国家行为 → 自定义命名), texts from the original localization
 * (StateCustomNaming*, StateFullNameFormat*, StateNameEmpty / StateNameAlreadyExists). */
export function CultureStateNaming47({civilization,id,busy,onEdit}:{civilization:Civilization47;id:string;busy:boolean;onEdit:(e:CivilizationEdit47)=>void}){
  const n=civilization.nations[id],stored=customNaming47(n.name.custom),enabled=!!stored;
  // GetDefaultCustomFullNameTemplate: the state's resolved form name around {Name}.
  const suggested=stateTitle47('{Name}',n.cultureId,n.polity,n.religionId);
  // A stored template that no longer validates falls back to the suggested one (StateFullNameFormatAutoFixed).
  const broken=!!stored&&stored.template.includes('{')&&!!fullNameTemplateError47(stored.template);
  const [base,setBase]=useState(stateBaseName47(n)),[template,setTemplate]=useState(stored&&!broken?stored.template:suggested),[error,setError]=useState<string|null>(null);
  const others=Object.entries(civilization.nations).filter(([k])=>k!==id).flatMap(([,v])=>[stateBaseName47(v),nationName47(v)]);
  const preview=fullNameTemplateError47(template)?null:template.replaceAll('{Name}',base.trim()||n.name.value).replaceAll('{RestorationOrdinal}','');
  const apply=(on:boolean)=>{
    if(!on){onEdit({kind:'nation',id,patch:{customName:null}});setError(null);return;}
    const name=base.trim();
    if(!name)return setError('国家名称不能为空');
    if(others.includes(name))return setError('国家名称已存在');
    const bad=fullNameTemplateError47(template.trim());if(bad)return setError(bad);
    const value=(name===n.name.value?'':name+CUSTOM_NAME_SEPARATOR47)+template.trim();
    if(value.length>100)return setError('全名模板无效，请检查大括号与格式化语法');
    setError(null);onEdit({kind:'nation',id,patch:{customName:value}});
  };
  const insert=(placeholder:string)=>{setTemplate(t=>t+placeholder);void navigator.clipboard?.writeText(placeholder).catch(()=>{});};
  return <details className="c47-naming" aria-label="自定义命名"><summary>自定义命名{enabled?' · 已启用':''}</summary>
    <small className="c47-office-hint">前缀、后缀、称号请直接写在模板里，例如：神圣{'{Name}'}帝国。模板至少要包含 {'{Name}'}；如需复国序号，可手动加入 {'{RestorationOrdinal}'}。</small>
    <label>国家名<input aria-label="国家名" value={base} maxLength={40} onChange={e=>{setBase(e.target.value);setError(null);}}/></label>
    <label>全名模板<input aria-label="全名模板" value={template} maxLength={60} onChange={e=>{setTemplate(e.target.value);setError(null);}}/></label>
    <div className="c47-naming-placeholders"><strong>模板占位符</strong><small>点击下方占位符可直接复制，然后粘贴到全名模板里。</small>
      <button type="button" onClick={()=>insert('{Name}')}>{'{Name}'}</button><button type="button" onClick={()=>insert('{RestorationOrdinal}')}>{'{RestorationOrdinal}'}</button></div>
    <p className="c47-naming-preview">当前预览：<strong>{preview??'—'}</strong></p>
    {broken&&<p className="c47-naming-error">检测到无效翻译模板，已自动回退到可用模板</p>}
    {error&&<p role="alert" className="c47-naming-error">{error}</p>}
    <div className="c47-office-buttons"><button className="c47-primary" disabled={busy} onClick={()=>apply(true)}>{enabled?'应用自定义命名':'启用自定义命名'}</button>{enabled&&<button disabled={busy} onClick={()=>apply(false)}>关闭自定义命名</button>}</div>
    <small className="c47-office-hint">叛乱继承规则：复国保留原国家自定义命名；独立叛乱不继承；继承权内战、改革内战、篡位内战会继承源国家自定义命名。</small>
  </details>;
}
