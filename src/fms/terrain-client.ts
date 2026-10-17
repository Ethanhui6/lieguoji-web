import { assertFmsDocument, pickFmsCell, selectFmsHillCells, type FmsDocument } from './model';
import { validFmsHillOptions, type FmsHillOptions, type FmsHillStats } from './hill';
import { fmsTemplatePlacement, validFmsTemplateOptions, type FmsTemplateOptions, type FmsTemplateStats } from './local-template';
import type { FmsNaturalizationOptions, FmsNaturalizationStats } from './naturalize';
import type { FmsDrainage } from './hydrology';
import { fixedFmsCoastVertices } from './coastline';
import { FMS_DEFAULT_COASTAL_WIDTH, fmsCoastalWidthWorld, validFmsNaturalizationOptions } from './terrain-options';
import { defaultFmsCatchmentArea, deriveFmsRunoff, FMS_DRAINAGE_ALGORITHM } from './runoff';
import { assertFmsFullMapSource, validFmsFullMapOptions, type FmsFullMapOptions, type FmsFullMapStats } from './full-map-terrain';

export interface FmsTerrainPreview {
  worldId: string; baseRevision: number; elevations: Int32Array;
  stats: FmsNaturalizationStats; drainage: FmsDrainage;
}
export interface FmsTerrainRequest {
  kind: 'naturalize'; requestId: number; document: FmsDocument; options: FmsNaturalizationOptions;
}
export interface FmsHillPreview extends Omit<FmsTerrainPreview, 'stats'> { stats: FmsHillStats }
export interface FmsHillRequest { kind: 'hill'; requestId: number; document: FmsDocument; options: FmsHillOptions }
export interface FmsTemplatePreview extends Omit<FmsTerrainPreview, 'stats'> { stats: FmsTemplateStats }
export interface FmsTemplateRequest { kind: 'template'; requestId: number; document: FmsDocument; options: FmsTemplateOptions }
export interface FmsFullMapPreview extends Omit<FmsTerrainPreview, 'stats'> { stats: FmsFullMapStats }
export interface FmsFullMapRequest { kind: 'full-map'; requestId: number; document: FmsDocument; options: FmsFullMapOptions }
export type FmsGenerationRequest = FmsTerrainRequest | FmsHillRequest | FmsTemplateRequest | FmsFullMapRequest;
export type FmsGenerationResponse = FmsTerrainResponse | ({ kind: 'hill-generated'; requestId: number } & FmsHillPreview)
  | ({ kind: 'template-generated'; requestId: number } & FmsTemplatePreview)
  | ({ kind: 'full-map-generated'; requestId: number } & FmsFullMapPreview);
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
type Snapshot = { worldId: string; revision: number; heights: Int32Array; coastLocks: Uint8Array; neighbors: number[][];
  points: FmsDocument['points']; triangles: Uint32Array; coastalWidthWorld: number; options: FmsNaturalizationOptions;
  hill?: { options: FmsHillOptions; selected: Set<number>; centerCell: number };
  template?: { options: FmsTemplateOptions; playerLocks: Uint8Array; centerCell: number; sizeFactor: number };
  fullMap?: FmsFullMapOptions };
type Pending = { requestId: number; snapshot: Snapshot; resolve: (value: FmsTerrainPreview | FmsHillPreview | FmsTemplatePreview | FmsFullMapPreview) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>; signal?: AbortSignal; abort: () => void };

function snapshotInput(doc: FmsDocument, options: FmsNaturalizationOptions): Snapshot {
  try { assertFmsDocument(doc); } catch { throw new FmsTerrainClientError('invalid-request', '地形文档无效。'); }
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
    points: doc.points.map(p => [...p]), triangles: doc.triangles.slice(),
    coastalWidthWorld: fmsCoastalWidthWorld(doc.width, doc.height, doc.points.length, options.coastalWidth ?? FMS_DEFAULT_COASTAL_WIDTH), options: { ...options } };
}

