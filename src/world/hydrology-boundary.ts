import { canonicalHydrologyCoastCrossing, HYDROLOGY_LIMITS, NO_WATER, type HydrologyControl, type HydrologyInput, type HydrologyOptions } from './hydrology-kernel';

export interface HydrologyBoundarySource { draftId: string; revision: number; manifestDigest: string; rootDigest: string }
export interface HydrologyBoundaryCore { originColumn: number; originRow: number; columns: number; rows: number }
export interface HydrologyBoundaryInput { source: HydrologyBoundarySource; core: HydrologyBoundaryCore; samples: HydrologyInput }
/** These are source-edge facts, not completed river directions or ocean connectivity. */
export const BOUNDARY_PORT = { land: 1, coast: 2, unknownLand: 3, worldBoundary: 4 } as const;
export const BOUNDARY_EXIT = { none: 0, lowerLand: 1, coast: 2 } as const;
export interface HydrologyBoundarySummary {
  format: 'lieguoji-hydrology-boundary-summary'; version: 1; algorithm: 'fine-boundary-components-v1';
  source: HydrologyBoundarySource; cores: HydrologyBoundaryCore[];
  /** Canonical page order, then row-major inside each disjoint core. */
  nodeIds: Uint32Array;
  /** Index into components, -1 for negative-coverage nodes. */
  componentIds: Int32Array;
  components: {
    /** Lowest world node ID. Components are ordered by this stable ID. */
    nodeId: Uint32Array; heightMeters: Int16Array; nodeCount: Uint32Array; unresolved: Uint8Array;
    /** Deterministic outlet candidate only: lower height, then target world ID,
     * then source world ID. A selected candidate is not a routed flat tree. */
    exitFrom: Int32Array; exitTo: Int32Array; exitKind: Uint8Array; coastXQ: Int32Array; coastYQ: Int32Array;
  };
  ports: {
    from: Uint32Array; to: Int32Array; kind: Uint8Array; relation: Int8Array;
    component: Uint32Array; targetComponent: Int32Array; coastXQ: Int32Array; coastYQ: Int32Array;
  };
  stats: { sampleNodes: number; coreNodes: number; flatComponents: number; ports: number; unresolvedComponents: number;
    operations: number; inputRetainedTypedArrayBytes: number; jobPeakTypedArrayBytes: number; summaryTypedArrayBytes: number };
}
/** A page capability returned by build; its public summary is diagnostic. Merge
 * reads the private immutable samples, never caller-mutated summary arrays. */
export interface HydrologyBoundaryPage {
  format: 'lieguoji-hydrology-boundary-page'; version: 1;
  source: HydrologyBoundarySource; core: HydrologyBoundaryCore; summary: HydrologyBoundarySummary;
}
type OwnedPage = HydrologyBoundaryInput & { retainedBytes: number };
const ownedPages = new WeakMap<HydrologyBoundaryPage, OwnedPage>();
const Int16 = Int16Array, int16Set = Int16Array.prototype.set;
const WORLD = 2049, STEP_Q = 512, DX = [0, 1, 0, -1, -1, 1], DY = [-1, 0, 1, 0, -1, 1];
const integer = (n: unknown, low: number, high: number): n is number => Number.isSafeInteger(n) && (n as number) >= low && (n as number) <= high;
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d?.enumerable && 'value' in d; });
}
const sameSource = (a: HydrologyBoundarySource, b: HydrologyBoundarySource) => a.draftId === b.draftId && a.revision === b.revision && a.manifestDigest === b.manifestDigest && a.rootDigest === b.rootDigest;
function validRectangle(raw: unknown): raw is HydrologyBoundaryCore {
  return exact(raw, ['originColumn', 'originRow', 'columns', 'rows']) && integer(raw.columns, 1, 512) && integer(raw.rows, 1, 512)
    && integer(raw.originColumn, 0, WORLD - raw.columns) && integer(raw.originRow, 0, WORLD - raw.rows);
}
function contains(r: HydrologyBoundaryCore, x: number, y: number) { return x >= r.originColumn && y >= r.originRow && x < r.originColumn + r.columns && y < r.originRow + r.rows; }
function halo(core: HydrologyBoundaryCore): HydrologyBoundaryCore {
  const originColumn = Math.max(0, core.originColumn - 1), originRow = Math.max(0, core.originRow - 1);
  return { originColumn, originRow, columns: Math.min(WORLD, core.originColumn + core.columns + 1) - originColumn,
    rows: Math.min(WORLD, core.originRow + core.rows + 1) - originRow };
}
function capture(input: HydrologyBoundaryInput, options: HydrologyOptions): OwnedPage {
  if (!exact(input, ['source', 'core', 'samples']) || !exact(input.source, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])
    || typeof input.source.draftId !== 'string' || input.source.draftId.length < 1 || input.source.draftId.length > 200 || !integer(input.source.revision, 0, Number.MAX_SAFE_INTEGER)
    || !['manifestDigest' as const, 'rootDigest' as const].every(key => typeof input.source[key] === 'string' && /^[a-f0-9]{64}$/.test(input.source[key] as string))
    || !validRectangle(input.core) || !exact(input.samples, ['originColumn', 'originRow', 'columns', 'rows', 'coverageQ', 'groundMeters'])) throw new Error('跨页水文输入身份或字段无效。');
  const source = { ...input.source } as unknown as HydrologyBoundarySource, core = { ...input.core }, range = halo(core), raw = input.samples;
  if (range.columns > 512 || range.rows > 512 || raw.originColumn !== range.originColumn || raw.originRow !== range.originRow || raw.columns !== range.columns || raw.rows !== range.rows) throw new Error('水文页必须带完整一圈真实 halo，连同核心不超过 512²。');
  const n = range.columns * range.rows, c = raw.coverageQ, h = raw.groundMeters;
  if (!(c instanceof Int16) || !(h instanceof Int16) || !(c.buffer instanceof ArrayBuffer) || !(h.buffer instanceof ArrayBuffer) || c.length !== n || h.length !== n) throw new Error('水文页必须提供完整可私有复制的整数细节点。');
  if (!exact(options, Object.keys(options).filter(key => ['batch', 'maximumOperations', 'maximumTypedArrayBytes'].includes(key)))
    || !integer(options.batch ?? 1024, 64, 8192) || !integer(options.maximumOperations ?? n * HYDROLOGY_LIMITS.operationsPerNode + 1024, 1, n * HYDROLOGY_LIMITS.operationsPerNode + 1024)
    || !integer(options.maximumTypedArrayBytes ?? HYDROLOGY_LIMITS.typedArrayBytes, n * 4, HYDROLOGY_LIMITS.typedArrayBytes)) throw new Error('水文页接管前工作或内存预算无效。');
  // Before the first callback/await. Ignore species, iterator and overridden slice.
  const coverageQ = new Int16(n), groundMeters = new Int16(n); int16Set.call(coverageQ, c); int16Set.call(groundMeters, h);
  return { source, core, samples: { ...range, coverageQ, groundMeters }, retainedBytes: n * 4 };
}
function pageOrder(a: OwnedPage, b: OwnedPage) { return a.core.originRow - b.core.originRow || a.core.originColumn - b.core.originColumn || a.core.rows - b.core.rows || a.core.columns - b.core.columns; }
function touch(a: HydrologyBoundaryCore, b: HydrologyBoundaryCore) {
  return ((a.originColumn + a.columns === b.originColumn || b.originColumn + b.columns === a.originColumn) && Math.max(a.originRow, b.originRow) < Math.min(a.originRow + a.rows, b.originRow + b.rows))
    || ((a.originRow + a.rows === b.originRow || b.originRow + b.rows === a.originRow) && Math.max(a.originColumn, b.originColumn) < Math.min(a.originColumn + a.columns, b.originColumn + b.columns));
}
export interface HydrologyBoundaryPreflight {
  pages: { core: HydrologyBoundaryCore; rectangle: HydrologyBoundaryCore }[];
  sampleNodes: number; coreNodes: number; portCapacity: number;
  /** Dense typed arrays only. Excludes the extractor's full verified document
   * snapshot, JavaScript object overhead and garbage collector retention. */
  maximumLiveBoundaryTypedArrayBytes: number;
  maximumTypedArrayBytes: number;
}
/** No terrain reads or dense/typed-array allocation. Small returned rectangles
 * are copied, so callers cannot change the checked plan during extraction. */
