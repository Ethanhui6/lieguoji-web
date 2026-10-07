import {useState} from 'react';
import {War28Panel} from './War28Panel';
import {war28View,type War29Run} from './war29-model';
import type {DiplomacyEdit} from './war29-diplomacy';
function DiplomacyControls({run,busy,edit}:{run:War29Run;busy:boolean;edit:(e:DiplomacyEdit)=>void}){
 const [months,setMonths]=useState(String(run.diplomacy.maximumMonths));
 const value=Number(months),valid=months.trim()!==''&&Number.isInteger(value)&&value>=0&&value<=480;
 return <details className="play-war-country play-diplomacy-controls" data-testid="diplomacy-settings"><summary>自动外交与战争期限</summary>
  <p className="play-muted">控制世界自主外交；行军、战斗和补给照常运行。真正覆亡的国家仍会结束参战。</p>
  <label className="play-checkbox"><input type="checkbox" checked={run.diplomacy.worldAuto} disabled={busy} onChange={e=>edit({scope:'world',enabled:e.target.checked})}/>世界自动外交</label>
  <label>最长战争期限（月）<input aria-label="最长战争期限（月）" type="number" min={0} max={480} step={1} value={months} disabled={busy} onChange={e=>setMonths(e.target.value)}/></label>
  <p className="play-muted">0 表示不设期限，最多 480 个月。每月首日检查，期满按战局结算。</p>
  {!valid&&<p role="alert">请输入 0 至 480 的整数月。</p>}
  <button disabled={busy||!valid||value===run.diplomacy.maximumMonths} onClick={()=>edit({scope:'duration',months:value})}>预览战争期限</button>
  <h4>各国自主外交</h4><p className="play-muted">关闭某国自主外交仍允许其他国家对它宣战；世界期限仍适用。</p>
  <div className="play-diplomacy-nations">{run.world.nations.map(n=><label key={n.id} className="play-checkbox"><input aria-label={`${n.name}自主外交`} type="checkbox" checked={run.diplomacy.nations[n.id]} disabled={busy} onChange={e=>edit({scope:'nation',nationId:n.id,enabled:e.target.checked})}/>{n.name}</label>)}</div>
 </details>;
}
export function War29Panel({run,locate,busy,edit}:{run:War29Run;locate:(id:string)=>void;busy:boolean;edit:(e:DiplomacyEdit)=>void}){
 return <><DiplomacyControls key={run.diplomacy.revision} run={run} busy={busy} edit={edit}/><War28Panel run={war28View(run)} locate={locate}/></>;
}
