import { Delaunay } from 'd3-delaunay';
import { createGenerationDraft, verifyGenerationDocument } from './generation-format';
import { generationArray, generationExact, generationHash, generationInt, type AtlasDetailCoastDocument } from './generation-contract';
import { hashBlock, yieldAtlas, type AtlasControl } from './model';
import { detailCoastKey, detailCoastOwnerLayout } from './detail-coast-types';
import { hashDetailCoastTile } from './detail-coast-codec';
import { buildDetailShapeDistanceIndex, DETAIL_DISTANCE_MAX_SEGMENTS, type DetailShapeDistanceIndex } from './generation/detail-shape-distance';

export const TERRAIN_IMPORT_LIMITS = Object.freeze({ bytes: 12 * 1024 * 1024, points: 50000, triangles: 100000, sampleSteps: 64000000, distanceWork: 256000000 });
export interface TerrainImportSummary {
  readonly sourceSha256: string; readonly sourceBytes: number; readonly pointCount: number; readonly triangleCount: number;
  readonly width: number; readonly height: number; readonly seed: string; readonly template: string;
  readonly sourceHeightHash: string; readonly sourceTopologyHash: string; readonly converter: 'research-to-atlas-v4-v1';
  readonly mapping: Readonly<{ scale: number; offsetX: number; offsetY: number; width: number; height: number; seaLevel: 20; metersPerUnit: 100; outerSeaMeters: -2000; note: string }>;
}
/** The verified numeric mesh remains private to the parsing Worker. A cloned
 * or caller-made summary is not a capability to create geography. */
export interface ParsedTerrainImport { readonly summary: TerrainImportSummary }
export interface TerrainImportOptions { name: string; size?: 128 | 256 | 512; draftId?: string; atlasId?: string }
interface TerrainMesh { points: Float64Array; heights: Uint8Array; triangles: Uint32Array; halfedges: Int32Array; denominators: Float64Array }
const accepted = new WeakMap<ParsedTerrainImport, TerrainMesh>();
const label = (raw: unknown, max = 80): raw is string => typeof raw === 'string' && raw.trim() === raw && raw.length > 0 && raw.length <= max
  && ![...raw].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const finite = (raw: unknown, min: number, max: number): raw is number => typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max;
async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
}
function triangleKey(a: number, b: number, c: number): string {
  return [a, b, c].sort((x, y) => x - y).join(':');
}
function denominator(points: Float64Array, a: number, b: number, c: number) {
  return (points[b * 2 + 1] - points[c * 2 + 1]) * (points[a * 2] - points[c * 2]) + (points[c * 2] - points[b * 2]) * (points[a * 2 + 1] - points[c * 2 + 1]);
}

/** All supplied triangles must equal a newly computed canonical Delaunay set.
 * Rectangle corners plus in-bounds unique points prove the hull is the complete
 * rectangle. Equality to the full mesh rejects overlaps, holes, disconnection,
 * duplicates and omitted vertices without depending on triangle order/winding. */
async function verifiedMesh(points: Float64Array, heights: Uint8Array, triangles: Uint32Array, width: number, height: number, control?: AtlasControl): Promise<TerrainMesh> {
  await yieldAtlas(control, '复算导入地形三角网', 0, points.length / 2);
  const delaunay = new Delaunay(points);
  await yieldAtlas(control, '复算导入地形三角网', points.length / 2, points.length / 2);
  if (delaunay.triangles.length !== triangles.length) throw new Error('输入三角网没有完整覆盖全部地形节点。');
  const canonical = new Set<string>(), used = new Uint8Array(heights.length), denominators = new Float64Array(triangles.length / 3);
  for (let index = 0; index < delaunay.triangles.length; index += 3) {
    const a = delaunay.triangles[index], b = delaunay.triangles[index + 1], c = delaunay.triangles[index + 2];
    const area = denominator(points, a, b, c);
    if (!Number.isFinite(area) || Math.abs(area) <= width * height * 1e-12) throw new Error('输入三角网含退化或过细的三角形。');
    denominators[index / 3] = area; canonical.add(triangleKey(a, b, c));
    used[a] = used[b] = used[c] = 1;
    if (index % 6144 === 0) await yieldAtlas(control, '核验完整地形拓扑', index, triangles.length);
  }
  if (used.some(value => value !== 1) || canonical.size !== triangles.length / 3) throw new Error('输入地形含未连接的节点或重复拓扑。');
  for (let index = 0; index < triangles.length; index += 3) {
    if (!canonical.delete(triangleKey(triangles[index], triangles[index + 1], triangles[index + 2]))) throw new Error('输入三角形重叠、重复或不属于完整 Delaunay 拓扑。');
    if (index % 6144 === 0) await yieldAtlas(control, '比对导入三角形', index, triangles.length);
  }
  if (canonical.size) throw new Error('输入三角网存在缺口。');
  return { points, heights, triangles: Uint32Array.from(delaunay.triangles), halfedges: Int32Array.from(delaunay.halfedges), denominators };
}

