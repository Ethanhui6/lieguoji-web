import { useId, useMemo, useRef, useState } from 'react';
import { useGame } from './useGame';
import type { Army, Order, World } from './sim/types';
import { MapCanvas } from './ui/MapCanvas';
import { StatecraftPanel, type StatecraftViewState } from './ui/StatecraftPanel';
import { HistoryPanel } from './ui/HistoryPanel';
import type { HistoryParent } from './history/types';
import { ContextInspector, type InspectorExtent } from './ui/ContextInspector';
import { AppearanceSettings } from './ui/AppearanceSettings';
import { Icon } from './ui/Icon';
import { ModalDialog } from './ui/ModalDialog';
import './styles.css';

const statusLabels: Record<Army['status'], string> = { idle: '驻防', marching: '行军', fighting: '交战', retreating: '撤退', destroyed: '溃散' };
const terrainLabels = { plain: '平原', forest: '林地', mountain: '山地' };
const eventLabels = { order: '军令', march: '行军', supply: '补给', battle: '交战', occupation: '控制', retreat: '撤退', system: '记事', economy: '生计', diplomacy: '外交' };
const number = (value: number) => Math.round(value).toLocaleString('zh-CN');
type GamePanel = 'armies' | 'orders' | 'government' | 'events' | 'world';

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><div><span>{label}</span><strong>{Math.round(value)}<small>/100</small></strong></div><progress max={100} value={Math.max(0, Math.min(100, value))} aria-label={label} /></div>;
}

function ArmyRoster({ world, selected, onSelect }: { world: World; selected: string; onSelect: (id: string) => void }) {
  return <div className="army-roster">{world.nations.map((nation) => {
    const armies = world.armies.filter((army) => army.nationId === nation.id);
    if (!armies.length) return null;
    return <section key={nation.id} className="nation-roster">
      <h3><i style={{ background: nation.color }} />{nation.name}<span>{armies.filter((army) => army.status !== 'destroyed').length} 军</span></h3>
      {armies.map((army) => <button key={army.id} className={`army-row ${selected === army.id ? 'is-selected' : ''}`} onClick={() => onSelect(army.id)} aria-pressed={selected === army.id} data-testid={`army-${army.id}`}>
        <span className="army-row-title"><strong>{army.name}</strong><small className={`army-status status-${army.status}`}>{statusLabels[army.status]}</small></span>
        <span className="army-row-detail"><span>{world.provinces.find((p) => p.id === army.provinceId)?.name}</span><span>{number(army.troops)} 人</span></span>
        <span className="supply-line" aria-label={`军粮 ${Math.round(army.supplies)}`}><span style={{ width: `${Math.min(100, army.supplies)}%` }} /></span>
      </button>)}
    </section>;
  })}</div>;
}

