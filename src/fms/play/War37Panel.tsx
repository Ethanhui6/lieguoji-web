import {War37Overview} from './War37Overview';
import {DiplomacyControls37} from './DiplomacyControls37';
import {type War37Run} from './war37-model';
import type {DiplomacyEdit} from './war29-diplomacy';
import {DECLARATION_LABELS37} from './war37-declaration';
import {truce37} from './war37-state';

export function War37Panel({run,locate,busy,edit}:{run:War37Run;locate:(id:string)=>void;busy:boolean;edit:(e:DiplomacyEdit)=>void}){
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
 return <><details className="play-war-country" data-testid="native-diplomacy"><summary>宣战理由与外交准备</summary>
  <p className="play-muted">各国每月在自己的处理日积累准备点数；超过 100 后才考虑自主宣战。力量、好感、相邻领土与停战期共同影响选择。</p>
  {run.world.nations.filter(n=>run.world.provinces.some(p=>p.controller===n.id)).map(n=>{const d=run.nativeDiplomacy.nations[n.id];return <div className="play-row" key={n.id}><span>{n.name}</span><span>准备 {Math.floor(d.pools.startWar)} · 每月 {d.updateDay} 日</span></div>;})}
  {run.nativeDiplomacy.declarations.map(d=>{const war=run.nativeWars.campaigns.find(w=>w.id===d.warId)!;return <p key={d.warId}>{name(war.attacker!)} → {name(war.defender!)} · {DECLARATION_LABELS37[d.casusBelliId]} · {war.endedTick===null?'进行中':'已结束'}</p>;})}
  {run.nativeDiplomacy.relations.filter(p=>truce37(run,p).blocked).map(p=><p key={p.a+'/'+p.b}>{name(p.a)}／{name(p.b)}：停战期 {truce37(run,p).required} 年{p.history==='unknown'?'（旧战争次数未知，采用保护期）':` · 已结束 ${p.warCount} 次战争`}</p>)}
  <p className="play-muted">盟友与宗属共同参战，附庸可争取独立；支持领土、吞并、文化统一和附庸和约。盟军战略协同、改宗及其他内战仍待完善，旧档未知历史不会补写为零。</p>
 </details><details className="play-war-country"><summary>宗主与附庸</summary>{run.vassals.records.filter(v=>v.endedTick===null).map(v=><p key={v.vassalId}>{name(v.vassalId)} → 宗主 {name(v.overlordId)}</p>)}{!run.vassals.records.some(v=>v.endedTick===null)&&<p>尚未建立附庸关系。</p>}</details><DiplomacyControls37 run={run} busy={busy} edit={edit}/><War37Overview run={run} locate={locate}/></>;
}
