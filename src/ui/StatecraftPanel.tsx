import { useId, useRef, useState } from 'react';
import type { EngineFacade } from '../engine/registry';
import type { PolicyPriority, StateAction, StateActionPreview, StateVersion, World } from '../sim/types';
import { ModalDialog } from './ModalDialog';
import './statecraft.css';

export type StatecraftViewState = { tab: 'economy' | 'diplomacy'; policy: PolicyPriority | null; targetId: string };
type Props = {
  world: World;
  engine: EngineFacade | undefined;
  selectedNationId?: string;
  onNationSelect?: (nationId: string) => void;
  viewState?: StatecraftViewState;
  onViewStateChange?: (patch: Partial<StatecraftViewState>) => void;
  busy: boolean;
  readOnly?: boolean;
  snapshot: () => Promise<World>;
  command: (action: StateAction, expected: StateVersion) => Promise<void>;
  onUpgrade?: (world: World) => Promise<void>;
};
const amount = (value: number) => Math.round(value).toLocaleString('zh-CN');
const signed = (value: number) => `${value > 0 ? '+' : ''}${amount(value)}`;
const actionName = (action: StateAction) => action.type === 'policy' ? '国策' : action.type === 'declare-war' ? '宣战' : '停战';

export function StatecraftPanel({ world, engine, selectedNationId, onNationSelect, viewState, onViewStateChange, busy, readOnly = false, snapshot, command, onUpgrade }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [localView, setLocalView] = useState<StatecraftViewState>({ tab: 'economy', policy: null, targetId: '' });
  const { tab, policy, targetId } = viewState ?? localView;
  function updateView(patch: Partial<StatecraftViewState>) { setLocalView(current => ({ ...current, ...patch })); onViewStateChange?.(patch); }
  const [pending, setPending] = useState<{ action: StateAction; preview: StateActionPreview } | null>(null);
  const [operating, setOperating] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const operation = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const nationSelectId = useId(), targetSelectId = useId(), policySelectId = useId(), upgradeTitleId = useId();
  const nation = world.nations.find(item => item.id === (selectedNationId ?? selectedId)) ?? world.nations[0];
  function chooseNation(id: string) { setSelectedId(id); onNationSelect?.(id); }
  const report = engine?.nationReports(world).find(item => item.nationId === nation?.id);
  const policyOptions = engine?.policyOptions ?? [];
  const storedPolicy = world.statecraft?.nations.find(item => item.nationId === nation?.id);
  const others = world.nations.filter(item => item.id !== nation?.id);
  const target = others.find(item => item.id === targetId) ?? others[0];
  const relation = world.statecraft?.relations.find(item => (item.a === nation?.id && item.b === target?.id) || (item.b === nation?.id && item.a === target?.id));
  const chosenPolicy = (readOnly ? report?.priority : policy ?? report?.priority) ?? 'balanced';
  const stale = !!pending && (pending.preview.basedOn.day !== world.day || pending.preview.basedOn.nextEventId !== world.nextEventId);
  const locked = busy || operating;

  function clearPreview() { setPending(null); setMessage(''); setFailure(''); }
  async function preview(action: StateAction) {
    if (readOnly || !engine || operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure(''); setMessage('');
    try {
      const current = await snapshot();
      setPending({ action, preview: engine.previewStateAction(current, action) });
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ block: 'nearest' }));
    } catch (error) { setFailure(error instanceof Error ? error.message : '未取得当前推演状态，请重试。'); }
    finally { operation.current = false; setOperating(false); }
  }
  async function confirm() {
    if (readOnly || !engine || !pending || !pending.preview.valid || stale || operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure('');
    try {
      await command(pending.action, pending.preview.basedOn);
      setMessage(`${actionName(pending.action)}已生效。推演保持暂停，可查看决策原因后继续。`);
      setPending(null);
    } catch (error) { setFailure(error instanceof Error ? error.message : '决策未生效，请重新预览。'); }
    finally { operation.current = false; setOperating(false); }
  }
  async function upgrade() {
    if (readOnly || !engine || !onUpgrade || operation.current || busy) return;
    operation.current = true; setOperating(true); setFailure('');
    try { const current = await snapshot(); await onUpgrade(current); setUpgradeOpen(false); }
    catch (error) { setFailure(error instanceof Error ? error.message : '副本未创建，请重试。'); }
    finally { operation.current = false; setOperating(false); }
  }

  return <aside className="government-panel" aria-label="国家经营与外交" data-testid="government-panel">
    <p className="statecraft-note" data-testid="statecraft-engine">{engine?.label ?? '规则引擎未注册'} · 规则 {world.rulesVersion}</p>
    {!engine ? <div className="statecraft-legacy"><h3>仅展示已保存事实</h3><p>此记录的规则引擎尚未注册。原记录保留，可导出历史；不计算国家收支预测、规则账册或决策预览。</p><label htmlFor={nationSelectId}>查看国家</label><select id={nationSelectId} value={nation?.id ?? ''} onChange={event => chooseNation(event.target.value)}>{world.nations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{storedPolicy?.lastLedger && <section className="statecraft-section"><h3>已存结算 · 第 {storedPolicy.lastLedger.day} 日</h3><dl className="economic-lines"><div><dt>结余粮库</dt><dd>{amount(storedPolicy.lastLedger.closingGrain)}</dd></div><div><dt>实际民用消耗</dt><dd>{amount(storedPolicy.lastLedger.civilianConsumed)}</dd></div><div><dt>实际军队消耗</dt><dd>{amount(storedPolicy.lastLedger.militaryConsumed)}</dd></div></dl><p>直接读取原记录，未重新计算。</p></section>}{storedPolicy?.lastDecision && <section className="decision-record"><small>已存决策 · 第 {storedPolicy.lastDecision.day} 日</small><h3>{storedPolicy.lastDecision.action}</h3><p>{storedPolicy.lastDecision.reason}</p></section>}</div> : !world.statecraft ? <div className="statecraft-legacy"><h3>{world.scenario === 'custom-world' ? '保留旧局，续写新篇' : '战役样例'}</h3><p>此推演使用 {world.rulesVersion} 规则，尚无人口、粮库与外交账册。{readOnly ? '当前为只读历史；创建独立分支后可继续原规则推演。' : '军队与原有历史仍可继续推演。'}</p>{!readOnly && world.scenario === 'custom-world' && onUpgrade ? <><p>可明确创建规则 0.2.0 的经营副本，经营各国、调整粮食分配并干预外交。原局继续保留规则 {world.rulesVersion}。</p><button className="primary-button" disabled={locked} onClick={() => { setUpgradeOpen(true); void snapshot().catch(error => setFailure(error instanceof Error ? error.message : '暂停失败')); }}>创建经营推演副本</button></> : <p>从世界工坊创建自建世界，即可体验国家经营与外交。</p>}</div> : <>
      <div className="country-picker"><label htmlFor={nationSelectId}>查看国家</label><div><i style={{ background: nation?.color }} /><select id={nationSelectId} value={nation?.id ?? ''} disabled={operating} onChange={event => { chooseNation(event.target.value); updateView({ policy: null, targetId: '' }); clearPreview(); }}>{world.nations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><p>{readOnly ? '只读历史：仅查看此时的账册与关系，不会更改当前推演。' : '创作沙盒：可暂停并干预任一国家。数据随实际控制区变化。'}</p></div>
      <div className="government-tabs" aria-label="国家面板内容"><button aria-pressed={tab === 'economy'} onClick={() => { updateView({ tab: 'economy' }); clearPreview(); }}>经营</button><button aria-pressed={tab === 'diplomacy'} onClick={() => { updateView({ tab: 'diplomacy' }); clearPreview(); }}>外交</button></div>
      {report && tab === 'economy' && <div className="statecraft-economy">
        <div className="country-totals"><div><span>实际人口</span><strong data-testid="nation-population">{amount(report.population)}</strong><small>人 · {report.territoryCount} 块辖区</small></div><div><span>国家粮库</span><strong data-testid="nation-grain">{amount(report.grain)}</strong><small>粮 · {report.armyCount} 支存续军队</small></div></div>
        <section className="statecraft-section"><div className="section-label"><h3>每日收支</h3><span>当前需求估算</span></div><dl className="economic-lines"><div><dt>粮食生产</dt><dd>+{amount(report.productionPerDay)}</dd></div><div><dt>民用需求</dt><dd>−{amount(report.civilianNeedPerDay)}</dd></div><div><dt>军队粮库需求</dt><dd>−{amount(report.militaryNeedPerDay)}</dd></div><div className={report.balancePerDay < 0 ? 'is-deficit' : 'is-surplus'}><dt>{report.balancePerDay < 0 ? '预计每日缺口' : '预计每日结余'}</dt><dd data-testid="nation-balance">{signed(report.balancePerDay)}</dd></div></dl><p className="statecraft-note">需求会随人口、军队与战局变化。粮库不足时按国策分配；军队自身携粮另见军令面板。</p></section>
        <section className="statecraft-section"><div className="section-label"><h3>粮食分配</h3><span>当前：{policyOptions.find(item => item.value === report.priority)?.label}</span></div><label htmlFor={policySelectId}>国家政策</label><select id={policySelectId} value={chosenPolicy} disabled={locked || readOnly} onChange={event => { updateView({ policy: event.target.value as PolicyPriority }); clearPreview(); }}>{policyOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p className="policy-description">{policyOptions.find(item => item.value === chosenPolicy)?.description}</p>{!readOnly && <button className="primary-button" disabled={locked} onClick={() => void preview({ type: 'policy', nationId: nation.id, priority: chosenPolicy })}>预览国策</button>}</section>
        <details className="ledger-details"><summary>最近结算 <span>{report.lastLedger ? `第 ${report.lastLedger.day} 日` : '尚未推进'}</span></summary>{report.lastLedger ? <dl className="economic-lines" data-testid="nation-ledger"><div><dt>期初粮库</dt><dd>{amount(report.lastLedger.openingGrain)}</dd></div><div><dt>当日生产</dt><dd>+{amount(report.lastLedger.production)}</dd></div><div><dt>实际民用消耗</dt><dd>−{amount(report.lastLedger.civilianConsumed)}</dd></div><div><dt>实际军队消耗</dt><dd>−{amount(report.lastLedger.militaryConsumed)}</dd></div><div><dt>领土转移粮食</dt><dd>{signed(report.lastLedger.territoryTransfer)}</dd></div><div><dt>结余粮库</dt><dd>{amount(report.lastLedger.closingGrain)}</dd></div><div className={report.lastLedger.starvationDeaths > 0 ? 'is-deficit' : ''}><dt>本日饥荒死亡</dt><dd>{amount(report.lastLedger.starvationDeaths)} 人</dd></div></dl> : <p className="statecraft-note">推进一日后，显示实际生产与消耗账目。</p>}</details>
      </div>}
      {report && tab === 'diplomacy' && <div className="statecraft-diplomacy"><div className="diplomacy-overview"><strong>{report.warCount}</strong><span>个交战国</span><small>关系决定可交战对象</small></div>{target ? <section className="statecraft-section"><label htmlFor={targetSelectId}>外交对象</label><select id={targetSelectId} value={target.id} disabled={locked} onChange={event => { updateView({ targetId: event.target.value }); clearPreview(); }}>{others.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className={`relation-state ${relation?.status === 'war' ? 'at-war' : ''}`} data-testid="diplomatic-status"><i style={{ background: target.color }} /><strong>{nation.name} · {target.name}</strong><span>{relation?.status === 'war' ? '交战' : '和平'}</span></div>{relation && relation.truceUntilDay > world.day && <p className="truce-note" data-testid="truce-status">停战保护至第 {relation.truceUntilDay} 日，剩余 {relation.truceUntilDay - world.day} 日。</p>}<p className="statecraft-note">{relation?.status === 'war' ? '停战属于沙盒双边干预。确认后双方停止新交战，在途军队先完成当前路段，再依规则退出。' : '宣战需有陆地接壤与实际领土，且不在停战保护期。预览将说明是否满足条件。'}</p>{!readOnly && <button className="primary-button" disabled={locked} onClick={() => void preview({ type: relation?.status === 'war' ? 'make-peace' : 'declare-war', nationId: nation.id, targetNationId: target.id })}>{relation?.status === 'war' ? '预览停战' : '预览宣战'}</button>}</section> : <p className="statecraft-note">当前只有一个国家。没有其他国家可进行外交。</p>}</div>}
      {!readOnly && pending && <div ref={previewRef} className={`state-action-preview ${pending.preview.valid && !stale ? '' : 'is-invalid'}`} data-testid="state-action-preview" aria-live="polite"><small>推演已暂停 · 第 {pending.preview.basedOn.day} 日</small><h3>{actionName(pending.action)}预览</h3><p>{pending.preview.reason}</p>{pending.preview.changes.length > 0 && <ul>{pending.preview.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>}{pending.preview.warnings.map((warning, index) => <p className="statecraft-warning" key={index}>{warning}</p>)}{stale && <p role="alert">推演状态已变化，此预览已过期。请取消后重新预览。</p>}<div className="confirm-actions"><button disabled={operating} onClick={clearPreview}>取消决策</button><button className="primary-button" disabled={locked || !pending.preview.valid || stale} onClick={() => void confirm()}>确认{actionName(pending.action)}</button></div></div>}
      {report?.lastDecision && <section className="decision-record" data-testid="state-decision"><small>最新决策 · 第 {report.lastDecision.day} 日</small><h3>{report.lastDecision.action}</h3><p>{report.lastDecision.reason}</p></section>}
    </>}
    {message && <p className="statecraft-feedback" role="status">{message}</p>}{failure && <p className="statecraft-feedback is-error" role="alert">{failure}</p>}
    {!readOnly && upgradeOpen && <ModalDialog titleId={upgradeTitleId} locked={operating} onDismiss={() => setUpgradeOpen(false)}><small>原历史保留 · 独立推演</small><h2 id={upgradeTitleId}>创建经营推演副本？</h2><p>原局为 {engine?.label}、规则 {world.rulesVersion}；目标为 0.4 兼容引擎、规则 0.2.0。新副本从当前日期继续，补建人口与粮库账册，并沿用当前战争关系。经营账册是目标规则的初始参数，不代表过去的实际收支。原推演及原存档保留在世界工坊的历史中。</p>{failure && <p role="alert">{failure}</p>}<div className="confirm-actions"><button autoFocus disabled={operating} onClick={() => setUpgradeOpen(false)}>取消</button><button className="primary-button" disabled={locked} onClick={() => void upgrade()}>确认创建副本</button></div></ModalDialog>}
  </aside>;
}