function validHillStats(raw: unknown, elevations: Int32Array, source: Snapshot): raw is FmsHillStats {
  const hill = source.hill;
  if (!hill || !exact(raw, ['algorithm', 'seed', 'centerCell', 'selectedCells', 'changedCells', 'height', 'decay'])
    || raw.algorithm !== 'recovered-native-hill-max-web-v1' || raw.seed !== hill.options.seed || raw.centerCell !== hill.centerCell
    || raw.selectedCells !== hill.selected.size || raw.height !== hill.options.height || raw.decay !== hill.options.decay) return false;
  let changed = 0;
  for (let cell = 0; cell < elevations.length; cell++) {
    const next = elevations[cell], previous = source.heights[cell];
    if (next < previous || next < 0 || next > 100 || ((source.coastLocks[cell] || !hill.selected.has(cell)) && next !== previous)) return false;
    if (next !== previous) changed++;
  }
  return raw.changedCells === changed;
}

function validTemplateStats(raw: unknown, elevations: Int32Array, source: Snapshot): raw is FmsTemplateStats {
  const template = source.template;
  if (!template || !exact(raw, ['algorithm', 'seed', 'x', 'y', 'template', 'preserveCoast', 'centerCell', 'sizeFactor', 'changedCells', 'newLandCells'])
    || raw.algorithm !== 'recovered-click-template-max-web-v1' || raw.centerCell !== template.centerCell || raw.sizeFactor !== template.sizeFactor
    || Object.entries(template.options).some(([key, value]) => raw[key] !== value)) return false;
  let changed = 0, newLand = 0;
  for (let cell = 0; cell < elevations.length; cell++) {
    const next = elevations[cell], previous = source.heights[cell];
    if (next < previous || next < 0 || next > 100 || ((template.playerLocks[cell] || (template.options.preserveCoast && source.coastLocks[cell])) && next !== previous)) return false;
    if (next !== previous) changed++;
    if (next >= LAND_LEVEL && previous < LAND_LEVEL) newLand++;
  }
  return raw.changedCells === changed && raw.newLandCells === newLand;
}

