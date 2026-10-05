import { assertFmsDocument, type FmsDocument } from '../model';
import { initializeStatecraft, validateWorld } from '../../compat/v0_4/sim/core';
import type { Point, World } from '../../sim/types';
import { worldNames } from './names';
import { statePalette } from './politics';

import legacyManifest from '../../compat/v0_4/manifest.json';
import { militaryRules,supportedMilitaryEngine,mobilizationFingerprint,navalFingerprint } from './military-registry';
import type { UnitAssignments } from './military-profile';
import { assertNavy, type Navy } from './navy';
import { seaGraph,type SeaGraph } from './sea-path';
import {assertNavy as assertFrozenNavy} from './compat/naval1/fms/play/navy';
import {seaGraph as frozenSeaGraph} from './compat/naval1/fms/play/sea-path';
import {assertClock,type SimClock} from './clock';
type RunBase = {id:string;engine:string;terrain:FmsDocument;scale:number;world:World};
export type FmsRun = RunBase & ({version:1}|{version:2;rules:'fms-military-1';units:UnitAssignments}|{version:3;rules:'fms-naval-1';units:UnitAssignments;navy:Navy}|{version:4;rules:'fms-realtime-1';units:UnitAssignments;navy:Navy;clock:SimClock});
export const runEngine = (version:1|2|3|4=1) => version===1?legacyManifest.engineFingerprint:version===2?mobilizationFingerprint:version===3?navalFingerprint:__FMS_PLAY_ENGINE__;
type Vertex = Point & { key: string };
type Face = { ring: Vertex[]; neighbors: number[]; height: number };
const edgeKey = (a: Vertex, b: Vertex) => a.key < b.key ? `${a.key}/${b.key}` : `${b.key}/${a.key}`;
export const polygonArea = (p: Point[]) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;

/** Clip the same float32 mesh at the renderer's h=20 contour. Shared vertices
 * retain canonical identities; neither proximity nor convex hulls create land. */
function landFaces(doc: FmsDocument): Face[] {
  const points = doc.points.map((p, i) => ({ x: Math.fround(p[0]), y: Math.fround(p[1]), key: `p${i}` }));
  const crossings = new Map<string, Vertex>(), faces: Face[] = [];
  const crossing = (a: number, b: number) => {
    if (a > b) [a, b] = [b, a];
    if (doc.elevations[a] === 20) return points[a];
    if (doc.elevations[b] === 20) return points[b];
    const key = `e${a}:${b}`, old = crossings.get(key); if (old) return old;
    const t = (20 - doc.elevations[a]) / (doc.elevations[b] - doc.elevations[a]);
    const v = { key, x: points[a].x + t * (points[b].x - points[a].x), y: points[a].y + t * (points[b].y - points[a].y) };
    crossings.set(key, v); return v;
  };
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const ids = Array.from(doc.triangles.slice(offset, offset + 3));
    if (!ids.some(id => doc.elevations[id] > 20)) continue;
    const ring: Vertex[] = [];
    for (let i = 0; i < 3; i++) {
      const a = ids[i], b = ids[(i + 1) % 3], insideA = doc.elevations[a] >= 20, insideB = doc.elevations[b] >= 20;
      if (insideA) ring.push(points[a]);
      if (insideA !== insideB) ring.push(crossing(a, b));
    }
    const unique = [...new Map(ring.map(v => [v.key, v])).values()];
    if (unique.length < 3 || polygonArea(unique) < 1e-7) continue;
    // Uniform orientation makes shared-edge cancellation deterministic.
    if (unique.reduce((sum, a, i) => { const b = unique[(i + 1) % unique.length]; return sum + a.x * b.y - b.x * a.y; }, 0) < 0) unique.reverse();
    faces.push({ ring: unique, neighbors: [], height: ids.reduce((s, id) => s + doc.elevations[id], 0) / 3 });
  }
  const owners = new Map<string, number>();
  faces.forEach((face, i) => face.ring.forEach((v, j) => {
    const key = edgeKey(v, face.ring[(j + 1) % face.ring.length]), other = owners.get(key);
    if (other !== undefined) { faces[other].neighbors.push(i); face.neighbors.push(other); } else owners.set(key, i);
  }));
  return faces;
}

/** Union along shared edges only; reject holes, point contacts and >200 vertices
 * instead of silently filling sea or changing the economy's land area. */
