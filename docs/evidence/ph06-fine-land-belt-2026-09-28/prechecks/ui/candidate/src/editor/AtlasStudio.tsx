import { isGenerationDocument, type AtlasFormat } from '../world/atlas-format';
import { validateCellRectangle, type GenerationRecipe, type GenerationScope, type AtlasCellRectangle } from '../world/generation-contract';
import { atlasCellLockFlags } from '../world/generation-locks';
import { getCoastalCellSurface } from '../world/coastal-surface';
import { MACRO_GENERATOR_FINGERPRINT, LANDFORM_GENERATOR_FINGERPRINT, ISLAND_GENERATOR_FINGERPRINT, COAST_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT, OCEAN_GENERATOR_FINGERPRINT } from '../world/generation/fingerprint';
import { useEffect, useId, useRef, useState } from 'react';
import { AtlasClient } from '../world/bridge';
import type { AtlasClientView, AtlasDraftList, AtlasGenerationPreview, AtlasConstraintsPreview, AtlasEditResult, AtlasPreview, AtlasProgress } from '../world/protocol';
import type { AtlasPatch } from '../world/transactions';
import type { AtlasSize } from '../world/model';
import { getAdminLeaf, getCellLayerSlot, getSimRegion } from '../world/model';
import { cellVertexIds, getCellQuad, getVertexPositionQ } from '../world/topology';
import { AtlasRenderer, type AtlasGraphicsState, type AtlasOutlinePoint } from '../world/renderer';
import { ContextInspector, type InspectorExtent } from '../ui/ContextInspector';
import { AppearanceSettings } from '../ui/AppearanceSettings';
import { Icon } from '../ui/Icon';
import { ModalDialog } from '../ui/ModalDialog';
import { atlasOperationFailureFeedback } from './atlas-operation-feedback';
import './atlas-studio.css';
import { DetailCoastPanel } from './DetailCoastPanel';
import { makeDetailCoastRecipe, restoreDetailCoastControls } from './detail-coast-controls';
import { atlasGenerationProgressLabel } from './atlas-generation-progress';
import { LocalReliefPanel } from './LocalReliefPanel';
import { canStartLocalRelief, localReliefScope, localReliefSelectionStep, makeLocalReliefRecipe, nearbyLocalReliefRectangle, restoreLocalReliefControls, LOCAL_RELIEF_DEFAULT_TRANSITION } from './local-relief-controls';
import { RegionProtectionPanel } from './RegionProtectionPanel';
import { makeProtectionRequest, protectionRectangle, protectionSelectionStep } from './region-protection-controls';

