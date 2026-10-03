import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { AtlasRenderer } from '../world/renderer';
import type { AtlasDocument } from '../world/atlas-format';
import { CountryClient, type CountryState, type CountryPreview, type CountryListEntry, type CountryCommand } from '../world/politics/bridge';
import { countryLandAt, type CountrySource } from '../world/politics/geography';
import { readCountryGeography } from '../world/politics/storage';
import { CountryRenderer } from '../world/politics/renderer';
import { countryGeometry } from '../world/politics/model';
import './country-studio.css';

export type CountryStudioProps = { initialWorldId?: string; source?: CountrySource; onBack: () => void; onWorldOpened: (worldId: string) => void };
type Panel = 'nation' | 'city' | 'world' | null;
type Tool = 'browse' | 'territory' | 'city' | 'outline-draw' | 'outline-points' | 'outline-move';
type PointQ = { xQ: number; yQ: number };
type Ticket = { lifecycle: number; operation: number };
type Progress = { stage: string; completed: number; total: number };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const selectionKey = (id: string) => `lieguoji-country-selection:${id}`;
const colors = ['#4878bd', '#b95959', '#41866a', '#996baf', '#ad7937', '#437f91'];

export function CountryStudio({ initialWorldId, source, onBack, onWorldOpened }: CountryStudioProps) {
  const entry = useRef({ initialWorldId, source }), callbacks = useRef({ onBack, onWorldOpened }); callbacks.current = { onBack, onWorldOpened };
  const host = useRef<HTMLDivElement>(null), client = useRef<CountryClient | null>(null), renderer = useRef<AtlasRenderer | null>(null), overlay = useRef<CountryRenderer | null>(null);
  const geography = useRef<AtlasDocument | null>(null), stateRef = useRef<CountryState | null>(null), pendingRef = useRef<CountryPreview | null>(null);
  const live = useRef(false), epoch = useRef(0), busyRef = useRef(true), toolRef = useRef<Tool>('browse'), anchor = useRef<number | null>(null), consumed = useRef(false);
  const operation = useRef(0), cancellingRef = useRef(false), activeKind = useRef<'preview' | 'other'>('other');
  const outlineRef = useRef<PointQ[]>([]), outlineCallback = useRef<(points: PointQ[]) => void>(() => {}), outlineCancel = useRef<() => void>(() => {});
  const pickPoint = useRef<(point: { x: number; y: number }) => void>(() => {}), pickCell = useRef<(id: number, land?: boolean) => void>(() => {});
  const selectedRef = useRef({ nationId: null as string | null, cityId: null as string | null });
  const previewPanel = useRef<Panel>(null);
  const [state, setState] = useState<CountryState | null>(null), [preview, setPreview] = useState<CountryPreview | null>(null), [previewVisible, setPreviewVisible] = useState(false);
  const [busy, setBusy] = useState(true), [fatal, setFatal] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('正在打开建国世界…');
  const [panel, setPanel] = useState<Panel>('world'), [expanded, setExpanded] = useState(false), [tool, setTool] = useState<Tool>('browse');
  const [worldName, setWorldName] = useState('我的列国'), [worlds, setWorlds] = useState<CountryListEntry[]>([]);
  const [copyName, setCopyName] = useState(''), [progress, setProgress] = useState<Progress | null>(null), [cancelling, setCancelling] = useState(false), [canCancel, setCanCancel] = useState(false);
  const [outlineQ, setOutlineQ] = useState<PointQ[]>([]), [outlineEditing, setOutlineEditing] = useState(false), [outlineControls, setOutlineControls] = useState(false);
  const [nationId, setNationId] = useState<string | null>(null), [cityId, setCityId] = useState<string | null>(null);
  const [nationName, setNationName] = useState(''), [nationColor, setNationColor] = useState(colors[0]), [cityName, setCityName] = useState('');
  const [newNation, setNewNation] = useState(false), [newCity, setNewCity] = useState(false), [claimMode, setClaimMode] = useState(false);
  const [releaseMode, setReleaseMode] = useState(false);
  const [cells, setCells] = useState<number[]>([]), [cityPosition, setCityPosition] = useState<PointQ | null>(null), [scale, setScale] = useState(1);
  const actual = preview?.document ?? state?.document, nation = actual?.nations.find(item => item.id === nationId), city = actual?.cities.find(item => item.id === cityId);
  const locked = busy || !!fatal || !!state?.readOnly || !!preview;
  const current = (ticket: Ticket) => live.current && epoch.current === ticket.lifecycle && operation.current === ticket.operation;
  const isPreviewOperation = () => activeKind.current === 'preview';

  function choose(nextNation: string | null, nextCity: string | null) {
    if (selectedRef.current.nationId !== nextNation) {
      clearOutline(); setCells([]); setClaimMode(false); setReleaseMode(false);
      const target = (pendingRef.current?.document ?? stateRef.current?.document)?.nations.find(item => item.id === nextNation);
      if (target) { setNewNation(false); setNationName(target.name); setNationColor(target.color); }
    }
    selectedRef.current = { nationId: nextNation, cityId: nextCity }; setNationId(nextNation); setCityId(nextCity);
    overlay.current?.setSelection(nextNation, nextCity);
    const id = stateRef.current?.document.worldId;
    if (id) try { localStorage.setItem(selectionKey(id), JSON.stringify({ nationId: nextNation, cityId: nextCity })); } catch { /* Entity persistence remains in the independent database. */ }
  }
  function stopTool() {
    toolRef.current = 'browse'; setTool('browse'); setOutlineEditing(false); anchor.current = null; renderer.current?.setOutlineMode(false); renderer.current?.showOutline([]); renderer.current?.showRegion(null);
  }
  function rememberOutline(points: readonly PointQ[]) {
    const owned = points.map(point => ({ ...point })); outlineRef.current = owned; setOutlineQ(owned); renderer.current?.showOutline(owned);
  }
  function clearOutline() { rememberOutline([]); setOutlineEditing(false); }
  function setOutlineTool(next: 'outline-draw' | 'outline-points' | 'outline-move') {
    if (locked) return;
    toolRef.current = next; setTool(next); renderer.current?.setOutlineMode(next === 'outline-draw', '手绘国土轮廓，单指或鼠标绘制，双指缩放平移');
    if (next !== 'outline-draw') renderer.current?.showOutline(outlineRef.current);
    setPanel(null); setOutlineControls(false);
  }
  function beginOutline(claim: boolean, release = false) {
    if (locked || !stateRef.current || stateRef.current.document.version < 2) return;
    stopTool(); clearOutline(); setCells([]); setClaimMode(claim); setReleaseMode(release); setError(''); setOutlineEditing(true); setOutlineControls(false); setOutlineTool('outline-draw');
    setStatus(release ? '圈出要移除的本国领土；先预览，再确认。含城市的领土会受到保护。' : '单指或鼠标圈出国土，双指调整视野。');
  }
  function cancelOutlineSelection() {
    stopTool(); clearOutline(); setClaimMode(false); setReleaseMode(false); setPanel('nation'); setStatus('已取消圈地，世界保持原样。');
  }
  function undoOutlinePoint() {
    setOutlineTool('outline-points'); rememberOutline(outlineRef.current.slice(0, -1)); setStatus('已撤销最后一个顶点，可继续点选。');
  }
  outlineCallback.current = points => {
    if (busyRef.current || toolRef.current !== 'outline-draw') return;
    toolRef.current = 'outline-points'; setTool('outline-points'); renderer.current?.setOutlineMode(false); rememberOutline(points);
    setStatus('轮廓已记录，可撤销顶点或闭合预览。');
  };
  outlineCancel.current = () => {
    if (busyRef.current || !toolRef.current.startsWith('outline-')) return;
    renderer.current?.showOutline(outlineRef.current); setStatus('当前笔划已取消，已有轮廓仍保留。');
  };
  function focus(point: PointQ) {
    const spec = geography.current?.manifest.spec; if (!spec) return;
    const col = Math.min(spec.columns - 1, Math.max(0, Math.floor(point.xQ / 256 / (spec.width / spec.columns))));
    const row = Math.min(spec.rows - 1, Math.max(0, Math.floor(point.yQ / 256 / (spec.height / spec.rows))));
    renderer.current?.focusCell(row * spec.columns + col, false);
  }
  function showNation(id: string, move = false) {
    const item = (pendingRef.current?.document ?? stateRef.current?.document)?.nations.find(item => item.id === id); if (!item) return;
    stopTool(); choose(id, null); setNewNation(false); setNewCity(false); setClaimMode(false); setReleaseMode(false); setNationName(item.name); setNationColor(item.color); setPanel('nation');
    setError(''); setStatus(`已选择「${item.name}」。`);
    if (move) focus(overlay.current?.getNationAnchorQ(item.id) ?? item.labelAnchorQ);
  }
  function showCity(id: string, move = false) {
    const item = (pendingRef.current?.document ?? stateRef.current?.document)?.cities.find(item => item.id === id); if (!item) return;
    stopTool(); choose(item.nationId, id); setNewNation(false); setNewCity(false); setCityName(item.name); setPanel('city');
    setError(''); setStatus(`已选择城市「${item.name}」。`);
    if (move) focus(item.positionQ);
  }

  async function accept(next: CountryState, ticket: Ticket) {
    if (!current(ticket)) return;
    const previous = stateRef.current, worldChanged = previous?.document.worldId !== next.document.worldId;
    stateRef.current = next; setState(next); callbacks.current.onWorldOpened(next.document.worldId);
    if (worldChanged || !geography.current) {
      const terrain = await readCountryGeography(next.document.worldId); if (!current(ticket)) return;
      geography.current = terrain; await renderer.current!.accept(terrain);
    }
    if (!current(ticket)) return;
    setProgress({ stage: '绘制已保存国土', completed: 0, total: 0 });
    try { await overlay.current!.show(geography.current!, next.document); }
    catch (failure) {
      if (current(ticket) && !(failure instanceof Error && failure.name === 'AbortError')) setFatal(message(failure));
      if (failure instanceof Error && failure.name === 'AbortError') throw new Error('地图显示已取消；本次操作可能已经保存，请重新打开世界核对。', { cause: failure });
      throw failure;
    }
    if (!current(ticket)) return;
    pendingRef.current = null; setPreview(null); setPreviewVisible(false); stopTool(); clearOutline(); setCells([]); setCityPosition(null);
    let selected = selectedRef.current;
    if (worldChanged) try { selected = JSON.parse(localStorage.getItem(selectionKey(next.document.worldId)) ?? 'null') ?? selected; } catch { /* Invalid view preferences do not affect world data. */ }
    const addedCity = next.document.cities.find(item => !previous?.document.cities.some(old => old.id === item.id));
    const addedNation = next.document.nations.find(item => !previous?.document.nations.some(old => old.id === item.id));
    const retainedCity = next.document.cities.find(item => item.id === selected.cityId), retainedNation = next.document.nations.find(item => item.id === selected.nationId);
    const cityChoice = !worldChanged && addedCity ? addedCity : retainedCity;
    const nationChoice = cityChoice ? next.document.nations.find(item => item.id === cityChoice.nationId) : !worldChanged && addedNation ? addedNation : retainedNation ?? next.document.nations[0];
    choose(nationChoice?.id ?? null, cityChoice?.id ?? null); setNewNation(false); setNewCity(false); setClaimMode(false); setReleaseMode(false);
    if (nationChoice) { setNationName(nationChoice.name); setNationColor(nationChoice.color); }
    if (cityChoice) setCityName(cityChoice.name);
    if (worldChanged) setCopyName(`${next.document.name.slice(0, 68)} · 升级副本`);
    setStatus(next.readOnly ? '这份世界以只读方式打开。' : next.recovered ? '已从可验证的备份恢复显示，请核对后继续。' : `已保存 · 修订 ${next.document.revision}`);
    if (!worldChanged && addedCity) { setPanel('city'); focus(addedCity.positionQ); }
    else if (!worldChanged && addedNation) { setPanel('nation'); focus(overlay.current?.getNationAnchorQ(addedNation.id) ?? addedNation.labelAnchorQ); }
    else if (worldChanged) setPanel(next.document.nations.length ? null : 'nation');
    const entries = await client.current!.list(); if (current(ticket)) setWorlds(entries);
  }

  async function run(action: (ticket: Ticket, api: CountryClient) => Promise<void>) {
    if (busyRef.current || fatal) return;
    const ticket = { lifecycle: epoch.current, operation: ++operation.current };
    activeKind.current = 'other'; busyRef.current = true; setBusy(true); setError(''); setProgress(null); setCanCancel(false);
    try { if (!client.current) throw new Error('建国连接不可用，请刷新恢复。'); await action(ticket, client.current); }
    catch (failure) {
      if (current(ticket)) {
        setError(message(failure));
        if (isPreviewOperation() && !pendingRef.current) { setPanel(previewPanel.current ?? 'nation'); renderer.current?.showOutline(outlineRef.current); }
      }
    }
    finally { if (current(ticket)) { busyRef.current = false; setBusy(false); setCanCancel(false); setProgress(null); } }
  }
  async function previewCommand(command: CountryCommand, ticket: Ticket) {
    if (!current(ticket)) return;
    activeKind.current = 'preview'; setCanCancel(true);
    previewPanel.current = panel; stopTool(); const next = await client.current!.preview(command); if (!current(ticket)) return;
    pendingRef.current = next; setPreview(next); setPreviewVisible(false);
    setProgress({ stage: '绘制国土预览', completed: 0, total: 0 });
    await overlay.current!.show(geography.current!, next.document, true); if (!current(ticket)) return;
    setPreviewVisible(true); setPanel(null); setStatus('预览尚未保存，请确认地图上的变化。');
  }
  async function cancelPreview(ticket: Ticket, api: CountryClient) {
    await api.cancelPreview(); if (!current(ticket)) return;
    pendingRef.current = null; setPreview(null); setPreviewVisible(false);
    await overlay.current!.show(geography.current!, stateRef.current!.document); if (!current(ticket)) return;
    setPanel(previewPanel.current ?? 'nation'); renderer.current?.showOutline(outlineRef.current); setStatus(`已取消预览 · 修订 ${stateRef.current!.document.revision}`);
  }
  async function cancelRunningPreview() {
    if (!busyRef.current || activeKind.current !== 'preview' || cancellingRef.current || !client.current) return;
    const ticket = { lifecycle: epoch.current, operation: ++operation.current }, api = client.current;
    cancellingRef.current = true; setCancelling(true); setCanCancel(false); setProgress({ stage: '正在取消预览', completed: 0, total: 0 });
    overlay.current?.cancelPending();
    try {
      await api.cancelPreview(); if (!current(ticket)) return;
      pendingRef.current = null; setPreview(null); setPreviewVisible(false);
      await overlay.current!.show(geography.current!, stateRef.current!.document); if (!current(ticket)) return;
      setPanel(previewPanel.current ?? 'nation'); renderer.current?.showOutline(outlineRef.current); setError(''); setStatus('已取消这次预览，已保存世界保持原样。');
    } catch (failure) { if (current(ticket)) { setFatal('取消结果未确认，请刷新核对已保存世界。'); setError(message(failure)); } }
    finally { if (current(ticket)) { cancellingRef.current = false; setCancelling(false); busyRef.current = false; setBusy(false); setProgress(null); } }
  }
  async function createWorld(ticket: Ticket, api: CountryClient) { await accept(await api.create(entry.current.source!, worldName.trim()), ticket); }
  async function openWorld(id: string, ticket: Ticket, api: CountryClient) { await accept(await api.open(id), ticket); }
  async function copyWorld(ticket: Ticket, api: CountryClient) { await accept(await api.copyToV3(stateRef.current!.document.worldId, copyName.trim()), ticket); }
  function previewTerritory() {
    if (outlineRef.current.length) {
      const points = outlineRef.current.map(point => ({ ...point }));
      if (releaseMode && nationId) return run(ticket => previewCommand({ type: 'release-territory-shape', nationId, outlineQ: points }, ticket));
      return run(ticket => previewCommand(claimMode && nationId ? { type: 'claim-territory-shape', nationId, outlineQ: points } : { type: 'create-nation-shape', name: nationName.trim(), color: nationColor, outlineQ: points }, ticket));
    }
    return run(ticket => previewCommand(claimMode && nationId ? { type: 'claim-territory', nationId, cellIds: cells } : { type: 'create-nation', name: nationName.trim(), color: nationColor, cellIds: cells }, ticket));
  }
  function beginTerritory(claim: boolean) {
    if (locked) return; stopTool(); clearOutline(); anchor.current = null; setCells([]); setClaimMode(claim); setReleaseMode(false); setError('');
    toolRef.current = 'territory'; setTool('territory'); setPanel(null); setStatus('点选范围的第一角，再点对角。海域会由真实陆地边界裁去。');
    renderer.current?.showRegion(null);
  }
  function beginCity() {
    if (locked || !nationId) return; stopTool(); setCityPosition(null); setError(''); toolRef.current = 'city'; setTool('city'); setPanel(null);
    setStatus('点选本国陆地上的聚落位置。可拖动或缩放地图。');
  }
  pickPoint.current = point => {
    consumed.current = false; if (busyRef.current || pendingRef.current || fatal) return;
    if (stateRef.current?.document.version === 3) renderer.current?.select(null);
    if (toolRef.current.startsWith('outline-')) {
      consumed.current = true; renderer.current?.select(null);
      if (toolRef.current === 'outline-points') {
        if (outlineRef.current.length >= 256) { setError('轮廓最多 256 个顶点。可撤销一点或重新绘制。'); return; }
        const next = { xQ: Math.round(point.x * 256), yQ: Math.round(point.y * 256) }, last = outlineRef.current.at(-1);
        if (!last || last.xQ !== next.xQ || last.yQ !== next.yQ) rememberOutline([...outlineRef.current, next]);
        setStatus('顶点已添加，可继续点选或闭合预览。');
      }
      return;
    }
    if (toolRef.current === 'territory') return;
    if (toolRef.current === 'city') {
      consumed.current = true; const positionQ = { xQ: Math.round(point.x * 256), yQ: Math.round(point.y * 256) };
      void run(async ticket => {
        const pick = await countryLandAt(geography.current!, positionQ.xQ, positionQ.yQ, undefined, countryGeometry(stateRef.current!.document));
        if (!current(ticket)) return;
        const territory = stateRef.current!.document.territories.find(item => item.cellId === pick.cellId);
        if (!pick.land || territory?.controllingNationId !== selectedRef.current.nationId) throw new Error('城市需要落在所选国家的真实陆地领土内，请重新点选。');
        setCityPosition(positionQ); stopTool(); setPanel('city'); focus(positionQ); setStatus('位置已选定。预览后确认，城市才会保存。');
      }); return;
    }
    const pickedCity = overlay.current?.pickCity(point);
    if (pickedCity) { consumed.current = true; showCity(pickedCity, true); return; }
    // Atlas onPick describes geographic sampling cells. A v3 political region
    // has its own shared geometry, so map browsing uses the same query as the
    // authoritative Worker city validation instead of reusing a coarse ID.
    if (stateRef.current?.document.version === 3) {
      consumed.current = true;
      void run(async ticket => {
        const surface = await countryLandAt(geography.current!, Math.round(point.x * 256), Math.round(point.y * 256), undefined, countryGeometry(stateRef.current!.document));
        if (!current(ticket)) return;
        const owner = stateRef.current!.document.territories.find(t => t.cellId === surface.cellId);
        if (surface.land && owner) showNation(owner.controllingNationId, true);
        else { choose(null, null); setPanel(null); setStatus(surface.land ? '这片陆地尚未划入国家。' : '这里是海域。'); }
      });
    }
  };
  pickCell.current = (id, land) => {
    if (consumed.current) { consumed.current = false; return; }
    if (busyRef.current || pendingRef.current || fatal || !stateRef.current) return;
    if (toolRef.current === 'territory') {
      const spec = geography.current!.manifest.spec;
      if (anchor.current === null) { anchor.current = id; renderer.current?.showRegion({ column: id % spec.columns, row: Math.floor(id / spec.columns), columns: 1, rows: 1 }); setStatus('第一角已选定，再点范围对角。'); return; }
      const first = anchor.current, column = Math.min(first % spec.columns, id % spec.columns), row = Math.min(Math.floor(first / spec.columns), Math.floor(id / spec.columns));
      const columns = Math.abs(first % spec.columns - id % spec.columns) + 1, rows = Math.abs(Math.floor(first / spec.columns) - Math.floor(id / spec.columns)) + 1;
      if (columns * rows > 1024) { setError('一次最多选择 1,024 个地块。请点选更近的对角，或取消后重新选择。'); return; }
      const selected = Array.from({ length: columns * rows }, (_, index) => (row + Math.floor(index / columns)) * spec.columns + column + index % columns);
      setCells(selected); anchor.current = null; toolRef.current = 'browse'; setTool('browse'); setPanel('nation');
      renderer.current?.showRegion({ column, row, columns, rows }); setStatus(`已选择 ${selected.length} 个候选地块，预览会排除海域。`); return;
    }
    if (land === false) { choose(null, null); setPanel(null); setStatus('这里是海域。'); return; }
    const territory = stateRef.current.document.territories.find(item => item.cellId === id);
    if (territory) showNation(territory.controllingNationId, true);
    else { choose(null, null); setPanel(null); setStatus('这片陆地尚未划入国家。'); }
  };

  useEffect(() => {
    const ticket = ++epoch.current; live.current = true; busyRef.current = true;
    const current = () => live.current && epoch.current === ticket;
    let api: CountryClient;
    const reportProgress = (value: Progress) => { if (current() && busyRef.current && !cancellingRef.current) setProgress(value); };
    try { api = new CountryClient({ onProgress: reportProgress }); client.current = api; }
    catch (failure) { setFatal(message(failure)); setError(message(failure)); busyRef.current = false; setBusy(false); return; }
    const politics = new CountryRenderer(host.current!, reportProgress); overlay.current = politics;
    const map = new AtlasRenderer(host.current!, {
      onPickPoint: point => { if (current()) pickPoint.current(point); }, onPick: (id, surface) => { if (current()) pickCell.current(id, surface?.land); },
      onOutline: points => { if (current()) outlineCallback.current(points); }, onOutlineCancel: () => { if (current()) outlineCancel.current(); },
      onCamera: camera => { if (current()) { politics.setCamera(camera); setScale(camera.scale); } },
      onFatal: failure => { if (current()) { setFatal(message(failure)); setError(message(failure)); } },
      onGraphicsState: next => { if (current() && next !== 'ready') setStatus('地图画面正在恢复，已保存世界保持原样。'); },
    }); renderer.current = map;
    void (async () => {
      try {
        await map.init(); if (!current()) return;
        if (entry.current.initialWorldId) {
          const initialTicket = { lifecycle: ticket, operation: operation.current };
          await accept(await api.open(entry.current.initialWorldId), initialTicket);
        }
        else { const entries = await api.list(); if (!current()) return; setWorlds(entries); setStatus(entry.current.source ? '从这份地理草稿创建独立建国世界。' : '打开已保存的建国世界，或返回地理草稿创建新副本。'); }
      } catch (failure) { if (current()) setError(message(failure)); }
      finally { if (current()) { busyRef.current = false; setBusy(false); setProgress(null); } }
    })();
    return () => { live.current = false; epoch.current++; api.close(); politics.destroy(); map.destroy(); client.current = null; renderer.current = null; overlay.current = null; geography.current = null; stateRef.current = null; pendingRef.current = null; };
    // The routed identity changes after a successful create. The live client
    // keeps that same world; it must not reopen during its own confirmation.
  }, []);

  const countryPanel = <>
    {state && state.document.version < 3 && <div className="country-upgrade-note"><p>此世界保留原地块国界。创建自然国界副本可使用不规则共享边界，原世界保留。</p><button disabled={busy || !!preview} onClick={() => setPanel('world')}>查看升级副本选项</button></div>}
    {!newNation && <button className="country-primary" disabled={locked} onClick={() => { stopTool(); clearOutline(); setNewNation(true); setClaimMode(false); setReleaseMode(false); setNationName(''); setNationColor(colors[(actual?.nations.length ?? 0) % colors.length]); setCells([]); choose(null, null); }}>新建国家</button>}
    {(newNation || nation) && <section aria-label="国家设置" className="country-fields">
      <label>国家名称<input aria-label="国家名称" maxLength={60} value={nationName} disabled={locked} onChange={event => setNationName(event.target.value)} /></label>
      {(newNation || claimMode) && <label className="country-color">国家颜色<input aria-label="国家颜色" type="color" value={nationColor} disabled={locked || claimMode} onChange={event => setNationColor(event.target.value)} /></label>}
      {newNation ? <><p>圈出国家范围，按圈内地块中心划入领土，海水自动排除。</p>
        <button className="country-primary" disabled={locked || !nationName.trim() || !state || state.document.version < 2} onClick={() => beginOutline(false)}>手绘国土</button>
        <button disabled={locked || !nationName.trim()} onClick={() => beginTerritory(false)}>在地图上选择国土</button>
        {outlineQ.length > 0 && <button disabled={locked} onClick={() => { setOutlineEditing(true); setOutlineControls(true); setOutlineTool('outline-points'); }}>继续编辑轮廓</button>}
        <p data-testid="country-territory-selection">{outlineQ.length ? `轮廓 ${outlineQ.length} 个顶点 · 按地块划入` : cells.length ? `已选择 ${cells.length} 个候选地块` : '尚未选择领土'}</p>
        <button className="country-primary" disabled={locked || !cells.length && outlineQ.length < 3 || !nationName.trim()} onClick={() => void previewTerritory()}>预览建国</button></>
        : nation && <><dl className="country-facts"><div><dt>领土地块</dt><dd>{actual!.territories.filter(item => item.controllingNationId === nation.id).length}</dd></div><div><dt>首都</dt><dd>{actual!.cities.find(item => item.id === nation.capitalCityId)?.name ?? '尚未设定'}</dd></div></dl>
          <button disabled={locked || !nationName.trim() || nationName === nation.name} onClick={() => void run(ticket => previewCommand({ type: 'rename-nation', nationId: nation.id, name: nationName.trim() }, ticket))}>预览国家更名</button>
          <button className="country-primary" disabled={locked || !state || state.document.version < 2} onClick={() => beginOutline(true)}>手绘扩展领土</button>
          <button disabled={locked} onClick={() => beginTerritory(true)}>为此国划定领土</button>
          <button className="country-destructive" disabled={locked || !state || state.document.version < 2} onClick={() => beginOutline(true, true)}>手绘移除领土</button>
          {claimMode && <><p data-testid="country-territory-selection">{outlineQ.length ? `轮廓 ${outlineQ.length} 个顶点 · ${releaseMode ? '移除本国领土' : '按地块划入'}` : cells.length ? `已选择 ${cells.length} 个候选地块` : '尚未选择领土'}</p>
            {releaseMode && <p>圈中的本国领土将恢复为未分配陆地。包含城市或他国领土的操作不会保存；也不能移除国家的全部领土。</p>}
            {outlineQ.length > 0 && <button disabled={locked} onClick={() => { setOutlineEditing(true); setOutlineTool('outline-points'); }}>继续编辑轮廓</button>}
            <button className={releaseMode ? 'country-destructive' : 'country-primary'} disabled={locked || !cells.length && outlineQ.length < 3} onClick={() => void previewTerritory()}>{releaseMode ? '预览移除领土' : '预览领土调整'}</button></>}
          <button disabled={locked} onClick={() => { setPanel('city'); setNewCity(true); setCityName(''); setCityPosition(null); choose(nation.id, null); }}>在此国新建城市</button>
          <details><summary>国家身份</summary><p className="country-id" data-testid="country-selected-nation-id">{nation.id}</p></details></>}
    </section>}
    <div className="country-entity-list" role="group" aria-label="国家列表">{actual?.nations.map(item => <button key={item.id} data-nation-id={item.id} aria-label={`国家 ${item.name}`} aria-pressed={item.id === nationId} disabled={busy || !!preview} onClick={() => showNation(item.id, true)}><span className="country-color-dot" style={{ background: item.color }} /><span>{item.name}</span><Icon name="chevron-left" size={16} /></button>)}</div>
    {!newNation && !actual?.nations.length && <p className="country-help">还没有国家。新建一个国家，从选择领土开始。</p>}
  </>;
  const cityPanel = <>
    {!actual?.nations.length ? <p className="country-help">请先创建国家，再在其陆地领土上落城。</p> : <>
      <label>所属国家<select aria-label="城市所属国家" value={nationId ?? ''} disabled={locked} onChange={event => { choose(event.target.value, null); setNewCity(true); setCityPosition(null); }}><option value="" disabled>选择国家</option>{actual.nations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {!newCity && <button className="country-primary" disabled={locked || !nationId} onClick={() => { stopTool(); setNewCity(true); setCityName(''); setCityPosition(null); choose(nationId, null); }}>新建城市</button>}
      {(newCity || city) && <section aria-label="城市设置" className="country-fields"><label>城市名称<input aria-label="城市名称" maxLength={60} disabled={locked} value={cityName} onChange={event => setCityName(event.target.value)} /></label>
        {newCity ? <><p>在本国陆地选择聚落位置。地图上的圆点代表聚落，星形代表首都。</p><button disabled={locked || !nationId || !cityName.trim()} onClick={beginCity}>在地图上选择城市位置</button><p data-testid="country-city-position">{cityPosition ? `位置已选定 · ${Math.round(cityPosition.xQ / 256)}，${Math.round(cityPosition.yQ / 256)}` : '尚未选择位置'}</p>
          <button className="country-primary" disabled={locked || !cityPosition || !nationId || !cityName.trim()} onClick={() => void run(ticket => previewCommand({ type: 'create-city', nationId: nationId!, name: cityName.trim(), positionQ: cityPosition! }, ticket))}>预览建城</button></>
          : city && <><dl className="country-facts"><div><dt>所属国家</dt><dd>{nation?.name}</dd></div><div><dt>城市地位</dt><dd data-testid="country-city-capital">{nation?.capitalCityId === city.id ? '首都' : '普通聚落'}</dd></div></dl>
            <button disabled={locked || cityName === city.name || !cityName.trim()} onClick={() => void run(ticket => previewCommand({ type: 'rename-city', cityId: city.id, name: cityName.trim() }, ticket))}>预览城市更名</button>
            <button className="country-primary" disabled={locked || nation?.capitalCityId === city.id} onClick={() => void run(ticket => previewCommand({ type: 'set-capital', nationId: city.nationId, cityId: city.id }, ticket))}>设为首都</button>
            <details><summary>城市身份</summary><p className="country-id" data-testid="country-selected-city-id">{city.id}</p></details></>}
      </section>}
      <div className="country-entity-list" role="group" aria-label="城市列表">{actual.cities.filter(item => !nationId || item.nationId === nationId).map(item => <button key={item.id} data-city-id={item.id} aria-label={`城市 ${item.name}`} aria-pressed={item.id === cityId} disabled={busy || !!preview} onClick={() => showCity(item.id, true)}><Icon name="city" /><span>{item.name}</span><small>{actual.nations.find(nation => nation.id === item.nationId)?.capitalCityId === item.id ? '首都' : '聚落'}</small></button>)}</div>
    </>}
  </>;
  const worldPanel = <>
    {entry.current.source && !state && <section className="country-fields"><h3>把山海，变成你的列国</h3><p>创建独立建国副本，保存自己的地理、国家与城市。原地理草稿保留。</p><label>世界名称<input aria-label="建国世界名称" maxLength={80} value={worldName} disabled={busy} onChange={event => setWorldName(event.target.value)} /></label><button className="country-primary" disabled={busy || !!fatal || !worldName.trim()} onClick={() => void run(createWorld)}>创建独立建国副本</button></section>}
    {state && <section><h3>{state.document.name}</h3><p>{state.document.nations.length} 个国家 · {state.document.cities.length} 座城市 · 修订 {state.document.revision}</p><p className="country-help">领土、国家与城市在本地保存；当前是建国阶段，尚未开启战争与社会推演。</p><details><summary>世界身份</summary><p className="country-id">{state.document.worldId}</p><p className="country-id">{state.rootDigest}</p></details></section>}
    {state && state.document.version < 3 && <section className="country-fields country-upgrade-note"><h3>让国界离开方格</h3><p>创建独立副本，以不规则共享多边形重新解释领土范围。海陆与地形不变，国家、城市与首都身份保留。沿边归属可能变化，没有陆地的单元会排除；若城市因此越界，复制会停止并说明原因。</p><p>原世界与原历史保持原规则。新副本从修订 0 开始。</p>
      <label>副本名称<input aria-label="升级副本名称" maxLength={80} value={copyName} disabled={busy || !!preview} onChange={event => setCopyName(event.target.value)} /></label>
      <button className="country-primary" disabled={busy || !!fatal || !!preview || state.recovered || !copyName.trim()} onClick={() => void run(copyWorld)}>创建自然国界副本</button>
      {state.document.version === 1 && <button disabled={busy || !!fatal || !!preview || state.recovered || !copyName.trim()} onClick={() => void run(async (ticket, api) => accept(await api.copyToV2(state.document.worldId, copyName.trim()), ticket))}>仅升级分块存储</button>}
      {state.recovered && <p>当前为备份恢复的只读状态，请先核对保存记录。</p>}</section>}
    <section><h3>已保存的世界</h3><div className="country-entity-list">{worlds.map(item => <button key={item.worldId} disabled={busy || !!preview} onClick={() => void run((ticket, api) => openWorld(item.worldId, ticket, api))} aria-label={`打开 ${item.name}`}><Icon name="world" /><span>{item.name}<small>{item.nationCount} 国 · {item.cityCount} 城</small></span></button>)}</div>{!worlds.length && <p className="country-help">还没有已保存的建国世界。</p>}</section>
  </>;

  return <main className="country-studio" data-testid="country-studio" data-country-state={fatal ? 'error' : busy ? 'busy' : state?.readOnly ? 'readonly' : state ? 'ready' : 'empty'} data-country-display={preview ? 'preview' : 'committed'} data-country-world-id={state?.document.worldId ?? ''} data-country-revision={state?.document.revision ?? ''} data-country-nation-count={actual?.nations.length ?? 0} data-country-city-count={actual?.cities.length ?? 0} data-country-selected-nation={nationId ?? ''} data-country-selected-city={cityId ?? ''} data-country-tool={tool} data-country-capital-city={nation?.capitalCityId ?? ''}
    data-country-version={state?.document.version ?? ''} data-country-outline-points={outlineQ.length} data-country-territory-action={releaseMode ? 'release' : claimMode ? 'claim' : 'create'} data-country-cancelling={cancelling} data-country-progress-stage={progress?.stage ?? ''} data-country-progress-completed={progress?.completed ?? ''} data-country-progress-total={progress?.total ?? ''}
    onKeyDown={event => {
      if (!(event.target instanceof HTMLCanvasElement) || !outlineEditing || locked) return;
      if (event.key === 'Escape') { event.preventDefault(); cancelOutlineSelection(); }
      else if (event.key === 'Backspace' && outlineQ.length) { event.preventDefault(); undoOutlinePoint(); }
      else if (event.key === 'Enter' && outlineQ.length >= 3) { event.preventDefault(); void previewTerritory(); }
    }}>
    <header className="country-header"><button disabled={busy} onClick={() => callbacks.current.onBack()} aria-label="返回地理草稿"><Icon name="chevron-left" /></button><div><h1>{state?.document.name ?? '建立你的列国'}</h1><span>{preview ? '预览 · 尚未保存' : state?.readOnly ? '只读世界' : '国家与城市'}</span></div><button aria-label="撤销上次操作" disabled={locked || !state?.undoCount} onClick={() => void run(async (ticket, api) => accept(await api.undo(), ticket))}><Icon name="chevron-left" /><span>撤销</span></button></header>
    <div className="country-stage"><div className="country-map" ref={host} />
      {state && <div className="country-map-tools" role="group" aria-label="建国地图视图"><button aria-label="放大建国地图" disabled={busy || !!fatal} onClick={() => renderer.current?.zoom(1.5)}>＋</button><button aria-label="缩小建国地图" disabled={busy || !!fatal} onClick={() => renderer.current?.zoom(1 / 1.5)}>−</button><button disabled={busy || !!fatal} onClick={() => renderer.current?.fit()}>全图</button><span>{Math.round(scale * 100)}%</span></div>}
      {(tool === 'territory' || tool === 'city') && <div className="country-pick-bar" role="status"><span>{tool === 'territory' ? '点选两角，划定国土' : '点选本国陆地，选择城市位置'}</span><button disabled={busy} onClick={() => { stopTool(); setPanel(tool === 'territory' ? 'nation' : 'city'); setStatus('已取消选点，世界保持原样。'); }}>取消选点</button></div>}
      {outlineEditing && !preview && <section className="country-outline-tools" aria-label="国土圈绘工具">
        <header><span>{tool === 'outline-draw' ? releaseMode ? '圈出要移除的国土' : '画出国土轮廓' : tool === 'outline-points' ? '点选轮廓顶点' : '移动地图'}<small>{outlineQ.length} 个顶点{releaseMode ? ' · 移除领土' : ''}</small></span>
          <button aria-label={outlineControls ? '收起圈地工具' : '展开圈地工具'} aria-expanded={outlineControls} onClick={() => setOutlineControls(value => !value)}><Icon name={outlineControls ? 'chevron-up' : 'chevron-down'} /></button></header>
        {outlineControls && <><div className="country-outline-modes" role="group" aria-label="圈地方式">
          <button disabled={locked} aria-pressed={tool === 'outline-draw'} onClick={() => setOutlineTool('outline-draw')}>手绘</button>
          <button disabled={locked} aria-pressed={tool === 'outline-points'} onClick={() => setOutlineTool('outline-points')}>逐点</button>
          <button disabled={locked} aria-pressed={tool === 'outline-move'} onClick={() => setOutlineTool('outline-move')}>移动地图</button></div>
          <div className="country-outline-actions"><button disabled={locked || !outlineQ.length} onClick={undoOutlinePoint}>撤销一点</button><button disabled={locked} onClick={() => beginOutline(claimMode, releaseMode)}>重新绘制</button></div>
          <p>{releaseMode ? '移除圈内本国领土，恢复为未分配；城市和他国领土受保护。' : '按圈内地块中心划入，海水自动排除。'}</p></>}
        <div className="country-outline-actions"><button disabled={locked} onClick={cancelOutlineSelection}>取消圈地</button><button className="country-primary" disabled={locked || outlineQ.length < 3} onClick={() => void previewTerritory()}>闭合并预览</button></div>
      </section>}
      {panel && !preview && <section className="country-inspector" data-extent={expanded ? 'reading' : 'half'} aria-label={panel === 'nation' ? '国家面板' : panel === 'city' ? '城市面板' : '世界面板'}>
        <header><h2>{panel === 'nation' ? newNation ? '新建国家' : nation?.name ?? '国家' : panel === 'city' ? newCity ? '新建城市' : city?.name ?? '城市' : '我的世界'}</h2><button className="country-expand" aria-label={expanded ? '收起建国面板' : '展开建国面板'} onClick={() => setExpanded(value => !value)}><Icon name={expanded ? 'chevron-down' : 'chevron-up'} /></button><button aria-label="关闭建国面板" onClick={() => setPanel(null)}><Icon name="close" /></button></header>
        <div className="country-inspector-body">{panel === 'nation' ? countryPanel : panel === 'city' ? cityPanel : worldPanel}</div>
      </section>}
      {preview && <section className="country-confirm" aria-label="建国操作预览"><div><strong>确认这次变化</strong><p>{preview.description}</p></div><div className="country-confirm-actions"><button disabled={busy || !!fatal} onClick={() => void run(cancelPreview)}>取消预览</button><button className="country-primary" disabled={busy || !!fatal || !previewVisible} onClick={() => void run(async (ticket, api) => accept(await api.confirm(), ticket))}>确认并保存</button></div></section>}
      <div className="country-feedback" role={error || fatal ? 'alert' : 'status'}><div><span>{fatal || error || (busy ? progress?.stage ?? '正在处理，请稍候…' : status)}</span>
        {busy && <div className="country-progress"><progress aria-label="建国操作进度" max={progress && progress.total > 0 ? progress.total : 1} value={progress && progress.total > 0 ? Math.min(progress.completed, progress.total) : undefined} />{progress && progress.total > 0 && <small>{progress.completed.toLocaleString()} / {progress.total.toLocaleString()}</small>}</div>}</div>
        {busy && canCancel && <button disabled={cancelling} onClick={() => void cancelRunningPreview()}>取消计算</button>}
        {(error || fatal) && state && <button onClick={() => window.location.reload()}>刷新恢复已保存世界</button>}</div>
    </div>
    <nav className="country-nav" aria-label="建国世界工具">{([{ panel: null, name: '地图', icon: 'map' }, { panel: 'nation', name: '国家', icon: 'flag' }, { panel: 'city', name: '城市', icon: 'city' }, { panel: 'world', name: '世界', icon: 'world' }] as const).map(item => <button key={item.name} disabled={busy || !!preview || item.panel !== 'world' && !state} aria-pressed={panel === item.panel} onClick={() => { stopTool(); setPanel(item.panel); if (state) { setError(''); setStatus(state.readOnly ? '这份世界以只读方式打开。' : `已保存 · 修订 ${state.document.revision}`); } }}><Icon name={item.icon} /><span>{item.name}</span></button>)}</nav>
  </main>;
}

export default CountryStudio;