export function preflightHydrologyBoundary(cores: readonly HydrologyBoundaryCore[], options: { maximumTypedArrayBytes?: number } = {}): HydrologyBoundaryPreflight {
  if (!Array.isArray(cores) || Object.getPrototypeOf(cores) !== Array.prototype || cores.length < 2 || cores.length > 4
    || Reflect.ownKeys(cores).length !== cores.length + 1 || !exact(options, Object.keys(options).filter(key => key === 'maximumTypedArrayBytes'))) throw new Error('跨页水文预检仅接受2至4个独立核心。');
  const pages: HydrologyBoundaryPreflight['pages'] = [];
  let sampleNodes = 0, coreNodes = 0, portCapacity = 0, maximumPageSamples = 0;
  for (let i = 0; i < cores.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(cores, String(i));
    if (!descriptor || !('value' in descriptor) || !validRectangle(descriptor.value)) throw new Error('跨页水文核心字段或访问器无效。');
    const core = { ...descriptor.value }, rectangle = halo(core), samples = rectangle.columns * rectangle.rows;
    if (rectangle.columns > HYDROLOGY_LIMITS.side || rectangle.rows > HYDROLOGY_LIMITS.side) throw new Error('核心加真实halo超过512节点边长。');
    pages.push({ core, rectangle }); sampleNodes += samples; coreNodes += core.columns * core.rows;
    maximumPageSamples = Math.max(maximumPageSamples, samples); portCapacity += 4 * (core.columns + core.rows) + 8;
  }
  pages.sort((a, b) => a.core.originRow - b.core.originRow || a.core.originColumn - b.core.originColumn || a.core.rows - b.core.rows || a.core.columns - b.core.columns);
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    const a = pages[i].core, b = pages[j].core;
    if (Math.max(a.originColumn, b.originColumn) < Math.min(a.originColumn + a.columns, b.originColumn + b.columns)
      && Math.max(a.originRow, b.originRow) < Math.min(a.originRow + a.rows, b.originRow + b.rows)) throw new Error('水文核心有重复所有者。');
  }
  let connected = 1;
  for (let pass = 0; pass < pages.length; pass++) for (let i = 0; i < pages.length; i++) for (let j = 0; j < pages.length; j++)
    if (connected & (1 << i) && touch(pages[i].core, pages[j].core)) connected |= 1 << j;
  if (connected !== (1 << pages.length) - 1) throw new Error('本切片只合并共享真实边的相邻核心页。');
  // Retained pages: 4*S samples + (8+28)*N summary + 26*P ports.
  // Merge: (12+28)*N scratch/output + 26*P ports. Include a single
  // extractor raw result while handing it over to the private page builder.
  const maximumLiveBoundaryTypedArrayBytes = 4 * sampleNodes + 76 * coreNodes + 52 * portCapacity + 4 * maximumPageSamples;
  const maximumTypedArrayBytes = options.maximumTypedArrayBytes ?? HYDROLOGY_LIMITS.typedArrayBytes;
  if (sampleNodes > HYDROLOGY_LIMITS.nodes || !integer(maximumTypedArrayBytes, 1, HYDROLOGY_LIMITS.typedArrayBytes)
    || maximumLiveBoundaryTypedArrayBytes > maximumTypedArrayBytes) throw new Error('跨页水文提取前总样本或最坏数组预算超限。');
  return { pages, sampleNodes, coreNodes, portCapacity, maximumLiveBoundaryTypedArrayBytes, maximumTypedArrayBytes };
}
function prepare(pages: OwnedPage[], options: HydrologyOptions) {
  if (!exact(options, Object.keys(options).filter(key => ['batch', 'maximumOperations', 'maximumTypedArrayBytes'].includes(key)))) throw new Error('未知水文工作预算。');
  const sampleNodes = pages.reduce((sum, page) => sum + page.samples.columns * page.samples.rows, 0), coreNodes = pages.reduce((sum, page) => sum + page.core.columns * page.core.rows, 0);
  const batch = options.batch ?? 1024, maxOperations = options.maximumOperations ?? sampleNodes * HYDROLOGY_LIMITS.operationsPerNode + 1024, maxBytes = options.maximumTypedArrayBytes ?? HYDROLOGY_LIMITS.typedArrayBytes;
  if (sampleNodes > HYDROLOGY_LIMITS.nodes || !integer(batch, 64, 8192) || !integer(maxOperations, 1, sampleNodes * HYDROLOGY_LIMITS.operationsPerNode + 1024) || !integer(maxBytes, 1, HYDROLOGY_LIMITS.typedArrayBytes)) throw new Error('跨页水文总输入、工作或内存预算超限。');
  pages.sort(pageOrder);
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    if (!sameSource(pages[i].source, pages[j].source)) throw new Error('水文页不属于同一固定地理来源。');
    const a = pages[i].core, b = pages[j].core;
    if (Math.max(a.originColumn, b.originColumn) < Math.min(a.originColumn + a.columns, b.originColumn + b.columns)
      && Math.max(a.originRow, b.originRow) < Math.min(a.originRow + a.rows, b.originRow + b.rows)) throw new Error('水文核心有重复所有者。');
  }
  const connected = new Set([0]);
  for (let k = 0; k < pages.length; k++) for (let i = 0; i < pages.length; i++) if (!connected.has(i) && [...connected].some(j => touch(pages[i].core, pages[j].core))) connected.add(i);
  if (connected.size !== pages.length) throw new Error('本切片只合并共享真实边的相邻核心页。');
  return { sampleNodes, coreNodes, batch, maxOperations, maxBytes };
}

