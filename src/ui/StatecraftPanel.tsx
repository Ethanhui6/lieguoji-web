import { useId, useRef, useState } from 'react';
import { nationReports, policyOptions, previewStateAction } from '../sim/core';
import type { PolicyPriority, StateAction, StateActionPreview, StateVersion, World } from '../sim/types';
import './statecraft.css';

type Props = {
  world: World;
  busy: boolean;
  snapshot: () => Promise<World>;
  command: (action: StateAction, expected: StateVersion) => Promise<void>;
  onUpgrade?: (world: World) => Promise<void>;
  onClose: () => void;
};
const amount = (value: number) => Math.round(value).toLocaleString('zh-CN');
const signed = (value: number) => `${value > 0 ? '+' : ''}${amount(value)}`;
const actionName = (action: StateAction) => action.type === 'policy' ? '国策' : action.type === 'declare-war' ? '宣战' : '停战';

export function StatecraftPanel({ world, busy, snapshot, command, onUpgrade, onClose }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'economy' | 'diplomacy'>('economy');
  const [policy, setPolicy] = useState<PolicyPriority | null>(null);
  const [targetId, setTargetId] = useState('');
  const [pending, setPending] = useState<{ action: StateAction; preview: StateActionPreview } | null>(null);
  const [operating, setOperating] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const operation = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const nationSelectId = useId(), targetSelectId = useId(), policySelectId = useId(), upgradeTitleId = useId();
  const nation = world.nations.find(item => item.id === selectedId) ?? world.nations[0];
  const report = nationReports(world).find(item => item.nationId === nation?.id);
  const others = world.nations.filter(item => item.id !== nation?.id);
  const target = others.find(item => item.id === targetId) ?? others[0];
  const relation = world.statecraft?.relations.find(item => (item.a === nation?.id && item.b === target?.id) || (item.b === nation?.id && item.a === target?.id));
  const chosenPolicy = policy ?? report?.priority ?? 'balanced';
  const stale = !!pending && (pending.preview.basedOn.day !== world.day || pending.preview.basedOn.nextEventId !== world.nextEventId);
  const locked = busy || operating;

  function clearPreview() { setPending(null); setMessage(''); setFailure(''); }
  async function preview(action: StateAction) {
    if (operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure(''); setMessage('');
    try {
      const current = await snapshot();
      setPending({ action, preview: previewStateAction(current, action) });
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ block: 'nearest' }));
    } catch (error) { setFailure(error instanceof Error ? error.message : '未取得当前推演状态，请重试。'); }
    finally { operation.current = false; setOperating(false); }
  }
  async function confirm() {
    if (!pending || !pending.preview.valid || stale || operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure('');
    try {
      await command(pending.action, pending.preview.basedOn);
      setMessage(`${actionName(pending.action)}已生效。推演保持暂停，可查看决策原因后继续。`);
      setPending(null);
    } catch (error) { setFailure(error instanceof Error ? error.message : '决策未生效，请重新预览。'); }
    finally { operation.current = false; setOperating(false); }
  }
  async function upgrade() {
    if (!onUpgrade || operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure('');
    try { const current = await snapshot(); await onUpgrade(current); setUpgradeOpen(false); }
    catch (error) { setFailure(error instanceof Error ? error.message : '副本未创建，请重试。'); }
    finally { operation.current = false; setOperating(false); }
  }

  return <aside className="government-panel" aria-label="国家经营与外交" data-testid="government-panel">
    <div className="panel-heading"><div><small>山河生计 · 列国往来</small><h2>国家簿</h2></div><button className="drawer-close" onClick={onClose} aria-label="关闭国家面板">×</button></div>
    {!world.statecraft ? <div className="statecraft-legacy"><h3>{world.scenario === 'custom-world' ? '保留旧局，续写新篇' : '战役样例'}</h3><p>此推演使用 {world.rulesVersion} 规则，尚无人口、粮库与外交账册。军队与原有历史仍可继续推演。</p>{world.scenario === 'custom-world' && onUpgrade ? <><p>创建经营推演副本后，可经营各国、调整粮食分配并干预外交。原推演保留在历史中。</p><button className="primary-button" disabled={locked} onClick={() => { setUpgradeOpen(true); void snapshot().catch(error => setFailure(error instanceof Error ? error.message : '暂停失败')); }}>创建经营推演副本</button></> : <p>从世界工坊创建自建世界，即可体验国家经营与外交。</p>}</div> : <>
      <div className="country-picker"><label htmlFor={nationSelectId}>查看国家</label><div><i style={{ background: nation?.color }} /><select id={nationSelectId} value={nation?.id ?? ''} disabled={operating} onChange={event => { setSelectedId(event.target.value); setPolicy(null); setTargetId(''); clearPreview(); }}>{world.nations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><p>创作沙盒：可暂停并干预任一国家。数据随实际控制区变化。</p></div>
      <div className="government-tabs" aria-label="国家面板内容"><button aria-pressed={tab === 'economy'} onClick={() => { setTab('economy'); clearPreview(); }}>经营</button><button aria-pressed={tab === 'diplomacy'} onClick={() => { setTab('diplomacy'); clearPreview(); }}>外交</button></div>
      {report && tab === 'economy' && <div className="statecraft-economy">
        <div className="country-totals"><div><span>实际人口</span><strong data-testid="nation-population">{amount(report.population)}</strong><small>人 · {report.territoryCount} 块辖区</small></div><div><span>国家粮库</span><strong data-testid="nation-grain">{amount(report.grain)}</strong><small>粮 · {report.armyCount} 支存续军队</small></div></div>
        <section className="statecraft-section"><div className="section-label"><h3>每日收支</h3><span>当前需求估算</span></div><dl className="economic-lines"><div><dt>粮食生产</dt><dd>+{amount(report.productionPerDay)}</dd></div><div><dt>民用需求</dt><dd>−{amount(report.civilianNeedPerDay)}</dd></div><div><dt>军队粮库需求</dt><dd>−{amount(report.militaryNeedPerDay)}</dd></div><div className={report.balancePerDay < 0 ? 'is-deficit' : 'is-surplus'}><dt>{report.balancePerDay < 0 ? '预计每日缺口' : '预计每日结余'}</dt><dd data-testid="nation-balance">{signed(report.balancePerDay)}</dd></div></dl><p className="statecraft-note">需求会随人口、军队与战局变化。粮库不足时按国策分配；军队自身携粮另见军令面板。</p></section>
        <section className="statecraft-section"><div className="section-label"><h3>粮食分配</h3><span>当前：{policyOptions.find(item => item.value === report.priority)?.label}</span></div><label htmlFor={policySelectId}>国家政策</label><select id={policySelectId} value={chosenPolicy} disabled={locked} onChange={event => { setPolicy(event.target.value as PolicyPriority); clearPreview(); }}>{policyOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="policy-description">{policyOptions.find(item => item.value === chosenPolicy)?.description}</p><button className="primary-button" disabled={locked} onClick={() => void preview({ type: 'policy', nationId: nation.id, priority: chosenPolicy })}>预览国策</button></section>
        <details className="ledger-details"><summary>最近结算 <span>{report.lastLedger ? `第 ${report.lastLedger.day} 日` : '尚未推进'}</span></summary>{report.lastLedger ? <dl className="economic-lines" data-testid="nation-ledger"><div><dt>期初粮库</dt><dd>{amount(report.lastLedger.openingGrain)}</dd></div><div><dt>当日生产</dt><dd>+{amount(report.lastLedger.production)}</dd></div><div><dt>实际民用消耗</dt><dd>−{amount(report.lastLedger.civilianConsumed)}</dd></div><div><dt>实际军队消耗</dt><dd>−{amount(report.lastLedger.militaryConsumed)}</dd></div><div><dt>领土转移粮食</dt><dd>{signed(report.lastLedger.territoryTransfer)}</dd></div><div><dt>结余粮库</dt><dd>{amount(report.lastLedger.closingGrain)}</dd></div><div className={report.lastLedger.starvationDeaths > 0 ? 'is-deficit' : ''}><dt>本日饥荒死亡</dt><dd>{amount(report.lastLedger.starvationDeaths)} 人</dd></div></dl> : <p className="statecraft-note">推进一日后，显示实际生产与消耗账目。</p>}</details>
      </div>}
      {report && tab === 'diplomacy' && <div className="statecraft-diplomacy"><div className="diplomacy-overview"><strong>{report.warCount}</strong><span>个交战国</span><small>关系决定可交战对象</small></div>{target ? <section className="statecraft-section"><label htmlFor={targetSelectId}>外交对象</label><select id={targetSelectId} value={target.id} disabled={locked} onChange={event => { setTargetId(event.target.value); clearPreview(); }}>{others.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className={`relation-state ${relation?.status === 'war' ? 'at-war' : ''}`} data-testid="diplomatic-status"><i style={{ background: target.color }} /><strong>{nation.name} · {target.name}</strong><span>{relation?.status === 'war' ? '交战' : '和平'}</span></div>{relation && relation.truceUntilDay > world.day && <p className="truce-note" data-testid="truce-status">停战保护至第 {relation.truceUntilDay} 日，剩余 {relation.truceUntilDay - world.day} 日。</p>}<p className="statecraft-note">{relation?.status === 'war' ? '停战属于沙盒双边干预。确认后双方停止新交战，在途军队先完成当前路段，再依规则退出。' : '宣战需有陆地接壤与实际领土，且不在停战保护期。预览将说明是否满足条件。'}</p><button className="primary-button" disabled={locked} onClick={() => void preview({ type: relation?.status === 'war' ? 'make-peace' : 'declare-war', nationId: nation.id, targetNationId: target.id })}>{relation?.status === 'war' ? '预览停战' : '预览宣战'}</button></section> : <p className="statecraft-note">当前只有一个国家。没有其他国家可进行外交。</p>}</div>}
      {pending && <div ref={previewRef} className={`state-action-preview ${pending.preview.valid && !stale ? '' : 'is-invalid'}`} data-testid="state-action-preview" aria-live="polite"><small>推演已暂停 · 第 {pending.preview.basedOn.day} 日</small><h3>{actionName(pending.action)}预览</h3><p>{pending.preview.reason}</p>{pending.preview.changes.length > 0 && <ul>{pending.preview.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>}{pending.preview.warnings.map((warning, index) => <p className="statecraft-warning" key={index}>{warning}</p>)}{stale && <p role="alert">推演状态已变化，此预览已过期。请取消后重新预览。</p>}<div className="confirm-actions"><button disabled={operating} onClick={clearPreview}>取消决策</button><button className="primary-button" disabled={locked || !pending.preview.valid || stale} onClick={() => void confirm()}>确认{actionName(pending.action)}</button></div></div>}
      {report?.lastDecision && <section className="decision-record" data-testid="state-decision"><small>最新决策 · 第 {report.lastDecision.day} 日</small><h3>{report.lastDecision.action}</h3><p>{report.lastDecision.reason}</p></section>}
    </>}
    {message && <p className="statecraft-feedback" role="status">{message}</p>}{failure && <p className="statecraft-feedback is-error" role="alert">{failure}</p>}
    {upgradeOpen && <div className="modal-backdrop"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby={upgradeTitleId} onKeyDown={event => { if (event.key === 'Escape' && !operating) setUpgradeOpen(false); if (event.key === 'Tab') { const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'); const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><small>原历史保留 · 独立推演</small><h2 id={upgradeTitleId}>创建经营推演副本？</h2><p>新副本从当前日期继续，补建人口与粮库账册，并沿用当前战争关系。经营账册是新规则的初始参数，不代表过去的实际收支。原推演及原存档保留在世界工坊的历史中。</p>{failure && <p role="alert">{failure}</p>}<div className="confirm-actions"><button autoFocus disabled={operating} onClick={() => setUpgradeOpen(false)}>取消</button><button className="primary-button" disabled={locked} onClick={() => void upgrade()}>确认创建副本</button></div></section></div>}
  </aside>;
}
