import { useId, useRef, useState } from 'react';
import type { Point } from '../sim/types';
import type { BrushTool, EditorDraft } from '../worldgen/types';
import { addNation, cellAt, createDraft, draftProblems, fillUnclaimed, generateCities, generateLand, generateNations, generateTerrain, paintStroke, placeCity } from '../worldgen/engine';
import { StudioCanvas } from './StudioCanvas';
import type { StudioLayer, StudioTool } from './StudioCanvas';
import { ContextInspector, type InspectorExtent } from '../ui/ContextInspector';
import { AppearanceSettings } from '../ui/AppearanceSettings';
import { Icon } from '../ui/Icon';
import { ModalDialog } from '../ui/ModalDialog';
import './studio.css';

type Props = { draft: EditorDraft; onChange: (draft: EditorDraft) => void; onStart: (draft: EditorDraft) => Promise<void>; onDemo: () => void; onSave: () => Promise<void>; onExport: () => Promise<void>; onImport: (file: File) => Promise<void>; saveStatus: string; error: string | null; onResume: () => void; canResume: boolean; savedRuns: readonly { id: string; name: string; createdAt: string }[]; onResumeRun: (id: string) => void; onAtlas?: () => void };
const tools: { id: StudioTool; label: string; icon: string; detail: string }[] = [
  { id: 'land', label: '绘制陆地', icon: '◒', detail: '在海面绘出大陆。拖动可连续落笔。' },
  { id: 'sea', label: '擦为海洋', icon: '≈', detail: '擦除陆地及其归属与城市。完整一笔可以撤销。' },
  { id: 'plain', label: '平原', icon: '⌁', detail: '在陆地铺设平原，保留大陆轮廓。' },
  { id: 'forest', label: '森林', icon: '♧', detail: '在陆地绘制林地。' },
  { id: 'mountain', label: '山脉', icon: '△', detail: '在陆地绘制山地。地形将影响推演行军与补给。' },
  { id: 'claim', label: '归属选中国家', icon: '⚑', detail: '将笔刷经过的陆地划归当前选中的国家。' },
  { id: 'unclaim', label: '擦除归属', icon: '⚐', detail: '保留陆地，清除国家归属。' },
  { id: 'city', label: '放置城市', icon: '▫', detail: '先填写城名，再点选已有国家归属的陆地。' },
  { id: 'capital', label: '设置首都', icon: '◇', detail: '点选所属国领土，放置或调整该国首都。' },
  { id: 'pan', label: '平移地图', icon: '✥', detail: '单指或鼠标拖动地图；任意工具下都可双指缩放。' },
];
const palette = ['#c6a65e', '#ad7363', '#74969c', '#a289aa', '#85a275', '#c09d87', '#8c91bb', '#91b6a9'];

