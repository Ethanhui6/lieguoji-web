import {Vassal31Panel} from './Vassal31Panel';
import type {War31Run} from './war31-model';
import type {War32Run} from './war32-model';
import {quoteTribute32} from './war32-tribute';

export function Vassal32Panel({run,nationId,busy,declare,release,toggle}:{run:War31Run|War32Run;nationId:string;busy:boolean;declare:(target:string)=>void;release:()=>void;toggle:(enabled:boolean)=>void}){
 const base=run.version===31?run:{...run,version:31 as const,rules:'fms-war-31' as const,engine:__FMS_WAR31_ENGINE__};
 const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
 return <><Vassal31Panel run={base} nationId={nationId} busy={busy} declare={declare} release={release}/>{run.version===32&&<section data-testid="tribute-ledger" className="play-tribute">
  <h3>年度贡金</h3><p>当前：{run.tribute.enabled?'正常结算':'已停用'}</p>
  {run.vassals.records.filter(v=>v.endedTick===null&&(v.vassalId===nationId||v.overlordId===nationId)).map(v=>{const q=quoteTribute32(run,v.vassalId)!;return <div className="play-war-country" key={v.vassalId}>
   <strong>{name(v.vassalId)} → {name(v.overlordId)}</strong>
   <p>下次：{q.next.year} 年 12 月 {q.next.day} 日 · 当前预计 {q.amount.toLocaleString()} 金</p>
  </div>;})}
  <p className="play-muted">每年按结算日月收入 × 30% × 12 缴纳。余额不足或双方交战时跳过，不补扣往年贡金；金额随收入变化。</p>
  <button disabled={busy} onClick={()=>toggle(!run.tribute.enabled)}>{run.tribute.enabled?'预览停用年度贡金':'预览启用年度贡金'}</button>
  <p className="play-muted">此开关影响整个世界。当前仅接入贡金，附庸自动叛乱仍待接入。</p>
  <h4>最近收支</h4>
  {run.tribute.receipts.filter(e=>e.vassalId===nationId||e.overlordId===nationId).slice(-12).reverse().map(e=><article className="play-tribute-receipt" key={e.id} data-receipt-id={e.id}>
   <strong>{e.year} 年 12 月 {e.dateDay} 日 · {e.status==='paid'?'已缴纳':e.status==='at-war'?'交战，暂停缴纳':'余额不足，未缴纳'}</strong>
   <p>{name(e.vassalId)} → {name(e.overlordId)}{e.amount!==null?` · ${e.amount.toLocaleString()} 金`:''}</p>
   <p className="play-muted">本国国库：{(e.vassalId===nationId?e.openingGold:e.openingOverlordGold).toLocaleString()} → {(e.vassalId===nationId?e.closingGold:e.closingOverlordGold).toLocaleString()}</p>
  </article>)}
  {!run.tribute.receipts.some(e=>e.vassalId===nationId||e.overlordId===nationId)&&<p className="play-muted">尚无到期账目。旧版本未结算的年份不会补写。</p>}
 </section>}</>;
}