export async function parseTerrainImport(bytes: Uint8Array, control?: AtlasControl): Promise<ParsedTerrainImport> {
  control?.signal?.throwIfAborted();
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.length < 2 || bytes.length > TERRAIN_IMPORT_LIMITS.bytes) throw new Error('地形导入只接受不超过 12 MiB 的 JSON 字节。');
  const owned = new Uint8Array(bytes); // Own the input synchronously, before any yield.
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(owned));
  if (!generationExact(raw, ['format', 'version', 'id', 'width', 'height', 'seed', 'template', 'heights', 'count', 'seaLevel', 'cellsX', 'cellsY', 'points', 'triangles', 'topology', 'topologyHash', 'hash', 'topologyMs', 'generationMs', 'elapsedMs', 'rendering'])
    || raw.format !== 'fms-terrain-research' || raw.version !== 2 || !generationInt(raw.id, 1, Number.MAX_SAFE_INTEGER)
    || !finite(raw.width, 1, 1000000) || !finite(raw.height, 1, 1000000) || !label(raw.seed) || !label(raw.template) || raw.seaLevel !== 20
    || !generationInt(raw.count, 4, TERRAIN_IMPORT_LIMITS.points) || !generationInt(raw.cellsX, 2, 50000) || !generationInt(raw.cellsY, 2, 50000) || raw.cellsX * raw.cellsY !== raw.count
    || !finite(raw.topologyMs, 0, 3600000) || !finite(raw.generationMs, 0, 3600000) || !finite(raw.elapsedMs, 0, 3600000) || !label(raw.rendering, 256)
    || !generationHash(raw.hash) || !generationHash(raw.topologyHash) || !generationArray(raw.points) || raw.points.length !== raw.count
    || !generationArray(raw.heights) || raw.heights.length !== raw.count || !generationArray(raw.triangles) || raw.triangles.length < 6 || raw.triangles.length % 3 || raw.triangles.length > TERRAIN_IMPORT_LIMITS.triangles * 3) throw new Error('地形研究文件字段、版本、尺寸或容量无效。');
  const topology = raw.topology;
  if (!generationExact(topology, ['kind', 'description', 'seed', 'jitterFraction', 'columns', 'rows', 'pointCount', 'triangleCount', 'boundary', 'cellsDesired', 'originalUnityTopologyRecovered'])
    || topology.kind !== 'web-jittered-delaunay-v1' || !label(topology.description, 256) || !generationInt(topology.seed, 0, 0xffffffff) || !finite(topology.jitterFraction, 0, 0.49)
    || topology.columns !== raw.cellsX || topology.rows !== raw.cellsY || topology.pointCount !== raw.count || topology.triangleCount !== raw.triangles.length / 3
    || topology.boundary !== 'rectangle-edge-sites' || !generationInt(topology.cellsDesired, 1, 1000000) || topology.originalUnityTopologyRecovered !== false) throw new Error('地形拓扑声明与实际数据不一致。');
  const points = new Float64Array(raw.count * 2), heights = new Uint8Array(raw.count), triangles = new Uint32Array(raw.triangles.length), distinct = new Set<string>();
  for (let index = 0; index < raw.count; index++) {
    const point = raw.points[index], height = raw.heights[index];
    if (!generationArray(point) || point.length !== 2 || !finite(point[0], 0, raw.width) || !finite(point[1], 0, raw.height) || !generationInt(height, 0, 100)) throw new Error('地形节点坐标或相对高程无效。');
    const key = `${point[0]},${point[1]}`; if (distinct.has(key)) throw new Error('地形节点坐标重复。'); distinct.add(key);
    points[index * 2] = point[0]; points[index * 2 + 1] = point[1]; heights[index] = height;
    if (index % 2048 === 0) await yieldAtlas(control, '核验导入地形节点', index, raw.count);
  }
  for (const corner of [`0,0`, `${raw.width},0`, `0,${raw.height}`, `${raw.width},${raw.height}`]) if (!distinct.has(corner)) throw new Error('地形节点未覆盖完整矩形四角，不能填造缺失地形。');
  for (let index = 0; index < raw.triangles.length; index++) {
    const vertex = raw.triangles[index];
    if (!generationInt(vertex, 0, raw.count - 1)) throw new Error('地形三角索引超出节点范围。'); triangles[index] = vertex;
  }
  const topologyBytes = new Uint8Array(points.byteLength + triangles.byteLength), view = new DataView(topologyBytes.buffer);
  for (let index = 0; index < points.length; index++) view.setFloat64(index * 8, points[index], true);
  for (let index = 0; index < triangles.length; index++) view.setUint32(points.byteLength + index * 4, triangles[index], true);
  const sourceHeightHash = await digest(heights), sourceTopologyHash = await digest(topologyBytes), sourceSha256 = await digest(owned);
  control?.signal?.throwIfAborted();
  if (sourceHeightHash !== raw.hash || sourceTopologyHash !== raw.topologyHash) throw new Error('地形高程或三角网摘要不匹配。');
  const mesh = await verifiedMesh(points, heights, triangles, raw.width, raw.height, control);
  const scale = 4096 / Math.max(raw.width, raw.height), width = raw.width * scale, height = raw.height * scale;
  const summary: TerrainImportSummary = Object.freeze({ sourceSha256, sourceBytes: owned.length, pointCount: raw.count, triangleCount: triangles.length / 3,
    width: raw.width, height: raw.height, seed: raw.seed, template: raw.template, sourceHeightHash, sourceTopologyHash, converter: 'research-to-atlas-v4-v1',
    mapping: Object.freeze({ scale, offsetX: (4096 - width) / 2, offsetY: (4096 - height) / 2, width, height, seaLevel: 20, metersPerUnit: 100, outerSeaMeters: -2000,
      note: '等比居中重采样；米数=100×(原相对高程−20)，是转换器约定而非原作实测。原矩形外填−2000米深海；细场步长2世界单位。覆盖值为距量化海岸的真实Q8距离；恰在岸线上的节点高程归零。' }) });
  const parsed: ParsedTerrainImport = Object.freeze({ summary }); accepted.set(parsed, mesh); return parsed;
}

