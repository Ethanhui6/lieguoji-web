import {useState} from 'react';
import type {FoundingForces47} from './civilization47-forces';
import {culture47} from './civilization47-catalog';
import {houseTitle47} from './civilization47-houses';
import {provinceDefense} from './upper14-state';
import {assertProvinceEdit47,provinceEditBlocker47,type ProvinceEdit47} from './civilization47-province-edit';
import {TICKS_PER_DAY} from './clock';

/** Original ProvinceInfoUI: 行省信息 with the 基本信息, 行省操作 and 战役信息
 * sections. Rows and texts follow UpdateBasicInfoSection /
 * UpdateCampaignInfoSection; city type follows Province.GetProvinceCityType
 * (capital → port → manual fortress/city → mountainous terrain → city). */
export type ProvinceCityType47='Capital'|'Port'|'Fortress'|'City';
const CITY_TYPE:Record<ProvinceCityType47,string>={Capital:'首都',Port:'港口',Fortress:'要塞',City:'普通城市'};
export function provinceCityType47(r:FoundingForces47,provinceId:string,ports:ReadonlySet<string>):ProvinceCityType47{
  const p=r.world.provinces.find(v=>v.id===provinceId)!,city=r.world.cities.find(c=>c.provinceId===provinceId);
  if(city&&r.world.nations.find(n=>n.id===p.controller)?.capitalId===city.id)return 'Capital';
  if(ports.has(provinceId))return 'Port';
  const c=r.upperCombat.provinces[provinceId];
  if(c?.manualSet)return c.manualFortress?'Fortress':'City';
  return r.terrainContext.provinces[provinceId]?.mountain?'Fortress':'City';
}
const number=(n:number)=>Math.round(n).toLocaleString('zh-CN');
export function CultureProvince47({run,provinceId,ports,busy,onState,onFamily,onEdit}:{run:FoundingForces47;provinceId:string;ports:ReadonlySet<string>;busy:boolean;onState:(id:string)=>void;onFamily:(nationId:string)=>void;onEdit:(edit:ProvinceEdit47)=>void}){
  const [dialog,setDialog]=useState<null|{kind:'population';current:string;max:string;error:string}|{kind:'defense';modifier:string;locked:boolean;error:string}>(null);
  const p=run.world.provinces.find(v=>v.id===provinceId);if(!p)return null;
  const nation=run.world.nations.find(n=>n.id===p.controller),city=run.world.cities.find(c=>c.provinceId===p.id);
  const economy=run.world.statecraft!.provinces.find(v=>v.provinceId===p.id),max=run.finance.provinces[p.id]?.maxPopulation;
  const combat=run.upperCombat.provinces[p.id],threshold=nation?run.upperCombat.nations[nation.id]?.coreThreshold:undefined;
  const core=!!combat&&threshold!==undefined&&combat.distance<=threshold;
  const familyId=houseTitle47(run,p.id),family=familyId===null?null:run.kin.families[String(familyId)];
  const culture=city?run.civilization.cities[city.id]?.cultureId:undefined;
  const type=provinceCityType47(run,p.id,ports),siege=run.occupation.sieges.find(s=>s.provinceId===p.id);
  const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
  const blankState=!nation;
  const action=(type:'capital'|'fortress'|'city',label:string)=>{const reason=provinceEditBlocker47(run as never,{type,provinceId:p.id});return <button disabled={busy||blankState||!!reason} title={reason??undefined} onClick={()=>onEdit({type,provinceId:p.id})}>{label}</button>;};
  return <section className="c47-province" aria-label="行省信息" data-city-type={type}>
    <h2>{p.name}</h2>
    <details open><summary>基本信息</summary><dl className="c47-province-rows">
      <div><dt>人口</dt><dd>{economy?`${number(economy.population)}/${max===undefined?'—':number(max)}`:'—'}</dd></div>
      <div><dt>国家</dt><dd>{nation?<button className="c47-link" onClick={()=>onState(nation.id)}>{nation.name}</button>:'无'}</dd></div>
      <div><dt>区域</dt><dd>无</dd></div>
      <div><dt>核心省份</dt><dd>{core?'是':'否'}</dd></div>
      <div><dt>城市类型</dt><dd>{CITY_TYPE[type]}</dd></div>
      <div><dt>文化</dt><dd>{culture?culture47(culture).label:'无'}</dd></div>
      <div><dt>家庭</dt><dd>{family&&nation?<button className="c47-link" onClick={()=>onFamily(family.nationId)}>{family.surname}</button>:'无'}</dd></div>
      <div><dt>主场作战效率</dt><dd>{combat?provinceDefense(run.upperCombat,p.id).toFixed(2):'—'}</dd></div>
      <div className="is-pending"><dt>宗教 · 总督 · 城市防御力</dt><dd>尚未还原</dd></div>
    </dl></details>
    <details open><summary>行省操作</summary><div className="c47-action-grid" role="group" aria-label="行省操作">
      {action('capital','设为首都')}{action('fortress','要塞化')}{action('city','去要塞化')}
      <button disabled={busy||!economy||max===undefined} title="设置当前人口、最大人口和最大人口锁定状态。" onClick={()=>setDialog({kind:'population',current:String(economy!.population),max:String(max),error:''})}>自定义人口</button>
      <button disabled={busy||!combat} title="设置当前城市防御、最大城市防御和主场作战效率。城市防御是攻占血量，主场作战效率会影响本行省陆战攻防。" onClick={()=>setDialog({kind:'defense',modifier:provinceDefense(run.upperCombat,p.id).toFixed(2),locked:combat!.locked,error:''})}>自定义防御</button>
      {['煽动叛乱','设为区域中心'].map(t=><button key={t} disabled title="尚未还原">{t}</button>)}
    </div>
    {dialog?.kind==='population'&&<form className="c47-province-dialog" aria-label="设置自定义人口" onSubmit={e=>{e.preventDefault();const edit={type:'population' as const,provinceId:p.id,current:Number(dialog.current.trim()),max:Number(dialog.max.trim())};try{if(!/^\d{1,10}$/.test(dialog.current.trim())||!/^\d{1,10}$/.test(dialog.max.trim()))throw Error();assertProvinceEdit47(edit);}catch{setDialog({...dialog,error:'自定义人口输入无效，请输入有效整数，当前人口不能小于 0，最大人口必须大于 0，且当前人口不能大于最大人口'});return;}setDialog(null);onEdit(edit);}}>
      <strong>设置自定义人口</strong>
      <label>当前人口<input inputMode="numeric" maxLength={10} value={dialog.current} onChange={e=>setDialog({...dialog,current:e.target.value,error:''})}/></label>
      <label>最大人口<input inputMode="numeric" maxLength={10} value={dialog.max} onChange={e=>setDialog({...dialog,max:e.target.value,error:''})}/></label>
      <label className="c47-check is-pending" title="网页推演中不会重算最大人口，锁定无实际作用"><input type="checkbox" disabled/>锁定最大人口<small>网页无重算流程</small></label>
      {dialog.error&&<p className="c47-menu-error" role="alert">{dialog.error}</p>}
      <div><button type="submit" disabled={busy}>确定</button><button type="button" onClick={()=>setDialog(null)}>取消</button></div>
    </form>}
    {dialog?.kind==='defense'&&<form className="c47-province-dialog" aria-label="设置自定义防御" onSubmit={e=>{e.preventDefault();const edit={type:'defense' as const,provinceId:p.id,modifier:Number(dialog.modifier.trim()),locked:dialog.locked};try{if(!dialog.modifier.trim())throw Error();assertProvinceEdit47(edit);}catch{setDialog({...dialog,error:'自定义防御输入无效，请输入有效数字：当前城市防御不能小于 0，最大城市防御必须大于 0，当前城市防御不能大于最大城市防御，主场作战效率必须在 1 到 10 之间。'});return;}setDialog(null);onEdit(edit);}}>
      <strong>设置自定义防御</strong>
      <label className="is-pending">当前城市防御 · 最大城市防御<small>尚未还原（网页无城市血量）</small></label>
      <label>主场作战效率<input inputMode="decimal" maxLength={5} value={dialog.modifier} onChange={e=>setDialog({...dialog,modifier:e.target.value,error:''})}/></label>
      <label className="c47-check" title={dialog.locked?'已锁定：本行省使用玩家设置的主场作战效率，地形、生态和要塞状态不会覆盖它。':'未锁定：主场作战效率会跟随地形、生态和要塞规则。普通地形为 1，台地约 1.5，山地或要塞最高为 3。'}><input type="checkbox" aria-label="锁定主场作战效率" checked={dialog.locked} onChange={e=>setDialog({...dialog,locked:e.target.checked,error:''})}/>锁定主场作战效率</label>
      {dialog.error&&<p className="c47-menu-error" role="alert">{dialog.error}</p>}
      <div><button type="submit" disabled={busy}>确定</button><button type="button" onClick={()=>setDialog(null)}>取消</button></div>
    </form>}
    <small>操作会暂停推演并记入本世界存档。煽动叛乱与区域中心尚未还原。</small></details>
    <details open><summary>战役信息</summary>{siege?<dl className="c47-province-rows">
      <div><dt>交战国</dt><dd><b>{name(siege.attacker)}</b> vs <b>{name(siege.controller)}</b></dd></div>
      <div><dt>战役持续时间</dt><dd>{Math.max(0,Math.floor((run.clock.tick-siege.started)/TICKS_PER_DAY))} 天</dd></div>
      <div><dt>占领进度</dt><dd>{siege.maximum>0?(100*(1-siege.resistance/siege.maximum)).toFixed(2):'0.00'}%</dd></div>
      <div><dt>包围或突出部</dt><dd>{combat&&!combat.connected&&p.controller===siege.controller?'是':'否'}</dd></div>
    </dl>:<p>没有正在进行的战役</p>}</details>
  </section>;
}
