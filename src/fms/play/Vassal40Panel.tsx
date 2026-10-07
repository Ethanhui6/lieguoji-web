import {REBELLION_REASONS40,rebellionSituation40} from './war40-rebellion';
import {VassalRelations40} from './VassalRelations40';
import type {War40Run} from './war40-model';
import {quoteTribute40} from './war40-tribute';

export function Vassal40Panel({run,nationId,busy,declare,release,toggle,rebellion}:{run:War40Run;nationId:string;busy:boolean;declare:(target:string)=>void;release:()=>void;toggle:(enabled:boolean)=>void;rebellion:(enabled:boolean)=>void}){
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
 return <><section className="play-tribute" data-testid="rebellion-settings"><h3>附庸自主独立</h3><p>{run.rebellion.enabled?'允许附庸自行争取独立':'附庸自主独立已暂停'}</p>
  <button disabled={busy} onClick={()=>rebellion(!run.rebellion.enabled)}>{run.rebellion.enabled?'预览暂停自主独立':'预览允许自主独立'}</button>
  {run.vassals.records.filter(v=>v.endedTick===null&&v.vassalId===nationId).map(v=>{const info=rebellionSituation40(run,v);return <div key={v.vassalId}><p>附属 {info.years} 年 · 相对宗主实力 {(info.strengthRatio*100).toFixed(0)}%</p><p className="play-muted">{info.years<12?`至少附属满 12 年才会考虑反叛。`:'已过时间门槛。每月判断独立意愿，在三、六、九、十二月的指定日可能开战。'}</p></div>;})}
  <p className="play-muted">同时考虑宗主败局、国运与君主特性；关闭后不结束正在进行的战争。正常独立和约要求存续 36 个月并保有至少一半开战领土，或宗主覆亡。</p>
  {run.rebellion.records.filter(e=>{const v=run.vassals.records[e.relationIndex];return v.vassalId===nationId||v.overlordId===nationId;}).slice(-5).reverse().map(e=>{const v=run.vassals.records[e.relationIndex],w=run.nativeWars.campaigns.find(w=>w.id===e.warId)!;return <article className="play-tribute-receipt" key={e.warId}><strong>{name(v.vassalId)}的独立战争</strong><p>第 {e.day} 日 · {REBELLION_REASONS40[e.reason]}</p><p>{w.endedTick===null?'交战中':w.settlement?.effects.some(e=>e.type===7&&e.status<=1)?'和约确认独立':'战争已结束，未执行独立和约'}</p></article>;})}
 </section><VassalRelations40 run={run} nationId={nationId} busy={busy} declare={declare} release={release}/>{run.version===40&&<section data-testid="tribute-ledger" className="play-tribute">
  <h3>年度贡金</h3><p>当前：{run.tribute.enabled?'正常结算':'已停用'}</p>
  {run.vassals.records.filter(v=>v.endedTick===null&&(v.vassalId===nationId||v.overlordId===nationId)).map(v=>{const q=quoteTribute40(run,v.vassalId)!;return <div className="play-war-country" key={v.vassalId}>
   <strong>{name(v.vassalId)} → {name(v.overlordId)}</strong>
   <p>下次：{q.next.year} 年 12 月 {q.next.day} 日 · 当前预计 {q.amount.toLocaleString()} 金</p>
  </div>;})}
  <p className="play-muted">每年按结算日月收入 × 30% × 12 缴纳。余额不足或双方交战时跳过，不补扣往年贡金；金额随收入变化。</p>
  <button disabled={busy} onClick={()=>toggle(!run.tribute.enabled)}>{run.tribute.enabled?'预览停用年度贡金':'预览启用年度贡金'}</button>
  <p className="play-muted">贡金与自主独立分开设置，这是网页控制方式；原作由同一世界开关控制。</p>
  <h4>最近收支</h4>
  {run.tribute.receipts.filter(e=>e.vassalId===nationId||e.overlordId===nationId).slice(-12).reverse().map(e=><article className="play-tribute-receipt" key={e.id} data-receipt-id={e.id}>
   <strong>{e.year} 年 12 月 {e.dateDay} 日 · {e.status==='paid'?'已缴纳':e.status==='at-war'?'交战，暂停缴纳':'余额不足，未缴纳'}</strong>
   <p>{name(e.vassalId)} → {name(e.overlordId)}{e.amount!==null?` · ${e.amount.toLocaleString()} 金`:''}</p>
   <p className="play-muted">本国国库：{(e.vassalId===nationId?e.openingGold:e.openingOverlordGold).toLocaleString()} → {(e.vassalId===nationId?e.closingGold:e.closingOverlordGold).toLocaleString()}</p>
  </article>)}
  {!run.tribute.receipts.some(e=>e.vassalId===nationId||e.overlordId===nationId)&&<p className="play-muted">尚无到期账目。旧版本未结算的年份不会补写。</p>}
 </section>}</>;
}