/** A bounded halfedge walk retains locality between neighbouring samples.
 * The whole conversion has a hard triangle-visit budget; no missing query is
 * replaced with an invented height if input exceeds this supported workload. */
function sampler(mesh: TerrainMesh, summary: TerrainImportSummary, control?: AtlasControl) {
  let last = 0, steps = 0;
  const { points, triangles, halfedges, denominators, heights } = mesh, mapping = summary.mapping;
  return (worldX: number, worldY: number): number => {
    if (worldX < mapping.offsetX || worldY < mapping.offsetY || worldX > mapping.offsetX + mapping.width || worldY > mapping.offsetY + mapping.height) return 0;
    const x = Math.max(0, Math.min(summary.width, (worldX - mapping.offsetX) / mapping.scale)), y = Math.max(0, Math.min(summary.height, (worldY - mapping.offsetY) / mapping.scale));
    for (let attempt = 0; attempt < denominators.length; attempt++) {
      if (++steps > TERRAIN_IMPORT_LIMITS.sampleSteps) throw new Error('地形采样超过有界三角查询预算，本次未创建草稿。');
      if (steps % 4096 === 0) control?.signal?.throwIfAborted();
      const edge = last * 3, ia = triangles[edge], ib = triangles[edge + 1], ic = triangles[edge + 2], denominator = denominators[last];
      const cx = points[ic * 2], cy = points[ic * 2 + 1];
      const a = ((points[ib * 2 + 1] - cy) * (x - cx) + (cx - points[ib * 2]) * (y - cy)) / denominator;
      const b = ((cy - points[ia * 2 + 1]) * (x - cx) + (points[ia * 2] - cx) * (y - cy)) / denominator, c = 1 - a - b;
      if (a >= -1e-10 && b >= -1e-10 && c >= -1e-10) {
        const wa = Math.max(0, a), wb = Math.max(0, b), wc = Math.max(0, c);
        return (wa * heights[ia] + wb * heights[ib] + wc * heights[ic]) / (wa + wb + wc);
      }
      const opposite = a <= b && a <= c ? 1 : b <= c ? 2 : 0, neighbor = halfedges[edge + opposite];
      if (neighbor < 0) throw new Error('完整矩形内未找到地形三角形，拒绝补造海陆。');
      last = Math.floor(neighbor / 3);
    }
    throw new Error('地形三角查询未收敛，本次未创建草稿。');
  };
}
function signed(value: number, factor: number): number {
  return value === 0 ? 0 : value < 0 ? Math.min(-1, Math.round(value * factor)) : Math.max(1, Math.round(value * factor));
}
function relativeHeight(value: number): number { const difference = value - 20; return Math.abs(difference) <= 1e-10 ? 0 : difference; }

