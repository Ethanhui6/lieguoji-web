import type {Fiscal15Run} from './fiscal15-model';
import type {Court16Run} from './court16-model';
import {provinceIncome as courtProvinceIncome} from './court16-state';
import {provinceIncome} from './fiscal15-state';
const number=(n:number)=>Math.round(n).toLocaleString('zh-CN');
export function FiscalPanel({run,nationId,provinceId}:{run:Fiscal15Run|Court16Run;nationId:string;provinceId:string|null}){
 const account=run.finance.nations[nationId],ledger=account?.ledger;if(!account)return null;
 const province=provinceId?run.world.provinces.find(p=>p.id===provinceId):undefined,local=province&&run.finance.provinces[province.id],population=province&&run.world.statecraft!.provinces.find(p=>p.provinceId===province.id)!.population;
 const exists=run.world.provinces.some(p=>p.controller===nationId);
 return <section className="play-fiscal" aria-label="国库与财政"><h3>国库与财政</h3><dl className="play-stats"><div><dt>国库金币</dt><dd data-testid="fiscal-gold">{number(account.gold)}</dd></div><div><dt>已入账月收入</dt><dd>{number(account.goldPerMonth)}</dd></div><div><dt>上次月军费</dt><dd>{number(account.armyCostGold)}</dd></div><div><dt>财政战力</dt><dd data-testid="fiscal-modifier">×{account.goldBattleModifier.toFixed(3)}</dd></div></dl>
 <p>{exists?`下次财政结算：第 ${(Math.floor(run.world.day/30)+1)*30} 日`:'已失去全部领土：国库保留，暂停财政结算。'}</p>
 {ledger&&<details><summary>第 {ledger.day} 日结算明细</summary><p>期初 {number(ledger.openingGold)} → 入账 {number(ledger.goldPerMonth)} → 限债后 {number(ledger.goldBeforeArmyCost)} → 军费 −{number(ledger.armyCostGold)} → 结算余额 {number(ledger.gold)}</p><p>此后重编完成费用：{number(ledger.reorganizationCost)}。财政战力在月军费扣除前确定，持续至下次财政结算。</p>{ledger.distanceSuspended&&<p>首都失守：无法确定首都距离，相关距离军费暂停计算。</p>}</details>}
 {local&&province&&<details className="play-fiscal-local"><summary>{province.name} · 人口与税源</summary><p>人口 {number(population!)} / 容量 {number(local.maxPopulation)} · 当前预计月税 {number(run.version===16?courtProvinceIncome(run.world,run.upperCombat,run.finance,province.id,run.people):provinceIncome(run.world,run.upperCombat,run.finance,province.id))}</p><p>{local.cellBiomes.length} 个地貌采样 · {local.seaNeighbor?'邻海':'内陆'} · {local.resources.length} 类资源</p><small>预估按现控制国与当前人口计算；国家的实际入账以结算明细为准。</small></details>}
 <small className="play-muted">金币与军粮分别结算。{run.version===16?'本版已接人物税赋和中央、省级任职。族群、地区官职和舰队军费尚未完整接入。':'族群、人物税赋和舰队军费尚未完整接入。'}</small></section>;
}