function validFullMapStats(raw: unknown, elevations: Int32Array, source: Snapshot): raw is FmsFullMapStats {
  const options = source.fullMap;
  if (!options || !exact(raw, ['algorithm', 'seed', 'template', 'changedCells', 'landCells', 'seaCells'])
    || (raw.algorithm !== 'recovered-height-square-v1' && raw.algorithm !== 'recovered-height-original-grid-v1') || raw.seed !== options.seed || raw.template !== options.template) return false;
  let changed = 0, land = 0;
  for (let cell = 0; cell < elevations.length; cell++) {
    const height = elevations[cell];
    if (source.heights[cell] !== 0 || !integer(height, 0, 100)) return false;
    if (height !== 0) changed++;
    if (height >= LAND_LEVEL) land++;
  }
  return land > 0 && raw.changedCells === changed && raw.landCells === land && raw.seaCells === elevations.length - land;
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
  if (!exact(raw, ['receiver', 'runoff', 'accumulation', 'filledElevation', 'lakeDepth', 'riverSegments', 'stats'])
    || !(raw.receiver instanceof Int32Array) || !(raw.accumulation instanceof Float64Array) || !(raw.runoff instanceof Float64Array)
    || !(raw.filledElevation instanceof Float64Array) || !(raw.lakeDepth instanceof Float32Array)
    || [raw.receiver, raw.runoff, raw.accumulation, raw.filledElevation, raw.lakeDepth].some(array => array.length !== count)
    || !Array.isArray(raw.riverSegments) || raw.riverSegments.length > count) return false;
  const { receiver, runoff, accumulation, filledElevation, lakeDepth, stats } = raw;
  const statKeys = ['cellCount', 'landCells', 'seaCells', 'connectedComponents', 'endorheicBasins', 'filledLandCells', 'maxLakeDepth', 'minCatchment', 'riverSegmentCount', 'seaDischarge', 'endorheicDischarge', 'maxAccumulation'];
  if (!exact(stats, [...statKeys, 'algorithm', 'landArea']) || stats.algorithm !== FMS_DRAINAGE_ALGORITHM) return false;
  const expectedRunoff = deriveFmsRunoff({ points: source.points, triangles: source.triangles, elevations });
  const landArea = expectedRunoff.reduce((sum, value) => sum + value, 0);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (!finite(stats.landArea, 0, 8192 ** 2) || !near(stats.landArea, landArea)
    || stats.minCatchment !== defaultFmsCatchmentArea(landArea)) return false;
  const areaKeys = ['minCatchment', 'seaDischarge', 'endorheicDischarge', 'maxAccumulation'];
  for (const key of statKeys) {
    if (areaKeys.includes(key)) { if (!finite(stats[key], 0, 8192 ** 2)) return false; }
    else if (!integer(stats[key], 0, key === 'maxLakeDepth' ? 2_147_483_647 : MAX_CELLS)) return false;
  }
  let land = 0, seaDischarge = 0, endorheicDischarge = 0, maximum = 0;
  for (let cell = 0; cell < count; cell++) {
    const next = receiver[cell], isLand = elevations[cell] >= LAND_LEVEL;
    if (!integer(next, -1, count - 1) || next === cell || (next >= 0 && !source.neighbors[cell].includes(next))
      || !finite(accumulation[cell], 0, landArea + 1e-6) || !finite(runoff[cell], 0, landArea + 1e-6)
      || !near(runoff[cell], expectedRunoff[cell]) || !finite(filledElevation[cell], elevations[cell], 2_147_483_647)
      || !finite(lakeDepth[cell], 0, 2_147_483_647)
      || (next >= 0 && filledElevation[next] > filledElevation[cell])
      || lakeDepth[cell] !== (isLand ? Math.fround(filledElevation[cell] - elevations[cell]) : 0)) return false;
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
  // A conserved graph could still be forged into isolated land terminals.
  // Sea-connected components have no land root; landlocked ones have exactly
  // their lowest (stable-id tie break) vertex as a terminal.
  const seen = new Uint8Array(count); let components = 0;
  for (let start = 0; start < count; start++) if (!seen[start]) {
    components++; const stack = [start], members: number[] = []; seen[start] = 1;
    let hasSea = false, lowest = start;
    while (stack.length) {
      const cell = stack.pop()!; members.push(cell);
      if (elevations[cell] < LAND_LEVEL) hasSea = true;
      if (elevations[cell] < elevations[lowest] || (elevations[cell] === elevations[lowest] && cell < lowest)) lowest = cell;
      for (const next of source.neighbors[cell]) if (!seen[next]) { seen[next] = 1; stack.push(next); }
    }
    for (const cell of members) if (elevations[cell] >= LAND_LEVEL && (receiver[cell] === -1) !== (!hasSea && cell === lowest)) return false;
  }
  if (stats.connectedComponents !== components) return false;
  // Local balances reject forged tributary totals even if outlet sums match.
  const expectedFlow = expectedRunoff.slice();
  for (let cell = 0; cell < count; cell++) if (receiver[cell] >= 0) expectedFlow[receiver[cell]] += accumulation[cell];
  for (let cell = 0; cell < count; cell++) if (!near(expectedFlow[cell], accumulation[cell])) return false;
  const riverSources = new Set<number>();
  for (const pair of raw.riverSegments) {
    if (!Array.isArray(pair) || pair.length !== 2 || !integer(pair[0], 0, count - 1) || !integer(pair[1], 0, count - 1)
      || elevations[pair[0]] < LAND_LEVEL || receiver[pair[0]] !== pair[1] || lakeDepth[pair[0]] > .5
      || accumulation[pair[0]] < stats.minCatchment || riverSources.has(pair[0])) return false;
    riverSources.add(pair[0]);
  }
  let filledLandCells = 0, maxLakeDepth = 0, roots = 0;
  for (let cell = 0; cell < count; cell++) if (elevations[cell] >= LAND_LEVEL) {
    if (lakeDepth[cell] > 0) { filledLandCells++; maxLakeDepth = Math.max(maxLakeDepth, lakeDepth[cell]); }
    if (receiver[cell] === -1) roots++;
    if ((receiver[cell] >= 0 && lakeDepth[cell] <= .5 && accumulation[cell] >= stats.minCatchment) !== riverSources.has(cell)) return false;
  }
  return stats.cellCount === count && stats.landCells === land && stats.seaCells === count - land
    && stats.filledLandCells === filledLandCells && stats.maxLakeDepth === maxLakeDepth && stats.endorheicBasins === roots
    && stats.riverSegmentCount === raw.riverSegments.length && stats.seaDischarge === seaDischarge
    && stats.endorheicDischarge === endorheicDischarge && near(seaDischarge + endorheicDischarge, landArea) && stats.maxAccumulation === maximum;
}

/** One in-flight candidate per client; failures replace only this client's Worker. No persistence. */
export class FmsTerrainClient {
  private worker?: Worker;
  private pending?: Pending;
  private preparing?: AbortController;
  private requestId = 0;
  private closed = false;
  private readonly timeoutMs: number;
  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!integer(this.timeoutMs, 1, 600_000)) throw new FmsTerrainClientError('invalid-timeout', '地形预览时限须为1至600000毫秒。');
  }
  async naturalize(document: FmsDocument, options: FmsNaturalizationOptions, control: { signal?: AbortSignal } = {}): Promise<FmsTerrainPreview> {
    return this.generate(document, options, control) as Promise<FmsTerrainPreview>;
  }
  async hill(document: FmsDocument, options: FmsHillOptions, control: { signal?: AbortSignal } = {}): Promise<FmsHillPreview> {
    if (!validFmsHillOptions(options)) throw new FmsTerrainClientError('invalid-request', '山丘参数无效。');
    return this.generate(document, { seed: options.seed, strength: 1 }, control, options) as Promise<FmsHillPreview>;
  }
  async localTemplate(document: FmsDocument, options: FmsTemplateOptions, control: { signal?: AbortSignal } = {}): Promise<FmsTemplatePreview> {
    if (!validFmsTemplateOptions(options)) throw new FmsTerrainClientError('invalid-request', '局部地形参数无效。');
    return this.generate(document, { seed: options.seed, strength: 1 }, control, undefined, options) as Promise<FmsTemplatePreview>;
  }
  async fullMap(document: FmsDocument, options: FmsFullMapOptions, control: { signal?: AbortSignal } = {}): Promise<FmsFullMapPreview> {
    if (!validFmsFullMapOptions(options)) throw new FmsTerrainClientError('invalid-request', '整图模板或种子无效。');
    if (this.closed) throw new FmsTerrainClientError('closed', '地形预览会话已关闭。');
    if (control.signal?.aborted) throw abortError();
    if (this.pending || this.preparing) throw new FmsTerrainClientError('busy', '当前地形仍在生成，请先取消或等待完成。');
    const preparation = new AbortController(), signal = control.signal;
    this.preparing = preparation;
    const abortPreparation = () => {
      preparation.abort();
      if (this.preparing === preparation) this.preparing = undefined;
    };
    signal?.addEventListener('abort', abortPreparation, { once: true });
    if (signal?.aborted) abortPreparation();
    try {
      // Own all generation inputs before the asynchronous topology check.
      // Reserve the client during that check so cancellation and retry cannot
      // let an old preparation take the new request's Worker slot.
      let owned: FmsDocument;
      try { owned = structuredClone(document); }
      catch { throw new FmsTerrainClientError('invalid-request', '地形文档无法复制。'); }
      const ownedOptions = { ...options };
      await assertFmsFullMapSource(owned, { signal: preparation.signal });
      if (preparation.signal.aborted) throw abortError();
      if (this.preparing === preparation) this.preparing = undefined;
      // generate() takes its pending slot synchronously before returning.
      return this.generate(owned, { seed: 0, strength: 1 }, { signal }, undefined, undefined, ownedOptions) as Promise<FmsFullMapPreview>;
    } catch (error) {
      if (preparation.signal.aborted) throw abortError();
      if (error instanceof FmsTerrainClientError) throw error;
      throw new FmsTerrainClientError('invalid-request', error instanceof Error ? error.message : '整图源地图无效。');
    } finally {
      signal?.removeEventListener('abort', abortPreparation);
      if (this.preparing === preparation) this.preparing = undefined;
    }
  }
  private async generate(document: FmsDocument, options: FmsNaturalizationOptions, control: { signal?: AbortSignal }, hillOptions?: FmsHillOptions, templateOptions?: FmsTemplateOptions, fullMapOptions?: FmsFullMapOptions): Promise<FmsTerrainPreview | FmsHillPreview | FmsTemplatePreview | FmsFullMapPreview> {
    if (this.closed) throw new FmsTerrainClientError('closed', '地形预览会话已关闭。');
    if (control.signal?.aborted) throw abortError();
    if (this.pending || this.preparing) throw new FmsTerrainClientError('busy', '当前地形仍在生成，请先取消或等待完成。');
    const snapshot = snapshotInput(document, options), requestId = ++this.requestId;
    if (fullMapOptions) snapshot.fullMap = { ...fullMapOptions };
    if (templateOptions) {
      if (document.elevations.some(h => h < 0 || h > 100)) throw new FmsTerrainClientError('invalid-request', '当前地形高度超出模板支持范围。');
      const placement = fmsTemplatePlacement(document, templateOptions);
      snapshot.template = { options: { ...templateOptions }, playerLocks: document.terrainLocks?.slice() ?? new Uint8Array(document.points.length), centerCell: placement.centerCell, sizeFactor: placement.sizeFactor };
    }
    if (hillOptions) {
      const centerCell = pickFmsCell(document, hillOptions.x, hillOptions.y);
      if (centerCell === null || snapshot.heights[centerCell] <= 20 || hillOptions.radius > Math.max(document.width, document.height)) {
        throw new FmsTerrainClientError('invalid-request', '请在已有陆地内部放置山丘。');
      }
      snapshot.hill = { options: { ...hillOptions }, centerCell, selected: selectFmsHillCells(document, hillOptions) };
    }
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
        const request: FmsGenerationRequest = snapshot.fullMap
          ? { kind: 'full-map', requestId, document, options: snapshot.fullMap } : snapshot.template
          ? { kind: 'template', requestId, document, options: snapshot.template.options } : snapshot.hill
          ? { kind: 'hill', requestId, document, options: snapshot.hill.options }
          : { kind: 'naturalize', requestId, document, options: snapshot.options };
        // Structured clone owns the Worker's copy. Never detach source document buffers.
        this.worker!.postMessage(request);
      } catch { this.fail(new FmsTerrainClientError('send-error', '无法发送地形数据，原地图未改变。')); }
    });
  }
  cancel(): void {
    this.preparing?.abort(); this.preparing = undefined;
    this.fail(abortError());
  }
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
      if (!exact(value, ['kind', 'requestId', 'worldId', 'baseRevision', 'elevations', 'stats', 'drainage']) || value.kind !== (pending.snapshot.fullMap ? 'full-map-generated' : pending.snapshot.template ? 'template-generated' : pending.snapshot.hill ? 'hill-generated' : 'naturalized')
        || !(value.elevations instanceof Int32Array) || value.elevations.length !== pending.snapshot.heights.length
        || !(pending.snapshot.fullMap ? validFullMapStats(value.stats, value.elevations, pending.snapshot) : pending.snapshot.template ? validTemplateStats(value.stats, value.elevations, pending.snapshot) : pending.snapshot.hill ? validHillStats(value.stats, value.elevations, pending.snapshot) : validStats(value.stats, value.elevations, pending.snapshot))
        || !validDrainage(value.drainage, value.elevations, pending.snapshot)) throw protocolError();
      const preview = { worldId: pending.snapshot.worldId, baseRevision: pending.snapshot.revision, elevations: value.elevations, drainage: value.drainage };
      this.clearPending()?.resolve(pending.snapshot.fullMap
        ? { ...preview, stats: value.stats as FmsFullMapStats } : pending.snapshot.template
        ? { ...preview, stats: value.stats as FmsTemplateStats } : pending.snapshot.hill
        ? { ...preview, stats: value.stats as FmsHillStats }
        : { ...preview, stats: value.stats as FmsNaturalizationStats });
    } catch (error) { this.fail(error instanceof FmsTerrainClientError ? error : protocolError()); }
  }
}