/** Source triangles provide the exact piecewise-linear h=20 coast. Short Q8
 * segments retain the existing distance codec's numerical contract. Clip-box
 * coast is added only where mapped land meets the explicit outer sea. */
async function coastDistance(mesh: TerrainMesh, summary: TerrainImportSummary, control?: AtlasControl): Promise<{ index: DetailShapeDistanceIndex; band: Uint8Array }> {
  const coordinates = new Uint32Array(DETAIL_DISTANCE_MAX_SEGMENTS * 4), band = new Uint8Array(4096), seen = new Set<string>();
  const { points, triangles, heights, halfedges } = mesh, mapping = summary.mapping; let count = 0;
  const worldPoint = (id: number) => [Math.round((mapping.offsetX + points[id * 2] * mapping.scale) * 256), Math.round((mapping.offsetY + points[id * 2 + 1] * mapping.scale) * 256)];
  const pointOnEdge = (a: number, b: number) => {
    const t = (20 - heights[a]) / (heights[b] - heights[a]);
    return [Math.round((mapping.offsetX + (points[a * 2] + (points[b * 2] - points[a * 2]) * t) * mapping.scale) * 256),
      Math.round((mapping.offsetY + (points[a * 2 + 1] + (points[b * 2 + 1] - points[a * 2 + 1]) * t) * mapping.scale) * 256)];
  };
  function append(a: number[], b: number[]) {
    if (a[0] === b[0] && a[1] === b[1]) return;
    const ak = `${a[0]},${a[1]}`, bk = `${b[0]},${b[1]}`, key = ak < bk ? `${ak}:${bk}` : `${bk}:${ak}`;
    if (seen.has(key)) return; seen.add(key);
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 512);
    let previous = a;
    for (let step = 1; step <= steps; step++) {
      if (count >= DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error('导入海岸超过 131072 条短岸段，本次未降采样或创建草稿。');
      const next = [Math.round(a[0] + (b[0] - a[0]) * step / steps), Math.round(a[1] + (b[1] - a[1]) * step / steps)];
      coordinates.set([previous[0], previous[1], next[0], next[1]], count++ * 4); previous = next;
    }
    // Include the unique owner immediately left/top of a tile boundary node.
    const tileQ = 64 * 256, margin = 32767 + 512;
    for (let by = Math.max(0, Math.floor((Math.min(a[1], b[1]) - margin) / tileQ)); by <= Math.min(63, Math.floor((Math.max(a[1], b[1]) + margin) / tileQ)); by++)
      for (let bx = Math.max(0, Math.floor((Math.min(a[0], b[0]) - margin) / tileQ)); bx <= Math.min(63, Math.floor((Math.max(a[0], b[0]) + margin) / tileQ)); bx++) band[by * 64 + bx] = 1;
  }
  for (let start = 0; start < triangles.length; start += 3) {
    const ids = [triangles[start], triangles[start + 1], triangles[start + 2]], hits: number[][] = [];
    if (!ids.every(id => heights[id] === 20)) {
      for (let side = 0; side < 3; side++) {
        const a = ids[side], b = ids[(side + 1) % 3], ah = heights[a] - 20, bh = heights[b] - 20;
        if (ah === 0) hits.push(worldPoint(a));
        if (ah * bh < 0) hits.push(pointOnEdge(a, b));
      }
      const unique = [...new Map(hits.map(point => [`${point[0]},${point[1]}`, point])).values()];
      if (unique.length === 2) append(unique[0], unique[1]);
    }
    for (let side = 0; side < 3; side++) if (halfedges[start + side] === -1) {
      const a = ids[side], b = ids[(side + 1) % 3], ax = points[a * 2], ay = points[a * 2 + 1], bx = points[b * 2], by = points[b * 2 + 1];
      const internalBoundary = ax === bx && (ax === 0 && mapping.offsetX > 0 || ax === summary.width && mapping.offsetX + mapping.width < 4096)
        || ay === by && (ay === 0 && mapping.offsetY > 0 || ay === summary.height && mapping.offsetY + mapping.height < 4096);
      if (internalBoundary && !(heights[a] < 20 && heights[b] < 20)) {
        if (heights[a] >= 20 && heights[b] >= 20) append(worldPoint(a), worldPoint(b));
        else append(heights[a] >= 20 ? worldPoint(a) : worldPoint(b), pointOnEdge(a, b));
      }
    }
    if (start % 1536 === 0) await yieldAtlas(control, '提取导入地形真实海岸', start, triangles.length);
  }
  const index = await buildDetailShapeDistanceIndex({ coordinates: coordinates.slice(0, count * 4).buffer, segmentCount: count }, {
    signal: control?.signal, yieldControl: control?.yieldTask,
    onProgress: (_phase, completed, total) => control?.onProgress?.({ stage: '建立导入海岸距离索引', completed, total }),
  });
  return { index, band };
}
export async function createImportedTerrain(parsed: ParsedTerrainImport, options: TerrainImportOptions, control?: AtlasControl): Promise<{ data: AtlasDetailCoastDocument; summary: TerrainImportSummary }> {
  const mesh = accepted.get(parsed); if (!mesh) throw new Error('必须使用本 Worker 已完整核验的地形导入结果。');
  if (!generationExact(options, ['name', ...(['size', 'draftId', 'atlasId'] as const).filter(key => Object.hasOwn(options, key))]) || !label(options.name)
    || options.size !== undefined && ![128, 256, 512].includes(options.size)) throw new Error('新地形草稿参数无效。');
  const ownedOptions = { ...options }, summary = parsed.summary, size = ownedOptions.size ?? 128;
  const data = await createGenerationDraft({ size, seed: summary.seed, name: ownedOptions.name,
    ...(ownedOptions.draftId === undefined ? {} : { draftId: ownedOptions.draftId }), ...(ownedOptions.atlasId === undefined ? {} : { atlasId: ownedOptions.atlasId }) }, control, 4);
  const sample = sampler(mesh, summary, control), step = 4096 / size, coast = await coastDistance(mesh, summary, control);
  let completedBlocks = 0;
  for (const block of data.blocks.values()) {
    if (block.layer === 'geometry') for (let index = 0; index < block.vertexIds.length; index++) {
      const id = block.vertexIds[index]; block.xyQ[index * 2] = id % (size + 1) * step * 256; block.xyQ[index * 2 + 1] = Math.floor(id / (size + 1)) * step * 256;
    }
    if (block.layer === 'elevation') for (let index = 0; index < block.values.length; index++) {
      const x = (block.bx * 32 + index % 32 + 0.5) * step, y = (block.by * 32 + Math.floor(index / 32) + 0.5) * step;
      block.values[index] = signed(relativeHeight(sample(x, y)), 100);
    }
    if (++completedBlocks % 4 === 0) await yieldAtlas(control, '重采样导入基础地形', completedBlocks, data.blocks.size);
  }
  for (let index = 0; index < data.manifest.blockRefs.length; index++) {
    const ref = data.manifest.blockRefs[index]; ref.hash = await hashBlock(data.blocks.get(ref.key)!);
    if (index % 8 === 0) await yieldAtlas(control, '保存导入地形基础高程', index, data.manifest.blockRefs.length);
  }
  let distanceWork = 0;
  for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) {
    control?.signal?.throwIfAborted();
    const layout = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let index = 0; index < layout.count; index++) {
      const x = (layout.startX + index % layout.width) * 2, y = (layout.startY + Math.floor(index / layout.width)) * 2, relative = relativeHeight(sample(x, y));
      let coverage = relative === 0 ? 0 : relative > 0 ? 32767 : -32767;
      if (relative !== 0 && coast.band[by * 64 + bx]) {
        const result = coast.index.sample(x * 256, y * 256, relative > 0 ? 1 : -1);
        distanceWork += result.stats.nodeBoundsTests + result.stats.segmentBoundsTests;
        if (distanceWork > TERRAIN_IMPORT_LIMITS.distanceWork) throw new Error('导入海岸距离查询超过有界工作预算，本次未创建草稿。');
        coverage = result.coverageQ;
      }
      coverageQ[index] = coverage; elevationMeters[index] = coverage === 0 ? 0 : signed(relative, 100);
    }
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'samples', coverageQ, elevationMeters } as const;
    data.detailCoast.set(detailCoastKey(bx, by), tile); data.manifest.detailCoast.refs.push({ bx, by, hash: await hashDetailCoastTile(tile) });
    if (bx % 4 === 3) await yieldAtlas(control, '转换导入地形连续细场', by * 64 + bx + 1, 4096);
  }
  await verifyGenerationDocument(data, control); control?.signal?.throwIfAborted();
  return { data, summary };
}
