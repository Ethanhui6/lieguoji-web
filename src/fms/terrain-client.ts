import type { FmsDocument } from './model';
import type { FmsNaturalizationOptions, FmsNaturalizationStats } from './naturalize';
import type { FmsDrainage } from './hydrology';
import { fixedFmsCoastVertices } from './coastline';
import { FMS_DEFAULT_COASTAL_WIDTH, fmsCoastalWidthWorld, validFmsNaturalizationOptions } from './terrain-options';

export interface FmsTerrainPreview {
  worldId: string; baseRevision: number; elevations: Int32Array;
  stats: FmsNaturalizationStats; drainage: FmsDrainage;
}
export interface FmsTerrainRequest {
  kind: 'naturalize'; requestId: number; document: FmsDocument; options: FmsNaturalizationOptions;
}
export type FmsTerrainResponse = ({ kind: 'naturalized'; requestId: number } & FmsTerrainPreview)
  | { kind: 'error'; requestId: number; worldId: string; baseRevision: number; code: string; message: string };
export class FmsTerrainClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'FmsTerrainClientError'; }
}
const exact = (raw: unknown, keys: readonly string[]): raw is Record<string, unknown> => !!raw && typeof raw === 'object'
  && !Array.isArray(raw) && Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key));
const integer = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
const finite = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const abortError = () => new DOMException('地形预览已取消，原地图未改变。', 'AbortError');
const protocolError = () => new FmsTerrainClientError('invalid-response', '地形线程返回的数据或世界版本不一致，请重新生成。');
const LAND_LEVEL = 20, MAX_CELLS = 50_000;
type Snapshot = { worldId: string; revision: number; heights: Int32Array; coastLocks: Uint8Array; neighbors: number[][]; coastalWidthWorld: number; options: FmsNaturalizationOptions };
type Pending = { requestId: number; snapshot: Snapshot; resolve: (value: FmsTerrainPreview) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>; signal?: AbortSignal; abort: () => void };

function snapshotInput(doc: FmsDocument, options: FmsNaturalizationOptions): Snapshot {
  if (!doc || typeof doc.worldId !== 'string' || !integer(doc.revision, 0, Number.MAX_SAFE_INTEGER - 1)
    || !Array.isArray(doc.points) || !integer(doc.points.length, 3, MAX_CELLS)
    || !(doc.elevations instanceof Int32Array) || doc.elevations.length !== doc.points.length
    || !(doc.triangles instanceof Uint32Array) || doc.triangles.length > doc.points.length * 6
    || !Array.isArray(doc.neighbors) || doc.neighbors.length !== doc.points.length
    || ![1, 2].includes(doc.version) || (doc.version === 1 && doc.terrainLocks !== undefined)
    || (doc.version === 2 && (!(doc.terrainLocks instanceof Uint8Array) || doc.terrainLocks.length !== doc.points.length || doc.terrainLocks.some(value => value !== 0 && value !== 1)))
    || doc.neighbors.some(row => !Array.isArray(row) || row.length > 128 || row.some(cell => !integer(cell, 0, doc.points.length - 1)))
    || !validFmsNaturalizationOptions(options)) {
    throw new FmsTerrainClientError('invalid-request', '地形文档、种子或自然化强度无效。');
  }
  const coastLocks = fixedFmsCoastVertices(doc);
  doc.terrainLocks?.forEach((value, id) => { if (value) coastLocks[id] = 1; });
  return { worldId: doc.worldId, revision: doc.revision, heights: doc.elevations.slice(), coastLocks, neighbors: doc.neighbors.map(row => [...row]),
    coastalWidthWorld: fmsCoastalWidthWorld(doc.width, doc.height, doc.points.length, options.coastalWidth ?? FMS_DEFAULT_COASTAL_WIDTH), options: { ...options } };
}

