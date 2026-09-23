import { useEffect, useRef, useState } from 'react';
import type { Point } from '../sim/types';
import type { BrushTool, EditorDraft } from '../worldgen/types';

export type StudioTool = BrushTool | 'city' | 'capital' | 'pan';
export type StudioLayer = 'terrain' | 'political';
type Props = { draft: EditorDraft; tool: StudioTool; radius: number; layer: StudioLayer; selectedNation: string; onStrokeStart: () => void; onStrokePoint: (point: Point) => void; onStrokeEnd: (cancelled: boolean) => void; onPlace: (point: Point) => void };
type Edge = { a: Point; b: Point; land: boolean; owner: string | null; otherLand?: boolean; otherOwner?: string | null };
type View = { x: number; y: number; scale: number };

function trace(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

function edges(draft: EditorDraft) {
  const result = new Map<string, Edge>();
  for (const cell of draft.cells) for (let i = 0; i < cell.polygon.length; i++) {
    const a = cell.polygon[i], b = cell.polygon[(i + 1) % cell.polygon.length];
    const keys = [`${a.x.toFixed(3)},${a.y.toFixed(3)}`, `${b.x.toFixed(3)},${b.y.toFixed(3)}`].sort();
    const key = keys.join('|');
    const existing = result.get(key);
    if (existing) { existing.otherLand = cell.land; existing.otherOwner = cell.ownerId; }
    else result.set(key, { a, b, land: cell.land, owner: cell.ownerId });
  }
  return [...result.values()];
}

function drawLine(context: CanvasRenderingContext2D, edge: Edge) {
  context.moveTo(edge.a.x, edge.a.y); context.lineTo(edge.b.x, edge.b.y);
}

export function drawStudioMap(context: CanvasRenderingContext2D, draft: EditorDraft, layer: StudioLayer) {
  context.clearRect(0, 0, 1000, 700);
  context.fillStyle = '#113443'; context.fillRect(0, 0, 1000, 700);
  context.strokeStyle = '#608a9618'; context.lineWidth = 0.65;
  context.strokeRect(0.5, 0.5, 999, 699);
  for (let y = 12; y < 700; y += 31) for (let x = (y % 62 ? 9 : 36); x < 1000; x += 57) {
    context.beginPath(); context.moveTo(x, y); context.bezierCurveTo(x + 4, y - 3, x + 10, y + 3, x + 16, y); context.stroke();
  }
  const lines = edges(draft);
  const coast = lines.filter((edge) => edge.otherLand === undefined ? edge.land : edge.land !== edge.otherLand);
  context.strokeStyle = '#41798755'; context.lineWidth = 14; context.lineJoin = 'round'; context.lineCap = 'round'; context.beginPath(); coast.forEach((edge) => drawLine(context, edge)); context.stroke();
  context.strokeStyle = '#66979565'; context.lineWidth = 5; context.stroke();
  for (const cell of draft.cells) {
    if (!cell.land) continue;
    const elevation = Math.min(1, Math.max(0, cell.elevation));
    const lightness = cell.terrain === 'mountain' ? 46 + elevation * 14 : cell.terrain === 'forest' ? 31 + elevation * 10 : 44 + elevation * 12;
    context.fillStyle = `hsl(${cell.terrain === 'forest' ? 143 : cell.terrain === 'mountain' ? 81 : 97} ${cell.terrain === 'mountain' ? 13 : 23}% ${lightness}%)`;
    trace(context, cell.polygon); context.fill();
    // Same-colour overlap closes anti-aliased cracks without drawing a grid.
    context.strokeStyle = context.fillStyle; context.lineWidth = 0.65; context.stroke();
    if (layer === 'political' && cell.ownerId) {
      const nation = draft.nations.find((nation) => nation.id === cell.ownerId);
      if (nation) { context.globalAlpha = 0.67; context.fillStyle = nation.color; context.fill(); context.strokeStyle = nation.color; context.lineWidth = 0.65; context.stroke(); context.globalAlpha = 1; }
    }
  }
  context.beginPath(); coast.forEach((edge) => drawLine(context, edge)); context.strokeStyle = '#d1d3a9a6'; context.lineWidth = 1.2; context.stroke();
  context.strokeStyle = '#729cabc9'; context.lineWidth = 2.2;
  for (const river of draft.rivers) {
    if (river.length < 2) continue;
    context.beginPath(); context.moveTo(river[0].x, river[0].y);
    for (let i = 1; i < river.length; i++) context.lineTo(river[i].x, river[i].y);
    context.stroke();
  }
  draft.cells.forEach((cell, index) => {
    if (!cell.land || index % 3) return;
    const { x, y } = cell.center;
    if (cell.terrain === 'mountain') {
      context.strokeStyle = '#344e4670'; context.lineWidth = 1;
      context.fillStyle = '#bbc5a732'; context.beginPath(); context.moveTo(x - 7, y + 5); context.lineTo(x, y - 9); context.lineTo(x + 7, y + 5); context.fill(); context.stroke();
      context.strokeStyle = '#ecedd663'; context.beginPath(); context.moveTo(x, y - 9); context.lineTo(x + 1, y - 1); context.lineTo(x + 7, y + 5); context.stroke();
    } else if (cell.terrain === 'forest') {
      context.fillStyle = '#173f3f30'; context.beginPath(); context.arc(x - 3, y, 3, 0, Math.PI * 2); context.arc(x + 3, y + 3, 3, 0, Math.PI * 2); context.fill();
    }
  });
  context.beginPath(); lines.filter((edge) => edge.land && edge.otherLand && edge.owner !== edge.otherOwner).forEach((edge) => drawLine(context, edge));
  context.strokeStyle = layer === 'political' ? '#eee3b2bb' : '#d4dbbb70'; context.lineWidth = layer === 'political' ? 1.7 : 0.9; context.stroke();
  const labels: { x: number; y: number; w: number; h: number }[] = [];
  context.textAlign = 'center'; context.textBaseline = 'middle';
  for (const nation of draft.nations) {
    const cells = draft.cells.filter((cell) => cell.land && cell.ownerId === nation.id);
    if (!cells.length) continue;
    const center = { x: cells.reduce((sum, cell) => sum + cell.center.x, 0) / cells.length, y: cells.reduce((sum, cell) => sum + cell.center.y, 0) / cells.length };
    const anchor = [...cells].sort((a, b) => Math.hypot(a.center.x - center.x, a.center.y - center.y) - Math.hypot(b.center.x - center.x, b.center.y - center.y))[0].center;
    context.font = '600 18px "Songti SC", SimSun, serif';
    const y = anchor.y - 15;
    const width = context.measureText(nation.name).width;
    context.lineWidth = 4; context.strokeStyle = '#183d4666'; context.strokeText(nation.name, anchor.x, y); context.fillStyle = '#faf2cb'; context.fillText(nation.name, anchor.x, y);
    labels.push({ x: anchor.x, y, w: width + 12, h: 22 });
  }
  for (const city of draft.cities) {
    const cell = draft.cells.find((cell) => cell.id === city.cellId);
    if (!cell?.land) continue;
    const { x, y } = cell.center;
    context.fillStyle = '#f7ead0'; context.strokeStyle = '#213d3f'; context.lineWidth = 1.2;
    context.beginPath(); context.rect(x - 3, y - 3, 6, 6); context.fill(); context.stroke();
    if (city.capital) { context.strokeStyle = '#faf0c2'; context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.stroke(); }
    context.font = '11px "Microsoft YaHei", sans-serif';
    const width = context.measureText(city.name).width;
    let textY = y + 14;
    for (const offset of [14, -14, 27, -27, 40]) {
      textY = y + offset;
      if (!labels.some((label) => Math.abs(label.x - x) < (label.w + width) / 2 + 5 && Math.abs(label.y - textY) < (label.h + 13) / 2)) break;
    }
    context.lineWidth = 3; context.strokeStyle = '#1b4145aa'; context.strokeText(city.name, x, textY); context.fillStyle = '#fff4d4'; context.fillText(city.name, x, textY);
    labels.push({ x, y: textY, w: width + 8, h: 13 });
  }
}

export function StudioCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  const fitRef = useRef(1);
  const cursorRef = useRef<Point | null>(null);
  const pointsRef = useRef(new Map<number, Point>());
  const gestureRef = useRef({ active: false, moved: false, cancelled: false, distance: 0, start: { x: 0, y: 0 } });
  const [zoom, setZoom] = useState(100);
  propsRef.current = props;

  function render() {
    const canvas = canvasRef.current, cache = cacheRef.current;
    if (!canvas || !cache) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = '#113443'; context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const view = viewRef.current;
    context.translate(view.x, view.y); context.scale(view.scale, view.scale); context.drawImage(cache, 0, 0, 1000, 700);
    if (view.scale / fitRef.current > 1.7) {
      context.strokeStyle = '#f1f1cf13'; context.lineWidth = 0.4 / view.scale;
      propsRef.current.draft.cells.filter((cell) => cell.land).forEach((cell) => { trace(context, cell.polygon); context.stroke(); });
    }
    const cursor = cursorRef.current;
    if (cursor && !['pan', 'city', 'capital'].includes(propsRef.current.tool)) {
      const x = (cursor.x - view.x) / view.scale, y = (cursor.y - view.y) / view.scale;
      context.strokeStyle = '#fff7d9cc'; context.lineWidth = 1.5 / view.scale; context.fillStyle = '#ffefd41a'; context.beginPath(); context.arc(x, y, propsRef.current.radius, 0, Math.PI * 2); context.fill(); context.stroke();
    }
  }

  function fit() {
    const canvas = canvasRef.current; if (!canvas) return;
    const scale = Math.min(canvas.clientWidth / 1000, canvas.clientHeight / 700) * 0.98;
    fitRef.current = scale; viewRef.current = { x: (canvas.clientWidth - 1000 * scale) / 2, y: (canvas.clientHeight - 700 * scale) / 2, scale }; setZoom(100); render();
  }

  function zoomBy(factor: number, anchor?: Point) {
    const canvas = canvasRef.current; if (!canvas) return;
    const center = anchor ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    const view = viewRef.current; const next = Math.max(fitRef.current * 0.7, Math.min(fitRef.current * 5, view.scale * factor));
    const scale = next / view.scale;
    viewRef.current = { x: center.x - (center.x - view.x) * scale, y: center.y - (center.y - view.y) * scale, scale: next }; setZoom(Math.round(next / fitRef.current * 100)); render();
  }

  useEffect(() => {
    if (!cacheRef.current) { cacheRef.current = document.createElement('canvas'); cacheRef.current.width = 2000; cacheRef.current.height = 1400; }
    const context = cacheRef.current.getContext('2d'); if (!context) return;
    context.setTransform(2, 0, 0, 2, 0, 0); drawStudioMap(context, props.draft, props.layer); render();
  }, [props.draft, props.layer]);

  useEffect(() => { render(); }, [props.tool, props.radius]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio)); fit(); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); zoomBy(Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }); };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); canvas.removeEventListener('wheel', wheel); };
  }, []);

  function mapPoint(point: Point) { const view = viewRef.current; return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }; }

  return <div className="studio-map-frame">
    <canvas ref={canvasRef} className={`studio-canvas tool-${props.tool}`} data-testid="studio-canvas" aria-label="世界工坊画布，单指绘制，双指缩放；也可选择平移工具拖动画布"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect(); const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointsRef.current.set(event.pointerId, point); cursorRef.current = point;
        if (pointsRef.current.size === 1) gestureRef.current = { active: false, moved: false, cancelled: false, distance: 0, start: point };
        else { if (gestureRef.current.active) propsRef.current.onStrokeEnd(true); gestureRef.current.active = false; gestureRef.current.cancelled = true; gestureRef.current.distance = 0; }
        render();
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect(); const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }; cursorRef.current = point;
        const previous = pointsRef.current.get(event.pointerId); if (!previous) { render(); return; }
        pointsRef.current.set(event.pointerId, point); const points = [...pointsRef.current.values()]; const gesture = gestureRef.current;
        if (points.length >= 2) {
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          if (gesture.distance > 0) zoomBy(distance / gesture.distance, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
          gesture.distance = distance; gesture.cancelled = true;
        } else if (!gesture.cancelled) {
          if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 3) gesture.moved = true;
          if (propsRef.current.tool === 'pan') { viewRef.current.x += point.x - previous.x; viewRef.current.y += point.y - previous.y; }
          else if (!['city', 'capital'].includes(propsRef.current.tool) && gesture.moved) {
            if (!gesture.active) { propsRef.current.onStrokeStart(); gesture.active = true; propsRef.current.onStrokePoint(mapPoint(gesture.start)); }
            propsRef.current.onStrokePoint(mapPoint(point));
          }
        }
        render();
      }}
      onPointerUp={(event) => {
        const point = pointsRef.current.get(event.pointerId); if (!point) return;
        const gesture = gestureRef.current;
        if (pointsRef.current.size === 1 && !gesture.cancelled) {
          if (['city', 'capital'].includes(propsRef.current.tool) && !gesture.moved) propsRef.current.onPlace(mapPoint(point));
          else if (propsRef.current.tool !== 'pan') {
            if (!gesture.active) { propsRef.current.onStrokeStart(); propsRef.current.onStrokePoint(mapPoint(point)); }
            propsRef.current.onStrokeEnd(false);
          }
        }
        pointsRef.current.delete(event.pointerId); gesture.distance = 0;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => { if (gestureRef.current.active) propsRef.current.onStrokeEnd(true); gestureRef.current.active = false; gestureRef.current.cancelled = true; pointsRef.current.delete(event.pointerId); }}
      onPointerLeave={() => { cursorRef.current = null; render(); }}
    />
    <div className="studio-chart-label" aria-hidden="true"><span>山海工坊</span><small>创作沙盒 · 非正式世界设定</small></div>
    <div className="studio-compass" aria-hidden="true">北<span>↑</span></div>
    <div className="studio-map-controls"><button aria-label="放大工坊地图" onClick={() => zoomBy(1.3)}>＋</button><span data-testid="studio-zoom">{zoom}%</span><button aria-label="缩小工坊地图" onClick={() => zoomBy(1 / 1.3)}>−</button><button onClick={fit}>地图归位</button></div>
  </div>;
}
