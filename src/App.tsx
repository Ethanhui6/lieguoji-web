import { useId, useMemo, useRef, useState } from 'react';
import { useGame } from './useGame';
import { previewOrder,canCommandArmy } from './sim/core';
import type { Army, Order, World } from './sim/types';
import { MapCanvas } from './ui/MapCanvas';
import './styles.css';

const statusLabels: Record<Army['status'], string> = { idle: '驻防', marching: '行军', fighting: '交战', retreating: '撤退', destroyed: '溃散' };
const terrainLabels = { plain: '平原', forest: '林地', mountain: '山地' };
const eventLabels = { order: '军令', march: '行军', supply: '补给', battle: '交战', occupation: '控制', retreat: '撤退', system: '记事' };
const number = (value: number) => Math.round(value).toLocaleString('zh-CN');

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

export default function App({scope='test-continent',onBack}:{scope?:string;onBack?:()=>void}) {
  const game = useGame(scope);
  const [selectedArmyId, setSelectedArmyId] = useState('');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [orderKind, setOrderKind] = useState<Order['kind']>('march');
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [drawer, setDrawer] = useState<'map' | 'armies' | 'orders' | 'events' | 'save'>('map');
  const [showNewGame, setShowNewGame] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const newGameCancelRef = useRef<HTMLButtonElement>(null);
  const targetSelectId = useId();
  const world = game.world;
  const army = world?.armies.find((item) => item.id === selectedArmyId) ?? world?.armies[0];
  const province = world?.provinces.find((item) => item.id === selectedProvinceId) ?? world?.provinces.find((item) => item.id === army?.provinceId);
  const target = world?.provinces.find((item) => item.id === targetId) ?? province;
  const preview = useMemo(() => world && pendingOrder ? previewOrder(world, pendingOrder) : null, [world, pendingOrder]);
  const nation = world?.nations.find((item) => item.id === army?.nationId);
  const recentEvents = world?.events.slice(-30).reverse() ?? [];

  function selectArmy(id: string) {
    setSelectedArmyId(id);
    setPendingOrder(null);
    const next = world?.armies.find((item) => item.id === id);
    if (next) { setSelectedProvinceId(next.provinceId); setTargetId(next.provinceId); }
    setDrawer('orders');
    setActionMessage('');
  }

  function selectProvince(id: string) {
    setSelectedProvinceId(id);
    setTargetId(id);
    setPendingOrder(null);
    setDrawer('orders');
  }

  async function act(action: () => Promise<void>, success: string) {
    setActionMessage('');
    try { await action(); setActionMessage(success); }
    catch (error) { setActionMessage(error instanceof Error ? error.message : '操作未完成，请重试。'); }
  }

  async function confirmOrder() {
    if (!pendingOrder || !world || !previewOrder(world, pendingOrder).valid) return;
    await act(() => game.command(pendingOrder), '军令已下达。继续推演或推进一日，查看实际行军与战报。');
    setPendingOrder(null);
  }

  const saveControls = <div className="save-controls">
    <button onClick={() => void act(game.save, '当前推演已保存到此浏览器。')} disabled={!game.ready || game.busy}>保存</button>
    <button onClick={() => void act(game.exportSave, '存档已导出。')} disabled={!game.ready || game.busy}>导出</button>
    <button onClick={() => fileRef.current?.click()} disabled={!game.ready || game.busy}>导入</button>
    {world?.scenario==='custom-world'?<button onClick={()=>void act(async()=>{game.setRunning(false);await game.save();onBack?.();},'')}>回到工坊</button>:<button onClick={() => { game.setRunning(false); setShowNewGame(true); requestAnimationFrame(() => newGameCancelRef.current?.focus()); }} disabled={!game.ready || game.busy}>新开局</button>}
  </div>;

  return <div className="game-shell">
    <header className="masthead">
      <a className="brand" href="#main-game" aria-label="列国纪，跳至地图"><span className="brand-seal" aria-hidden="true">列</span><span><strong>列国纪</strong><small>{world?.custom?.name??'山河之间，自有兴亡'}</small></span></a>
      <div className="time-controls" aria-label="推演时间控制">
        <div className="day-counter"><small>推演历</small><strong>第 <b data-testid="day-number">{world?.day ?? 0}</b> 日</strong></div>
        <button className={`run-button ${game.running ? 'is-running' : ''}`} disabled={!game.ready || (!game.running && game.busy)} onClick={() => { setPendingOrder(null); game.setRunning(!game.running); }} aria-label={game.running ? '暂停推演' : '继续推演'}><span aria-hidden="true">{game.running ? 'Ⅱ' : '▶'}</span><span>{game.running ? '暂停' : '继续'}</span></button>
        <button className="step-button" disabled={!game.ready || game.busy || game.running} onClick={() => { setPendingOrder(null); game.step(); }} aria-label="推进一日">单日 <span aria-hidden="true">›</span></button>
        <div className="speed-controls" aria-label="推演速度">{[1, 4, 12].map((speed) => <button key={speed} aria-pressed={game.speed === speed} onClick={() => game.setSpeed(speed)}>{speed}×</button>)}</div>
      </div>
      <div className="desktop-save">{saveControls}<small className="save-status" role="status">{game.saveStatus}</small></div>
    </header>

    <div className="preview-strip"><span><i />技术预览 <b>·</b> {world?.scenario==='custom-world'?`自建世界 · ${world.custom?.name}`:'测试大陆，非正式地图'}</span><span>{world?.scenario==='custom-world'?'各国自主推演 · 可暂停干预':'沙盒自然演化 · 演示参数'}</span>{onBack&&<button className="back-to-studio" onClick={()=>void act(async()=>{game.setRunning(false);if(world)await game.save();onBack();},'')}>世界工坊</button>}</div>
    <input ref={fileRef} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择导入存档" onChange={(event) => { const file = event.target.files?.[0]; if (file) { game.setRunning(false); setPendingImport(file); } event.target.value = ''; }} />
    {game.error && <div className="global-error" role="alert">{game.error}</div>}
    {actionMessage && <div className="action-message" role="status"><span>{actionMessage}</span><button aria-label="关闭操作提示" onClick={() => setActionMessage('')}>×</button></div>}

    {!world ? <main className="loading-state" aria-live="polite"><span className="brand-seal">列</span><h1>{game.error?'尚未载入推演':'正在铺开舆图'}</h1><p>{scope==='test-continent'?'准备测试大陆与推演线程…':'读取自建世界与推演线程…'}</p>{game.error && <button onClick={() => window.location.reload()}>重新载入</button>}</main> : <>
      <main id="main-game" className={`game-layout drawer-${drawer}`}>
        <aside className="roster-panel" aria-label="各国军队">
          <div className="panel-heading"><div><small>兵力与驻地</small><h2>军情簿</h2></div><span>{world.armies.filter((item) => item.status !== 'destroyed').length} 支军队</span><button className="drawer-close" onClick={() => setDrawer('map')} aria-label="关闭军情簿">×</button></div>
          <p className="roster-note">{world.scenario==='custom-world'?'各国依据兵力与补给选择行动。你可以暂停并干预任何军队。':'你正指挥烈军，守军依规则防御。'}<br />{world.scenario==='custom-world'?'继续推演即可观察世界变化。':'选中烈军，再点选目的地。'}</p>
          <ArmyRoster world={world} selected={army?.id ?? ''} onSelect={selectArmy} />
          <details className="province-list"><summary>地区目录 <span>{world.provinces.length}</span></summary><div>{world.provinces.map((item) => <button key={item.id} onClick={() => selectProvince(item.id)} aria-pressed={province?.id === item.id}>{item.name}<small>{world.nations.find((country) => country.id === item.controller)?.name}</small></button>)}</div></details>
        </aside>

        <MapCanvas world={world} selectedArmyId={army?.id ?? ''} selectedProvinceId={province?.id ?? ''} route={preview?.route ?? []} onArmySelect={selectArmy} onProvinceSelect={selectProvince} />

        <aside className="orders-panel" aria-label="军队详情与下令">
          <div className="panel-heading"><div><small>当前编队</small><h2>{army?.name ?? '选择军队'}</h2></div><button className="drawer-close" onClick={() => setDrawer('map')} aria-label="关闭军令面板">×</button></div>
          {army && <>
            <div className="army-identity"><span><i style={{ background: nation?.color }} />{nation?.name}</span><strong className={`army-status status-${army.status}`}>{statusLabels[army.status]}</strong></div>
            <div className="army-strength"><span>现有兵力</span><strong>{number(army.troops)}<small> 人</small></strong></div>
            <div className="army-meters"><Meter label="士气" value={army.morale} /><Meter label="军粮" value={army.supplies} /></div>
            <p className="stationed">驻地 <strong>{world.provinces.find((item) => item.id === army.provinceId)?.name}</strong>{army.route.length > 0 && <span> → {world.provinces.find((item) => item.id === army.route.at(-1))?.name}</span>}</p>
            {canCommandArmy(world,army) ? <section className="order-form" aria-label="下达军令">
              <div className="section-label"><h3>下达军令</h3><span>先预览，再确认</span></div>
              <div className="order-kinds">{(['march', 'retreat'] as const).map((kind) => <button key={kind} aria-pressed={orderKind === kind} onClick={() => { setOrderKind(kind); setPendingOrder(null); }}>{kind === 'march' ? '行军 / 进攻' : '主动撤退'}</button>)}</div>
              <label htmlFor={targetSelectId}>目的地</label>
              <select id={targetSelectId} value={target?.id ?? ''} onChange={(event) => selectProvince(event.target.value)}>{world.provinces.map((item) => <option key={item.id} value={item.id}>{item.name} · {terrainLabels[item.terrain]}</option>)}</select>
              {!pendingOrder && <button className="primary-button preview-order" disabled={game.busy || !game.ready || army.status === 'destroyed'} onClick={() => { if (target) { game.setRunning(false); setPendingOrder({ armyId: army.id, targetId: target.id, kind: orderKind }); setActionMessage(''); } }}>预览命令 <span aria-hidden="true">→</span></button>}
              {preview && <div className={`order-preview ${preview.valid ? '' : 'is-invalid'}`} data-testid="order-preview">
                <h4>{preview.valid ? '军令预览' : '暂不能下令'}</h4>
                <p>{preview.reason}</p>
                {preview.valid && <><dl><div><dt>预计行程</dt><dd>{preview.days} 日</dd></div><div><dt>预计耗粮</dt><dd>{Math.round(preview.supplyCost)}</dd></div></dl><p className="route-text">{preview.route.map((id) => world.provinces.find((item) => item.id === id)?.name).join(' → ')}</p></>}
                {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                <div className="confirm-actions"><button onClick={() => setPendingOrder(null)}>取消</button><button className="primary-button" disabled={!preview.valid || game.busy} onClick={() => void confirmOrder()}>确认军令</button></div>
              </div>}
            </section> : <section className="order-form"><div className="section-label"><h3>守军情报</h3><span>不可指挥</span></div><p className="rule-note">此军由守军规则控制。选择烈军，即可预览与下达军令。</p></section>}
          </>}
          {province && <section className="province-info"><div className="section-label"><h3>{province.name}</h3><span>{terrainLabels[province.terrain]}</span></div><dl><div><dt>实际控制</dt><dd>{world.nations.find((item) => item.id === province.controller)?.name}</dd></div><div><dt>法理所属</dt><dd>{world.nations.find((item) => item.id === province.legalOwner)?.name}</dd></div><div><dt>当地补给</dt><dd>{province.supply}</dd></div></dl></section>}
          <p className="rule-note">行军、军粮和战斗随推演日变化。占领改变实际控制；首都失守不会自动灭国。</p>
        </aside>

        <section className="events-panel" aria-label="事件与原因">
          <div className="events-title"><h2>行军纪事</h2><small>真实状态 · 因果记录</small><button className="drawer-close" onClick={() => setDrawer('map')} aria-label="关闭行军纪事">×</button></div>
          <div className="events-list">{recentEvents.length ? recentEvents.map((event) => <details key={event.id} className={`event-entry event-${event.kind}`}><summary><time>第 {event.day} 日</time><span className="event-kind">{eventLabels[event.kind]}</span><span>{event.text}</span><small>查看原因</small></summary><p>{event.reason}</p></details>) : <p className="empty-events">推演尚未开始。下达军令或推进一日，事件与原因会在此记录。</p>}</div>
        </section>
        <section className="mobile-save-panel" aria-label="存档管理"><div className="panel-heading"><h2>存档</h2><button onClick={() => setDrawer('map')} aria-label="关闭存档管理">×</button></div><p>存档保存在此浏览器。换设备或更换网址前，请先导出。</p>{saveControls}<p role="status">{game.saveStatus}</p>{game.restored && <p>已从此浏览器恢复推演。</p>}</section>
      </main>
      <footer className="desktop-footer"><span><i className={game.ready ? 'connected' : ''} />{game.ready ? '推演线程就绪' : '推演线程连接中'} <b>·</b> {game.restored ? '已恢复本地存档' : '本地沙盒'}</span><span>规则 {world.rulesVersion} <b>·</b> <span title={__BUILD_SHA__}>构建 {__BUILD_SHA__.slice(0, 8)}</span> <b>·</b> {world.scenario==='custom-world'?'自建地图 · 创作沙盒':'正式地图待核定'}</span></footer>
      <nav className="mobile-toolbar" aria-label="游戏工具">{([{ id: 'map', icon: '◇', label: '舆图' }, { id: 'armies', icon: '⚑', label: '军情' }, { id: 'orders', icon: '↗', label: '军令' }, { id: 'events', icon: '≡', label: '纪事' }, { id: 'save', icon: '▣', label: '存档' }] as const).map((item) => <button key={item.id} onClick={() => setDrawer(item.id)} aria-pressed={drawer === item.id}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
    </>}
    {(showNewGame || pendingImport) && <div className="modal-backdrop"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-description" onKeyDown={(event) => { if (event.key === 'Escape') { setShowNewGame(false); setPendingImport(null); } if (event.key === 'Tab') { const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('button'); const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}>
      <small>推演已暂停</small><h2 id="replace-title">{pendingImport ? '导入并替换当前推演？' : '重新开始测试大陆？'}</h2><p id="replace-description">{pendingImport ? `将校验并载入「${pendingImport.name}」。` : '将回到测试大陆的初始状态。'}当前未导出的进度可能被替换。可先取消，导出存档后再继续。</p><div className="confirm-actions"><button ref={newGameCancelRef} autoFocus onClick={() => { setShowNewGame(false); setPendingImport(null); }}>保留当前推演</button><button className="primary-button" onClick={() => { const file = pendingImport; setShowNewGame(false); setPendingImport(null); setPendingOrder(null); setSelectedArmyId(''); setSelectedProvinceId(''); setTargetId(''); void act(file ? () => game.importSave(file) : game.newGame, file ? '存档已载入。' : '新的测试大陆已准备就绪。'); }}>{pendingImport ? '确认导入' : '确认新开局'}</button></div>
    </section></div>}
  </div>;
}