async function compute(pages: OwnedPage[], options: HydrologyOptions, control?: HydrologyControl): Promise<HydrologyBoundarySummary> {
  const limits = prepare(pages, options), n = limits.coreNodes;
  let operations = 0, nextYield = 0, bytes = pages.reduce((sum, page) => sum + page.retainedBytes, 0);
  const inputRetainedTypedArrayBytes = bytes;
  const reserve = (count: number) => { if (bytes + count > limits.maxBytes) throw new Error('跨页水文实际保留数组超出既有内存预算。'); bytes += count; };
  const work = () => { if (++operations > limits.maxOperations) throw new Error('跨页水文超出既有操作预算。'); };
  const checkpoint = async (phase: string) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, operations, limits.maxOperations); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted(); nextYield = operations + limits.batch;
  };
  control?.signal?.throwIfAborted(); reserve(0); await checkpoint('boundary-capture');
  const rawSample = (page: OwnedPage, x: number, y: number) => {
    const s = page.samples; if (!contains(s, x, y)) return undefined;
    const i = (y - s.originRow) * s.columns + x - s.originColumn;
    return { coverageQ: s.coverageQ[i], height: s.groundMeters[i] };
  };
  for (let p = 0; p < pages.length; p++) {
    const s = pages[p].samples;
    for (let id = 0; id < s.coverageQ.length; id++) {
      work(); const c = s.coverageQ[id], h = s.groundMeters[id], x = s.originColumn + id % s.columns, y = s.originRow + Math.floor(id / s.columns);
      if (c === -32768 || h < -12000 || h > 12000 || c < 0 && h >= 0 || c === 0 && h !== 0 || c > 0 && h < 0) throw new Error('跨页水文实际节点海陆或高程无效。');
      for (let other = 0; other < p; other++) { work(); const match = rawSample(pages[other], x, y); if (match && (match.coverageQ !== c || match.height !== h)) throw new Error('相同世界节点的核心/halo 值不一致。'); }
      if (operations >= nextYield) await checkpoint('boundary-validate-halo');
    }
  }
  reserve(n * 12);
  const nodeIds = new Uint32Array(n), componentIds = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1);
  const offsets: number[] = []; let nextNode = 0;
  for (const page of pages) {
    offsets.push(nextNode); const c = page.core;
    for (let y = c.originRow; y < c.originRow + c.rows; y++) for (let x = c.originColumn; x < c.originColumn + c.columns; x++) {
      work(); nodeIds[nextNode++] = y * WORLD + x; if (operations >= nextYield) await checkpoint('boundary-core-owners');
    }
  }
  const owner = (x: number, y: number): number => pages.findIndex(page => contains(page.core, x, y));
  const indexAt = (x: number, y: number): number => { const p = owner(x, y); if (p < 0) return -1; const c = pages[p].core; return offsets[p] + (y - c.originRow) * c.columns + x - c.originColumn; };
  const find = (id: number): number => {
    let root = id; while (parent[root] >= 0) { work(); root = parent[root]; }
    while (id !== root) { work(); const next = parent[id]; parent[id] = root; id = next; } return root;
  };
  const unite = (a: number, b: number) => {
    let rootA = find(a), rootB = find(b); if (rootA === rootB) return;
    if (parent[rootA] > parent[rootB] || parent[rootA] === parent[rootB] && nodeIds[rootA] > nodeIds[rootB]) [rootA, rootB] = [rootB, rootA];
    parent[rootA] += parent[rootB]; parent[rootB] = rootA;
  };
  const landEdge = (page: OwnedPage, x: number, y: number, ox: number, oy: number): boolean => {
    const a = rawSample(page, x, y), b = rawSample(page, ox, oy); if (!a || !b || a.coverageQ < 0 || b.coverageQ < 0) return false;
    if (a.coverageQ > 0 || b.coverageQ > 0) return true;
    const lx = Math.min(x, ox), ly = Math.min(y, oy), hx = Math.max(x, ox), hy = Math.max(y, oy), horizontal = y === oy;
    const first = rawSample(page, horizontal ? lx : lx - 1, horizontal ? ly - 1 : ly), second = rawSample(page, horizontal ? hx : hx + 1, horizontal ? hy + 1 : hy);
    return !!first && first.coverageQ >= 0 || !!second && second.coverageQ >= 0;
  };
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p], c = page.core;
    for (let local = 0; local < c.columns * c.rows; local++) {
      work(); const x = c.originColumn + local % c.columns, y = c.originRow + Math.floor(local / c.columns), a = rawSample(page, x, y)!;
      if (a.coverageQ >= 0) for (const direction of [1, 2]) {
        work(); const ox = x + DX[direction], oy = y + DY[direction], other = indexAt(ox, oy), b = rawSample(page, ox, oy);
        if (other >= 0 && b && b.height === a.height && landEdge(page, x, y, ox, oy)) unite(offsets[p] + local, other);
      }
      if (operations >= nextYield) await checkpoint('boundary-union-flats');
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) {
    work(); const x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD), page = pages[owner(x, y)];
    if (rawSample(page, x, y)!.coverageQ >= 0) { componentIds[i] = find(i); if (parent[i] < 0) count++; }
    if (operations >= nextYield) await checkpoint('boundary-component-roots');
  }
  // Union parents are no longer needed. Reuse their bounded buffer as root ->
  // component table; public component IDs are assigned in global node order.
  parent.fill(-1); reserve(count * 28);
  const components = { nodeId: new Uint32Array(count), heightMeters: new Int16Array(count), nodeCount: new Uint32Array(count), unresolved: new Uint8Array(count),
    exitFrom: new Int32Array(count).fill(-1), exitTo: new Int32Array(count).fill(-1), exitKind: new Uint8Array(count), coastXQ: new Int32Array(count).fill(-1), coastYQ: new Int32Array(count).fill(-1) };
  let assigned = 0;
  const cursors = pages.map(() => 0);
  /** Merge at most four sorted core streams; no uninterruptible global sort. */
  const nextGlobalIndex = () => {
    let best = -1, page = -1;
    for (let p = 0; p < pages.length; p++) {
      work(); if (cursors[p] >= pages[p].core.columns * pages[p].core.rows) continue;
      const index = offsets[p] + cursors[p]; if (best < 0 || nodeIds[index] < nodeIds[best]) { best = index; page = p; }
    }
    if (page >= 0) cursors[page]++; return best;
  };
  for (let scanned = 0; scanned < n; scanned++) {
    const i = nextGlobalIndex(), root = componentIds[i];
    if (root >= 0) {
      if (parent[root] < 0) { parent[root] = assigned; components.nodeId[assigned] = nodeIds[i]; const x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD); components.heightMeters[assigned] = rawSample(pages[owner(x, y)], x, y)!.height; assigned++; }
      const component = parent[root]; componentIds[i] = component; components.nodeCount[component]++;
    }
    if (operations >= nextYield) await checkpoint('boundary-order-components');
  }
  if (assigned !== count) throw new Error('平地组件计数不一致。');
  // A port can occur only where one of at most six incident directions leaves
  // a core. This conservative perimeter bound includes zero-node diagonals.
  const portCapacity = pages.reduce((sum, p) => sum + 4 * (p.core.columns + p.core.rows) + 8, 0); reserve(portCapacity * 26);
  const rawPorts = { from: new Uint32Array(portCapacity), to: new Int32Array(portCapacity), kind: new Uint8Array(portCapacity), relation: new Int8Array(portCapacity),
    component: new Uint32Array(portCapacity), targetComponent: new Int32Array(portCapacity), coastXQ: new Int32Array(portCapacity), coastYQ: new Int32Array(portCapacity) };
  let portCount = 0;
  const addPort = (from: number, to: number, kind: number, relation: number, component: number, targetComponent: number, cross?: { xQ: number; yQ: number }) => {
    if (portCount >= portCapacity) throw new Error('跨页端口超过真实周长预算。');
    const i = portCount++; rawPorts.from[i] = from; rawPorts.to[i] = to; rawPorts.kind[i] = kind; rawPorts.relation[i] = relation;
    rawPorts.component[i] = component; rawPorts.targetComponent[i] = targetComponent; rawPorts.coastXQ[i] = cross?.xQ ?? -1; rawPorts.coastYQ[i] = cross?.yQ ?? -1;
  };
  const preferExit = (component: number, from: number, to: number, height: number, kind: number, cross?: { xQ: number; yQ: number }) => {
    const oldTo = components.exitTo[component], oldKind = components.exitKind[component];
    let oldHeight = Infinity;
    if (oldKind === BOUNDARY_EXIT.coast) oldHeight = 0;
    else if (oldTo >= 0) { const x = oldTo % WORLD, y = Math.floor(oldTo / WORLD); for (const page of pages) { const sample = rawSample(page, x, y); if (sample) { oldHeight = sample.height; break; } } }
    if (!oldKind || height < oldHeight || height === oldHeight && (to < oldTo || to === oldTo && from < components.exitFrom[component])) {
      components.exitFrom[component] = from; components.exitTo[component] = to; components.exitKind[component] = kind;
      components.coastXQ[component] = cross?.xQ ?? -1; components.coastYQ[component] = cross?.yQ ?? -1;
    }
  };
  cursors.fill(0);
  for (let scanned = 0; scanned < n; scanned++) {
    const i = nextGlobalIndex(), component = componentIds[i], gid = nodeIds[i], x = gid % WORLD, y = Math.floor(gid / WORLD), p = owner(x, y), page = pages[p], a = rawSample(page, x, y)!;
    if (component >= 0) for (let direction = 0; direction < (a.coverageQ === 0 ? 6 : 4); direction++) {
      work(); const ox = x + DX[direction], oy = y + DY[direction];
      if (ox < 0 || oy < 0 || ox >= WORLD || oy >= WORLD) {
        // Do not invent an ocean beyond the map. Cardinal world edges are
        // explicit unresolved boundary facts, not an implicit drainage policy.
        if (direction < 4) { components.unresolved[component] = 1; addPort(gid, -1, BOUNDARY_PORT.worldBoundary, 0, component, -1); } continue;
      }
      const b = rawSample(page, ox, oy); if (!b) throw new Error('真实 halo 缺少相邻源节点。');
      const target = oy * WORLD + ox, other = indexAt(ox, oy), crossingCore = !contains(page.core, ox, oy);
      if (b.coverageQ < 0) {
        const cross = canonicalHydrologyCoastCrossing({ xQ: x * STEP_Q, yQ: y * STEP_Q, coverageQ: a.coverageQ }, { xQ: ox * STEP_Q, yQ: oy * STEP_Q, coverageQ: b.coverageQ });
        preferExit(component, gid, target, 0, BOUNDARY_EXIT.coast, cross);
        if (crossingCore) addPort(gid, target, BOUNDARY_PORT.coast, -1, component, -1, cross);
      } else if (direction < 4 && landEdge(page, x, y, ox, oy)) {
        if (b.height < a.height) preferExit(component, gid, target, b.height, BOUNDARY_EXIT.lowerLand);
        if (other < 0) components.unresolved[component] = 1;
        if (crossingCore) addPort(gid, target, other >= 0 ? BOUNDARY_PORT.land : BOUNDARY_PORT.unknownLand, Math.sign(b.height - a.height), component, other >= 0 ? componentIds[other] : -1);
      }
    }
    if (operations >= nextYield) await checkpoint('boundary-port-facts');
  }
  const ports = { from: rawPorts.from.subarray(0, portCount), to: rawPorts.to.subarray(0, portCount), kind: rawPorts.kind.subarray(0, portCount), relation: rawPorts.relation.subarray(0, portCount),
    component: rawPorts.component.subarray(0, portCount), targetComponent: rawPorts.targetComponent.subarray(0, portCount), coastXQ: rawPorts.coastXQ.subarray(0, portCount), coastYQ: rawPorts.coastYQ.subarray(0, portCount) };
  let unresolvedComponents = 0;
  for (let i = 0; i < count; i++) { work(); unresolvedComponents += components.unresolved[i]; if (operations >= nextYield) await checkpoint('boundary-summary'); }
  const summaryTypedArrayBytes = n * 8 + count * 28 + portCapacity * 26;
  await checkpoint('boundary-complete');
  return { format: 'lieguoji-hydrology-boundary-summary', version: 1, algorithm: 'fine-boundary-components-v1', source: { ...pages[0].source }, cores: pages.map(p => ({ ...p.core })), nodeIds, componentIds, components, ports,
    stats: { sampleNodes: limits.sampleNodes, coreNodes: n, flatComponents: count, ports: portCount, unresolvedComponents, operations, inputRetainedTypedArrayBytes, jobPeakTypedArrayBytes: bytes, summaryTypedArrayBytes } };
}

