import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { Army, Point, World } from '../sim/types';

type Props = {
  world: World;
  selectedArmyId: string;
  selectedProvinceId: string;
  route: string[];
  onArmySelect: (id: string) => void;
  onProvinceSelect: (id: string) => void;
};
type View = { x: number; y: number; scale: number };

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;

function armyPoint(army: Army, world: World): Point {
  const origin = world.provinces.find((p) => p.id === army.provinceId)?.center ?? { x: 0, y: 0 };
  const target = world.provinces.find((p) => p.id === army.route[0])?.center;
  if (target && (army.status === 'marching' || army.status === 'retreating')) {
    const progress = Math.min(1, Math.max(0, army.progress));
    return { x: origin.x + (target.x - origin.x) * progress, y: origin.y + (target.y - origin.y) * progress };
  }
  return origin;
}

function contains(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function label(text: string, x: number, y: number, size: number, fill: string, family = 'SimSun, Songti SC, serif') {
  const node = new Text({ text, style: { fontFamily: family, fontSize: size, fill, fontWeight: '600', align: 'center' } });
  node.anchor.set(0.5);
  node.position.set(x, y);
  return node;
}

function renderWorld(props: Props, layer: Container) {
  const { world, selectedArmyId, selectedProvinceId, route } = props;
  layer.removeChildren().forEach((child) => child.destroy({ children: true }));
  const water = new Graphics();
  for (let y = 40; y < MAP_HEIGHT; y += 48) {
    for (let x = (y % 96 ? 10 : 32); x < MAP_WIDTH; x += 72) {
      water.moveTo(x, y).bezierCurveTo(x + 7, y - 4, x + 13, y + 4, x + 21, y).stroke({ color: '#52798a', alpha: 0.17, width: 1 });
    }
  }
  layer.addChild(water);
  world.provinces.forEach((province) => {
    const nation = world.nations.find((n) => n.id === province.controller);
    const legal = world.nations.find((n) => n.id === province.legalOwner);
    const shape = new Graphics().poly(province.polygon.flatMap((p) => [p.x, p.y]))
      .fill({ color: nation?.color ?? '#627c70', alpha: 0.82 })
      .stroke({ color: '#183841', width: 2.5 });
    layer.addChild(shape);
    if (province.controller !== province.legalOwner) {
      layer.addChild(new Graphics().poly(province.polygon.flatMap((p) => [p.x, p.y])).stroke({ color: legal?.color ?? '#e8e0c6', width: 4, alpha: 0.8 }));
    }
    const terrain = new Graphics();
    const { x, y } = province.center;
    const offsets = [[-64, -9], [-44, -16], [43, -10], [63, -18]];
    if (province.terrain === 'mountain') {
      offsets.forEach(([dx, dy], index) => {
        const h = index % 2 ? 18 : 24;
        terrain.poly([x + dx - 12, y + dy + 11, x + dx, y + dy - h, x + dx + 15, y + dy + 11])
          .fill({ color: '#425553', alpha: 0.34 }).stroke({ color: '#243f43', alpha: 0.54, width: 1.2 });
        terrain.moveTo(x + dx, y + dy - h).lineTo(x + dx + 2, y + dy - 2).lineTo(x + dx + 15, y + dy + 11)
          .stroke({ color: '#eee6c9', alpha: 0.3, width: 1 });
      });
    } else if (province.terrain === 'forest') {
      offsets.forEach(([dx, dy], index) => {
        terrain.moveTo(x + dx, y + dy).lineTo(x + dx, y + dy + 14).stroke({ color: '#264a42', alpha: 0.65, width: 1.5 });
        terrain.poly([x + dx - 7, y + dy + 8, x + dx, y + dy - 8 - (index % 2) * 4, x + dx + 7, y + dy + 8]).fill({ color: '#2b5648', alpha: 0.56 });
      });
    } else {
      offsets.slice(1, 4).forEach(([dx, dy]) => {
        terrain.moveTo(x + dx - 4, y + dy + 5).lineTo(x + dx + 4, y + dy + 5).stroke({ color: '#263e35', alpha: 0.22, width: 1 });
      });
    }
    layer.addChild(terrain);
  });

  const roads = new Graphics();
  world.provinces.forEach((province) => province.neighbors.filter((id) => id > province.id).forEach((id) => {
    const destination = world.provinces.find((p) => p.id === id);
    if (destination) roads.moveTo(province.center.x, province.center.y).lineTo(destination.center.x, destination.center.y)
      .stroke({ color: '#f3e1b4', alpha: 0.22, width: 2 });
  }));
  layer.addChild(roads);

  const selectedProvince = world.provinces.find((p) => p.id === selectedProvinceId);
  if (selectedProvince) layer.addChild(new Graphics().poly(selectedProvince.polygon.flatMap((p) => [p.x, p.y]))
    .fill({ color: '#fff4d2', alpha: 0.08 }).stroke({ color: '#f2df9f', width: 3.4 }));

  world.provinces.forEach((province) => layer.addChild(label(province.name, province.label.x, province.label.y, 17, '#152f37')));
  world.cities.forEach((city) => {
    const capital = world.nations.some((nation) => nation.capitalId === city.id);
    const marker = new Graphics();
    if (capital) marker.circle(city.position.x, city.position.y, 8).stroke({ color: '#f6e9c8', width: 1.5 });
    marker.rect(city.position.x - 3.5, city.position.y - 3.5, 7, 7).fill('#eee3c6').stroke({ color: '#173742', width: 1.5 });
    layer.addChild(marker, label(city.name, city.label.x, city.label.y, 12, '#eff0da', 'Microsoft YaHei, sans-serif'));
  });

  const selectedArmy = world.armies.find((army) => army.id === selectedArmyId);
  const visibleRoute = route.length ? route : (selectedArmy?.route ?? []);
  if (selectedArmy && visibleRoute.length) {
    const path = new Graphics();
    const origin = armyPoint(selectedArmy, world);
    path.moveTo(origin.x, origin.y);
    visibleRoute.forEach((id) => {
      const province = world.provinces.find((p) => p.id === id);
      if (province) path.lineTo(province.center.x, province.center.y);
    });
    path.stroke({ color: '#ffe5a0', width: 3.5, alpha: 0.96 });
    visibleRoute.forEach((id) => {
      const province = world.provinces.find((p) => p.id === id);
      if (province) path.circle(province.center.x, province.center.y, 4).fill('#ffe5a0');
    });
    layer.addChild(path);
  }

  world.armies.filter((army) => army.status !== 'destroyed').forEach((army) => {
    const point = armyPoint(army, world);
    // Stable displacement keeps co-located armies individually selectable.
    const colocated = world.armies.filter((other) => other.provinceId === army.provinceId && other.status !== 'destroyed');
    const offset = (colocated.findIndex((other) => other.id === army.id) - (colocated.length - 1) / 2) * 36;
    const x = point.x + offset + 29;
    const y = point.y + 12;
    const color = world.nations.find((nation) => nation.id === army.nationId)?.color ?? '#cbaa76';
    const flag = new Graphics();
    if (army.id === selectedArmyId) flag.circle(x, y - 9, 23).fill({ color: '#fff3c4', alpha: 0.16 }).stroke({ color: '#ffedb9', width: 2 });
    flag.moveTo(x - 10, y + 12).lineTo(x - 10, y - 26).stroke({ color: '#f2e6c9', width: 2 });
    flag.poly([x - 9, y - 26, x + 16, y - 26, x + 12, y - 16, x + 16, y - 6, x - 9, y - 6]).fill(color).stroke({ color: '#152d36', width: 1.5 });
    layer.addChild(flag, label(army.name.slice(0, 1), x + 1, y - 16, 12, '#102a32'), label(`${Math.round(army.troops / 100) / 10}千`, x, y + 22, 11, '#fbefd0', 'Microsoft YaHei, sans-serif'));
  });
}

export function MapCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldLayerRef = useRef<Container | null>(null);
  const propsRef = useRef(props);
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  const fitScaleRef = useRef(1);
  const pointsRef = useRef(new Map<number, Point>());
  const gestureRef = useRef({ moved: false, start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, distance: 0 });
  const [mapError, setMapError] = useState('');
  const [zoomLabel, setZoomLabel] = useState(100);

  function applyView() {
    const layer = worldLayerRef.current;
    const app = appRef.current;
    if (!layer || !app) return;
    const view = viewRef.current;
    layer.position.set(view.x, view.y);
    layer.scale.set(view.scale);
    app.render();
    setZoomLabel(Math.round(view.scale / fitScaleRef.current * 100));
  }

  function resetView() {
    const host = hostRef.current;
    if (!host) return;
    const scale = Math.min(host.clientWidth / MAP_WIDTH, host.clientHeight / MAP_HEIGHT) * 0.96;
    fitScaleRef.current = scale;
    viewRef.current = { x: (host.clientWidth - MAP_WIDTH * scale) / 2, y: (host.clientHeight - MAP_HEIGHT * scale) / 2, scale };
    applyView();
  }

  function zoom(factor: number, point?: Point) {
    const host = hostRef.current;
    if (!host) return;
    const anchor = point ?? { x: host.clientWidth / 2, y: host.clientHeight / 2 };
    const view = viewRef.current;
    const next = Math.max(fitScaleRef.current * 0.7, Math.min(fitScaleRef.current * 4, view.scale * factor));
    const ratio = next / view.scale;
    viewRef.current = { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, scale: next };
    applyView();
  }

  useEffect(() => {
    propsRef.current = props;
    if (worldLayerRef.current && appRef.current) {
      renderWorld(props, worldLayerRef.current);
      appRef.current.render();
    }
  }, [props]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialized = false;
    const app = new Application();
    let observer: ResizeObserver | undefined;
    void app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), antialias: true, background: '#102d3b', resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, autoStart: false, preference: 'webgl' }).then(() => {
      initialized = true;
      if (disposed) { app.destroy(true, { children: true }); return; }
      appRef.current = app;
      app.canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(app.canvas);
      const layer = new Container();
      worldLayerRef.current = layer;
      app.stage.addChild(layer);
      renderWorld(propsRef.current, layer);
      const resize = () => {
        app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
        const scale = Math.min(host.clientWidth / MAP_WIDTH, host.clientHeight / MAP_HEIGHT) * 0.96;
        fitScaleRef.current = scale;
        viewRef.current = { x: (host.clientWidth - MAP_WIDTH * scale) / 2, y: (host.clientHeight - MAP_HEIGHT * scale) / 2, scale };
        layer.position.set(viewRef.current.x, viewRef.current.y);
        layer.scale.set(scale);
        app.render();
        setZoomLabel(100);
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(host);
    }).catch((error: unknown) => {
      if (!disposed) setMapError(`地图渲染未启动：${error instanceof Error ? error.message : String(error)}。仍可通过军队与地区列表操作。`);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      appRef.current = null;
      worldLayerRef.current = null;
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const view = viewRef.current;
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const next = Math.max(fitScaleRef.current * 0.7, Math.min(fitScaleRef.current * 4, view.scale * Math.exp(-event.deltaY * 0.0015)));
      const ratio = next / view.scale;
      viewRef.current = { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, scale: next };
      if (worldLayerRef.current && appRef.current) {
        worldLayerRef.current.position.set(viewRef.current.x, viewRef.current.y);
        worldLayerRef.current.scale.set(next);
        appRef.current.render();
        setZoomLabel(Math.round(next / fitScaleRef.current * 100));
      }
    };
    host.addEventListener('wheel', wheel, { passive: false });
    return () => host.removeEventListener('wheel', wheel);
  }, []);

  function pick(point: Point) {
    const view = viewRef.current;
    const position = { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
    const { world } = props;
    const army = [...world.armies].reverse().find((candidate) => {
      if (candidate.status === 'destroyed') return false;
      const location = armyPoint(candidate, world);
      const colocated = world.armies.filter((other) => other.provinceId === candidate.provinceId && other.status !== 'destroyed');
      const offset = (colocated.findIndex((other) => other.id === candidate.id) - (colocated.length - 1) / 2) * 36;
      return Math.hypot(position.x - location.x - offset - 29, position.y - location.y + 3) < Math.max(22, 20 / view.scale);
    });
    if (army) { props.onArmySelect(army.id); return; }
    const province = world.provinces.find((candidate) => contains(position, candidate.polygon));
    if (province) props.onProvinceSelect(province.id);
  }

  return <section className="map-section" aria-label="可交互测试大陆地图">
    <div className="map-kicker"><span>列国舆图</span><span>沙盒推演 · 实际控制</span></div>
    <div ref={hostRef} className="map-canvas" data-testid="map-canvas" role="img" aria-label="测试大陆。单指拖动，双指或滚轮缩放；通过军队列表和地区列表也可选择。"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointsRef.current.set(event.pointerId, point);
        if (pointsRef.current.size === 1) gestureRef.current = { moved: false, start: point, last: point, distance: 0 };
        else { gestureRef.current.moved = true; gestureRef.current.distance = 0; }
      }}
      onPointerMove={(event) => {
        if (!pointsRef.current.has(event.pointerId)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const previous = pointsRef.current.get(event.pointerId)!;
        pointsRef.current.set(event.pointerId, point);
        const points = [...pointsRef.current.values()];
        if (points.length === 2) {
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          if (gestureRef.current.distance > 0) zoom(distance / gestureRef.current.distance, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
          gestureRef.current.distance = distance;
          gestureRef.current.moved = true;
        } else if (points.length === 1) {
          const gesture = gestureRef.current;
          if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 7) gesture.moved = true;
          if (gesture.moved) {
            viewRef.current.x += point.x - previous.x;
            viewRef.current.y += point.y - previous.y;
            applyView();
          }
        }
        gestureRef.current.last = point;
      }}
      onPointerUp={(event) => {
        if (!pointsRef.current.has(event.pointerId)) return;
        const point = pointsRef.current.get(event.pointerId)!;
        if (!gestureRef.current.moved && pointsRef.current.size === 1) pick(point);
        pointsRef.current.delete(event.pointerId);
        gestureRef.current.distance = 0;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => { pointsRef.current.delete(event.pointerId); gestureRef.current.moved = true; gestureRef.current.distance = 0; }}
    />
    {mapError && <p className="map-error" role="alert">{mapError}</p>}
    <div className="map-compass" aria-hidden="true"><span>北</span><i /><small>N</small></div>
    <div className="map-tools" aria-label="地图视角">
      <button onClick={() => zoom(1.25)} aria-label="放大地图">＋</button>
      <span aria-live="off">{zoomLabel}%</span>
      <button onClick={() => zoom(0.8)} aria-label="缩小地图">−</button>
      <button onClick={resetView}>归位</button>
    </div>
    <div className="map-hint">拖动查看 · 缩放舆图 · 点选地区下令</div>
  </section>;
}
