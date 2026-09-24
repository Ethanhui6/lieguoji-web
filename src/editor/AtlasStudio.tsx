import { useEffect, useId, useRef, useState } from 'react';
import { AtlasClient } from '../world/bridge';
import type { AtlasClientView, AtlasDraftList, AtlasEditResult, AtlasPreview, AtlasProgress } from '../world/protocol';
import type { AtlasPatch } from '../world/transactions';
import type { AtlasSize } from '../world/model';
import { getAdminLeaf, getCellLayerSlot, getSimRegion } from '../world/model';
import { cellVertexIds, getCellQuad, getVertexPositionQ } from '../world/topology';
import { AtlasRenderer, type AtlasGraphicsState } from '../world/renderer';
import { ContextInspector, type InspectorExtent } from '../ui/ContextInspector';
import { AppearanceSettings } from '../ui/AppearanceSettings';
import { Icon } from '../ui/Icon';
import { ModalDialog } from '../ui/ModalDialog';
import './atlas-studio.css';

type Props = {
  initialDraftId?: string; initialSource?: 'current' | 'backup'; expectedManifest?: string;
  onBack: () => void;
  onDraftOpened: (draftId: string, source: 'current' | 'backup', manifestDigest: string) => void;
};
type Pending = { patch: AtlasPatch; reason: string; preview: AtlasPreview; input: string };
type Confirmation = { title: string; detail: string; button: string; action: () => Promise<void> };
const explain = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function AtlasStudio({ initialDraftId = '', initialSource = 'current', expectedManifest = '', onBack, onDraftOpened }: Props) {
  const hostRef = useRef<HTMLDivElement>(null), rendererRef = useRef<AtlasRenderer | null>(null), clientRef = useRef<AtlasClient | null>(null);
  const live = useRef(false), generation = useRef(0), busyRef = useRef(false), selectedRef = useRef<number | null>(null), viewRef = useRef<AtlasClientView | null>(null);
  const callbacks = useRef({ onDraftOpened }); callbacks.current = { onDraftOpened };
  const [view, setView] = useState<AtlasClientView | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(true);
  const [error, setError] = useState(''), [fatal, setFatal] = useState(''), [status, setStatus] = useState('正在打开大世界草稿…');
  const [graphicsState, setGraphicsState] = useState<AtlasGraphicsState>('ready');
  const [progress, setProgress] = useState<AtlasProgress | null>(null), [drafts, setDrafts] = useState<AtlasDraftList>([]);
  const [section, setSection] = useState<'edit' | 'world' | null>(initialDraftId ? null : 'world'), [extent, setExtent] = useState<InspectorExtent>('half');
  const [selected, setSelected] = useState<number | null>(null), [locate, setLocate] = useState('32896');
  const [mode, setMode] = useState<'elevation' | 'vertex'>('elevation'), [range, setRange] = useState(1), [height, setHeight] = useState(100);
  const [vertexId, setVertexId] = useState<number | null>(null), [moveX, setMoveX] = useState(1), [moveY, setMoveY] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [name, setName] = useState('新的山河'), [seed, setSeed] = useState('山河-大世界-01'), [size, setSize] = useState<AtlasSize>(256);
  const [frameMetrics, setFrameMetrics] = useState({ commitMs: 0, durableMs: 0, repaintBlocks: 0 });
  const [cameraScale, setCameraScale] = useState(1), titleId = useId();

  function clearPreview() { setPending(null); if (ready && !fatal) rendererRef.current?.showPreview([]); }
  function lockDisplay(error: unknown) {
    const message = `地图未能正确显示，已停止继续编辑。已提交的草稿仍保留，请刷新并恢复。${explain(error)}`;
    clientRef.current?.fail(new Error(message));
    if (live.current) { setFatal(message); setError(message); setReady(false); }
  }
  async function accept(next: AtlasClientView, start: number, durableAt: number, ticket = generation.current) {
    if (!live.current || generation.current !== ticket) return;
    const renderer = rendererRef.current!;
    callbacks.current.onDraftOpened(next.head.draftId, next.head.readOnly ? 'backup' : 'current', next.head.manifestDigest);
    const delta = 'delta' in next ? next as AtlasEditResult : undefined;
    try {
      // Painting now yields: discard old-world selection before input can run
      // against a smaller new atlas between two batches.
      if (viewRef.current?.head.draftId !== next.head.draftId) { selectedRef.current = null; setSelected(null); setVertexId(null); }
      const rendered = await renderer.accept(next.data, delta);
      if (!live.current || generation.current !== ticket) return;
      viewRef.current = next; setView(next); setPending(null);
      const selectedId = selectedRef.current;
      if (selectedId !== null && selectedId < next.data.manifest.spec.columns ** 2) {
        renderer.select(selectedId);
        const ids = cellVertexIds(next.data.manifest.spec, selectedId); setVertexId(current => current !== null && ids.includes(current) ? current : ids[0]);
      }
      else { selectedRef.current = null; setSelected(null); setVertexId(null); }
      setFrameMetrics({ commitMs: performance.now() - start, durableMs: durableAt - start, repaintBlocks: rendered.repaintBlocks });
      setStatus(next.head.readOnly ? '正在查看上一次备份；原草稿保持不变。' : `草稿已保存 · 修订 ${next.head.revision}`);
      setReady(true);
    } catch (error) { if (live.current && generation.current === ticket) lockDisplay(error); throw error; }
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current || fatal || rendererRef.current?.metrics().gpu.state !== 'ready') return;
    const ticket = generation.current;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { if (live.current && generation.current === ticket) { setError(explain(error)); setStatus(error instanceof Error && error.name === 'AbortError' ? '操作已取消；已经提交的草稿仍保留。' : '操作未完成，请查看原因。'); } }
    finally { if (live.current && generation.current === ticket) { busyRef.current = false; setBusy(false); setProgress(null); } }
  }
  const refreshList = async (client = clientRef.current!, ticket = generation.current) => {
    try { const rows = await client.list(); if (live.current && generation.current === ticket) setDrafts(rows); }
    catch (failure) { if (live.current && generation.current === ticket) setError(`草稿目录暂时无法读取；已经提交的草稿保持原样。${explain(failure)}`); }
  };
  useEffect(() => {
    const ticket = ++generation.current, current = () => live.current && generation.current === ticket;
    live.current = true; busyRef.current = true;
    let client: AtlasClient;
    try { client = new AtlasClient({ onProgress: next => { if (current()) setProgress(next); }, onFatal: failure => { if (current()) { setFatal(explain(failure)); setReady(false); } } }); }
    catch (failure) { setFatal(`草稿线程未能启动，请刷新后恢复。${explain(failure)}`); setBusy(false); busyRef.current = false; return () => { if (generation.current === ticket) live.current = false; }; }
    clientRef.current = client;
    const renderer = new AtlasRenderer(hostRef.current!, {
      onPick: id => {
        if (!current()) return;
        if (busyRef.current) { renderer.select(selectedRef.current); return; }
        selectedRef.current = id; setSelected(id); setLocate(String(id)); setPending(null); renderer.showPreview([]);
        const data = viewRef.current?.data; if (data) setVertexId(cellVertexIds(data.manifest.spec, id)[0]);
        renderer.focusCell(id, false); setSection('edit');
      },
      onCamera: camera => { if (current()) setCameraScale(camera.scale); },
      onProgress: next => { if (current()) setProgress(next); },
      onGraphicsState: next => { if (current()) { setGraphicsState(next); if (next === 'ready') setProgress(null); } },
      onFatal: failure => { client.fail(failure); if (current()) { setFatal(`地图显示失败，已停止继续编辑。请刷新并恢复已保存草稿。${failure.message}`); setReady(false); } },
    });
    rendererRef.current = renderer;
    void (async () => {
      await renderer.init().catch(failure => { if (current()) lockDisplay(failure); throw failure; }); if (!current()) return;
      try {
        if (initialDraftId) {
          if (initialSource === 'backup' && !/^[0-9a-f]{64}$/.test(expectedManifest)) throw new Error('备份链接缺少有效的时点标识，未打开其他时点。请在草稿列表中明确选择要查看的备份。');
          const started = performance.now(), next = await client.restore(initialDraftId, initialSource);
          if (!current()) return;
          if (initialSource === 'backup' && next.head.manifestDigest !== expectedManifest) throw new Error('备份位置已变化，未替换所选历史。原链接的时点不再位于备份槽；请在草稿列表中明确选择当前可用的备份或主档。');
          await accept(next, started, performance.now(), ticket);
        } else { setStatus('新建一份空白海洋草稿，或打开已保存的山河。'); setReady(true); }
      } catch (failure) {
        if (current()) { setError(explain(failure)); setStatus('草稿未能打开，原始数据未被覆盖。'); setSection('world'); }
      }
      if (current()) await refreshList(client, ticket);
    })().catch(failure => { if (current()) { setError(explain(failure)); setStatus('草稿未能打开，原始数据未被覆盖。'); setSection('world'); } }).finally(() => { if (current()) { busyRef.current = false; setBusy(false); setProgress(null); } });
    return () => {
      if (generation.current === ticket) live.current = false;
      client.close(); renderer.destroy();
      if (clientRef.current === client) clientRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
    // Route identity is fixed for this mounted studio; local draft switches use the same renderer.
  }, []);

  const data = view?.data, spec = data?.manifest.spec, readOnly = view?.head.readOnly ?? false, graphicsLocked = graphicsState !== 'ready', locked = busy || !ready || !!fatal || readOnly || graphicsLocked;
  const selectedHeight = data && selected !== null ? (() => { const cell = getCellLayerSlot(data, 'elevation', selected); return cell.block.values[cell.slot]; })() : null;
  const selectedQuad = data && selected !== null ? getCellQuad(data, selected) : null;
  const center = selectedQuad ? { x: selectedQuad.reduce((sum, p) => sum + p.x, 0) / 4, y: selectedQuad.reduce((sum, p) => sum + p.y, 0) / 4 } : null;
  const vertices = spec && selected !== null ? cellVertexIds(spec, selected) : [];
  const position = data && vertexId !== null && vertices.includes(vertexId) ? getVertexPositionQ(data, vertexId) : null;
  const cells = (() => {
    if (!spec || selected === null) return [];
    const x = selected % spec.columns, y = Math.floor(selected / spec.columns), start = Math.floor(range / 2), ids: number[] = [];
    for (let row = y - start; row < y - start + range; row++) for (let col = x - start; col < x - start + range; col++) if (col >= 0 && row >= 0 && col < spec.columns && row < spec.rows) ids.push(row * spec.columns + col);
    return ids;
  })();
  function selectById() {
    const id = Number(locate);
    if (!spec || !Number.isInteger(id) || id < 0 || id >= spec.columns * spec.rows) { setError('请选择当前地图范围内的地块编号。'); return; }
    clearPreview(); selectedRef.current = id; setSelected(id); setVertexId(cellVertexIds(spec, id)[0]); rendererRef.current?.focusCell(id); setSection('edit');
  }
  async function create() {
    const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.create({ size, seed, name });
    if (!live.current || ticket !== generation.current) return;
    await accept(next, start, performance.now(), ticket); await refreshList(client, ticket);
    if (live.current && ticket === generation.current) setSection(null);
  }
  async function restore(id: string, source: 'current' | 'backup') {
    clearPreview(); const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.restore(id, source);
    if (!live.current || ticket !== generation.current) return;
    selectedRef.current = null; setSelected(null); setVertexId(null); await accept(next, start, performance.now(), ticket);
    if (live.current && ticket === generation.current) setSection(source === 'backup' ? 'world' : null);
  }
  async function prepare() {
    const ticket = generation.current, client = clientRef.current!;
    if (!data || selected === null) throw new Error('先在地图上点选一个地块。');
    let patch: AtlasPatch, reason: string, input: string;
    if (mode === 'elevation') {
      if (!Number.isInteger(height) || height < -12000 || height > 12000) throw new Error('高程需要是 -12000 至 12000 米的整数。');
      patch = { elevation: { ids: new Uint32Array(cells), values: new Int32Array(cells.length).fill(height) } };
      reason = `将选中范围的高程调整为${height}米`; input = `${range}×${range}范围，实际${cells.length}地块${cells.length < range * range ? '（已在世界边缘裁切）' : ''}，调整为${height}米。选中中心当前为${selectedHeight}米。`;
    } else {
      if (vertexId === null || !position || !Number.isFinite(moveX) || !Number.isFinite(moveY)) throw new Error('选择共享顶点并填写有限位移。');
      const x = position.xQ + Math.round(moveX * 256), y = position.yQ + Math.round(moveY * 256);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x > 4096 * 256 || y > 4096 * 256) throw new Error('顶点位移超出世界坐标范围。');
      patch = { vertices: { ids: new Uint32Array([vertexId]), xyQ: new Int32Array([x, y]) } };
      reason = `移动共享顶点${vertexId}`; input = `顶点 #${vertexId}：(${(position.xQ / 256).toFixed(3)}, ${(position.yQ / 256).toFixed(3)}) → (${(x / 256).toFixed(3)}, ${(y / 256).toFixed(3)})。相邻地块将一起更新。`;
    }
    const preview = await client.preview(patch, reason);
    if (live.current && generation.current === ticket) { setPending({ patch, reason, preview, input }); rendererRef.current?.showPreview(preview.affectedCellIds, patch.vertices); setStatus('预览已核验，草稿尚未修改。'); }
  }
  async function confirmEdit() {
    if (!pending) return;
    const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.edit(pending.patch, pending.reason, { revision: pending.preview.baseRevision, rootDigest: pending.preview.baseRootDigest });
    if (!live.current || ticket !== generation.current) return;
    await accept(next, start, performance.now(), ticket); await refreshList(client, ticket);
  }
  async function undo() {
    clearPreview(); const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.undo();
    if (!live.current || ticket !== generation.current) return;
    await accept(next, start, performance.now(), ticket); await refreshList(client, ticket);
  }
  async function fork() {
    const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.fork(`${view?.head.name ?? '山河'} · 独立副本`);
    if (!live.current || ticket !== generation.current) return;
    await accept(next, start, performance.now(), ticket); await refreshList(client, ticket);
  }
  const graphicsMessage = graphicsState === 'lost' ? '图形连接暂时中断，草稿仍保留；恢复画面后可继续编辑。' : graphicsState === 'restoring' ? '正在恢复地图画面，草稿与当前视角保持不变。' : '';
  const feedback = <div className="inspector-feedback" tabIndex={0} aria-label="草稿操作反馈"><div className="inspector-notice" role={error || fatal ? 'alert' : 'status'}><span>{fatal || graphicsMessage || error || (progress ? `${progress.stage} · ${progress.completed}/${progress.total}` : status)}</span>{busy && !fatal && <button onClick={() => { try { if (!rendererRef.current?.cancelPendingAcceptance()) clientRef.current?.cancel(); } catch (failure) { setError(explain(failure)); } }}>取消操作</button>}</div>{(fatal || graphicsLocked) && <button onClick={() => window.location.reload()}>刷新并恢复已保存草稿</button>}</div>;

  const editPanel = <div className="atlas-panel-content">
    <form className="atlas-locate" onSubmit={event => { event.preventDefault(); selectById(); }}><label>定位地块<input aria-label="定位地块编号" type="number" min={0} max={spec ? spec.columns * spec.rows - 1 : 0} value={locate} onChange={event => setLocate(event.target.value)} /></label><button disabled={!data || busy || graphicsLocked}>定位</button></form>
    {selected !== null && data && <>
      <dl className="atlas-cell-details"><div><dt>地块</dt><dd>#{selected}</dd></div><div><dt>坐标</dt><dd>{center?.x.toFixed(2)}，{center?.y.toFixed(2)}</dd></div><div><dt>高程</dt><dd data-testid="atlas-selected-height">{selectedHeight} 米</dd></div><div><dt>地表</dt><dd>{selectedHeight! < 0 ? '海洋' : '陆地'}</dd></div><div><dt>模拟区</dt><dd>{getSimRegion(data, selected) ?? '未分配'}</dd></div><div><dt>行政叶</dt><dd>{getAdminLeaf(data, selected) ?? '未分配'}</dd></div></dl>
      {readOnly ? <p className="atlas-help">这份备份只供查看。请在草稿面板创建独立副本后继续编辑。</p> : <fieldset className="atlas-edit-fields" disabled={locked}>
        <div className="atlas-segmented" aria-label="地理编辑方式"><button aria-pressed={mode === 'elevation'} onClick={() => { clearPreview(); setMode('elevation'); }}>高程</button><button aria-pressed={mode === 'vertex'} onClick={() => { clearPreview(); setMode('vertex'); }}>共享顶点</button></div>
        {mode === 'elevation' ? <><label className="atlas-field">调整为高程（米）<input aria-label="目标高程（米）" type="number" min={-12000} max={12000} step={10} value={height} onChange={event => { clearPreview(); setHeight(Number(event.target.value)); }} /></label><label className="atlas-field">局部范围<select aria-label="高程编辑范围" value={range} onChange={event => { clearPreview(); setRange(Number(event.target.value)); }}><option value={1}>1 个地块</option><option value={8}>8 × 8 地块</option><option value={32}>32 × 32 地块</option></select></label><p className="atlas-help">以选中地块为中心，实际影响 {cells.length} / {range * range} 个地块{cells.length < range * range ? '，已在世界边缘裁切' : ''}。高程低于 0 米显示为海洋。</p></> : <><label className="atlas-field">共享顶点<select aria-label="共享顶点" value={vertexId ?? ''} onChange={event => { clearPreview(); setVertexId(Number(event.target.value)); }}>{vertices.map(id => <option key={id} value={id}>顶点 #{id}</option>)}</select></label><div className="atlas-two-fields"><label className="atlas-field">东西位移<input aria-label="顶点东西位移" type="number" step={.25} value={moveX} onChange={event => { clearPreview(); setMoveX(Number(event.target.value)); }} /></label><label className="atlas-field">南北位移<input aria-label="顶点南北位移" type="number" step={.25} value={moveY} onChange={event => { clearPreview(); setMoveY(Number(event.target.value)); }} /></label></div><p className="atlas-help">单位为世界坐标。共享顶点的小幅移动会同时改变所有相邻地块；越界或退化的几何会被拒绝。</p></>}
        {!pending && <button className="atlas-primary" disabled={locked} onClick={() => void run(prepare)}>预览地理编辑</button>}
        {pending && <section className="atlas-preview" aria-label="地理编辑预览" data-atlas-preview-owner-blocks={pending.preview.ownerCoordinates.length} data-atlas-preview-display-blocks={pending.preview.displayBlocks.length} data-atlas-preview-cells={pending.preview.affectedCellCount}><h3>确认这次变化</h3><p>{pending.input}</p><p>实际改变 {pending.preview.affectedCellCount} 个地块{mode === 'vertex' ? '，相邻地块将共同使用新的边界位置' : ''}。确认之前，草稿保持原样。</p><div className="atlas-actions"><button disabled={busy} onClick={() => { clearPreview(); setStatus('已取消预览，草稿未修改。'); }}>取消编辑</button><button className="atlas-primary" disabled={locked} onClick={() => void run(confirmEdit)}>确认地理编辑</button></div><details className="world-metadata"><summary>本次校验信息</summary><p>基于修订 {pending.preview.baseRevision}；{pending.preview.ownerCoordinates.length} 个权威块位置、{pending.preview.writeKeys.length} 个分层块、{pending.preview.displayBlocks.length} 个显示块。</p><p>请求 {pending.preview.requestBytes} bytes；回执 {pending.preview.responseBytes} bytes。</p></details></section>}
      </fieldset>}
    </>}
    {selected === null && <p className="atlas-help">轻点地图选择地块，或输入编号定位。拖动只移动视野，不会改地形。</p>}
  </div>;
  const worldPanel = <div className="atlas-panel-content">
    {view && <section className="atlas-current"><h3>{view.head.name}</h3><p>{view.head.readOnly ? '只读备份' : '已保存草稿'} · 修订 {view.head.revision} · {view.data.manifest.spec.columns ** 2} 地块</p>{view.head.readOnly && <button className="atlas-primary" disabled={busy || !!fatal || graphicsLocked} onClick={() => setConfirmation({ title: '从备份创建独立副本？', detail: '新草稿使用独立存储身份。原主档与备份均保持不变。', button: '确认创建独立副本', action: fork })}>创建独立副本</button>}</section>}
    <section><h3>新建空白大世界</h3><label className="atlas-field">草稿名称<input aria-label="大世界草稿名称" maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><label className="atlas-field">生成种子<input aria-label="大世界生成种子" maxLength={120} value={seed} onChange={event => setSeed(event.target.value)} /></label><label className="atlas-field">地理规模<select aria-label="大世界地理规模" value={size} onChange={event => setSize(Number(event.target.value) as AtlasSize)}><option value={128}>基本 · 16,384 地块</option><option value={256}>标准 · 65,536 地块</option><option value={512}>扩展实验 · 262,144 地块</option></select></label><p className="atlas-help">从负高程海洋开始，点选后可以局部升降地形。此草稿用于地理创作；经营与军事推演仍可从原世界工坊进入。</p><button className="atlas-primary" disabled={busy || !ready || !!fatal || graphicsLocked || !name.trim() || !seed.trim()} onClick={() => view ? setConfirmation({ title: '创建另一份空白草稿？', detail: '当前草稿已经自动保存，新建不会覆盖它。', button: '确认新建草稿', action: create }) : void run(create)}>新建空白海洋草稿</button></section>
    <section><div className="atlas-section-heading"><h3>已保存的草稿</h3><button disabled={busy || !!fatal || graphicsLocked} onClick={() => void run(refreshList)}>刷新列表</button></div>{drafts.length ? <ul className="atlas-draft-list">{drafts.map(row => <li key={row.draftId}><strong>{row.name}</strong><span>修订 {row.revision} · {row.size ** 2} 地块</span><div className="atlas-actions"><button disabled={busy || !!fatal || graphicsLocked} onClick={() => void run(() => restore(row.draftId, 'current'))}>打开 {row.name}</button>{row.backupAvailable && <button disabled={busy || !!fatal || graphicsLocked} onClick={() => setConfirmation({ title: '只读查看上一次备份？', detail: '不会回滚或改写主档。需要继续修改时，请创建独立副本。', button: '读取只读备份', action: () => restore(row.draftId, 'backup') })}>查看备份 {row.name}</button>}</div></li>)}</ul> : <p className="atlas-help">这个浏览器还没有大世界草稿。</p>}</section>
    <AppearanceSettings />
    <details className="world-metadata"><summary>草稿身份与版本</summary><p>生产草稿格式 v1 · 地理编辑阶段，不是社会推演存档。</p>{view && <><p>草稿 {view.head.draftId}</p><p>地理 {view.head.atlasId}</p><p>内容摘要 {view.head.manifestDigest}</p></>}<p>构建 {__BUILD_SHA__}</p></details>
    <button className="atlas-return" disabled={busy} onClick={onBack}>返回原世界工坊</button>
  </div>;
  return <main className="atlas-studio workbench" data-mode="atlas" data-testid="atlas-studio" data-atlas-id={view?.head.draftId ?? ''} data-atlas-revision={view?.head.revision ?? ''} data-atlas-hash={view?.head.manifestDigest ?? ''} data-atlas-gpu={graphicsState} data-atlas-state={fatal ? 'fatal' : graphicsLocked ? graphicsState : busy ? 'busy' : readOnly ? 'readonly' : view ? 'ready' : 'empty'} data-selectedcell={selected ?? ''} data-atlas-selectedcell={selected ?? ''} data-atlas-commit-ms={frameMetrics.commitMs} data-atlas-durable-ms={frameMetrics.durableMs} data-atlas-request-bytes={view?.metrics.requestBytes ?? 0} data-atlas-response-bytes={view?.metrics.responseBytes ?? 0} data-atlas-repainted-blocks={frameMetrics.repaintBlocks}>
    <header className="workbench-header"><div className="workbench-identity"><h1>{view?.head.name ?? '大世界草稿'}</h1><small className="mode-label">{readOnly ? '只读备份' : '地理创作'}</small></div><button disabled={locked || !view?.head.undoCount} aria-label="撤销大世界编辑" onClick={() => void run(undo)}><Icon name="chevron-left" /><span>撤销</span></button><button disabled={busy} aria-label="返回原世界工坊" onClick={onBack}><Icon name="chevron-left" /><span>工坊</span></button></header>
    <div className="workbench-stage"><div className="workbench-map atlas-map" ref={hostRef} />
      <div className="context-toolbar atlas-toolbar"><button disabled={!view || !!fatal || graphicsLocked || busy} aria-label="放大大世界地图" onClick={() => rendererRef.current?.zoom(1.5)}>＋</button><button disabled={!view || !!fatal || graphicsLocked || busy} aria-label="缩小大世界地图" onClick={() => rendererRef.current?.zoom(1 / 1.5)}>−</button><button disabled={!view || !!fatal || graphicsLocked || busy} onClick={() => rendererRef.current?.fit()}>全图</button><span data-testid="atlas-zoom">{Math.round(cameraScale * 100)}%</span><small>拖动浏览 · 双指缩放 · 点选查看</small></div>
      {!view && !busy && !fatal && <div className="atlas-empty"><Icon name="map" size={44} /><p>从一片海洋开始</p><button onClick={() => setSection('world')}>创建或打开草稿</button></div>}
      {section && <ContextInspector panel={`atlas-${section}`} title={section === 'edit' ? selected === null ? '地理编辑' : `地块 #${selected}` : '大世界草稿'} subtitle={section === 'edit' ? '查看 → 预览 → 确认后自动保存' : '独立保存，不覆盖原世界'} extent={extent} onExtent={setExtent} onClose={() => setSection(null)} closeLabel="关闭大世界面板" actions={feedback}>{section === 'edit' ? editPanel : worldPanel}</ContextInspector>}
      {!section && <div className="workbench-status atlas-status">{feedback}</div>}
    </div>
    <nav className="workbench-nav" aria-label="大世界草稿工具">{([{ id: null, label: '地图', icon: 'map' }, { id: 'edit', label: '编辑', icon: 'brush' }, { id: 'world', label: '草稿', icon: 'world' }] as const).map(item => <button key={item.label} className="workbench-nav-item" aria-pressed={section === item.id} onClick={() => setSection(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    {confirmation && <ModalDialog titleId={titleId} locked={busy} onDismiss={() => setConfirmation(null)}><h2 id={titleId}>{confirmation.title}</h2><p>{confirmation.detail}</p><div className="confirm-actions"><button autoFocus disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button disabled={busy} className="atlas-primary" onClick={() => { const action = confirmation.action; setConfirmation(null); void run(action); }}>{confirmation.button}</button></div></ModalDialog>}
  </main>;
}