export async function buildHydrologyBoundaryPage(input: HydrologyBoundaryInput, options: HydrologyOptions = {}, control?: HydrologyControl): Promise<HydrologyBoundaryPage> {
  control?.signal?.throwIfAborted(); const owned = capture(input, options), summary = await compute([owned], options, control);
  const page: HydrologyBoundaryPage = { format: 'lieguoji-hydrology-boundary-page', version: 1, source: { ...owned.source }, core: { ...owned.core }, summary };
  owned.retainedBytes += summary.stats.summaryTypedArrayBytes; ownedPages.set(page, owned); return page;
}
export async function mergeHydrologyBoundaryPages(input: readonly HydrologyBoundaryPage[], options: HydrologyOptions = {}, control?: HydrologyControl): Promise<HydrologyBoundarySummary> {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length < 2 || input.length > 4 || Reflect.ownKeys(input).length !== input.length + 1) throw new Error('当前水文边界切片只合并 2–4 个私有相邻页。');
  const pages: OwnedPage[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d?.enumerable || !('value' in d)) throw new Error('水文页数组不可含访问器。');
    const owned = ownedPages.get(d.value); if (!owned) throw new Error('水文页必须来自实际私有构造，不能伪造摘要。'); pages.push(owned);
  }
  // These references are immutable private ingress snapshots. Public arrays
  // and page metadata cannot mutate them; no second raw ownership copy occurs.
  return compute(pages, options, control);
}