type Props = {
  initialDraftId?: string; initialSource?: 'current' | 'backup'; expectedManifest?: string; initialFormat?: AtlasFormat | null;
  onBack: () => void;
  onDraftOpened: (draftId: string, source: 'current' | 'backup', manifestDigest: string, format: AtlasFormat) => void;
};
type Pending = { patch: AtlasPatch; reason: string; preview: AtlasPreview; input: string };
type Confirmation = { title: string; detail: string; button: string; action: () => Promise<void> };
const explain = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function AtlasStudio({ initialDraftId = '', initialSource = 'current', expectedManifest = '', initialFormat = 1, onBack, onDraftOpened }: Props) {
  const hostRef = useRef<HTMLDivElement>(null), rendererRef = useRef<AtlasRenderer | null>(null), clientRef = useRef<AtlasClient | null>(null);
  const live = useRef(false), generation = useRef(0), busyRef = useRef(false), selectedRef = useRef<number | null>(null), viewRef = useRef<AtlasClientView | null>(null);
  const callbacks = useRef({ onDraftOpened }); callbacks.current = { onDraftOpened };
  const [view, setView] = useState<AtlasClientView | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(true);
  const [error, setError] = useState(''), [fatal, setFatal] = useState(''), [status, setStatus] = useState('正在打开大世界草稿…');
  const [graphicsState, setGraphicsState] = useState<AtlasGraphicsState>('ready');
  const [progress, setProgress] = useState<AtlasProgress | null>(null), [drafts, setDrafts] = useState<(AtlasDraftList[number] & { format: AtlasFormat })[]>([]);
  const [section, setSection] = useState<'edit' | 'world' | 'generate' | null>(initialDraftId ? null : 'world'), [extent, setExtent] = useState<InspectorExtent>('half');
  const [selected, setSelected] = useState<number | null>(null), [locate, setLocate] = useState('32896');
  const [mode, setMode] = useState<'elevation' | 'vertex'>('elevation'), [range, setRange] = useState(1), [height, setHeight] = useState(100);
  const [vertexId, setVertexId] = useState<number | null>(null), [moveX, setMoveX] = useState(1), [moveY, setMoveY] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [name, setName] = useState('新的山河'), [seed, setSeed] = useState('山河-大世界-01'), [size, setSize] = useState<AtlasSize>(256);
  const [generationPreview, setGenerationPreview] = useState<AtlasGenerationPreview | null>(null), generationPreviewRef = useRef<AtlasGenerationPreview | null>(null);
  const [constraintsPreview, setConstraintsPreview] = useState<AtlasConstraintsPreview | null>(null), constraintsPreviewRef = useRef<AtlasConstraintsPreview | null>(null);
  const [localGeneration, setLocalGeneration] = useState(false), [showLockRegion, setShowLockRegion] = useState(false);
  const [fineOperation, setFineOperation] = useState<'draw' | 'local-relief' | 'protect'>('draw');
  const beforeProtection = useRef<'draw' | 'local-relief'>('draw');
  const [protectionRegion, setProtectionRegion] = useState<AtlasCellRectangle>({ column: 0, row: 0, columns: 1, rows: 1 });
  const [protectionSelecting, setProtectionSelecting] = useState(false), protectionSelectionRef = useRef<{ active: boolean; anchor: number | null }>({ active: false, anchor: null });
  const [localSelecting, setLocalSelecting] = useState(false), localSelectionRef = useRef<{ active: boolean; anchor: number | null }>({ active: false, anchor: null });
  const [localReliefSeed, setLocalReliefSeed] = useState('山地-01'), [localReliefMeters, setLocalReliefMeters] = useState(2400);
  const [region, setRegion] = useState<AtlasCellRectangle>({ column: 32, row: 32, columns: 64, rows: 64 }), [transitionCells, setTransitionCells] = useState(4);
  const [lockMask, setLockMask] = useState<1 | 2 | 3>(3), [lockAction, setLockAction] = useState<'set' | 'clear'>('set');
  const cancelGenerationDisplay = useRef<(() => Promise<void>) | null>(null);
  const [continents, setContinents] = useState(3), [coverage, setCoverage] = useState(400), [wavelength, setWavelength] = useState(384), [relief, setRelief] = useState(2400);
  const [terrainSeed, setTerrainSeed] = useState('山海-01');
  const [terrainOperation, setTerrainOperation] = useState<'macro' | 'landforms' | 'islands' | 'coast' | 'shape' | 'ocean'>(initialFormat === 4 ? 'shape' : 'macro');
  const [chainCount, setChainCount] = useState(1), [islandsPerChain, setIslandsPerChain] = useState(3), [islandRadius, setIslandRadius] = useState(80);
  const [coastStrength, setCoastStrength] = useState(650), [coastIterations, setCoastIterations] = useState(2);
  const [mountainRanges, setMountainRanges] = useState(3), [basins, setBasins] = useState(2);
  const [drawing, setDrawing] = useState(false), [outline, setOutline] = useState<AtlasOutlinePoint[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [shapeRoughness, setShapeRoughness] = useState(initialFormat === 3 ? 96 : 32), [shapeShelf, setShapeShelf] = useState(128);
  const [detailIslands, setDetailIslands] = useState(1), [detailIslandCount, setDetailIslandCount] = useState(3);
  const [detailVersion, setDetailVersion] = useState<1 | 2>(2), [coastStructure, setCoastStructure] = useState(96);
  const [surfacePick, setSurfacePick] = useState<{ cellId: number; land: boolean; height: number } | null>(null);
  const [oceanDepth, setOceanDepth] = useState(3600), [oceanRelief, setOceanRelief] = useState(1000), [oceanShelf, setOceanShelf] = useState(320);
  const outlineCallback = useRef<(points: AtlasOutlinePoint[]) => void>(() => {});
  const [frameMetrics, setFrameMetrics] = useState({ commitMs: 0, durableMs: 0, repaintBlocks: 0 });
  const [cameraScale, setCameraScale] = useState(1), titleId = useId();

  function clearPreview() { setPending(null); if (ready && !fatal) rendererRef.current?.showPreview([]); }
  function stopLocalSelection() {
    localSelectionRef.current = { active: false, anchor: null }; setLocalSelecting(false);
    protectionSelectionRef.current = { active: false, anchor: null }; setProtectionSelecting(false);
  }
  function lockDisplay(error: unknown) {
    const message = `地图未能正确显示，已停止继续编辑。已提交的草稿仍保留，请刷新并恢复。${explain(error)}`;
    clientRef.current?.fail(new Error(message));
    if (live.current) { setFatal(message); setError(message); setReady(false); }
  }
  async function accept(next: AtlasClientView, start: number, durableAt: number, ticket = generation.current) {
    if (!live.current || generation.current !== ticket) return;
    const renderer = rendererRef.current!;
    callbacks.current.onDraftOpened(next.head.draftId, next.head.readOnly ? 'backup' : 'current', next.head.manifestDigest, next.data.manifest.version);
    const delta = 'delta' in next ? next as AtlasEditResult : undefined;
    try {
      // Painting now yields: discard old-world selection before input can run
      // against a smaller new atlas between two batches.
      if (viewRef.current?.head.draftId !== next.head.draftId) { stopLocalSelection(); selectedRef.current = null; setSelected(null); setVertexId(null); }
      const rendered = await renderer.accept(next.data, delta);
      if (!live.current || generation.current !== ticket) return;
      if (viewRef.current?.data.manifest.version !== next.data.manifest.version) {
        setShapeRoughness(next.data.manifest.version === 3 ? 96 : 32); setShapeShelf(128);
        if (next.data.manifest.version === 4) { setTerrainOperation('shape'); setLocalGeneration(false); setShowLockRegion(false); }
      }
      // Opening a saved world restores the player's last applied controls. A
      // normal confirmation/undo in this session must not reset unsaved choices.
      if (viewRef.current?.head.draftId !== next.head.draftId && next.data.manifest.version === 4) {
        const applied = next.data.manifest.generation.lastApplied, recipe = applied?.recipe;
        const restoredLocal = restoreLocalReliefControls(recipe, applied?.scope, next.data.manifest.spec);
        if (restoredLocal) {
          setFineOperation('local-relief'); setLocalReliefSeed(restoredLocal.seed); setLocalReliefMeters(restoredLocal.reliefMeters);
          setRegion(restoredLocal.rectangle); setTransitionCells(restoredLocal.transitionCells); setLocalGeneration(true); setShowLockRegion(false);
        } else { setFineOperation('draw'); setLocalGeneration(false); }
        const restored = restoreDetailCoastControls(recipe, next.data.manifest.seed);
        setDetailVersion(restored.version); setCoastStructure(restored.structure); setTerrainSeed(restored.seed);
        setShapeRoughness(restored.roughness); setShapeShelf(restored.shelf); setRelief(restored.relief);
        setDetailIslands(restored.islands); setDetailIslandCount(restored.islandsPerChain);
      }
      viewRef.current = next; setView(next); setSurfacePick(null); setPending(null); generationPreviewRef.current = null; setGenerationPreview(null); constraintsPreviewRef.current = null; setConstraintsPreview(null);
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
    stopLocalSelection();
    const ticket = generation.current;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { if (live.current && generation.current === ticket) { const feedback = atlasOperationFailureFeedback(error); setError(feedback.error); setStatus(feedback.status); } }
    finally { if (live.current && generation.current === ticket) { busyRef.current = false; setBusy(false); setProgress(null); cancelGenerationDisplay.current = null; } }
  }
  const refreshList = async (client = clientRef.current!, ticket = generation.current) => {
    try { const detailed = (await client.list(4)).map(row => ({ ...row, format: 4 as const })), coastal = (await client.list(3)).map(row => ({ ...row, format: 3 as const })), modern = (await client.list(2)).map(row => ({ ...row, format: 2 as const })), legacy = (await client.list(1)).map(row => ({ ...row, format: 1 as const })); const rows = [...detailed, ...coastal, ...modern, ...legacy]; if (live.current && generation.current === ticket) setDrafts(rows); }
    catch (failure) { if (live.current && generation.current === ticket) setError(`草稿目录暂时无法读取；已经提交的草稿保持原样。${explain(failure)}`); }
  };
  useEffect(() => {
    const ticket = ++generation.current, current = () => live.current && generation.current === ticket;
    live.current = true; busyRef.current = true;
    if (initialFormat === null) { setFatal('链接指定了未知草稿格式，未打开或修改任何存档。'); setBusy(false); busyRef.current = false; return () => { if (generation.current === ticket) live.current = false; }; }
    let client: AtlasClient;
    try { client = new AtlasClient({ format: initialFormat, onProgress: next => { if (current()) setProgress(next); }, onFatal: failure => { if (current()) { setFatal(explain(failure)); setReady(false); } } }); }
    catch (failure) { setFatal(`草稿线程未能启动，请刷新后恢复。${explain(failure)}`); setBusy(false); busyRef.current = false; return () => { if (generation.current === ticket) live.current = false; }; }
    clientRef.current = client;
    const renderer = new AtlasRenderer(hostRef.current!, {
      onPick: (id, surface) => {
        if (!current()) return;
        if (busyRef.current) { renderer.select(selectedRef.current); return; }
        const selection = localSelectionRef.current, actual = viewRef.current;
        const protection = protectionSelectionRef.current;
        if (protection.active && actual?.data.manifest.version === 4) {
          const result = protectionSelectionStep(protection.anchor, id, actual.data.manifest.spec);
          selectedRef.current = id; setSelected(id); setSurfacePick(surface ?? null); setLocate(String(id)); setPending(null); renderer.showPreview([]);
          if (result.kind === 'anchor') {
            protectionSelectionRef.current = { active: true, anchor: result.anchor };
            setStatus('已选保护范围第一角。再点对角位置；也可以再次点此处，只保护一个地块。');
          } else {
            setProtectionRegion(result.rectangle); stopLocalSelection(); setSection('generate');
            setStatus('保护范围已选好。选择保护内容和锁定操作，再预览实际变化。');
          }
          // Range picking must not move the camera between the two taps.
          return;
        }
        if (selection.active && actual?.data.manifest.version === 4) {
          const result = localReliefSelectionStep(selection.anchor, id, surface ?? null, actual.data.manifest.spec);
          if (result.kind === 'rejected') { renderer.select(selectedRef.current); setStatus(result.message); return; }
          selectedRef.current = id; setSelected(id); setSurfacePick(surface ?? null); setLocate(String(id)); setPending(null); renderer.showPreview([]);
          if (result.kind === 'anchor') {
            localSelectionRef.current = { active: true, anchor: result.anchor };
            setStatus('已选第一角。再点范围的对角位置；拖动浏览与双指缩放仍可使用。');
          } else {
            setRegion(result.rectangle); stopLocalSelection(); setSection('generate');
            setStatus('范围已选好。检查蓝色外框与过渡带，调整起伏后再预览。');
          }
          // Selection uses existing trusted tap picking. Do not focusCell here:
          // even focusCell(id, false) moves the camera between the two corners.
          return;
        }
        selectedRef.current = id; setSelected(id); setSurfacePick(surface ?? null); setLocate(String(id)); setPending(null); renderer.showPreview([]);
        const data = generationPreviewRef.current?.data ?? constraintsPreviewRef.current?.data ?? viewRef.current?.data; if (data) setVertexId(cellVertexIds(data.manifest.spec, id)[0]);
        renderer.focusCell(id, false); setSection(generationPreviewRef.current || constraintsPreviewRef.current ? 'generate' : 'edit');
      },
      onOutline: points => { if (current() && !busyRef.current) outlineCallback.current(points); },
      onOutlineCancel: () => { if (current() && !busyRef.current) setStatus('绘制已取消。再画一条不交叉的大陆轮廓；双指可以调整视野。'); },
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
      localSelectionRef.current = { active: false, anchor: null };
      protectionSelectionRef.current = { active: false, anchor: null };
      client.close(); renderer.destroy();
      if (clientRef.current === client) clientRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
    // Route identity is fixed for this mounted studio; local draft switches use the same renderer.
  }, []);

  const data = generationPreview?.data ?? constraintsPreview?.data ?? view?.data, spec = data?.manifest.spec, readOnly = view?.head.readOnly ?? false, graphicsLocked = graphicsState !== 'ready', locked = busy || !ready || !!fatal || readOnly || graphicsLocked || !!generationPreview || !!constraintsPreview;
  const fine = (data?.manifest.version ?? initialFormat) === 4, detailAlreadyDrawn = view?.data.manifest.version === 4 && (view.data.manifest.generation.lastApplied !== null || view.data.manifest.detailCoast.refs.length > 0);
  const regionValid = !!spec && validateCellRectangle(region, spec), supportsLocal = fine ? fineOperation === 'local-relief' : terrainOperation === 'landforms' || terrainOperation === 'coast';
  const localScope = spec ? localReliefScope(region, transitionCells, spec) : null;
  useEffect(() => {
    if (!ready || fatal || graphicsLocked) return;
    rendererRef.current?.setOutlineMode(drawing && !locked && !!view && view.data.manifest.version !== 1);
  }, [drawing, locked, ready, fatal, graphicsLocked, view]);
  useEffect(() => {
    if (ready && !fatal && !graphicsLocked) rendererRef.current?.setGridVisible(showGrid);
  }, [showGrid, ready, fatal, graphicsLocked]);
  useEffect(() => {
    if (!drawing && !localSelecting && !protectionSelecting) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (localSelectionRef.current.active || protectionSelectionRef.current.active) { stopLocalSelection(); setSection('generate'); setStatus('已取消范围选择，草稿保持原样。'); } else { setDrawing(false); setStatus('已退出手绘，草稿保持原样。'); } } };
    window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel);
  }, [drawing, localSelecting, protectionSelecting]);
  useEffect(() => { if ((localSelecting || protectionSelecting) && (busy || !ready || fatal || graphicsLocked || readOnly)) stopLocalSelection(); }, [localSelecting, protectionSelecting, busy, ready, fatal, graphicsLocked, readOnly]);
  const selectedFlags = data && isGenerationDocument(data) && selected !== null ? atlasCellLockFlags(data, selected) : 0;
  useEffect(() => {
    if (!ready || fatal || graphicsLocked) return;
    const savedScope = generationPreview?.preview.scope;
    const r = constraintsPreview?.preview.rectangle ?? (savedScope?.kind === 'cell-rectangle' ? { column: savedScope.column, row: savedScope.row, columns: savedScope.columns, rows: savedScope.rows } : fine && fineOperation === 'protect' ? protectionRegion : region);
    const inset = constraintsPreview ? 0 : generationPreview ? savedScope?.kind === 'cell-rectangle' ? savedScope.transitionCells : 0 : localGeneration && supportsLocal ? transitionCells : 0;
    const visible = section === 'generate' && (!!constraintsPreview || savedScope?.kind === 'cell-rectangle' || !generationPreview && (fine ? fineOperation === 'protect' || localGeneration && supportsLocal : showLockRegion || localGeneration && supportsLocal));
    const valid = !!spec && validateCellRectangle(r, spec) && Number.isInteger(inset) && inset >= 0 && inset * 2 < Math.min(r.columns, r.rows);
    rendererRef.current?.showRegion(visible && valid ? r : null, valid ? inset : 0);
  }, [ready, fatal, graphicsLocked, section, region, spec, generationPreview, constraintsPreview, localGeneration, supportsLocal, showLockRegion, transitionCells, fine, fineOperation, protectionRegion]);
  const selectedHeight = data && selected !== null ? (() => { const cell = getCellLayerSlot(data, 'elevation', selected); return cell.block.values[cell.slot]; })() : null;
  const selectedSurface = data?.manifest.version === 3 && selected !== null ? getCoastalCellSurface(data, selected) : null;
  const selectedQuad = data && selected !== null ? getCellQuad(data, selected) : null;
  const centerAnchor = selectedSurface && [...selectedSurface.land, ...selectedSurface.sea].flat().find(vertex => vertex.anchor.kind === 'center');
  const center = centerAnchor ? { x: centerAnchor.xQ6 / 1536, y: centerAnchor.yQ6 / 1536 } : selectedQuad ? { x: selectedQuad.reduce((sum, p) => sum + p.x, 0) / 4, y: selectedQuad.reduce((sum, p) => sum + p.y, 0) / 4 } : null;
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
    clearPreview(); selectedRef.current = id; setSelected(id); setSurfacePick(null); setVertexId(cellVertexIds(spec, id)[0]); rendererRef.current?.focusCell(id); setSection('edit');
  }
  async function create() {
    const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.create({ size, seed, name });
    if (!live.current || ticket !== generation.current) return;
    await accept(next, start, performance.now(), ticket); await refreshList(client, ticket);
    if (live.current && ticket === generation.current) setSection(null);
  }
  async function restore(id: string, source: 'current' | 'backup', format: AtlasFormat) {
    clearPreview(); const ticket = generation.current, client = clientRef.current!, start = performance.now(), next = await client.restore(id, source, format);
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
  async function copyForGeneration() {
    const start = performance.now(), next = await clientRef.current!.generationCopy((view?.head.name ?? '山河') + ' · 创世副本');
    await accept(next, start, performance.now()); await refreshList(); setSection('generate');
  }
  async function copyForCoast() {
    const start = performance.now(), next = await clientRef.current!.generationCopy((view?.head.name ?? '山河') + ' · 自然海岸', 3);
    await accept(next, start, performance.now()); await refreshList(); setShapeRoughness(96); setSection(null);
  }
  function beginOutline() {
    if (locked || !view || view.data.manifest.version === 1) return;
    stopLocalSelection(); setFineOperation('draw'); setLocalGeneration(false); clearPreview(); setOutline([]); setTerrainOperation('shape'); setSection(null); setDrawing(true);
    rendererRef.current?.showOutline([]); setStatus('按住鼠标或单指画大陆轮廓，松开后自动生成预览。轮廓会自动闭合；双指可缩放与平移。');
  }
  function beginLocalRelief() {
    if (locked || !fine || !spec || !canStartLocalRelief(selected, surfacePick)) return;
    stopLocalSelection(); clearPreview(); setDrawing(false); setFineOperation('local-relief'); setLocalGeneration(true); setShowLockRegion(false);
    setRegion(nearbyLocalReliefRectangle(selected!, spec)); setTransitionCells(LOCAL_RELIEF_DEFAULT_TRANSITION); setSection('generate');
    setStatus('已框出点击位置附近的范围。可重新选择两个对角位置；确认范围后再预览山地。');
  }
  function beginLocalRangeSelection() {
    if (locked || !fine || !view) return;
    stopLocalSelection();
    setDrawing(false); localSelectionRef.current = { active: true, anchor: null }; setLocalSelecting(true); setSection(null);
    setStatus('先点一处已有陆地作为第一角，再点对角位置选择矩形范围。选择不会修改草稿。');
  }
  function beginProtection() {
    if (locked || !fine || !spec || selected === null) return;
    stopLocalSelection(); clearPreview(); setDrawing(false);
    if (fineOperation !== 'protect') beforeProtection.current = fineOperation;
    setProtectionRegion(protectionRectangle(selected, selected, spec)); setFineOperation('protect'); setSection('generate');
    setStatus('先保护当前地块，或在地图上选两个对角位置扩大范围。预览之前不会修改草稿。');
  }
  function beginProtectionSelection() {
    if (locked || !fine || !view) return;
    stopLocalSelection(); setDrawing(false); protectionSelectionRef.current = { active: true, anchor: null }; setProtectionSelecting(true); setSection(null);
    setStatus('点两个对角位置选择保护范围，海域和陆地均可。拖动浏览、双指缩放仍可使用。');
  }
  outlineCallback.current = points => {
    if (busyRef.current || locked || !view || view.data.manifest.version === 1) return;
    setOutline(points); setDrawing(false); setTerrainOperation('shape'); setSection('generate');
    void run(() => previewTerrain(points));
  };
  async function previewTerrain(shapePoints = outline) {
    clearPreview();
    const recipe: GenerationRecipe = fine && fineOperation === 'local-relief'
      ? makeLocalReliefRecipe(localReliefSeed, localReliefMeters)
      : fine
      ? makeDetailCoastRecipe({ version: detailVersion, seed: terrainSeed, structure: coastStructure, roughness: shapeRoughness, shelf: shapeShelf, relief, islands: detailIslands, islandsPerChain: detailIslandCount }, shapePoints, detailAlreadyDrawn)
      : terrainOperation === 'shape'
      ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, seed: terrainSeed, parameters: { pointsQ: shapePoints.map(p => ({ ...p })), coastRoughnessWorld: shapeRoughness, coastWavelengthWorld: 192, reliefMeters: relief, shelfWidthWorld: shapeShelf } }
      : terrainOperation === 'ocean'
      ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'ocean-floor', version: 1, fingerprint: OCEAN_GENERATOR_FINGERPRINT }, seed: terrainSeed, parameters: { meanDepthMeters: oceanDepth, reliefMeters: oceanRelief, shelfWidthWorld: oceanShelf } }
      : terrainOperation === 'macro'
      ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'macro-landmass', version: 1, fingerprint: MACRO_GENERATOR_FINGERPRINT }, seed: terrainSeed, parameters: { majorContinents: continents, landCoveragePermille: coverage, coastWavelengthWorld: wavelength, reliefMeters: relief } }
      : terrainOperation === 'landforms' ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'landforms', version: 1, fingerprint: LANDFORM_GENERATOR_FINGERPRINT }, seed: terrainSeed, parameters: { mountainRanges, basins, reliefMeters: relief } }
      : terrainOperation === 'islands' ? { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'island-chains', version: 1, fingerprint: ISLAND_GENERATOR_FINGERPRINT }, seed: terrainSeed, parameters: { chainCount, islandsPerChain, radiusWorld: islandRadius, reliefMeters: relief } }
      : { format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'coast-smoothing', version: 1, fingerprint: COAST_GENERATOR_FINGERPRINT }, parameters: { strengthPermille: coastStrength, iterations: coastIterations } };
    if (fine && fineOperation === 'local-relief' && !localScope) throw new Error('山地选区越界或过窄，请调整范围与过渡带。不会改为整图生成。');
    const scope: GenerationScope = fine && fineOperation === 'local-relief' ? localScope! : localGeneration && supportsLocal ? { kind: 'cell-rectangle', ...region, transitionCells } : { kind: 'world' };
    const next = await clientRef.current!.previewGeneration(recipe, scope).catch(error => {
      if (fine && fineOperation === 'draw' && explain(error).includes('生成配方或范围版本不受支持')) throw new Error('轮廓或参数暂不符合生成要求。请让轮廓围成一片区域、不交叉，在地图边缘留出海水，并检查起伏与近海宽度范围。');
      throw error;
    });
    let cancelled = false; let cancellation: Promise<void> | null = null;
    cancelGenerationDisplay.current = () => {
      cancelled = true;
      cancellation ??= rendererRef.current!.clearGenerationPreview().then(() => clientRef.current!.discardGeneration()).then(() => { setStatus('已取消生成，原草稿保持不变。'); });
      return cancellation;
    };
    try { await rendererRef.current!.showGenerationPreview(next.data); }
    catch (error) { if (cancelled) await cancellation; else if (rendererRef.current?.metrics().gpu.state === 'ready') await clientRef.current!.discardGeneration(); throw error; }
    if (cancelled) { await cancellation; throw new DOMException('生成预览已取消。', 'AbortError'); }
    cancelGenerationDisplay.current = null;
    generationPreviewRef.current = next; setGenerationPreview(next); setSurfacePick(null); setStatus('正在查看生成预览，尚未保存。');
  }
  async function discardTerrain() {
    await clientRef.current!.discardGeneration(); await rendererRef.current!.clearGenerationPreview(); generationPreviewRef.current = null; setGenerationPreview(null); setSurfacePick(null); setStatus('已取消生成，恢复原草稿。');
  }
  async function confirmTerrain() {
    const localRelief = generationPreview?.preview.recipe.generator.id === 'local-detail-relief';
    const start = performance.now(), next = await clientRef.current!.confirmGeneration(); await accept(next, start, performance.now()); await refreshList(); setOutline([]); rendererRef.current?.showOutline([]); setDrawing(false); setStatus(localRelief ? '局部山地已保存，可以继续选择其他范围，或撤销刚才的生成。' : fine ? '这片大陆已保存。可以继续在海面画新大陆，或撤销刚才的生成。' : '生成地形已保存，可以继续手工编辑或撤销。');
  }
  async function previewLocks() {
    clearPreview();
    const request = fine ? makeProtectionRequest(protectionRegion, lockMask, lockAction, spec!) : { rectangle: region, mask: lockMask, action: lockAction };
    const next = await clientRef.current!.previewConstraints(request.rectangle, request.mask, request.action);
    constraintsPreviewRef.current = next; setConstraintsPreview(next); setShowLockRegion(true); setStatus('正在查看区域锁预览，确认后才会保存。');
  }
  async function discardLocks() { await clientRef.current!.discardConstraints(); constraintsPreviewRef.current = null; setConstraintsPreview(null); setStatus('已取消区域锁修改，原草稿保持不变。'); }
  async function confirmLocks() { const start = performance.now(), next = await clientRef.current!.confirmConstraints(); await accept(next, start, performance.now()); await refreshList(); setStatus('区域锁已保存，后续生成会保留锁定内容。'); }
  const terrainTitle = { shape: '画一片自己的大陆', ocean: '从浅海到深蓝', macro: '塑造大陆', landforms: '起伏山河', islands: '散落群岛', coast: '细化海岸' }[terrainOperation];
  const terrainButton = { shape: '重新预览手绘大陆', ocean: '预览海床生成', macro: '预览大陆生成', landforms: '预览山系与盆地', islands: '预览岛链生成', coast: '预览海岸细化' }[terrainOperation];
  const terrainHelp = {
    shape: '沿你画的轮廓形成海湾、半岛、浅海和连续高程。只添加新陆地，已有陆地与保护区保留。过小或交叉轮廓会提示重画。',
    ocean: '从近岸陆架逐渐进入深海，形成连续海盆与海底山脊。保留陆地、第一圈近岸、封闭内湖和保护区；只改变连通世界边界的外海水深。',
    macro: '重建整张地图的海陆与高程，需要地图内没有锁定区域。',
    landforms: '沿已有陆地生成相连山脊和内陆低地。保留海岸和锁定高程；山系和盆地合计 1—12 处。',
    islands: '在开阔海面添加弯曲岛链，保留现有陆地和锁定区域。空间不足时保持原图，并说明原因。',
    coast: '平滑真实海岸顶点，保留海陆、高程与锁定海岸。每轮检查几何；必要时自动减小位移，保护相邻地块。',
  }[terrainOperation];
  const generatedSummary = generationPreview?.preview.summary;
  const generatePanel = <div className="atlas-panel-content">
    {view && view.data.manifest.version !== 3 && <section className="atlas-preview"><h3>连续海岸创作</h3><p className="atlas-help">将这张地图另存为自然海岸副本，岸线可穿过地块内部，海陆面积随真实轮廓重新计算。原稿和备份保留。</p><button disabled={busy || !!fatal || graphicsLocked || !!generationPreview || !!constraintsPreview} onClick={() => setConfirmation({ title: '创建自然海岸副本？', detail: '使用新的海陆轮廓规则建立独立副本。已有陆地采样和高程保留，沿岸地块的陆海面积会变化；原草稿不会改写。', button: '创建自然海岸副本', action: copyForCoast })}>创建自然海岸副本</button></section>}
    {!view ? <p className="atlas-help">先在草稿面板创建一片空白海洋。</p> : view.data.manifest.version === 1 || readOnly ? <section><h3>在独立副本中创世</h3><p className="atlas-help">保留当前草稿和所选时点，建立可以生成地形的独立副本。</p><button className="atlas-primary" disabled={busy || !!fatal || graphicsLocked || !!generationPreview} onClick={() => setConfirmation({ title: '创建创世副本？', detail: '复制当前看到的固定时点，使用独立保存空间。原草稿与备份不改写。', button: '创建创世副本', action: copyForGeneration })}>创建创世副本</button></section> : <>
      {generationPreview && generatedSummary && <section className="atlas-preview" aria-label="大陆生成预览">
        <h3>尚未保存 · 生成预览</h3>{generationPreview.preview.scope.kind === 'cell-rectangle' && <p>局部生成：列 {generationPreview.preview.scope.column}、行 {generationPreview.preview.scope.row} 起，{generationPreview.preview.scope.columns} × {generationPreview.preview.scope.rows} 地块，过渡带 {generationPreview.preview.scope.transitionCells} 格。</p>}<p>{generatedSummary.majorComponentCount} {data?.manifest.version === 3 ? '片陆地采样连通区' : generationPreview.preview.recipe.generator.id === 'macro-landmass' ? '个大陆' : '片独立陆地'} · 实际陆地 {Math.round(1000 * generatedSummary.landAreaQ2 / generatedSummary.worldAreaQ2)}‰ · 改变 {generatedSummary.changedCellCount.toLocaleString()} 个地块。</p>
        {generatedSummary.shape && <p>根据 {generatedSummary.shape.controlPointCount} 个轮廓点生成；新增 {generatedSummary.shape.newLandCellCount.toLocaleString()} 个陆地地块，调整 {generatedSummary.shape.affectedSeaCellCount.toLocaleString()} 个近海地块。{data?.manifest.version === 3 ? '既有陆地高程保留；相邻海陆轮廓随新大陆衔接。' : '原有陆地保持原样。'}</p>}
        {generatedSummary.ocean && <p>调整 {generatedSummary.ocean.changedSeaCellCount.toLocaleString()} 个外海地块。距岸过渡带 {generatedSummary.ocean.shelfCellCount.toLocaleString()} 格，带外海域 {generatedSummary.ocean.deepSeaCellCount.toLocaleString()} 格；保留 {generatedSummary.ocean.protectedSeaCellCount.toLocaleString()} 个受保护海格。陆地、封闭内湖和第一圈近岸保持原样。</p>}
        {generatedSummary.landforms && <p>实际形成 {generatedSummary.landforms.mountainRanges} 条山系、{generatedSummary.landforms.basins} 处盆地；抬升 {generatedSummary.landforms.raisedCellCount.toLocaleString()} 个地块，降低 {generatedSummary.landforms.loweredCellCount.toLocaleString()} 个地块。海岸保持原样。</p>}
        {generatedSummary.islands && <p>实际形成 {generatedSummary.islands.chainCount} 条岛链、{generatedSummary.islands.newIslandCount} 座新岛。保留原有 {generatedSummary.islands.originalComponentCount} 片陆地，新增 {generatedSummary.islands.newLandCellCount.toLocaleString()} 个陆地地块。</p>}
        {generatedSummary.coast && <p>{generatedSummary.coast.changedVertexCount > 0 ? '细化 ' + generatedSummary.coast.changedVertexCount.toLocaleString() + ' 个海岸顶点，采用 ' + generatedSummary.coast.iterationsApplied + ' 轮有效调整。海陆与高程保持原样。' : '没有需要调整的可编辑海岸，地图保持原样。'}</p>}
        <p>高程 {generatedSummary.minElevationMeters} 至 {generatedSummary.maxElevationMeters} 米。可缩放、拖动或点选地图检查。</p>{selected !== null && <p>选中地块 #{selected}：{selectedHeight} 米</p>}
        <div className="atlas-actions"><button disabled={busy || graphicsLocked || !!fatal} onClick={() => void run(discardTerrain)}>取消生成</button><button className="atlas-primary" disabled={busy || graphicsLocked || !!fatal || generatedSummary.coast?.changedVertexCount === 0} onClick={() => void run(confirmTerrain)}>确认生成并保存</button></div>
      </section>}
      {!generationPreview && !constraintsPreview && <div className="atlas-create-intro"><span className="atlas-eyebrow">你的山海，从一笔开始</span><button className="atlas-draw-card" disabled={locked} onClick={beginOutline}><Icon name="brush" size={28} /><span><strong>手绘大陆</strong><small>画轮廓，自动长出海岸与山地</small></span><Icon name="chevron-left" className="icon-redo" /></button></div>}
      <h3>{terrainTitle}</h3><p className="atlas-help">先预览真实地图，再决定是否保存；你可以继续修改每一块地形。</p>
      <fieldset className="atlas-edit-fields" disabled={locked}>
        <label className="atlas-field">生成内容<select aria-label="生成内容" value={terrainOperation} onChange={event => {
          const value = event.target.value; setTerrainOperation(value === 'landforms' || value === 'islands' || value === 'coast' || value === 'shape' || value === 'ocean' ? value : 'macro');
        }}><option value="shape">手绘轮廓 · 保留已有陆地</option><option value="macro">大陆与海洋</option><option value="landforms">山系与盆地 · 保留海岸</option><option value="islands">海上岛链 · 保留陆地</option><option value="ocean">海床与深海 · 保留陆地</option><option value="coast">海岸细化 · 保留海陆</option></select></label>
        {terrainOperation !== 'coast' && <label className="atlas-field">地貌种子<input aria-label="地貌种子" value={terrainSeed} maxLength={120} onChange={event => setTerrainSeed(event.target.value)} /></label>}
        {terrainOperation === 'shape' && <><div className="atlas-two-fields"><label className="atlas-field">海岸曲折<input aria-label="手绘海岸曲折" type="range" min={0} max={128} step={8} value={shapeRoughness} onChange={event => setShapeRoughness(Number(event.target.value))} /><small>{shapeRoughness === 0 ? '忠于原始轮廓' : '自然海湾与岬角 · ' + shapeRoughness}</small></label><label className="atlas-field">近海宽度<input aria-label="手绘近海宽度" type="range" min={32} max={256} step={16} value={shapeShelf} onChange={event => setShapeShelf(Number(event.target.value))} /><small>{shapeShelf} 世界单位</small></label></div><p className="atlas-help">{outline.length ? '轮廓已记录，可调整地形后重新预览，或重新绘制。' : '选择上方「手绘大陆」，直接在地图上画出想要的形状。'}</p></>}
        {terrainOperation === 'macro' && <>
          <div className="atlas-two-fields"><label className="atlas-field">大陆数量<input aria-label="大陆数量" type="number" min={1} max={6} step={1} value={continents} onChange={event => setContinents(Number(event.target.value))} /></label><label className="atlas-field">陆地比例（‰）<input aria-label="陆地比例" type="number" min={150} max={650} step={10} value={coverage} onChange={event => setCoverage(Number(event.target.value))} /></label></div>
          <label className="atlas-field">海岸变化尺度<input aria-label="海岸变化尺度" type="number" min={128} max={1024} step={32} value={wavelength} onChange={event => setWavelength(Number(event.target.value))} /></label>
        </>}
        {terrainOperation === 'landforms' && <div className="atlas-two-fields"><label className="atlas-field">山系数量<input aria-label="山系数量" type="number" min={0} max={8} step={1} value={mountainRanges} onChange={event => setMountainRanges(Number(event.target.value))} /></label><label className="atlas-field">盆地数量<input aria-label="盆地数量" type="number" min={0} max={8} step={1} value={basins} onChange={event => setBasins(Number(event.target.value))} /></label></div>}
        {terrainOperation === 'islands' && <>
          <div className="atlas-two-fields"><label className="atlas-field">岛链数量<input aria-label="岛链数量" type="number" min={1} max={3} step={1} value={chainCount} onChange={event => setChainCount(Number(event.target.value))} /></label><label className="atlas-field">每链岛屿<input aria-label="每链岛屿" type="number" min={2} max={6} step={1} value={islandsPerChain} onChange={event => setIslandsPerChain(Number(event.target.value))} /></label></div>
          <label className="atlas-field">岛屿半径<input aria-label="岛屿半径" type="number" min={64} max={128} step={8} value={islandRadius} onChange={event => setIslandRadius(Number(event.target.value))} /></label>
        </>}
        {terrainOperation === 'ocean' && <><div className="atlas-two-fields"><label className="atlas-field">平均海深（米）<input aria-label="平均海深" type="number" min={1000} max={6000} step={100} value={oceanDepth} onChange={event => setOceanDepth(Number(event.target.value))} /></label><label className="atlas-field">海底起伏（米）<input aria-label="海底起伏" type="number" min={0} max={2000} step={100} value={oceanRelief} onChange={event => setOceanRelief(Number(event.target.value))} /></label></div><label className="atlas-field">陆架宽度<input aria-label="陆架宽度" type="number" min={64} max={1024} step={32} value={oceanShelf} onChange={event => setOceanShelf(Number(event.target.value))} /><small>世界单位 · 越宽，浅海向深海的过渡越缓</small></label></>}
        {terrainOperation === 'coast' ? <>
          <label className="atlas-field">目标平滑强度（‰）<input aria-label="目标平滑强度" type="number" min={100} max={1000} step={50} value={coastStrength} onChange={event => setCoastStrength(Number(event.target.value))} /></label>
          <label className="atlas-field">细化轮数<input aria-label="细化轮数" type="number" min={1} max={4} step={1} value={coastIterations} onChange={event => setCoastIterations(Number(event.target.value))} /></label>
        </> : terrainOperation !== 'ocean' && <label className="atlas-field">内陆起伏（米）<input aria-label="内陆起伏" type="number" min={200} max={terrainOperation === 'islands' ? 3000 : 6000} step={100} value={relief} onChange={event => setRelief(Number(event.target.value))} /></label>}
        <p className="atlas-help">{terrainHelp}先查看预览中的实际变化，再确认保存。</p>
        <button className="atlas-primary" disabled={locked || terrainOperation !== 'coast' && !terrainSeed.trim() || terrainOperation === 'shape' && outline.length < 3} onClick={() => void run(() => previewTerrain())}>{terrainButton}</button>
      </fieldset>
      <details className="atlas-advanced" data-testid="atlas-region-tools"><summary>局部生成与区域保护</summary><fieldset className="atlas-edit-fields" disabled={locked}>
        <legend>局部范围与区域锁</legend>
        {supportsLocal && <label className="atlas-field">地貌生成范围<select aria-label="地貌生成范围" value={localGeneration ? 'local' : 'world'} onChange={event => setLocalGeneration(event.target.value === 'local')}><option value="world">整张地图</option><option value="local">仅下面的矩形选区</option></select></label>}
        <label className="atlas-field"><span><input aria-label="显示区域锁选区" type="checkbox" checked={showLockRegion} onChange={event => setShowLockRegion(event.target.checked)} /> 显示区域锁选区</span></label>
        {(showLockRegion || supportsLocal && localGeneration) && <>
          <div className="atlas-two-fields">{(['column', 'row', 'columns', 'rows'] as const).map(key => <label className="atlas-field" key={key}>{({ column: '起始列', row: '起始行', columns: '选区宽度', rows: '选区高度' })[key]}<input aria-label={({ column: '选区起始列', row: '选区起始行', columns: '选区宽度', rows: '选区高度' })[key]} type="number" step={1} min={key === 'column' || key === 'row' ? 0 : 1} max={spec?.columns ?? 128} value={region[key]} onChange={event => setRegion(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
          <button disabled={locked || selected === null || !spec} onClick={() => { if (selected !== null && spec) setRegion(current => ({ ...current, column: Math.min(selected % spec.columns, spec.columns - current.columns), row: Math.min(Math.floor(selected / spec.columns), spec.rows - current.rows) })); }}>从选中地块设置选区</button>
          {supportsLocal && localGeneration && <label className="atlas-field">过渡带宽度（地块）<input aria-label="过渡带宽度" type="number" min={0} max={16} step={1} value={transitionCells} onChange={event => setTransitionCells(Number(event.target.value))} /></label>}
          <p className="atlas-help">行列从 0 开始。蓝线沿真实地块边界标出选区；浅色内框是完整生效范围，之间逐步过渡。选区外保持原样。{regionValid ? '当前选区共 ' + (region.columns * region.rows).toLocaleString() + ' 个地块。' : '选区越界或尺寸无效，请调整。'}</p>
        </>}
        <div className="atlas-two-fields"><label className="atlas-field">保护内容<select aria-label="区域锁保护内容" value={lockMask} onChange={event => setLockMask(Number(event.target.value) as 1 | 2 | 3)}><option value={3}>海岸与高程</option><option value={1}>海岸</option><option value={2}>高程</option></select></label><label className="atlas-field">锁定操作<select aria-label="区域锁操作" value={lockAction} onChange={event => setLockAction(event.target.value === 'clear' ? 'clear' : 'set')}><option value="set">锁定选区</option><option value="clear">解除所选保护</option></select></label></div>
        <p className="atlas-help">海岸锁保护海陆类型及相邻海岸顶点，高程锁保留高度。锁也约束手工地理编辑；解除一种保护会保留另一种。</p>
        <button disabled={locked || !regionValid || !showLockRegion} onClick={() => void run(previewLocks)}>预览区域锁修改</button>
      </fieldset></details>
      {constraintsPreview && <section className="atlas-preview" aria-label="区域锁修改预览"><h3>尚未保存 · 区域锁预览</h3><p>{constraintsPreview.preview.action === 'set' ? '锁定' : '解除保护'}：{constraintsPreview.preview.mask === 3 ? '海岸与高程' : constraintsPreview.preview.mask === 1 ? '海岸' : '高程'}。实际改变 {constraintsPreview.preview.changedCellCount.toLocaleString()} 个地块的保护状态，地形保持原样。</p><p>列 {constraintsPreview.preview.rectangle.column} 起、行 {constraintsPreview.preview.rectangle.row} 起，{constraintsPreview.preview.rectangle.columns} × {constraintsPreview.preview.rectangle.rows} 地块。蓝线标出本次操作范围。</p>{selected !== null && <p>选中地块 #{selected}：{selectedFlags & 1 ? '海岸已锁定' : '海岸可编辑'} · {selectedFlags & 2 ? '高程已锁定' : '高程可编辑'}</p>}<div className="atlas-actions"><button disabled={busy || graphicsLocked || !!fatal} onClick={() => void run(discardLocks)}>取消区域锁修改</button><button className="atlas-primary" disabled={busy || graphicsLocked || !!fatal} onClick={() => void run(confirmLocks)}>确认区域锁并保存</button></div></section>}

    </>}
  </div>;
  const graphicsMessage = graphicsState === 'lost' ? '图形连接暂时中断，草稿仍保留；恢复画面后可继续编辑。' : graphicsState === 'restoring' ? '正在恢复地图画面，草稿与当前视角保持不变。' : '';
  const feedback = <div className="inspector-feedback" tabIndex={0} aria-label="草稿操作反馈"><div className="inspector-notice" role={error || fatal ? 'alert' : 'status'}><span>{fatal || graphicsMessage || error || (progress ? `${atlasGenerationProgressLabel(progress.stage)} · 本步 ${progress.completed}/${progress.total}` : status)}</span>{(localSelecting || protectionSelecting) && !busy && <button onClick={() => { stopLocalSelection(); setSection('generate'); setStatus('已取消范围选择，草稿保持原样。'); }}>取消选择范围</button>}{busy && !fatal && <button onClick={() => { try { if (cancelGenerationDisplay.current) { void cancelGenerationDisplay.current().catch(failure => setError(explain(failure))); } else if (!rendererRef.current?.cancelPendingAcceptance()) clientRef.current?.cancel(); } catch (failure) { setError(explain(failure)); } }}>取消操作</button>}</div>{(fatal || graphicsLocked) && <button onClick={() => window.location.reload()}>刷新并恢复已保存草稿</button>}</div>;

  const savedLocalScope = generationPreview?.preview.scope.kind === 'cell-rectangle' ? generationPreview.preview.scope : null;
  const finePanel = (fineOperation === 'protect' || constraintsPreview) && spec
    ? <RegionProtectionPanel locked={locked} busy={busy || graphicsLocked || !!fatal} readOnly={readOnly} rectangle={protectionRegion} valid={validateCellRectangle(protectionRegion, spec)} maxColumns={spec.columns} maxRows={spec.rows} mask={lockMask} action={lockAction} preview={constraintsPreview?.preview ?? null} onRectangle={setProtectionRegion} onMask={setLockMask} onAction={setLockAction} onChooseRange={beginProtectionSelection} onPreview={() => void run(previewLocks)} onConfirm={() => void run(confirmLocks)} onCancel={() => void run(discardLocks)} onReturn={() => { stopLocalSelection(); setFineOperation(beforeProtection.current); setStatus('已返回地貌创作，山地范围和参数保持原样。'); }}/>
    : fineOperation === 'local-relief' && spec
    ? <LocalReliefPanel locked={locked} busy={busy || graphicsLocked || !!fatal} readOnly={readOnly} seed={localReliefSeed} reliefMeters={localReliefMeters} rectangle={savedLocalScope ?? region} transitionCells={savedLocalScope?.transitionCells ?? transitionCells} maxColumns={spec.columns} maxRows={spec.rows} validScope={!!localScope} preview={generatedSummary?.detailLocalRelief ?? null} onSeed={setLocalReliefSeed} onRelief={setLocalReliefMeters} onRectangle={setRegion} onTransition={setTransitionCells} onChooseRange={beginLocalRangeSelection} onPreview={() => void run(() => previewTerrain())} onConfirm={() => void run(confirmTerrain)} onCancel={() => void run(discardTerrain)} onDrawMode={() => { stopLocalSelection(); setFineOperation('draw'); setLocalGeneration(false); setStatus('已返回画大陆，草稿保持原样。'); }}/>
    : <DetailCoastPanel hasWorld={!!view} alreadyDrawn={detailAlreadyDrawn} readOnly={readOnly} locked={locked} busy={busy || graphicsLocked || !!fatal} outlinePoints={outline.length} seed={terrainSeed} version={detailVersion} structure={coastStructure} roughness={shapeRoughness} shelf={shapeShelf} relief={relief} islands={detailIslands} islandsPerChain={detailIslandCount} onSeed={setTerrainSeed} onVersion={value => { setDetailVersion(value); if (value === 2 && detailVersion === 1) setCoastStructure(96); }} onStructure={setCoastStructure} onIslandsPerChain={setDetailIslandCount} onRoughness={setShapeRoughness} onShelf={setShapeShelf} onRelief={setRelief} onIslands={setDetailIslands} onDraw={beginOutline} onPreview={() => void run(() => previewTerrain())} onConfirm={() => void run(confirmTerrain)} onCancel={() => void run(discardTerrain)} preview={generatedSummary ? { ...generatedSummary, addedLandAreaQ2: generatedSummary.detailNaturalAdd?.addedLandAreaTwiceQ2 ?? generatedSummary.detailAdd?.addedLandAreaTwiceQ2 } : null} />;
  const editPanel = <div className="atlas-panel-content">
    <form className="atlas-locate" onSubmit={event => { event.preventDefault(); selectById(); }}><label>定位地块<input aria-label="定位地块编号" type="number" min={0} max={spec ? spec.columns * spec.rows - 1 : 0} value={locate} onChange={event => setLocate(event.target.value)} /></label><button disabled={!data || busy || graphicsLocked}>定位</button></form>
    {selected !== null && data && <>
      <dl className="atlas-cell-details"><div><dt>地块</dt><dd>#{selected}</dd></div><div><dt>坐标</dt><dd>{center?.x.toFixed(2)}，{center?.y.toFixed(2)}</dd></div><div><dt>{selectedSurface || fine ? '采样中心高程' : '高程'}</dt><dd data-testid="atlas-selected-height">{selectedHeight} 米</dd></div><div><dt>保护</dt><dd>{selectedFlags & 1 ? '海岸锁定' : '海岸可编辑'} · {selectedFlags & 2 ? '高程锁定' : '高程可编辑'}</dd></div><div><dt>地表</dt><dd>{selectedSurface ? `陆地 ${(100 * selectedSurface.landAreaQ2 / selectedSurface.totalAreaQ2).toFixed(1)}% · 海域 ${(100 * selectedSurface.seaAreaQ2 / selectedSurface.totalAreaQ2).toFixed(1)}%` : fine ? '以点击位置为准' : selectedHeight! < 0 ? '海洋' : '陆地'}</dd></div>{surfacePick && surfacePick.cellId === selected && <div><dt>点击位置</dt><dd data-testid="atlas-picked-surface" data-land={surfacePick.land ? 'land' : 'sea'}>{surfacePick.land ? '陆地' : '海域'} · {Math.round(surfacePick.height)} 米</dd></div>}<div><dt>模拟区</dt><dd>{getSimRegion(data, selected) ?? '未分配'}</dd></div><div><dt>行政叶</dt><dd>{getAdminLeaf(data, selected) ?? '未分配'}</dd></div></dl>
      {fine ? <><p className="atlas-help">点击位置显示真实海陆与高程。点一处已有陆地，可以选择附近范围，单独重新生成山地。</p>{readOnly ? <p className="atlas-help">这份备份仅供查看，打开当前草稿后才能修改。</p> : <><button className="atlas-primary" disabled={locked || !canStartLocalRelief(selected, surfacePick)} onClick={beginLocalRelief}>仅重生成山地</button><button disabled={locked} onClick={beginProtection}>保护区域</button>{!canStartLocalRelief(selected, surfacePick) && <p className="atlas-help">请在地图上点一处真实陆地；仅按地块编号选择不能确定点击处的海陆。</p>}</>}</> : readOnly ? <p className="atlas-help">这份备份只供查看。请在草稿面板创建独立副本后继续编辑。</p> : <fieldset className="atlas-edit-fields" disabled={locked}>
        <div className="atlas-segmented" aria-label="地理编辑方式"><button aria-pressed={mode === 'elevation'} onClick={() => { clearPreview(); setMode('elevation'); }}>高程</button><button aria-pressed={mode === 'vertex'} onClick={() => { clearPreview(); setMode('vertex'); }}>共享顶点</button></div>
        {mode === 'elevation' ? <><label className="atlas-field">调整为高程（米）<input aria-label="目标高程（米）" type="number" min={-12000} max={12000} step={10} value={height} onChange={event => { clearPreview(); setHeight(Number(event.target.value)); }} /></label><label className="atlas-field">局部范围<select aria-label="高程编辑范围" value={range} onChange={event => { clearPreview(); setRange(Number(event.target.value)); }}><option value={1}>1 个地块</option><option value={8}>8 × 8 地块</option><option value={32}>32 × 32 地块</option></select></label><p className="atlas-help">以选中地块为中心，实际影响 {cells.length} / {range * range} 个地块{cells.length < range * range ? '，已在世界边缘裁切' : ''}。高程低于 0 米显示为海洋。</p></> : <><label className="atlas-field">共享顶点<select aria-label="共享顶点" value={vertexId ?? ''} onChange={event => { clearPreview(); setVertexId(Number(event.target.value)); }}>{vertices.map(id => <option key={id} value={id}>顶点 #{id}</option>)}</select></label><div className="atlas-two-fields"><label className="atlas-field">东西位移<input aria-label="顶点东西位移" type="number" step={.25} value={moveX} onChange={event => { clearPreview(); setMoveX(Number(event.target.value)); }} /></label><label className="atlas-field">南北位移<input aria-label="顶点南北位移" type="number" step={.25} value={moveY} onChange={event => { clearPreview(); setMoveY(Number(event.target.value)); }} /></label></div><p className="atlas-help">单位为世界坐标。共享顶点的小幅移动会同时改变所有相邻地块；越界或退化的几何会被拒绝。</p></>}
        {!pending && <button className="atlas-primary" disabled={locked} onClick={() => void run(prepare)}>预览地理编辑</button>}
        {pending && <section className="atlas-preview" aria-label="地理编辑预览" data-atlas-preview-owner-blocks={pending.preview.ownerCoordinates.length} data-atlas-preview-display-blocks={pending.preview.displayBlocks.length} data-atlas-preview-cells={pending.preview.affectedCellCount}><h3>确认这次变化</h3><p>{pending.input}</p><p>实际改变 {pending.preview.affectedCellCount} 个地块{mode === 'vertex' ? '，相邻地块将共同使用新的边界位置' : ''}。确认之前，草稿保持原样。</p><div className="atlas-actions"><button disabled={busy} onClick={() => { clearPreview(); setStatus('已取消预览，草稿未修改。'); }}>取消编辑</button><button className="atlas-primary" disabled={locked} onClick={() => void run(confirmEdit)}>确认地理编辑</button></div><details className="world-metadata"><summary>本次校验信息</summary><p>基于修订 {pending.preview.baseRevision}；{pending.preview.ownerCoordinates.length} 个权威块位置、{pending.preview.writeKeys.length} 个分层块、{pending.preview.displayBlocks.length} 个显示块。</p><p>请求 {pending.preview.requestBytes} bytes；回执 {pending.preview.responseBytes} bytes。</p></details></section>}
      </fieldset>}
    </>}
    {selected === null && <p className="atlas-help">轻点地图选择地块，或输入编号定位。拖动只移动视野，不会改地形。</p>}
  </div>;
  const worldPanel = <div className="atlas-panel-content">
    {view && <section className="atlas-current"><h3>{view.head.name}</h3><p>{view.head.readOnly ? '只读备份' : '已保存草稿'} · 修订 {view.head.revision} · {view.data.manifest.spec.columns ** 2} 地块</p>{view.head.readOnly && !fine && <button className="atlas-primary" disabled={busy || !!fatal || graphicsLocked} onClick={() => setConfirmation({ title: '从备份创建独立副本？', detail: '新草稿使用独立存储身份。原主档与备份均保持不变。', button: '确认创建独立副本', action: fork })}>创建独立副本</button>}</section>}
    <section><h3>新建空白大世界</h3><label className="atlas-field">草稿名称<input aria-label="大世界草稿名称" maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><label className="atlas-field">生成种子<input aria-label="大世界生成种子" maxLength={120} value={seed} onChange={event => setSeed(event.target.value)} /></label><label className="atlas-field">地理规模<select aria-label="大世界地理规模" value={size} onChange={event => setSize(Number(event.target.value) as AtlasSize)}><option value={128}>基本 · 16,384 地块</option><option value={256}>标准 · 65,536 地块</option><option value={512}>扩展实验 · 262,144 地块</option></select></label><p className="atlas-help">{fine ? '画出大陆轮廓，生成细海岸、山地与近海群岛。地理规模决定基础地形采样；海岸细节使用独立精度。当前为地理创作版本，国家与战争仍在开发。' : '画一条轮廓塑造大陆，也可以用种子自动生成海陆，再逐块调整。65,536 地块适合开始创作；经营与军事推演目前从原世界工坊进入。'}</p><button className="atlas-primary" disabled={busy || !ready || !!fatal || graphicsLocked || !!generationPreview || !!constraintsPreview || !name.trim() || !seed.trim()} onClick={() => view ? setConfirmation({ title: '创建另一份空白草稿？', detail: '当前草稿已经自动保存，新建不会覆盖它。', button: '确认新建草稿', action: create }) : void run(create)}>新建空白海洋草稿</button></section>
    <section><div className="atlas-section-heading"><h3>已保存的草稿</h3><button disabled={busy || !!fatal || graphicsLocked} onClick={() => void run(refreshList)}>刷新列表</button></div>{drafts.length ? <ul className="atlas-draft-list">{drafts.map(row => <li key={`${row.format}:${row.draftId}`}><strong>{row.name}</strong><span>修订 {row.revision} · {row.size ** 2} 地块</span><div className="atlas-actions"><button disabled={busy || !!fatal || graphicsLocked} onClick={() => void run(() => restore(row.draftId, 'current', row.format))}>打开 {row.name}</button>{row.backupAvailable && <button disabled={busy || !!fatal || graphicsLocked} onClick={() => setConfirmation({ title: '只读查看上一次备份？', detail: '不会回滚或改写主档。需要继续修改时，请创建独立副本。', button: '读取只读备份', action: () => restore(row.draftId, 'backup', row.format) })}>查看备份 {row.name}</button>}</div></li>)}</ul> : <p className="atlas-help">这个浏览器还没有大世界草稿。</p>}</section>
    <AppearanceSettings />
    <details className="world-metadata"><summary>草稿身份与版本</summary><p>生产草稿格式 v{view?.data.manifest.version ?? initialFormat} · 地理编辑阶段，不是社会推演存档。</p>{view && <><p>草稿 {view.head.draftId}</p><p>地理 {view.head.atlasId}</p><p>内容摘要 {view.head.manifestDigest}</p></>}<p>构建 {__BUILD_SHA__}</p></details>
    <button className="atlas-return" disabled={busy} onClick={onBack}>返回原世界工坊</button>
  </div>;
  return <main className="atlas-studio workbench" data-chrome="map-first-staging" data-mode="atlas" data-atlas-progress-stage={progress?.stage ?? ''} data-atlas-progress-completed={progress?.completed ?? ''} data-atlas-progress-total={progress?.total ?? ''} data-atlas-tool={drawing ? 'outline' : localSelecting || protectionSelecting ? 'region' : 'browse'} data-testid="atlas-studio" data-atlas-id={view?.head.draftId ?? ''} data-atlas-revision={view?.head.revision ?? ''} data-atlas-hash={view?.head.manifestDigest ?? ''} data-atlas-format={view?.data.manifest.version ?? initialFormat ?? 'unknown'} data-atlas-display={constraintsPreview ? 'constraints-preview' : generationPreview ? 'generation-preview' : 'committed'} data-atlas-gpu={graphicsState} data-atlas-state={fatal ? 'fatal' : graphicsLocked ? graphicsState : busy ? 'busy' : readOnly ? 'readonly' : view ? 'ready' : 'empty'} data-selectedcell={selected ?? ''} data-atlas-selectedcell={selected ?? ''} data-atlas-commit-ms={frameMetrics.commitMs} data-atlas-durable-ms={frameMetrics.durableMs} data-atlas-request-bytes={view?.metrics.requestBytes ?? 0} data-atlas-response-bytes={view?.metrics.responseBytes ?? 0} data-atlas-repainted-blocks={frameMetrics.repaintBlocks}>
    <header className="workbench-header"><div className="workbench-identity"><h1>{view?.head.name ?? '大世界草稿'}</h1><small className="mode-label">{constraintsPreview ? '区域锁预览 · 尚未保存' : generationPreview ? '生成预览 · 尚未保存' : readOnly ? '只读备份' : '地理创作'}</small></div><button disabled={locked || !view?.head.undoCount} aria-label="撤销大世界编辑" onClick={() => void run(undo)}><Icon name="chevron-left" /><span>撤销</span></button><button disabled={busy} aria-label="返回原世界工坊" onClick={onBack}><Icon name="chevron-left" /><span>工坊</span></button></header>
    <div className="workbench-stage"><div className="workbench-map atlas-map" ref={hostRef} />
      <div className="atlas-tool-shelf atlas-toolbar" role="group" aria-label="地图视图与创作工具">
      <div className="context-toolbar atlas-toolbar atlas-zoom-controls"><button disabled={!view || !!fatal || graphicsLocked || busy} aria-label="放大大世界地图" onClick={() => rendererRef.current?.zoom(1.5)}>＋</button><button disabled={!view || !!fatal || graphicsLocked || busy} aria-label="缩小大世界地图" onClick={() => rendererRef.current?.zoom(1 / 1.5)}>−</button><button disabled={!view || !!fatal || graphicsLocked || busy} onClick={() => rendererRef.current?.fit()}>全图</button><span data-testid="atlas-zoom">{Math.round(cameraScale * 100)}%</span><small>拖动浏览 · 双指缩放 · 点选查看</small></div>
      {view && <div className="atlas-brush-toolbar atlas-toolbar" role="toolbar" aria-label="地图创作工具"><button aria-label="浏览地图" aria-pressed={!drawing} disabled={busy || !!fatal || graphicsLocked} onClick={() => { stopLocalSelection(); setDrawing(false); setStatus('拖动浏览，轻点查看地块。'); }}><Icon name="map" /><span>浏览</span></button><button aria-label="画大陆" aria-pressed={drawing} disabled={locked || view.data.manifest.version === 1} onClick={drawing ? () => { setDrawing(false); setStatus('已退出手绘，草稿保持原样。'); } : beginOutline}><Icon name="brush" /><span>{drawing ? '退出绘制' : '画大陆'}</span></button><button aria-label="显示地块网格" title="在近景显示可编辑地块边界" aria-pressed={showGrid} disabled={busy || !!fatal || graphicsLocked} onClick={() => { setShowGrid(value => !value); setStatus(showGrid ? '已隐藏网格，选中地块仍有轮廓。' : '近景网格已开启，放大后显示地块边界。'); }}><Icon name="grid" /><span>网格</span></button></div>}
      </div>
      {drawing && <div className="atlas-drawing-hint" role="status">画出大陆轮廓 · 松开自动生成</div>}
      {!view && !busy && !fatal && <div className="atlas-empty"><Icon name="map" size={44} /><p>从一片海洋开始</p><button onClick={() => setSection('world')}>创建或打开草稿</button></div>}
      {section && <ContextInspector panel={`atlas-${section}`} title={section === 'edit' ? selected === null ? '地理编辑' : `地块 #${selected}` : section === 'generate' ? fine && fineOperation === 'protect' ? '保护区域' : '大陆与地貌' : '大世界草稿'} subtitle={section === 'edit' ? '查看 → 预览 → 确认后自动保存' : '独立保存，不覆盖原世界'} extent={extent} onExtent={setExtent} onClose={() => setSection(null)} closeLabel="关闭大世界面板" actions={feedback}>{section === 'edit' ? editPanel : section === 'generate' ? fine ? finePanel : generatePanel : worldPanel}</ContextInspector>}
      {!section && <div className="workbench-status atlas-status" data-feedback={error || fatal ? 'alert' : graphicsLocked ? 'recovery' : busy || progress ? 'busy' : localSelecting || protectionSelecting ? 'selection' : 'status'}>{feedback}</div>}
    </div>
    <nav className="workbench-nav" aria-label="大世界草稿工具">{([{ id: null, label: '地图', icon: 'map' }, { id: 'generate', label: '创世', icon: 'world' }, { id: 'edit', label: '编辑', icon: 'brush' }, { id: 'world', label: '草稿', icon: 'world' }] as const).map(item => <button key={item.label} className="workbench-nav-item" aria-pressed={section === item.id} onClick={() => { stopLocalSelection(); setDrawing(false); setSection(item.id); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    {confirmation && <ModalDialog titleId={titleId} locked={busy} onDismiss={() => setConfirmation(null)}><h2 id={titleId}>{confirmation.title}</h2><p>{confirmation.detail}</p><div className="confirm-actions"><button autoFocus disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button disabled={busy} className="atlas-primary" onClick={() => { const action = confirmation.action; setConfirmation(null); void run(action); }}>{confirmation.button}</button></div></ModalDialog>}
  </main>;
}