export default function App({scope='test-continent',onBack,onUpgrade,onRecord,onBranch,onImportHistory}:{scope?:string;onBack?:()=>void;onUpgrade?:(world:World)=>Promise<void>;onRecord?:(world:World)=>Promise<void>;onBranch?:(point:{world:World;parent:HistoryParent;sourceEngineFingerprint:string})=>Promise<void>;onImportHistory?:(file:File)=>Promise<void>}) {
  const game = useGame(scope);
  const [selectedArmyId, setSelectedArmyId] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [orderKind, setOrderKind] = useState<Order['kind']>('march');
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [panel, setPanel] = useState<GamePanel | null>(null);
  const [extent, setExtent] = useState<InspectorExtent>('half');
  const [selectedNationId, setSelectedNationId] = useState('');
  const [statecraftView, setStatecraftView] = useState<StatecraftViewState>({ tab: 'economy', policy: null, targetId: '' });
  const [chronicleTab, setChronicleTab] = useState<'events' | 'history'>('events');
  const [showNewGame, setShowNewGame] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const targetSelectId = useId();
  const replaceTitleId = useId();
  const world = game.replay?.world ?? game.world;
  const readOnly = game.readOnly;
  const mutationLocked = readOnly || game.protectedStorage;
  const lastHistorySeq = game.history?.entries.at(-1)?.seq ?? 0;
  const army = world?.armies.find((item) => item.id === selectedArmyId) ?? world?.armies[0];
  const province = world?.provinces.find((item) => item.id === selectedProvinceId) ?? world?.provinces.find((item) => item.id === army?.provinceId);
  const target = world?.provinces.find((item) => item.id === targetId) ?? province;
  const preview = useMemo(() => !mutationLocked && world && pendingOrder && game.engine ? game.engine.previewOrder(world, pendingOrder) : null, [world, pendingOrder, mutationLocked, game.engine]);
  const nation = world?.nations.find((item) => item.id === army?.nationId);
  const recentEvents = world?.events.slice(-30).reverse() ?? [];
  const panelTitles = { armies: '军情簿', orders: army?.name ?? '当前编队', government: '国家簿', events: '纪事', world: '世界与存档' };
  const closeLabels = { armies: '关闭军情簿', orders: '关闭军令面板', government: '关闭国家面板', events: '关闭行军纪事', world: '关闭存档管理' };

  function openPanel(next: GamePanel | null) {
    if (next !== 'orders') setPendingOrder(null);
    setPanel(next); setActionMessage('');
  }
  function changeViewedNation(id: string) {
    if (id !== selectedNationId) setStatecraftView(current => ({ ...current, policy: null, targetId: '' }));
    setSelectedNationId(id);
  }
  function selectNation(id: string) { changeViewedNation(id); openPanel('government'); }

  function selectArmy(id: string) {
    setSelectedArmyId(id);
    setPendingOrder(null);
    const next = world?.armies.find((item) => item.id === id);
    if (next) { setSelectedProvinceId(next.provinceId); setTargetId(next.provinceId); changeViewedNation(next.nationId); }
    setPanel('orders');
    setActionMessage('');
  }

  function selectProvince(id: string) {
    setSelectedProvinceId(id);
    setTargetId(id);
    setPendingOrder(null);
    changeViewedNation(world?.provinces.find(item => item.id === id)?.controller ?? '');
    setPanel('orders');
  }

  async function act(action: () => Promise<void>, success: string) {
    setActionMessage('');
    try { await action(); setActionMessage(success); }
    catch (error) { setActionMessage(error instanceof Error ? error.message : '操作未完成，请重试。'); }
  }

  async function confirmOrder() {
    if (mutationLocked || !pendingOrder || !world || !game.engine?.previewOrder(world, pendingOrder).valid) return;
    await act(() => game.command(pendingOrder), '军令已下达。继续推演或推进一日，查看实际行军与战报。');
    setPendingOrder(null);
  }

  async function backToStudio() {
    game.setRunning(false); game.setReplayPlaying(false);
    if (game.world && !readOnly && !game.protectedStorage) await game.save();
    onBack?.();
  }
  async function enterReplay() {
    setPendingOrder(null); setActionMessage('');
    await game.enterReplay();
  }
  function exitReplay() {
    game.setReplayPlaying(false); setPendingOrder(null); setActionMessage('');
    game.exitReplay();
  }
  async function startRecord() {
    if (!onRecord || mutationLocked || game.history) throw new Error('当前推演不能开始新的记录副本。');
    setPendingOrder(null);
    await onRecord(await game.snapshot());
  }
  async function createBranch(position: {runId:string;seq:number;sourceEngineFingerprint:string}) {
    if (!onBranch || !game.historyCompatible || game.history?.runId !== position.runId || game.history.engineFingerprint !== position.sourceEngineFingerprint || game.replay?.seq !== position.seq) throw new Error('分支起点或规则引擎已变化，请重新选择记录。');
    game.setReplayPlaying(false);
    const point = await game.branchPoint(position.seq);
    if (point.parent.runId !== position.runId || point.parent.seq !== position.seq || point.sourceEngineFingerprint !== position.sourceEngineFingerprint) throw new Error('分支起点或规则引擎核验不一致，原历史未修改。');
    await onBranch(point);
  }

  const saveControls = <div className="save-controls">
    <button onClick={() => { if(!mutationLocked) void act(game.save, '当前推演已保存到此浏览器。'); }} disabled={!game.ready || game.busy || mutationLocked}>保存</button>
    <button onClick={() => void act(game.exportSave, '存档已导出。')} disabled={!game.ready || game.busy || readOnly || game.protectedStorage}>导出</button>
    <button onClick={() => fileRef.current?.click()} disabled={!game.ready || game.busy || readOnly || game.protectedStorage || !!game.history}>导入</button>
    {world?.scenario!=='custom-world' && <button onClick={() => { game.setRunning(false); setShowNewGame(true); }} disabled={!game.ready || game.busy || mutationLocked || !!game.history}>新开局</button>}
  </div>;
  const protectedBackupControls = game.protectedStorage && <section className="global-error" aria-label="原始存档保护" data-testid="protected-storage"><p>{world && !game.restored ? '当前显示的测试世界不是原存档。' : ''}可保留数据库中的原始主档、备份与修订号。此备份未经规则校验，当前版本不支持导入，请保留文件并使用兼容版本恢复。</p><button className="primary-button" disabled={game.busy} onClick={() => void act(game.exportProtectedBackup, '受保护原始备份已导出。原始主备仍保留，此文件需兼容版本恢复。')}>导出受保护原始备份</button></section>;
  const feedback = (game.error || actionMessage) && <div className="inspector-feedback" tabIndex={0} aria-label="操作反馈">
    {game.error && <div className="inspector-notice" role="alert"><span>{game.error}</span></div>}
    {actionMessage && <div className="inspector-notice" role="status"><span>{actionMessage}</span><button aria-label="关闭操作提示" onClick={() => setActionMessage('')}><Icon name="close" /></button></div>}
  </div>;

  const mode = game.protectedStorage ? 'protected' : game.archive ? 'archive' : game.replay ? 'replay' : 'live';
  return <div className="game-shell workbench" data-mode={mode} data-inspector-open={!!panel}>
    <header className="workbench-header">
      <a className="workbench-identity" href="#main-game" aria-label="列国纪，跳至地图"><h1>{world?.custom?.name ?? '列国纪'}</h1><small className="mode-label">{readOnly ? game.archive ? '历史归档 · 只读' : '历史只读' : world?.scenario === 'custom-world' ? '创作沙盒' : '测试大陆 · 非正式地图'}{game.history && !readOnly ? ' · 记录中' : ''}</small></a>
      {!(game.protectedStorage && !world) && <div className={`time-controls ${readOnly ? 'replay-time-controls' : ''}`} aria-label={readOnly ? '历史回放时间控制' : '推演时间控制'}>
        <div className="day-counter"><strong>第 <b data-testid="day-number">{world?.day ?? 0}</b> 日</strong></div>
        {readOnly ? game.replay ? <>
          <button className="replay-header-button" disabled={game.replayBusy || game.replay.seq <= 0} onClick={() => { game.setReplayPlaying(false); void act(() => game.seekReplay(game.replay!.seq - 1), ''); }} aria-label="回放上一条">‹</button>
          <button className="replay-header-button" disabled={(!game.replay.playing && game.replayBusy) || (!game.replay.playing && game.replay.seq >= lastHistorySeq)} onClick={() => game.setReplayPlaying(!game.replay!.playing)} aria-label={game.replay.playing ? '暂停历史' : '播放历史'}>{game.replay.playing ? '暂停' : '播放'}</button>
          <button className="replay-header-button" disabled={game.replayBusy || game.replay.seq >= lastHistorySeq} onClick={() => { game.setReplayPlaying(false); void act(() => game.seekReplay(game.replay!.seq + 1), ''); }} aria-label="回放下一条">›</button>
        </> : <span className="history-controls-unavailable">{game.historyCompatible ? '只读归档' : '引擎未注册'}</span> : <>
          <button className={`run-button ${game.running ? 'is-running' : ''}`} disabled={!game.ready || game.protectedStorage || (!game.running && game.busy)} onClick={() => { setPendingOrder(null); game.setRunning(!game.running); }} aria-label={game.running ? '暂停推演' : '继续推演'}>{game.running ? '暂停' : '继续'}</button>
          <button className="step-button" disabled={!game.ready || game.busy || game.running || game.protectedStorage} onClick={() => { setPendingOrder(null); game.step(); }} aria-label="推进一日">单日</button>
          <select className="speed-controls" aria-label="推演速度" disabled={game.protectedStorage} value={game.speed} onChange={event => game.setSpeed(Number(event.target.value))}>{[1, 4, 12].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>
        </>}
      </div>}
    </header>
    <input ref={fileRef} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择导入存档" disabled={readOnly || game.protectedStorage || !!game.history} onChange={event => { const file = event.target.files?.[0]; if (file && !readOnly && !game.protectedStorage && !game.history) { game.setRunning(false); setPendingImport(file); } event.target.value = ''; }} />
    {world && !panel && feedback && <div className="workbench-status">{feedback}</div>}
    {!world ? <main className="loading-state" aria-live="polite"><h1>{game.error ? '尚未载入推演' : '正在铺开舆图'}</h1><p>{game.error ? '读取未完成，原始存储未修改。' : '正在读取地图与推演线程…'}</p>{feedback && <div className="loading-feedback">{feedback}</div>}{protectedBackupControls}{game.error && <button onClick={() => window.location.reload()}>重新载入</button>}{onBack && <button onClick={onBack}>世界工坊</button>}</main> : <>
      <main id="main-game" className="game-layout workbench-stage" tabIndex={-1}>
        <div className="workbench-map"><MapCanvas world={world} readOnly={readOnly} selectedArmyId={army?.id ?? ''} selectedProvinceId={province?.id ?? ''} route={preview?.route ?? []} onArmySelect={selectArmy} onProvinceSelect={selectProvince} /></div>
        <div className="context-toolbar">
          {readOnly ? <div className="context-primary replay-banner" data-testid="replay-banner"><strong>{!game.historyCompatible ? '引擎未注册 · 只读' : game.archive ? '历史归档 · 只读' : '历史回放 · 只读'}</strong>{game.replay && <span>记录 {game.replay.seq}/{lastHistorySeq}</span>}<button onClick={() => { setChronicleTab('history'); openPanel('events'); }}>查看历史</button>{game.replay && !game.archive && <button disabled={game.replayBusy} onClick={exitReplay}>退出历史回放</button>}</div> : <div className="context-primary"><span>{game.history ? '逐日与逐次命令已记录' : '选择地图或军队，查看详情'}</span></div>}
          {game.protectedStorage && <div className="context-secondary"><button onClick={() => openPanel('world')}>原档已保护 · 导出原始备份</button></div>}
        </div>
        {panel && <ContextInspector panel={panel} title={panelTitles[panel]} subtitle={panel === 'orders' ? '编队与目的地' : undefined} extent={extent} onExtent={setExtent} onClose={() => openPanel(null)} closeLabel={closeLabels[panel]} onBack={panel === 'orders' ? () => openPanel('armies') : undefined} backLabel="返回军队列表" actions={feedback}>
          {panel === 'armies' && <section className="roster-panel" aria-label="各国军队">
            <div className="military-tabs"><button aria-pressed onClick={() => openPanel('armies')}>军队列表</button><button disabled={!army} onClick={() => setPanel('orders')}>当前编队</button></div>
            <p className="roster-note">{readOnly ? '选择编队或地区查看当时状态，原推演保持不变。' : world.scenario === 'custom-world' ? '各国依据兵力与补给行动。你可以暂停并干预任何军队。' : '你正指挥烈军，守军依规则防御。'}</p>
            <ArmyRoster world={world} selected={army?.id ?? ''} onSelect={selectArmy} />
            <details className="province-list"><summary>地区目录 <span>{world.provinces.length}</span></summary><div>{world.provinces.map(item => <button key={item.id} onClick={() => selectProvince(item.id)} aria-pressed={province?.id === item.id}>{item.name}<small>{world.nations.find(country => country.id === item.controller)?.name}</small></button>)}</div></details>
          </section>}
          {panel === 'orders' && <section className="orders-panel" aria-label="军队详情与下令">
          {army && <>
            <div className="army-identity"><button onClick={() => nation && selectNation(nation.id)}><i style={{ background: nation?.color }} />{nation?.name}</button><strong className={`army-status status-${army.status}`}>{statusLabels[army.status]}</strong></div>
            <div className="army-strength"><span>现有兵力</span><strong>{number(army.troops)}<small> 人</small></strong></div>
            <div className="army-meters"><Meter label="士气" value={army.morale} /><Meter label="军粮" value={army.supplies} /></div>
            <p className="stationed">驻地 <strong>{world.provinces.find((item) => item.id === army.provinceId)?.name}</strong>{army.route.length > 0 && <span> → {world.provinces.find((item) => item.id === army.route.at(-1))?.name}</span>}</p>
            {readOnly ? <p className="read-only-order">只读历史：可查看此时兵力、粮食和驻地。{game.engine ? '要改变历史，请在纪事中创建保留原规则的独立分支。' : '规则引擎尚未注册，不能预览军令或创建分支。'}</p> : game.engine?.canCommandArmy(world,army) ? <section className="order-form" aria-label="下达军令">
              <div className="section-label"><h3>下达军令</h3><span>先预览，再确认</span></div>
              <div className="order-kinds">{(['march', 'retreat'] as const).map((kind) => <button key={kind} aria-pressed={orderKind === kind} onClick={() => { setOrderKind(kind); setPendingOrder(null); }}>{kind === 'march' ? '行军 / 进攻' : '主动撤退'}</button>)}</div>
              <label htmlFor={targetSelectId}>目的地</label>
              <select id={targetSelectId} value={target?.id ?? ''} onChange={(event) => selectProvince(event.target.value)}>{world.provinces.map((item) => <option key={item.id} value={item.id}>{item.name} · {terrainLabels[item.terrain]}</option>)}</select>
              {!pendingOrder && <button className="primary-button preview-order" disabled={game.busy || !game.ready || mutationLocked || army.status === 'destroyed'} onClick={() => { if (target) { game.setRunning(false); setPendingOrder({ armyId: army.id, targetId: target.id, kind: orderKind }); setActionMessage(''); } }}>预览命令 <span aria-hidden="true">→</span></button>}
              {preview && <div className={`order-preview ${preview.valid ? '' : 'is-invalid'}`} data-testid="order-preview">
                <h4>{preview.valid ? '军令预览' : '暂不能下令'}</h4>
                <p>{preview.reason}</p>
                {preview.valid && <><dl><div><dt>预计行程</dt><dd>{preview.days} 日</dd></div><div><dt>预计耗粮</dt><dd>{Math.round(preview.supplyCost)}</dd></div></dl><p className="route-text">{preview.route.map((id) => world.provinces.find((item) => item.id === id)?.name).join(' → ')}</p></>}
                {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                <div className="confirm-actions"><button onClick={() => setPendingOrder(null)}>取消</button><button className="primary-button" disabled={!preview.valid || game.busy || mutationLocked} onClick={() => void confirmOrder()}>确认军令</button></div>
              </div>}
            </section> : <section className="order-form"><div className="section-label"><h3>守军情报</h3><span>不可指挥</span></div><p className="rule-note">此军由守军规则控制。选择烈军，即可预览与下达军令。</p></section>}
          </>}
          {province && <section className="province-info"><div className="section-label"><h3>{province.name}</h3><span>{terrainLabels[province.terrain]}</span></div><dl><div><dt>实际控制</dt><dd><button onClick={() => selectNation(province.controller)}>查看 {world.nations.find((item) => item.id === province.controller)?.name}</button></dd></div><div><dt>法理所属</dt><dd>{world.nations.find((item) => item.id === province.legalOwner)?.name}</dd></div><div><dt>当地补给</dt><dd>{province.supply}</dd></div></dl></section>}
          <p className="rule-note">行军、军粮和战斗随推演日变化。占领改变实际控制；首都失守不会自动灭国。</p>

          </section>}
          {panel === 'government' && <StatecraftPanel key={`${game.engine?.fingerprint ?? 'unknown'}-${readOnly ? 'readonly' : 'live'}`} world={world} engine={game.engine} selectedNationId={selectedNationId} onNationSelect={changeViewedNation} viewState={statecraftView} onViewStateChange={patch => setStatecraftView(current => ({ ...current, ...patch }))} readOnly={readOnly} busy={game.busy || game.replayBusy || game.protectedStorage} snapshot={game.snapshot} command={game.stateCommand} onUpgrade={!mutationLocked && !game.history ? onUpgrade : undefined} />}
          {panel === 'events' && <section className="events-panel" aria-label="事件与原因">
            <div className="chronicle-tabs" aria-label="纪事内容"><button aria-pressed={chronicleTab === 'events'} onClick={() => setChronicleTab('events')}>事件</button><button aria-pressed={chronicleTab === 'history'} onClick={() => { setChronicleTab('history'); setActionMessage(''); }}>历史</button></div>
            {chronicleTab === 'history' ? <HistoryPanel world={game.world ?? world} history={game.history} historyBytes={game.historyBytes} archive={game.archive} compatible={game.historyCompatible} engineLabel={game.engine?.label} replay={game.replay} busy={game.busy || game.replayBusy} saveStatus={game.saveStatus} onPause={() => { game.setRunning(false); game.setReplayPlaying(false); }} onRecord={onRecord && !mutationLocked && !game.history ? startRecord : undefined} onEnterReplay={enterReplay} onSeek={game.seekReplay} onPlaying={game.setReplayPlaying} onExitReplay={exitReplay} onBranch={onBranch && game.historyCompatible ? createBranch : undefined} onExport={game.exportHistory} onImport={onImportHistory} /> : <div className="events-list">{recentEvents.length ? recentEvents.map(event => <details key={event.id} className={`event-entry event-${event.kind}`}><summary><time>第 {event.day} 日</time><span className="event-kind">{eventLabels[event.kind]}</span><span>{event.text}</span><small>查看原因</small></summary><p>{event.reason}</p></details>) : <p className="empty-events">下达军令或推进一日后，事件与原因会在此记录。</p>}</div>}
          </section>}
          {panel === 'world' && <section className="world-panel" aria-label="存档管理">
            <p>{readOnly ? '只读历史不会改写原存档。完整记录和独立分支在纪事的历史页中管理。' : game.history ? '此推演已逐次记录历史。可导出当前快照，完整记录请前往纪事。' : '存档保存在此浏览器，换设备前请先导出。'}</p>
            {saveControls}<p className="save-status" role="status">{game.saveStatus}</p>{game.restored && <p>已从此浏览器恢复推演。</p>}{protectedBackupControls}
            <div className="world-navigation"><button onClick={() => { setChronicleTab('history'); openPanel('events'); }}>历史与分支</button>{onBack && <button disabled={game.busy || game.replayBusy} onClick={() => void act(backToStudio, '')}>世界工坊</button>}</div>
            <AppearanceSettings />
            <details className="world-metadata"><summary>当前世界与版本</summary><p>{world.scenario === 'custom-world' ? '自建地图 · 创作沙盒，非正式设定' : '五国测试大陆 · 正式地图待核定'}</p><p>技术预览 · {game.engine?.label ?? '规则引擎未注册'} · 规则 {world.rulesVersion}</p><p>构建 {__BUILD_SHA__}</p><p>{game.history ? '已提交的历史记录保存在此浏览器。' : '此局尚未建立逐次历史记录。'}</p></details>
          </section>}
        </ContextInspector>}
      </main>
      <nav className="workbench-nav" aria-label="游戏工具">{([{ id: null, icon: 'map', label: '舆图' }, { id: 'armies', icon: 'army', label: '军情' }, { id: 'government', icon: 'flag', label: '国家' }, { id: 'events', icon: 'book', label: '纪事' }, { id: 'world', icon: 'world', label: '世界' }] as const).map(item => <button key={item.label} className="workbench-nav-item" aria-pressed={item.id === panel || item.id === 'armies' && panel === 'orders'} onClick={() => openPanel(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    </>}
    {!readOnly && !game.history && (showNewGame || pendingImport) && <ModalDialog titleId={replaceTitleId} locked={game.busy} onDismiss={() => { setShowNewGame(false); setPendingImport(null); }}>
      <small>推演已暂停</small><h2 id={replaceTitleId}>{pendingImport ? '导入并替换当前推演？' : '重新开始测试大陆？'}</h2><p>{pendingImport ? `将校验并载入「${pendingImport.name}」。` : '将回到测试大陆的初始状态。'}当前未导出的进度可能被替换。可先取消，导出存档后再继续。</p><div className="confirm-actions"><button autoFocus disabled={game.busy} onClick={() => { setShowNewGame(false); setPendingImport(null); }}>保留当前推演</button><button className="primary-button" disabled={game.busy || mutationLocked} onClick={() => { const file = pendingImport; setShowNewGame(false); setPendingImport(null); setPendingOrder(null); setSelectedArmyId(''); setSelectedProvinceId(''); setTargetId(''); void act(file ? () => game.importSave(file) : game.newGame, file ? '存档已载入。' : '新的测试大陆已准备就绪。'); }}>{pendingImport ? '确认导入' : '确认新开局'}</button></div>
    </ModalDialog>}
  </div>;
}