function mergeRing(a: Vertex[], b: Vertex[]): Vertex[] | null {
  const edges = new Map<string, [Vertex, Vertex]>(); let shared = 0;
  for (const ring of [a, b]) for (let i = 0; i < ring.length; i++) {
    const from = ring[i], to = ring[(i + 1) % ring.length], key = edgeKey(from, to);
    if (edges.has(key)) { edges.delete(key); shared++; } else edges.set(key, [from, to]);
  }
  if (!shared || edges.size < 3 || edges.size > 200) return null;
  const outgoing = new Map<string, [Vertex, Vertex]>();
  for (const edge of edges.values()) { if (outgoing.has(edge[0].key)) return null; outgoing.set(edge[0].key, edge); }
  const start = edges.values().next().value![0], ring: Vertex[] = []; let next = start;
  while (outgoing.has(next.key)) { const edge = outgoing.get(next.key)!; ring.push(next); outgoing.delete(next.key); next = edge[1]; }
  return next.key === start.key && !outgoing.size ? ring : null;
}

export function createFmsRun(document: FmsDocument, countryCount = 6, relations: 'peace' | 'war' = 'peace'): Extract<FmsRun,{version:1}> {
  assertFmsDocument(document);
  if (!Number.isInteger(countryCount) || countryCount < 2 || countryCount > 8) throw new Error('请选择 2—8 个国家。');
  const terrain = structuredClone(document), faces = landFaces(terrain), scale = 1000 / Math.max(terrain.width, terrain.height);
  if (faces.length < 2) throw new Error('请先画出足够的陆地，再创建世界。');
  const assigned = new Int32Array(faces.length).fill(-1), regions: { ring: Vertex[]; center: Point; height: number; neighbors: Set<number> }[] = [];
  for (let start = 0; start < faces.length; start++) {
    if (assigned[start] >= 0) continue;
    let ring = faces[start].ring; const id = regions.length, queue = [start], visited = new Set(queue);
    assigned[start] = id; let count = 1, height = faces[start].height;
    for (let head = 0; head < queue.length && count < 160; head++) for (const next of faces[queue[head]].neighbors) {
      if (assigned[next] >= 0 || visited.has(next)) continue;
      visited.add(next); const merged = mergeRing(ring, faces[next].ring); if (!merged) continue;
      ring = merged; assigned[next] = id; queue.push(next); count++; height += faces[next].height;
      if (count >= 160) break;
    }
    // Interior of a constituent convex face, not the possibly-exterior centroid of a concave union.
    const face = faces[start].ring, center = { x: face.reduce((s, v) => s + v.x, 0) / face.length, y: face.reduce((s, v) => s + v.y, 0) / face.length };
    regions.push({ ring, center, height: height / count, neighbors: new Set() });
  }
  // Tiny numerical slivers cannot satisfy core's 0.01 minimum area. Keep the
  // draft intact and ask for a less fragmented playable copy, never drop land.
  if (regions.length > 1000 || regions.some(r => polygonArea(r.ring) * scale * scale < .01)) throw new Error('这张地图的极小碎片过多，暂不能生成可靠的推演辖区；原稿已保留。请减少孤立碎点后重试。');
  faces.forEach((face, i) => face.neighbors.forEach(j => { if (assigned[i] !== assigned[j]) regions[assigned[i]].neighbors.add(assigned[j]); }));
  countryCount = Math.min(countryCount, regions.length);
  if (countryCount < 2) throw new Error('陆地太小，请扩大大陆后再创建多个国家。');
  const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const seeds = [regions.reduce((best, r, i) => polygonArea(r.ring) > polygonArea(regions[best].ring) ? i : best, 0)];
  while (seeds.length < countryCount) {
    let best = -1, score = -1;
    regions.forEach((r, i) => { if (seeds.includes(i)) return; const d = Math.min(...seeds.map(s => distance(r.center, regions[s].center))); if (d > score) { best = i; score = d; } });
    seeds.push(best);
  }
  const owners = new Int32Array(regions.length).fill(-1), queue = [...seeds]; seeds.forEach((s, i) => { owners[s] = i; });
  for (let head = 0; head < queue.length; head++) for (const next of regions[queue[head]].neighbors) if (owners[next] < 0) { owners[next] = owners[queue[head]]; queue.push(next); }
  // Disconnected islands may belong to a nearby state, but gain NO sea routes.
  regions.forEach((r, i) => { if (owners[i] < 0) owners[i] = seeds.reduce((best, s, n) => distance(r.center, regions[s].center) < distance(r.center, regions[seeds[best]].center) ? n : best, 0); });
  const {countries:names,places}=worldNames(terrain.worldId,regions.length), colors = statePalette;
  const point = (v: Point) => ({ x: v.x * scale, y: v.y * scale });
  const provinces = regions.map((r, i) => ({ id: `p-${i}`, name: places[i], polygon: r.ring.map(point), center: point(r.center), label: point(r.center), terrain: r.height > 65 ? 'mountain' as const : r.height > 45 ? 'forest' as const : 'plain' as const, legalOwner: `n-${owners[i]}`, controller: `n-${owners[i]}`, neighbors: [...r.neighbors].map(n => `p-${n}`), supply: 80 }));
  const cities = regions.flatMap((r, i) => seeds.includes(i) || (i % 4 === 0 && polygonArea(r.ring) * scale * scale > 100) ? [{ id: `c-${i}`, name: places[i], provinceId: `p-${i}`, position: point(r.center), label: point(r.center), fort: seeds.includes(i) ? 2 : 1 }] : []);
  const nations = seeds.map((s, i) => ({ id: `n-${i}`, name: names[i], color: colors[i], capitalId: `c-${s}`, regimeId: `regime-${i}`, dynastyId: `dynasty-${i}` }));
  const armies = seeds.map((s, i) => ({ id: `a-${i}`, name: `${names[i]}军`, nationId: `n-${i}`, provinceId: `p-${s}`, originId: `p-${s}`, troops: 2400 + (i % 3) * 800, morale: 85, supplies: 100, status: 'idle' as const, route: [], progress: 0 }));
  const id = `fms-${crypto.randomUUID()}`;
  const base: World = { schemaVersion: 1, rulesVersion: '0.1.0', scenario: 'custom-world', custom: { id, name: '我的诸国世界', seed: terrain.worldId, rivers: [] }, mode: 'sandbox', day: 0, nations, provinces, cities, armies, events: [], nextEventId: 1 };
  if (!validateWorld(base)) throw new Error('生成的世界未通过规则校验，原稿未改动。');
  const world = initializeStatecraft(base, relations);
  return { version: 1, id, engine: runEngine(), terrain, scale, world };
}