/** Separate contract from single-domain HydrologyResult/Trace. Coast means an
 * actual negative-coverage neighbour, not proof of global ocean connectivity. */
export const RECEIVER_TERMINAL = { coast: -1, depression: -2, unresolved: -3, excluded: -4 } as const;
export const RECEIVER_STATUS = { excluded: 0, coast: 1, depression: 2, unresolved: 3 } as const;
export interface HydrologyPageReceivers {
  format: 'lieguoji-hydrology-page-receivers'; version: 1; algorithm: 'fine-two-page-receivers-v1';
  source: HydrologyBoundarySource; cores: HydrologyBoundaryCore[]; stepQ: 512;
  /** Canonical page order/row-major. Stable world IDs, never simulation IDs. */
  nodeIds: Uint32Array; coverageQ: Int16Array; groundMeters: Int16Array;
  /** >=0 is a world node ID owned by these cores; otherwise RECEIVER_TERMINAL. */
  receiverNodeIds: Int32Array; terminalNodeIds: Uint32Array; drainageStatus: Uint8Array;
  contributingSamples: Uint32Array; contributingSamplesIncomplete: Uint8Array;
  /** No rainfall/volume/lake simulation in this slice: every value NO_WATER. */
  lakeWaterSurfaceMeters: Int16Array;
  /** Only terminal rows carry an actual coast crossing or external witness. */
  coastXQ: Int32Array; coastYQ: Int32Array; boundaryTargetNodeIds: Int32Array;
  stats: { sampleNodes: number; coreNodes: number; landNodes: number; crossPageReceivers: number;
    operations: number; maximumOperations: number; outputTypedArrayBytes: number; maximumLiveTypedArrayBytes: number };
}
export function preflightHydrologyReceivers(cores: readonly HydrologyBoundaryCore[], options: { maximumTypedArrayBytes?: number } = {}) {
  const plan = preflightHydrologyBoundary(cores, options);
  if (plan.pages.length !== 2 || plan.pages.some(page => page.core.columns > 128 || page.core.rows > 128)) throw new Error('接收关系切片仅支持两个相邻的至多128×128核心。');
  // Boundary retained/scratch worst case plus complete receiver outputs and
  // queue/indegree. Counts nodeIds twice conservatively. Full Owned snapshots,
  // JS objects and garbage awaiting collection are outside this array bound.
  const maximumLiveTypedArrayBytes = plan.maximumLiveBoundaryTypedArrayBytes + plan.coreNodes * 41;
  if (maximumLiveTypedArrayBytes > plan.maximumTypedArrayBytes) throw new Error('两页接收关系在抽取前超过数组预算。');
  const maximumKernelOperations = 2 * plan.sampleNodes * HYDROLOGY_LIMITS.operationsPerNode + 3 * 1024;
  return { ...plan, maximumLiveTypedArrayBytes, maximumKernelOperations };
}

