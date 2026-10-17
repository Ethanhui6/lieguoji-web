import { useEffect, useRef, useState } from 'react';
import { SEED_TERRAIN_TEMPLATES, type SeedTerrainTemplate } from '../../world/recovered-terrain/contract';
import { generateRecoveredHeights } from '../../world/recovered-terrain/engine';
import { loadOriginalGrid, ORIGINAL_GRIDS, type OriginalGrid, type OriginalGridId } from './original-grid';
import { OriginalMapRenderer, type OriginalMapStats } from './original-map-renderer';
import { ORIGINAL_PRESETS, type OriginalLandMode } from './original-style';
import './original-map.css';

/** Comparison view: the original's own blank grid, the recovered height
 * templates and the original's drawing order. Not yet the playable world. */
export default function OriginalMapView() {
  const host = useRef<HTMLDivElement>(null), renderer = useRef<OriginalMapRenderer | null>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 }), gridCache = useRef(new Map<OriginalGridId, OriginalGrid>());
  const [gridId, setGridId] = useState<OriginalGridId>('20k'), [template, setTemplate] = useState<SeedTerrainTemplate>('continents');
  const [seed, setSeed] = useState('1337'), [preset, setPreset] = useState(0), [landMode, setLandMode] = useState<OriginalLandMode>('height-background');
  const [ready, setReady] = useState(false), [stats, setStats] = useState<OriginalMapStats | null>(null), [error, setError] = useState('');
  const apply = () => { const c = camera.current; renderer.current?.setCamera(c.x, c.y, c.scale); };
  const fit = () => { const el = host.current; if (!el) return; const s = Math.min(el.clientWidth / 1600, el.clientHeight / 900); camera.current = { scale: s, x: (el.clientWidth - 1600 * s) / 2, y: (el.clientHeight - 900 * s) / 2 }; apply(); };
  useEffect(() => {
    const el = host.current!, r = new OriginalMapRenderer(); renderer.current = r; let alive = true;
    void r.init(el).then(() => { if (!alive) return; fit(); setReady(true); }).catch(e => setError(String(e)));
    const observer = new ResizeObserver(() => { r.resize(el.clientWidth, el.clientHeight); fit(); }); observer.observe(el);
    const zoomAt = (px: number, py: number, factor: number) => {
      const c = camera.current, fitScale = Math.min(el.clientWidth / 1600, el.clientHeight / 900);
      // PlayerController#38720 ZoomMin 5 (orthographic half-height, world units):
      // the closest view shows 10 world units = 66.7 map units vertically.
      const closest = el.clientHeight / (10 / (240 / 1600)), next = Math.min(Math.max(closest, fitScale), Math.max(fitScale * .8, c.scale * factor)), k = next / c.scale;
      camera.current = { scale: next, x: px - (px - c.x) * k, y: py - (py - c.y) * k }; apply();
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const b = el.getBoundingClientRect(); zoomAt(e.clientX - b.left, e.clientY - b.top, Math.exp(-e.deltaY * .002)); };
    const pointers = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
    const move = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId); if (!last) return;
      if (pointers.size === 1) { camera.current.x += e.clientX - last.x; camera.current.y += e.clientY - last.y; apply(); }
      else if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1], b = el.getBoundingClientRect();
        const before = Math.hypot(last.x - other.x, last.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 0) zoomAt((e.clientX + other.x) / 2 - b.left, (e.clientY + other.y) / 2 - b.top, after / before);
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => pointers.delete(e.pointerId);
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { alive = false; observer.disconnect(); el.removeEventListener('wheel', wheel); r.destroy(); renderer.current = null; };
  }, []);
  useEffect(() => {
    if (!ready) return; let cancelled = false;
    void (async () => {
      try {
        let grid = gridCache.current.get(gridId);
        if (!grid) { grid = await loadOriginalGrid(gridId); gridCache.current.set(gridId, grid); }
        const heights = await generateRecoveredHeights(grid, seed.trim() || '1337', template);
        if (cancelled || !renderer.current) return;
        setStats(renderer.current.render({ grid, heights, preset: ORIGINAL_PRESETS[preset], landMode })); setError('');
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { cancelled = true; };
  }, [ready, gridId, template, seed, preset, landMode]);
  return <main className="om-app">
    <div className="om-map" ref={host} />
    <form className="om-panel" onSubmit={e => e.preventDefault()} aria-label="原作地图对照设置">
      <strong>原作格网地图</strong>
      <label>格网<select aria-label="原作格网" value={gridId} onChange={e => setGridId(e.target.value as OriginalGridId)}>{Object.entries(ORIGINAL_GRIDS).map(([id, g]) => <option key={id} value={id}>{g.desired.toLocaleString()} 格</option>)}</select></label>
      <label>模板<select aria-label="地形模板" value={template} onChange={e => setTemplate(e.target.value as SeedTerrainTemplate)}>{SEED_TERRAIN_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>种子<input aria-label="地形种子" value={seed} maxLength={20} onChange={e => setSeed(e.target.value)} /></label>
      <label>显示预设<select aria-label="显示预设" value={preset} onChange={e => setPreset(Number(e.target.value))}>{ORIGINAL_PRESETS.map((p, i) => <option key={i} value={i}>预设 {i + 1}{p.parchment ? ' · 羊皮纸' : ''}</option>)}</select></label>
      <label>陆地<select aria-label="陆地显示" value={landMode} onChange={e => setLandMode(e.target.value as OriginalLandMode)}><option value="height-background">高度底图（原作默认）</option><option value="height-palette">高度编辑配色</option></select></label>
      <button type="button" onClick={fit}>显示全图</button>
      {stats && <small>陆地格 {stats.landCells} · 海岸链 {stats.coastChains} · {Math.round(stats.buildMs)}ms</small>}
      {error && <small role="alert">{error}</small>}
    </form>
  </main>;
}