export function assertFmsRun(value: unknown): asserts value is FmsRun {
  assertRun(value);
}
/** Session-only output check. The initial terrain is fully validated on input;
 * an internal movement step cannot edit it. Mutable state is still validated
 * before committing each command, and storage always uses assertFmsRun. */
export function assertRealtimeStep(previous:Extract<FmsRun,{version:4}>,next:Extract<FmsRun,{version:4}>,graph:SeaGraph){
  if(previous.terrain!==next.terrain||previous.scale!==next.scale)throw Error('日内推进不能修改地形。');
  const sameGeometry=previous.world.provinces.length===next.world.provinces.length&&previous.world.provinces.every((p,i)=>p.id===next.world.provinces[i].id&&p.polygon===next.world.provinces[i].polygon);
  assertRun(next,{terrain:previous.terrain,graph:sameGeometry?graph:undefined});
}
function assertRun(value:unknown,trusted?:{terrain:FmsDocument;graph?:SeaGraph}):asserts value is FmsRun {
  const r = value as FmsRun;
  if (!r || ![1,2,3,4].includes(r.version) || !(r.version===1?r.engine===runEngine(1):r.version===2?supportedMilitaryEngine(r.engine):r.engine===runEngine(r.version)) || (r.version!==1&&(r.rules!==(r.version===2?'fms-military-1':r.version===3?'fms-naval-1':'fms-realtime-1')||!r.units||typeof r.units!=='object'||Array.isArray(r.units)))) throw new Error('推演存档版本或规则不同，已保留原档并锁定写入。');
  const keys=['version','id','engine','terrain','scale','world',...(r.version!==1?['rules','units']:[]),...(r.version===3||r.version===4?['navy']:[]),...(r.version===4?['clock']:[])];
  if(Object.keys(r).length!==keys.length||!keys.every(k=>Object.hasOwn(r,k)))throw new Error('推演存档含未知字段，已锁定写入。');
  if(trusted?.terrain!==r.terrain){
    assertFmsDocument(r.terrain);
    if((r.version===3||r.version===4)&&r.terrain.elevations.some(h=>h!==Math.fround(h)))throw Error('此地形高程超出海军版的精确渲染范围，请保留原世界继续旧规则。');
  }
  if (!(r.version!==1?militaryRules(r.engine,r.units):{validateWorld}).validateWorld(r.world) || r.world.schemaVersion !== 2 || r.world.scenario !== 'custom-world' || r.id !== r.world.custom?.id || r.scale !== 1000 / Math.max(r.terrain.width, r.terrain.height)) throw new Error('推演存档数据损坏，原档已保留。');
  if(r.version===3)assertFrozenNavy(r.navy,r.world,frozenSeaGraph(r.terrain,r.world));
  if(r.version===4){assertClock(r.clock,r.world.day);assertNavy(r.navy,r.world,trusted?.graph??seaGraph(r.terrain,r.world));}
}

export function provinceAt(world: World, point: Point): string | null {
  for (const province of world.provinces) {
    let inside = false; const ring = province.polygon;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
    if (inside) return province.id;
  }
  return null;
}