export function WorldStudio(props: Props) {
  const { draft } = props;
  const [tool, setTool] = useState<StudioTool>('pan');
  const [radius, setRadius] = useState(38);
  const [layer, setLayer] = useState<StudioLayer>('terrain');
  const [nationId, setNationId] = useState('');
  const [nationName, setNationName] = useState('');
  const [nationColor, setNationColor] = useState(palette[0]);
  const [nationCount, setNationCount] = useState(5);
  const [cityName, setCityName] = useState('新城');
  const [citiesPerNation, setCitiesPerNation] = useState(2);
  const [undo, setUndo] = useState<EditorDraft[]>([]);
  const [redo, setRedo] = useState<EditorDraft[]>([]);
  const [section, setSection] = useState<'tools' | 'nations' | 'cities' | 'world' | null>(null);
  const [extent, setExtent] = useState<InspectorExtent>('half');
  const confirmationTitleId = useId();
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ title: string; detail: string; action: () => void } | null>(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const strokeRef = useRef<{ before: EditorDraft; current: EditorDraft; points: Point[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedNation = draft.nations.find((nation) => nation.id === nationId) ?? draft.nations[0];
  const landCount = draft.cells.filter((cell) => cell.land).length;
  const claimedCount = draft.cells.filter((cell) => cell.land && cell.ownerId).length;
  const activeTool = tools.find((item) => item.id === tool)!;

  function commit(next: EditorDraft) {
    setUndo((history) => [...history.slice(-23), draftRef.current]); setRedo([]); props.onChange(next); draftRef.current = next; setProblems([]); setNotice('');
  }

  function attempt(action: () => EditorDraft, message = '') {
    try { commit(action()); if (message) setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成，请检查当前地图。'); }
  }

  async function run(action: () => Promise<void>, message = '') {
    setBusy(true); setNotice('');
    try { await action(); if (message) setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成。'); }
    finally { setBusy(false); }
  }

  function makeNew(blank: boolean) {
    setConfirmation({ title: blank ? '从空白海洋重新创作？' : '生成一张新大陆？', detail: '将替换当前地图、国家和城市。可先取消并导出草稿；此次替换也可立即撤销。', action: () => attempt(() => ({ ...createDraft(draftRef.current.seed, blank), id: `world-${crypto.randomUUID()}` }), blank ? '空白海洋已准备好，使用陆地笔刷开始创作。' : '新大陆已生成，国家与城市等待你安排。') });
  }

  function confirmGenerated(title: string, detail: string, action: () => EditorDraft) { setConfirmation({ title, detail: `${detail}生成结果可以撤销。`, action: () => attempt(action) }); }

  function undoEdit() { const previous = undo.at(-1); if (!previous) return; setRedo((history) => [...history, draftRef.current]); setUndo((history) => history.slice(0, -1)); props.onChange(previous); setProblems([]); }
  function redoEdit() { const next = redo.at(-1); if (!next) return; setUndo((history) => [...history, draftRef.current]); setRedo((history) => history.slice(0, -1)); props.onChange(next); setProblems([]); }

  const toolPanel = <>
    <div className="studio-tool-grid">{tools.map((item) => <button key={item.id} aria-label={item.label} aria-pressed={tool === item.id} data-testid={`tool-${item.id}`} onClick={() => { setTool(item.id); setNotice(''); if (item.id === 'claim') setLayer('political'); }}><Icon name={item.id === 'claim' || item.id === 'unclaim' ? 'flag' : item.id === 'city' || item.id === 'capital' ? 'city' : item.id === 'pan' ? 'map' : 'brush'} /><span>{item.label === '归属选中国家' ? '归属国家' : item.label}</span></button>)}</div>
    <label className="studio-field">笔刷半径 <strong>{radius}</strong><input aria-label="笔刷半径" type="range" min={12} max={100} step={2} value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label>
    <p className="studio-help">{activeTool.detail}</p>
    {tool === 'claim' && <p className="studio-selected-country">当前国家：{selectedNation?.name ?? '请先在国家面板建国'}</p>}
    <div className="studio-generators"><button onClick={() => confirmGenerated('保留轮廓，重新生成地形？', '大陆轮廓与国家归属保留，山脉、森林和河流将重新生成。', () => generateTerrain(draftRef.current))}>自动生成地形 <span>↗</span></button><button onClick={() => confirmGenerated('重新生成大陆轮廓？', '当前海陆轮廓将被替换，可能影响国家与城市。', () => generateLand(draftRef.current))}>按种子生成大陆 <span>↗</span></button></div>
  </>;
  const nationPanel = <>
    <p className="studio-help">自定国名与颜色，亲手涂抹疆域，或让程序按地理分国。此处所有名称均为创作内容。</p>
    <div className="studio-nations">{draft.nations.map((nation) => <div key={nation.id} className={`studio-nation ${selectedNation?.id === nation.id ? 'selected' : ''}`}><button className="studio-nation-select" aria-label={`选择国家 ${nation.name}`} aria-pressed={selectedNation?.id === nation.id} onClick={() => { setNationId(nation.id); setTool('claim'); setLayer('political'); }}><i style={{ background: nation.color }} /><span>{nation.name}</span><small>{draft.cells.filter((cell) => cell.land && cell.ownerId === nation.id).length} 地</small></button>{selectedNation?.id === nation.id && <div className="studio-nation-edit"><input aria-label="选中国家名称" defaultValue={nation.name} key={`${nation.id}-${nation.name}`} maxLength={20} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== nation.name) commit({ ...draft, nations: draft.nations.map((item) => item.id === nation.id ? { ...item, name } : item) }); }} /><input aria-label="选中国家颜色" type="color" value={nation.color} onChange={(event) => commit({ ...draft, nations: draft.nations.map((item) => item.id === nation.id ? { ...item, color: event.target.value } : item) })} /></div>}</div>)}</div>
    <div className="studio-new-country"><input aria-label="新国家名称" placeholder="给新国家命名" maxLength={20} value={nationName} onChange={(event) => setNationName(event.target.value)} /><input aria-label="新国家颜色" type="color" value={nationColor} onChange={(event) => setNationColor(event.target.value)} /><button onClick={() => { try { const next = addNation(draft, nationName.trim() || `新国${draft.nations.length + 1}`, nationColor); commit(next); setNationId(next.nations.at(-1)?.id ?? ''); setNationName(''); setNationColor(palette[next.nations.length % palette.length]); setTool('claim'); setLayer('political'); } catch (error) { setNotice(String(error)); } }}>建国</button></div>
    <label className="studio-field">自动分为 <strong>{nationCount} 国</strong><input aria-label="自动国家数量" type="range" min={2} max={10} value={nationCount} onChange={(event) => setNationCount(Number(event.target.value))} /></label>
    <button className="studio-wide-button" onClick={() => confirmGenerated('重新划分国家与疆界？', '将替换当前国家与归属，原有城市可能重新归属或移除。', () => { setLayer('political'); return generateNations(draftRef.current, nationCount); })}>自动分国</button>
    <button className="studio-wide-button subtle" disabled={!draft.nations.length} onClick={() => attempt(() => fillUnclaimed(draftRef.current), '未分配陆地已按邻近国家分配。')}>分配剩余土地 <small>{landCount - claimedCount} 块未归属</small></button>
  </>;
  const cityPanel = <>
    <label className="studio-field">新城市名称<input aria-label="新城市名称" value={cityName} maxLength={24} onChange={(event) => setCityName(event.target.value)} /></label>
    <div className="studio-two-buttons"><button aria-pressed={tool === 'city'} onClick={() => setTool('city')}>点选放置城市</button><button aria-pressed={tool === 'capital'} onClick={() => setTool('capital')}>点选设置首都</button></div>
    <p className="studio-help">城市必须落在有归属的陆地上。首都属于所在地国家，每国一座；调整首都不会消灭国家。</p>
    <label className="studio-field">每国自动城池 <strong>{citiesPerNation}</strong><input aria-label="每国城市数量" type="range" min={1} max={4} value={citiesPerNation} onChange={(event) => setCitiesPerNation(Number(event.target.value))} /></label>
    <button className="studio-wide-button" disabled={!draft.nations.length} onClick={() => confirmGenerated('自动安排城池与首都？', '将按各国领土重新安排城市与首都，替换已有城池。', () => generateCities(draftRef.current, citiesPerNation))}>自动城池与首都</button>
    <div className="studio-city-list">{draft.cities.map((city) => <div key={city.id}><span className="studio-city-symbol">{city.capital ? '◇' : '▫'}</span><input aria-label={`城市名称 ${city.name}`} defaultValue={city.name} key={`${city.id}-${city.name}`} maxLength={24} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== city.name) commit({ ...draft, cities: draft.cities.map((item) => item.id === city.id ? { ...item, name } : item) }); }} /><small>{city.capital ? '首都' : '城市'}</small><button aria-label={`移除城市 ${city.name}`} onClick={() => commit({ ...draft, cities: draft.cities.filter((item) => item.id !== city.id) })}>×</button></div>)}</div>
  </>;
  const worldPanel = <>
    {props.onAtlas && <div className="studio-generators"><button disabled={busy} onClick={props.onAtlas}>大世界草稿 <span>→</span></button><p className="studio-help">独立的大地图地理编辑入口；当前世界与已有推演继续保留。</p></div>}
    <label className="studio-field">世界名称<input aria-label="世界名称" value={draft.name} maxLength={40} onChange={(event) => props.onChange({ ...draft, name: event.target.value })} /></label>
    <label className="studio-field">生成种子<input aria-label="生成种子" value={draft.seed} maxLength={80} onChange={(event) => props.onChange({ ...draft, seed: event.target.value })} /></label><p className="studio-help">同一生成种子得到相同初始地理。修改种子后，点击生成才会改变地图。</p>
    <div className="studio-two-buttons"><button onClick={() => makeNew(true)}>空白海洋</button><button onClick={() => makeNew(false)}>新大陆</button></div>
    <div className="studio-storage-actions"><button disabled={busy} onClick={() => void run(props.onSave, '世界草稿已保存。')}>保存草稿</button><button disabled={busy} onClick={() => void run(props.onExport, '世界草稿已导出。')}>导出草稿</button><button disabled={busy} onClick={() => fileRef.current?.click()}>导入草稿</button></div>
    <p className="studio-save-status" role="status">{props.saveStatus}</p>
    {props.savedRuns.length > 0 && <label className="studio-field">已保存的推演<select aria-label="已保存的推演" defaultValue="" onChange={event => props.onResumeRun(event.target.value)}><option value="" disabled>选择历史世界</option>{props.savedRuns.map(run => <option key={run.id} value={run.id}>{run.name} · {new Date(run.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
    <div className="studio-generators">{props.canResume && <button onClick={props.onResume}>继续已有推演 <span>→</span></button>}<button onClick={props.onDemo}>进入五国测试大陆 <span>→</span></button></div><p className="studio-help">创作沙盒与正式五国设定分别保存；五国测试大陆继续保留。</p>
    <AppearanceSettings />
    <details className="world-metadata"><summary>工坊与版本</summary><p>技术预览 · 当前地图与名称均为创作沙盒，不是正式设定。</p><p>构建 {__BUILD_SHA__}</p></details>
  </>;

  const titles = { tools: '画笔与地形', nations: '国家与疆域', cities: '城市与首都', world: '世界草稿' };
  const feedback = (props.error || notice) && <div className="inspector-feedback" tabIndex={0} aria-label="操作反馈"><div className="inspector-notice" data-testid="studio-notice" role={props.error ? 'alert' : 'status'}><span>{props.error || notice}</span>{!props.error && <button aria-label="关闭工坊提示" onClick={() => setNotice('')}><Icon name="close" /></button>}</div></div>;
  return <main className="world-studio workbench" data-mode="studio" data-inspector-open={!!section} data-testid="world-studio">
    <header className="workbench-header">
      <div className="workbench-identity"><h1>{draft.name || '未命名世界'}</h1><small className="mode-label">世界工坊 · 创作沙盒</small></div>
      <div className="studio-header-actions"><button aria-label="撤销编辑" disabled={!undo.length} onClick={undoEdit}><Icon name="chevron-left" /><span>撤销</span></button><button aria-label="重做编辑" disabled={!redo.length} onClick={redoEdit}><Icon name="chevron-left" className="icon-redo" /><span>重做</span></button><button className="studio-start" disabled={busy} onClick={() => { const issues = draftProblems(draft); setProblems(issues); if (!issues.length) void run(() => props.onStart(draft)); }}>开始推演</button></div>
    </header>
    <div className="studio-workspace workbench-stage">
      <div className="workbench-map studio-map-area">
<StudioCanvas draft={draft} tool={tool} radius={radius} layer={layer} selectedNation={selectedNation?.id ?? ''} onStrokeStart={() => { strokeRef.current = { before: draftRef.current, current: draftRef.current, points: [] }; }} onStrokePoint={(point) => {
        const stroke = strokeRef.current; if (!stroke) return;
        if (point.x < 0 || point.y < 0 || point.x > draft.width || point.y > draft.height) return;
        try { stroke.points.push(point); const recent = stroke.points.slice(-2); const next = paintStroke(stroke.current, recent, tool as BrushTool, radius, selectedNation?.id); stroke.current = next; props.onChange(next); draftRef.current = next; }
        catch (error) { setNotice(error instanceof Error ? error.message : '无法绘制'); }
      }} onStrokeEnd={(cancelled) => {
        const stroke = strokeRef.current; if (!stroke) return;
        if (cancelled) { props.onChange(stroke.before); draftRef.current = stroke.before; }
        else if (stroke.current !== stroke.before) { setUndo((history) => [...history.slice(-23), stroke.before]); setRedo([]); setProblems([]); }
        strokeRef.current = null;
      }} onPlace={(point) => { const cell = cellAt(draftRef.current, point); if (!cell?.land || !cell.ownerId) { setNotice('请在已归属国家的陆地上放置城市。'); return; } attempt(() => placeCity(draftRef.current, point, cityName.trim() || '新城', tool === 'capital')); }} />

        <div className="studio-layer-toggle" aria-label="工坊地图图层"><button aria-pressed={layer === 'terrain'} onClick={() => setLayer('terrain')}>自然地形</button><button aria-pressed={layer === 'political'} onClick={() => setLayer('political')}>国家政区</button></div>
      </div>
      <div className="context-toolbar studio-tool-context"><div className="context-primary"><Icon name={tool === 'pan' ? 'map' : tool === 'city' || tool === 'capital' ? 'city' : tool === 'claim' || tool === 'unclaim' ? 'flag' : 'brush'} /><strong>{activeTool.label}</strong><button onClick={() => setSection('tools')}>更换工具</button>{tool !== 'pan' && <button aria-label="结束绘制并平移" onClick={() => setTool('pan')}>结束绘制</button>}</div><div className="context-secondary">{tool === 'claim' ? `归属：${selectedNation?.name ?? '请先建国'}` : tool === 'city' || tool === 'capital' ? `城名：${cityName || '新城'}` : tool === 'pan' ? '拖动浏览 · 双指缩放' : `笔刷半径 ${radius}`}<span data-testid="studio-land-count">{landCount} 陆地区域</span><span>{draft.nations.length} 国 · {draft.cities.length} 城</span></div></div>
      {!section && feedback && <div className="workbench-status">{feedback}</div>}
      {problems.length > 0 && <div className="studio-problems" role="alert"><h2>开始之前，还需要</h2><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul><button onClick={() => setProblems([])}>继续编辑</button></div>}
      {section && <ContextInspector panel={section} title={titles[section]} subtitle={section === 'nations' ? `${draft.nations.length} 个创作国家` : section === 'cities' ? `${draft.cities.length} 座城市` : undefined} extent={extent} onExtent={setExtent} onClose={() => setSection(null)} closeLabel="关闭工坊面板" actions={feedback}>
        <div className={section === 'world' ? 'world-panel' : `studio-${section}-content`}>{section === 'tools' ? toolPanel : section === 'nations' ? nationPanel : section === 'cities' ? cityPanel : worldPanel}</div>
      </ContextInspector>}
    </div>
    <nav className="workbench-nav" aria-label="世界工坊工具">{([{ id: null, label: '地图', icon: 'map' }, { id: 'tools', label: '画笔', icon: 'brush' }, { id: 'nations', label: '国家', icon: 'flag' }, { id: 'cities', label: '城市', icon: 'city' }, { id: 'world', label: '世界', icon: 'world' }] as const).map(item => <button key={item.label} className="workbench-nav-item" aria-pressed={section === item.id} onClick={() => { setSection(item.id); if (item.id === null) setTool('pan'); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    <input ref={fileRef} type="file" className="visually-hidden" aria-label="选择世界草稿文件" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setConfirmation({ title: '导入并替换当前草稿？', detail: `将验证「${file.name}」，通过后替换当前编辑内容。请先保存或导出需要保留的草稿。`, action: () => { void run(async () => { await props.onImport(file); setUndo([]); setRedo([]); }, '草稿已导入。'); } }); }} />
    {confirmation && <ModalDialog titleId={confirmationTitleId} className="studio-confirm" locked={busy} onDismiss={() => setConfirmation(null)}><small>确认本次编辑</small><h2 id={confirmationTitleId}>{confirmation.title}</h2><p>{confirmation.detail}</p><div className="confirm-actions"><button autoFocus disabled={busy} onClick={() => setConfirmation(null)}>取消，保留当前草稿</button><button className="studio-start" disabled={busy} onClick={() => { const action = confirmation.action; setConfirmation(null); action(); }}>确认执行</button></div></ModalDialog>}
  </main>;
}