function validStats(raw: unknown, elevations: Int32Array, source: Snapshot): raw is FmsNaturalizationStats {
  const count = elevations.length;
  if (!exact(raw, ['algorithm', 'seed', 'strength', 'landCells', 'seaCells', 'changedCells', 'coastalLandCells', 'landComponents', 'minLandHeight', 'maxLandHeight',
    'meanLandHeight', 'meanCoastHeight', 'meanInteriorHeight', 'maxDistanceToCoast', 'fallbackBoundaryComponents', 'landMaskPreserved', 'coastalWidth', 'coastalWidthWorld'])
    || raw.algorithm !== 'fms-shape-preserving-relief-v4' || raw.seed !== source.options.seed || raw.strength !== source.options.strength
    || raw.coastalWidth !== (source.options.coastalWidth ?? FMS_DEFAULT_COASTAL_WIDTH) || raw.coastalWidthWorld !== source.coastalWidthWorld || raw.landMaskPreserved !== true) return false;
  for (const key of ['landCells', 'seaCells', 'changedCells', 'coastalLandCells', 'landComponents', 'fallbackBoundaryComponents']) if (!integer(raw[key], 0, count)) return false;
  for (const key of ['minLandHeight', 'maxLandHeight', 'meanLandHeight']) if (!finite(raw[key], 0, 100)) return false;
  for (const key of ['meanCoastHeight', 'meanInteriorHeight']) if (raw[key] !== null && !finite(raw[key], 0, 100)) return false;
  if (!finite(raw.maxDistanceToCoast, 0, Math.SQRT2 * 8192 * count)) return false;
  let land = 0, changed = 0, sum = 0, minimum = 100, maximum = 0;
  for (let cell = 0; cell < count; cell++) {
    const height = elevations[cell], previous = source.heights[cell], isLand = previous >= LAND_LEVEL;
    if (height < 0 || height > 100 || (height >= LAND_LEVEL) !== isLand
      || (previous > LAND_LEVEL && height === LAND_LEVEL) || (source.coastLocks[cell] && height !== previous)) return false;
    if (height !== previous) changed++;
    if (isLand) { land++; sum += height; minimum = Math.min(minimum, height); maximum = Math.max(maximum, height); }
  }
  return land > 0 && raw.landCells === land && raw.seaCells === count - land && raw.changedCells === changed
    && raw.minLandHeight === minimum && raw.maxLandHeight === maximum && Math.abs(Number(raw.meanLandHeight) - sum / land) < 1e-9;
}

function validDrainage(raw: unknown, elevations: Int32Array, source: Snapshot): raw is FmsDrainage {
  const count = elevations.length;
  if (!exact(raw, ['receiver', 'accumulation', 'filledElevation', 'lakeDepth', 'riverSegments', 'stats'])
    || !(raw.receiver instanceof Int32Array) || !(raw.accumulation instanceof Float32Array)
    || !(raw.filledElevation instanceof Float64Array) || !(raw.lakeDepth instanceof Float32Array)
    || [raw.receiver, raw.accumulation, raw.filledElevation, raw.lakeDepth].some(array => array.length !== count)
    || !Array.isArray(raw.riverSegments) || raw.riverSegments.length > count) return false;
  const { receiver, accumulation, filledElevation, lakeDepth, stats } = raw;
  const statKeys = ['cellCount', 'landCells', 'seaCells', 'connectedComponents', 'endorheicBasins', 'filledLandCells', 'maxLakeDepth', 'minCatchment', 'riverSegmentCount', 'seaDischarge', 'endorheicDischarge', 'maxAccumulation'];
  if (!exact(stats, statKeys) || !integer(stats.minCatchment, 1, MAX_CELLS)) return false;
  for (const key of statKeys) if (!finite(stats[key], 0, key === 'maxLakeDepth' ? 2_147_483_647 : MAX_CELLS)) return false;
  let land = 0, seaDischarge = 0, endorheicDischarge = 0, maximum = 0;
  for (let cell = 0; cell < count; cell++) {
    const next = receiver[cell], isLand = elevations[cell] >= LAND_LEVEL;
    if (!integer(next, -1, count - 1) || next === cell || (next >= 0 && !source.neighbors[cell].includes(next))
      || !integer(accumulation[cell], 0, count) || !finite(filledElevation[cell], elevations[cell], 2_147_483_647)
      || !finite(lakeDepth[cell], 0, 2_147_483_647)
      || (next >= 0 && filledElevation[next] > filledElevation[cell])) return false;
    if (isLand) { land++; if (next === -1) endorheicDischarge += accumulation[cell]; }
    else { if (next !== -1 || lakeDepth[cell] !== 0) return false; seaDischarge += accumulation[cell]; }
    maximum = Math.max(maximum, accumulation[cell]);
  }
  // Each cell is visited at most twice. Reject cycles before rendering streams.
  const state = new Uint8Array(count);
  for (let start = 0; start < count; start++) {
    let cell = start;
    while (cell >= 0 && state[cell] === 0) { state[cell] = 1; cell = receiver[cell]; }
    if (cell >= 0 && state[cell] === 1) return false;
    cell = start;
    while (cell >= 0 && state[cell] === 1) { state[cell] = 2; cell = receiver[cell]; }
  }
  const riverSources = new Set<number>();
  for (const pair of raw.riverSegments) {
    if (!Array.isArray(pair) || pair.length !== 2 || !integer(pair[0], 0, count - 1) || !integer(pair[1], 0, count - 1)
      || elevations[pair[0]] < LAND_LEVEL || receiver[pair[0]] !== pair[1] || lakeDepth[pair[0]] > .5
      || accumulation[pair[0]] < stats.minCatchment || riverSources.has(pair[0])) return false;
    riverSources.add(pair[0]);
  }
  return stats.cellCount === count && stats.landCells === land && stats.seaCells === count - land
    && stats.riverSegmentCount === raw.riverSegments.length && stats.seaDischarge === seaDischarge
    && stats.endorheicDischarge === endorheicDischarge && seaDischarge + endorheicDischarge === land && stats.maxAccumulation === maximum;
}

