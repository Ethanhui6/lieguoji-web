import {War29Panel} from './War29Panel';
import {war29View,type War30Run} from './war30-model';
import type {DiplomacyEdit} from './war29-diplomacy';
import {DECLARATION_LABELS30} from './war30-declaration';
import {truce30} from './war30-state';

export function War30Panel({run,locate,busy,edit}:{run:War30Run;locate:(id:string)=>void;busy:boolean;edit:(e:DiplomacyEdit)=>void}){
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
 return <><details className="play-war-country" data-testid="native-diplomacy"><summary>宣战理由与外交准备</summary>
  <p className="play-muted">各国每月在自己的处理日积累准备点数；超过 100 后才考虑自主宣战。力量、好感、相邻领土与停战期共同影响选择。</p>
  {run.world.nations.filter(n=>run.world.provinces.some(p=>p.controller===n.id)).map(n=>{const d=run.nativeDiplomacy.nations[n.id];return <div className="play-row" key={n.id}><span>{n.name}</span><span>准备 {Math.floor(d.pools.startWar)} · 每月 {d.updateDay} 日</span></div>;})}
  {run.nativeDiplomacy.declarations.map(d=>{const war=run.nativeWars.campaigns.find(w=>w.id===d.warId)!;return <p key={d.warId}>{name(war.attacker!)} → {name(war.defender!)} · {DECLARATION_LABELS30[d.casusBelliId]} · {war.endedTick===null?'进行中':'已结束'}</p>;})}
  {run.nativeDiplomacy.relations.filter(p=>truce30(run,p).blocked).map(p=><p key={p.a+'/'+p.b}>{name(p.a)}／{name(p.b)}：停战期 {truce30(run,p).required} 年{p.history==='unknown'?'（旧战争次数未知，采用保护期）':` · 已结束 ${p.warCount} 次战争`}</p>)}
  <p className="play-muted">已接入领土争夺、吞并和文化统一。附庸、改宗、联盟与内战外交仍待接入；旧档未知历史不会补写为零。</p>
 </details><War29Panel run={war29View(run)} locate={locate} busy={busy} edit={edit}/></>;
}