/** Private page capabilities are the only input. A forged/mutated public
 * summary cannot supply data. All geography remains the original private copy. */
export async function buildHydrologyPageReceivers(input: readonly HydrologyBoundaryPage[], options: HydrologyOptions = {}, control?: HydrologyControl): Promise<HydrologyPageReceivers> {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length !== 2 || Reflect.ownKeys(input).length !== 3) throw new Error('接收关系只接受两页私有能力。');
  const pages: OwnedPage[] = [];
  for (let p = 0; p < 2; p++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(p));
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('接收关系页不可含访问器。');
    const owned = ownedPages.get(descriptor.value); if (!owned) throw new Error('接收关系页必须来自实际私有构造。'); pages.push(owned);
  }
  const limits = prepare(pages, options), plan = preflightHydrologyReceivers(pages.map(page => page.core), { maximumTypedArrayBytes: limits.maxBytes });
  control?.signal?.throwIfAborted();
  // Existing merge authenticates identical halo samples and actual zero/land
  // edges. Its components remain equal-height components, never basin labels.
  const summary = await compute(pages, options, control), n = limits.coreNodes;
  const UNASSIGNED = -10, nodeIds = summary.nodeIds;
  const coverageQ = new Int16(n), groundMeters = new Int16(n), receiver = new Int32Array(n).fill(UNASSIGNED);
  const terminalNodeIds = new Uint32Array(n), drainageStatus = new Uint8Array(n), contributingSamples = new Uint32Array(n), incomplete = new Uint8Array(n);
  const lakeWaterSurfaceMeters = new Int16(n).fill(NO_WATER), coastXQ = new Int32Array(n).fill(-1), coastYQ = new Int32Array(n).fill(-1), external = new Int32Array(n).fill(-1);
  const indegree = new Uint8Array(n), queue = new Uint32Array(n);
  let operations = summary.stats.operations, nextYield = operations, landNodes = 0, crossPageReceivers = 0;
  const work = () => { if (++operations > limits.maxOperations) throw new Error('两页接收关系超出既有操作预算。'); };
  const checkpoint = async (phase: string) => {
    control?.signal?.throwIfAborted(); control?.onProgress?.(phase, operations, limits.maxOperations); control?.signal?.throwIfAborted();
    if (control?.yieldControl) await control.yieldControl(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
    control?.signal?.throwIfAborted(); nextYield = operations + limits.batch;
  };
  const offsets = [0, pages[0].core.columns * pages[0].core.rows];
  const owner = (x: number, y: number) => pages.findIndex(page => contains(page.core, x, y));
  const indexAt = (x: number, y: number) => { const p = owner(x, y); return p < 0 ? -1 : offsets[p] + (y - pages[p].core.originRow) * pages[p].core.columns + x - pages[p].core.originColumn; };
  const sample = (page: OwnedPage, x: number, y: number) => {
    const s = page.samples; if (!contains(s, x, y)) return undefined;
    const i = (y - s.originRow) * s.columns + x - s.originColumn; return { c: s.coverageQ[i], h: s.groundMeters[i] };
  };
  const landEdge = (page: OwnedPage, x: number, y: number, ox: number, oy: number) => {
    const a = sample(page, x, y), b = sample(page, ox, oy); if (!a || !b || a.c < 0 || b.c < 0) return false;
    if (a.c > 0 || b.c > 0) return true;
    const lx = Math.min(x, ox), ly = Math.min(y, oy), hx = Math.max(x, ox), hy = Math.max(y, oy), horizontal = y === oy;
    const first = sample(page, horizontal ? lx : lx - 1, horizontal ? ly - 1 : ly), second = sample(page, horizontal ? hx : hx + 1, horizontal ? hy + 1 : hy);
    return !!first && first.c >= 0 || !!second && second.c >= 0;
  };
  // Merge two already sorted core streams for deterministic world-ID seed order.
  const cursors = [0, 0];
  const nextGlobal = () => {
    let best = -1, page = -1;
    for (let p = 0; p < 2; p++) { work(); if (cursors[p] >= pages[p].core.columns * pages[p].core.rows) continue;
      const index = offsets[p] + cursors[p]; if (best < 0 || nodeIds[index] < nodeIds[best]) { best = index; page = p; } }
    if (page >= 0) cursors[page]++; return best;
  };
  await checkpoint('receiver-capture');
  for (let i = 0; i < n; i++) {
    work(); const x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD), a = sample(pages[owner(x, y)], x, y)!;
    coverageQ[i] = a.c; groundMeters[i] = a.h;
    if (a.c < 0) receiver[i] = RECEIVER_TERMINAL.excluded; else { contributingSamples[i] = 1; landNodes++; }
    if (operations >= nextYield) await checkpoint('receiver-copy');
  }
  for (let i = 0; i < n; i++) {
    work(); if (coverageQ[i] < 0) { if (operations >= nextYield) await checkpoint('receiver-descent'); continue; }
    const gid = nodeIds[i], x = gid % WORLD, y = Math.floor(gid / WORLD), page = pages[owner(x, y)];
    let bestHeight = groundMeters[i], bestKey = Infinity, best = UNASSIGNED, bestCoast = false, witness = -1, bestDirection = -1;
    // Receiver edges remain cardinal. A zero node may itself already be on
    // the coast of an incident NW/SE source triangle; the diagonal witness
    // then proves a coast terminal at this same node, never a diagonal flow.
    for (let d = 0; d < (coverageQ[i] === 0 ? 6 : 4); d++) {
      work(); const ox = x + DX[d], oy = y + DY[d];
      if (ox < 0 || oy < 0 || ox >= WORLD || oy >= WORLD) { if (d < 4) incomplete[i] = 1; continue; }
      const b = sample(page, ox, oy); if (!b) throw new Error('接收关系缺失真实halo。');
      const other = indexAt(ox, oy), coast = b.c < 0, key = oy * WORLD + ox;
      if (d >= 4 && !coast) continue;
      if (!coast && !landEdge(page, x, y, ox, oy)) continue;
      if (!coast && other < 0) incomplete[i] = 1;
      const height = coast ? 0 : b.h;
      if (!coast && height >= groundMeters[i]) continue;
      if (height < bestHeight || height === bestHeight && (coast && !bestCoast || coast === bestCoast && key < bestKey)) {
        bestHeight = height; bestKey = key; bestCoast = coast; witness = key; bestDirection = d;
        best = coast ? RECEIVER_TERMINAL.coast : other < 0 ? RECEIVER_TERMINAL.unresolved : other;
      }
    }
    receiver[i] = best;
    if (best === RECEIVER_TERMINAL.coast) {
      const ox = x + DX[bestDirection], oy = y + DY[bestDirection], b = sample(page, ox, oy)!;
      const cross = canonicalHydrologyCoastCrossing({ xQ: x * STEP_Q, yQ: y * STEP_Q, coverageQ: coverageQ[i] }, { xQ: ox * STEP_Q, yQ: oy * STEP_Q, coverageQ: b.c });
      coastXQ[i] = cross.xQ; coastYQ[i] = cross.yQ;
    } else if (best === RECEIVER_TERMINAL.unresolved) external[i] = witness;
    if (operations >= nextYield) await checkpoint('receiver-descent');
  }
  let head = 0, tail = 0;
  for (let scanned = 0; scanned < n; scanned++) { const i = nextGlobal(); if (coverageQ[i] >= 0 && receiver[i] !== UNASSIGNED) queue[tail++] = i; if (operations >= nextYield) await checkpoint('receiver-flat-seeds'); }
  while (head < tail) {
    const i = queue[head++], x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD), page = pages[owner(x, y)]; work();
    for (let d = 0; d < 4; d++) { work(); const ox = x + DX[d], oy = y + DY[d], other = indexAt(ox, oy);
      if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[i] && landEdge(page, x, y, ox, oy)) { receiver[other] = i; queue[tail++] = other; } }
    if (operations >= nextYield) await checkpoint('receiver-route-flats');
  }
  cursors.fill(0);
  for (let scanned = 0; scanned < n; scanned++) {
    const start = nextGlobal(); if (receiver[start] !== UNASSIGNED) { if (operations >= nextYield) await checkpoint('receiver-closed-flats'); continue; }
    head = 0; tail = 1; queue[0] = start; receiver[start] = RECEIVER_TERMINAL.depression; let edge = -1, edgeTarget = -1;
    while (head < tail) {
      const i = queue[head++], x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD), page = pages[owner(x, y)]; work();
      for (let d = 0; d < 4; d++) {
        work(); const ox = x + DX[d], oy = y + DY[d], other = indexAt(ox, oy), worldEdge = ox < 0 || oy < 0 || ox >= WORLD || oy >= WORLD;
        const b = worldEdge ? undefined : sample(page, ox, oy), sameLand = !worldEdge && b && landEdge(page, x, y, ox, oy);
        // Only an equal/lower external land edge leaves this flat unresolved;
        // a higher neighbour alone cannot be its missing downhill receiver.
        if (other < 0 && (worldEdge || b && sameLand && b.h <= groundMeters[i]) && (edge < 0 || nodeIds[i] < nodeIds[edge])) { edge = i; edgeTarget = worldEdge ? -1 : oy * WORLD + ox; }
        if (other >= 0 && receiver[other] === UNASSIGNED && groundMeters[other] === groundMeters[i] && sameLand) { receiver[other] = i; queue[tail++] = other; }
      }
      if (operations >= nextYield) await checkpoint('receiver-closed-flats');
    }
    if (edge >= 0) {
      let i = edge, previous: number = RECEIVER_TERMINAL.unresolved;
      while (i >= 0) { work(); const next = receiver[i]; receiver[i] = previous; previous = i; i = next; if (operations >= nextYield) await checkpoint('receiver-boundary-stop'); }
      external[edge] = edgeTarget;
    }
  }
  head = 0; tail = 0;
  for (let i = 0; i < n; i++) { work(); if (receiver[i] >= 0) indegree[receiver[i]]++; if (operations >= nextYield) await checkpoint('receiver-topology'); }
  for (let i = 0; i < n; i++) { work(); if (coverageQ[i] >= 0 && indegree[i] === 0) queue[tail++] = i; if (operations >= nextYield) await checkpoint('receiver-topology'); }
  while (head < tail) {
    const i = queue[head++], to = receiver[i]; work();
    if (to >= 0) { contributingSamples[to] += contributingSamples[i]; incomplete[to] |= incomplete[i]; if (--indegree[to] === 0) queue[tail++] = to; }
    if (operations >= nextYield) await checkpoint('receiver-accumulation');
  }
  if (tail !== landNodes) throw new Error('跨页接收关系存在闭环或断链。');
  for (let q = tail - 1; q >= 0; q--) {
    work(); const i = queue[q], to = receiver[i];
    if (to >= 0) { terminalNodeIds[i] = terminalNodeIds[to]; drainageStatus[i] = drainageStatus[to]; }
    else { terminalNodeIds[i] = nodeIds[i]; drainageStatus[i] = to === RECEIVER_TERMINAL.coast ? RECEIVER_STATUS.coast : to === RECEIVER_TERMINAL.depression ? RECEIVER_STATUS.depression : RECEIVER_STATUS.unresolved; }
    if (operations >= nextYield) await checkpoint('receiver-upstream-terminals');
  }
  for (let i = 0; i < n; i++) {
    work(); const to = receiver[i];
    if (to >= 0) {
      const x = nodeIds[i] % WORLD, y = Math.floor(nodeIds[i] / WORLD), ox = nodeIds[to] % WORLD, oy = Math.floor(nodeIds[to] / WORLD);
      if (Math.abs(x - ox) + Math.abs(y - oy) !== 1 || groundMeters[to] > groundMeters[i] || !landEdge(pages[owner(x, y)], x, y, ox, oy)) throw new Error('接收关系不是实际相邻不逆坡陆地。');
      if (owner(x, y) !== owner(ox, oy)) crossPageReceivers++; receiver[i] = nodeIds[to];
    }
    if (operations >= nextYield) await checkpoint('receiver-world-ids');
  }
  const outputTypedArrayBytes = [nodeIds, coverageQ, groundMeters, receiver, terminalNodeIds, drainageStatus, contributingSamples, incomplete, lakeWaterSurfaceMeters, coastXQ, coastYQ, external].reduce((sum, array) => sum + array.byteLength, 0);
  await checkpoint('receiver-complete');
  return { format: 'lieguoji-hydrology-page-receivers', version: 1, algorithm: 'fine-two-page-receivers-v1', source: { ...pages[0].source }, cores: pages.map(page => ({ ...page.core })), stepQ: STEP_Q,
    nodeIds, coverageQ, groundMeters, receiverNodeIds: receiver, terminalNodeIds, drainageStatus, contributingSamples, contributingSamplesIncomplete: incomplete, lakeWaterSurfaceMeters,
    coastXQ, coastYQ, boundaryTargetNodeIds: external,
    stats: { sampleNodes: limits.sampleNodes, coreNodes: n, landNodes, crossPageReceivers, operations, maximumOperations: limits.maxOperations, outputTypedArrayBytes, maximumLiveTypedArrayBytes: plan.maximumLiveTypedArrayBytes } };
}