/** One in-flight candidate per client; failures replace only this client's Worker. No persistence. */
export class FmsTerrainClient {
  private worker?: Worker;
  private pending?: Pending;
  private requestId = 0;
  private closed = false;
  private readonly timeoutMs: number;
  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!integer(this.timeoutMs, 1, 600_000)) throw new FmsTerrainClientError('invalid-timeout', '地形预览时限须为1至600000毫秒。');
  }
  async naturalize(document: FmsDocument, options: FmsNaturalizationOptions, control: { signal?: AbortSignal } = {}): Promise<FmsTerrainPreview> {
    if (this.closed) throw new FmsTerrainClientError('closed', '地形预览会话已关闭。');
    if (control.signal?.aborted) throw abortError();
    if (this.pending) throw new FmsTerrainClientError('busy', '当前地形仍在生成，请先取消或等待完成。');
    const snapshot = snapshotInput(document, options), requestId = ++this.requestId;
    if (!this.worker) {
      try { this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }); }
      catch { throw new FmsTerrainClientError('worker-start', '无法启动地形线程，请重试。'); }
      const worker = this.worker;
      worker.onmessage = event => { if (this.worker === worker) this.receive(event.data); };
      worker.onerror = () => { if (this.worker === worker) this.fail(new FmsTerrainClientError('worker-error', '地形线程运行失败，原地图未改变。')); };
      worker.onmessageerror = () => { if (this.worker === worker) this.fail(new FmsTerrainClientError('message-error', '地形线程数据无法读取，请重新生成。')); };
    }
    return new Promise((resolve, reject) => {
      const abort = () => this.cancel();
      const timer = setTimeout(() => this.fail(new FmsTerrainClientError('timeout', '地形预览超时，已停止线程，原地图未改变。')), this.timeoutMs);
      this.pending = { requestId, snapshot, resolve, reject, timer, signal: control.signal, abort };
      control.signal?.addEventListener('abort', abort, { once: true });
      if (control.signal?.aborted) { abort(); return; }
      try {
        const request: FmsTerrainRequest = { kind: 'naturalize', requestId, document, options: snapshot.options };
        // Structured clone owns the Worker's copy. Never detach source document buffers.
        this.worker!.postMessage(request);
      } catch { this.fail(new FmsTerrainClientError('send-error', '无法发送地形数据，原地图未改变。')); }
    });
  }
  cancel(): void { this.fail(abortError()); }
  close(): void { this.closed = true; this.cancel(); }
  private clearPending(): Pending | undefined {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.signal?.removeEventListener('abort', pending.abort); }
    return pending;
  }
  private fail(error: Error): void {
    const worker = this.worker; this.worker = undefined;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
    this.clearPending()?.reject(error);
  }
  private receive(raw: unknown): void {
    const pending = this.pending;
    if (!pending) return;
    try {
      if (!raw || typeof raw !== 'object') throw protocolError();
      const value = raw as Record<string, unknown>;
      if (value.requestId !== pending.requestId || value.worldId !== pending.snapshot.worldId || value.baseRevision !== pending.snapshot.revision) throw protocolError();
      if (value.kind === 'error') {
        if (!exact(value, ['kind', 'requestId', 'worldId', 'baseRevision', 'code', 'message']) || typeof value.code !== 'string' || !value.code || value.code.length > 80
          || typeof value.message !== 'string' || !value.message || value.message.length > 500) throw protocolError();
        this.fail(new FmsTerrainClientError(value.code, value.message)); return;
      }
      if (!exact(value, ['kind', 'requestId', 'worldId', 'baseRevision', 'elevations', 'stats', 'drainage']) || value.kind !== 'naturalized'
        || !(value.elevations instanceof Int32Array) || value.elevations.length !== pending.snapshot.heights.length
        || !validStats(value.stats, value.elevations, pending.snapshot) || !validDrainage(value.drainage, value.elevations, pending.snapshot)) throw protocolError();
      this.clearPending()?.resolve({ worldId: pending.snapshot.worldId, baseRevision: pending.snapshot.revision,
        elevations: value.elevations, stats: value.stats, drainage: value.drainage });
    } catch (error) { this.fail(error instanceof FmsTerrainClientError ? error : protocolError()); }
  }
}
