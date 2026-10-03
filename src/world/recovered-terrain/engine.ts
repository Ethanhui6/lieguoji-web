import { createAlea } from './alea';
import { boundedIndices, finiteMean, firstMinimumIndex } from './numeric';
import { TERRAIN_RECIPES } from './templates';
import type { SeedTerrainTemplate } from './contract';
import { yieldAtlas, type AtlasControl } from '../model';

/** Restricted adaptation of the reviewed height generator. See README and the
 * complete third-party notices in ./licenses/. The original global state and
 * unused entry points are deliberately absent. */
export const RECOVERED_WORK_LIMIT = 256000000;
export interface RecoveredGraph {
  width: number; height: number; cellsX: number; cellsY: number;
  points: readonly (readonly [number, number])[]; neighbors: readonly (readonly number[])[];
}
export interface RecoveredEngineControl extends AtlasControl { workLimit?: number }

export async function generateRecoveredHeights(source: RecoveredGraph, seed: string, template: SeedTerrainTemplate, control?: RecoveredEngineControl): Promise<Uint8Array> {
  control?.signal?.throwIfAborted();
  const n = source.points.length, workLimit = control?.workLimit ?? RECOVERED_WORK_LIMIT;
  if (!Number.isInteger(n) || n < 16 || n > 50000 || source.neighbors.length !== n
    || !Number.isInteger(source.cellsX) || !Number.isInteger(source.cellsY) || source.cellsX < 2 || source.cellsY < 2 || source.cellsX * source.cellsY !== n
    || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0 || source.width > 1000000 || source.height > 1000000
    || !Number.isInteger(workLimit) || workLimit < 1 || workLimit > RECOVERED_WORK_LIMIT || !Object.hasOwn(TERRAIN_RECIPES, template)) throw new Error('地形生成图或工作上限无效。');
  const points = source.points.map(point => {
    if (point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < 0 || point[1] < 0 || point[0] > source.width || point[1] > source.height) throw new Error('地形生成坐标无效。');
    return [point[0], point[1]] as const;
  });
  const neighbors = source.neighbors.map((adjacent, id) => {
    if (!adjacent.length || adjacent.length > 16 || adjacent.some(other => !Number.isInteger(other) || other < 0 || other >= n || other === id) || new Set(adjacent).size !== adjacent.length) throw new Error('地形生成邻接无效。');
    return [...adjacent];
  });
  const visited = new Uint8Array(n), connectivity = [0]; visited[0] = 1;
  for (let cursor = 0; cursor < connectivity.length; cursor++) for (const other of neighbors[connectivity[cursor]]) {
    if (!neighbors[other].includes(connectivity[cursor])) throw new Error('地形生成邻接不是双向连接。');
    if (!visited[other]) { visited[other] = 1; connectivity.push(other); }
  }
  if (connectivity.length !== n) throw new Error('地形生成图未完整连通。');
  const graphWidth = source.width, graphHeight = source.height, cellsX = source.cellsX;
  const centerPoint = [graphWidth / 2, graphHeight / 2], random = createAlea(seed);
  // Each invocation owns its Math facade and RNG. Never assign global Math.random.
  const localMath: Math = Object.create(globalThis.Math);
  let work = 0;
  const spend = (amount = 1) => {
    work += amount;
    if (work > workLimit) throw new Error('地形生成超过有界工作预算，本次未生成地图。');
    control?.signal?.throwIfAborted();
  };
  localMath.random = () => { spend(); return random(); };
  const checkpoint = () => yieldAtlas(control, '生成种子地形', work, workLimit);
  const lim = (value: number) => localMath.min(localMath.max(value, 0), 100);
  const probability = (value: number) => value >= 1 ? true : value <= 0 ? false : localMath.random() < value;
  const rand = (min: number, max: number) => localMath.floor(localMath.random() * (max - min + 1)) + min;
  const numberInRange = (text: string) => {
    if (!Number.isNaN(+text)) return ~~(+text) + +probability(+text - ~~(+text));
    const parts = text.split('-'), value = rand(+parts[0], +parts[1]);
    if (parts.length !== 2 || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('内建地形命令的数值范围无效。');
    return value;
  };
  const pointInRange = (range: string, length: number, center: number) => {
    const min = +range.split('-')[0] / 100 || 0, max = +range.split('-')[1] / 100 || min;
    return center + (length / 2 - rand(min * length, max * length));
  };
  const nearest = (x: number, y: number) => {
    let best = 0, distance = Infinity;
    for (let id = 0; id < n; id++) {
      spend(); const candidate = (points[id][0] - x) ** 2 + (points[id][1] - y) ** 2;
      if (candidate < distance) { best = id; distance = candidate; }
    }
    return best;
  };
  let heights = new Uint8Array(n);
  // Original setGraph passes cellsDesired=20000. The recovered getLinePower
  // ignores that argument and looks up an empty outer cells object, yielding
  // 0.79. Preserve this observed compatibility behaviour, rather than use 0.82.
  const blobPower = 0.99, legacyLinePower = 0.79;

  async function hill(countText: string, heightText: string, rangeX: string, rangeY: string) {
    for (let count = numberInRange(countText); count > 0; count--) {
      const change = new Uint8Array(n); let attempts = 0, start: number;
      const height = lim(numberInRange(heightText));
      do {
        start = nearest(pointInRange(rangeX, graphWidth, centerPoint[0]), pointInRange(rangeY, graphHeight, centerPoint[1])); attempts++;
      } while (heights[start] + height > 90 && attempts < 50);
      change[start] = height;
      const queue = [start];
      // A head cursor preserves FIFO/RNG order without Array.shift's quadratic copies.
      for (let head = 0; head < queue.length; head++) for (const next of neighbors[queue[head]]) {
        spend(); if (change[next]) continue;
        change[next] = change[queue[head]] ** blobPower * (localMath.random() * 0.2 + 0.9);
        if (change[next] > 1) queue.push(next);
      }
      spend(n); heights = heights.map((height, id) => lim(height + change[id])); await checkpoint();
    }
  }
  async function pit(countText: string, heightText: string, rangeX: string, rangeY: string) {
    for (let count = numberInRange(countText); count > 0; count--) {
      const used = new Uint8Array(n); let attempts = 0, start: number, height = lim(numberInRange(heightText));
      do {
        start = nearest(pointInRange(rangeX, graphWidth, centerPoint[0]), pointInRange(rangeY, graphHeight, centerPoint[1])); attempts++;
      } while (heights[start] < 20 && attempts < 50);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        height = height ** blobPower * (localMath.random() * 0.2 + 0.9);
        if (height < 1) break;
        for (const next of neighbors[queue[head]]) {
          spend(); if (used[next]) continue;
          heights[next] = lim(heights[next] - height * (localMath.random() * 0.2 + 0.9)); used[next] = 1; queue.push(next);
        }
      }
      await checkpoint();
    }
  }
  async function ridge(countText: string, heightText: string, rangeX: string, rangeY: string, trough: boolean) {
    for (let count = numberInRange(countText); count > 0; count--) {
      const used = new Uint8Array(n); let height = lim(numberInRange(heightText));
      let startX: number, startY: number, start = 0, attempts = 0;
      do {
        startX = pointInRange(rangeX, graphWidth, centerPoint[0]); startY = pointInRange(rangeY, graphHeight, centerPoint[1]);
        if (trough) start = nearest(startX, startY); attempts++;
      } while (trough && heights[start] < 20 && attempts < 50);
      let endX: number, endY: number, distance: number; attempts = 0;
      do {
        const offsetX = localMath.random() * graphWidth * 0.8 + graphWidth * 0.1, offsetY = localMath.random() * graphHeight * 0.7 + graphHeight * 0.15;
        endX = centerPoint[0] + (offsetX - graphWidth / 2); endY = centerPoint[1] + (offsetY - graphHeight / 2);
        distance = localMath.abs(endY - startY) + localMath.abs(endX - startX); attempts++;
      } while ((distance < graphWidth / 8 || distance > graphWidth / (trough ? 2 : 3)) && attempts < 50);
      if (!trough) start = nearest(startX, startY);
      const end = nearest(endX, endY), range = [start]; used[start] = 1;
      let current = start;
      while (current !== end) {
        let minimum = Infinity;
        for (const next of neighbors[current]) {
          spend(); if (used[next]) continue;
          let difference = (points[end][0] - points[next][0]) ** 2 + (points[end][1] - points[next][1]) ** 2;
          if (localMath.random() > (trough ? 0.8 : 0.85)) difference /= 2;
          if (difference < minimum) { minimum = difference; current = next; }
        }
        if (minimum === Infinity) break;
        range.push(current); used[current] = 1;
      }
      let queue = range.slice(), layers = 0;
      while (queue.length) {
        const frontier = queue.slice(); queue = []; layers++;
        for (const id of frontier) heights[id] = trough
          ? lim(heights[id] - height * (localMath.random() * 0.3 + 0.85))
          : lim(heights[id] + height * (localMath.random() * 0.3 + 0.85));
        height = height ** legacyLinePower - 1;
        if (height < 2) break;
        for (const id of frontier) for (const next of neighbors[id]) {
          spend(); if (!used[next]) { queue.push(next); used[next] = 1; }
        }
      }
      range.forEach((id, offset) => {
        if (offset % 6 !== 0) return;
        boundedIndices(layers).forEach(() => {
          spend(neighbors[id].length);
          const next = neighbors[id][firstMinimumIndex(neighbors[id], (a, b) => heights[a] - heights[b])];
          heights[next] = (heights[id] * 2 + heights[next]) / 3; id = next;
        });
      });
      await checkpoint();
    }
  }
  async function strait(widthText: string, direction: string) {
    let width = localMath.min(numberInRange(widthText), cellsX / 3);
    if (width < 1 && probability(width)) return;
    const used = new Uint8Array(n), vertical = direction === 'vertical';
    const startX = vertical ? localMath.floor(localMath.random() * graphWidth * 0.4 + graphWidth * 0.3) : 5;
    const startY = vertical ? 5 : localMath.floor(localMath.random() * graphHeight * 0.4 + graphHeight * 0.3);
    const endX = vertical ? localMath.floor(graphWidth - startX - graphWidth * 0.1 + localMath.random() * graphWidth * 0.2) : graphWidth - 5;
    const endY = vertical ? graphHeight - 5 : localMath.floor(graphHeight - startY - graphHeight * 0.1 + localMath.random() * graphHeight * 0.2);
    const end = nearest(endX, endY); let current = nearest(startX, startY), steps = 0;
    let range: number[] = []; const query: number[] = [];
    while (current !== end) {
      if (++steps > n * 8) throw new Error('海峡路径超过有界步数，本次未生成地图。');
      let minimum = Infinity;
      for (const next of neighbors[current]) {
        spend(); let difference = (points[end][0] - points[next][0]) ** 2 + (points[end][1] - points[next][1]) ** 2;
        if (localMath.random() > 0.8) difference /= 2;
        if (difference < minimum) { minimum = difference; current = next; }
      }
      range.push(current);
    }
    const step = 0.1 / width;
    while (width > 0) {
      const exponent = 0.9 - step * width;
      for (const id of range) for (const next of neighbors[id]) {
        spend(); if (used[next]) continue;
        used[next] = 1; query.push(next); heights[next] **= exponent;
        if (heights[next] > 100) heights[next] = 5;
      }
      range = query.slice(); width--; await checkpoint();
    }
  }
  const modify = (range: string, add: number, multiply: number) => {
    const min = range === 'land' ? 20 : range === 'all' ? 0 : +range.split('-')[0];
    const max = range === 'land' || range === 'all' ? 100 : +range.split('-')[1], land = min === 20;
    spend(n); heights = heights.map(height => {
      if (height < min || height > max) return height;
      if (add) height = land ? localMath.max(height + add, 20) : height + add;
      if (multiply !== 1) height = land ? (height - 20) * multiply + 20 : height * multiply;
      return lim(height);
    });
  };
  const smooth = (factor: number) => {
    spend(n); heights = heights.map((height, id) => {
      spend(neighbors[id].length); const adjacent = [height, ...neighbors[id].map(other => heights[other])];
      return factor === 1 ? finiteMean(adjacent) : lim((height * (factor - 1) + finiteMean(adjacent)) / factor);
    });
  };
  const mask = (power: number) => {
    const fraction = power ? localMath.abs(power) : 1;
    spend(n); heights = heights.map((height, id) => {
      const x = 2 * points[id][0] / graphWidth - 1, y = 2 * points[id][1] / graphHeight - 1;
      let distance = (1 - x ** 2) * (1 - y ** 2); if (power < 0) distance = 1 - distance;
      return lim((height * (fraction - 1) + height * distance) / fraction);
    });
  };
  const steps = TERRAIN_RECIPES[template].split('\n');
  for (const step of steps) {
    await checkpoint(); const [tool, a, b, c, d] = step.trim().split(' ');
    if (tool === 'Hill') await hill(a, b, c, d);
    else if (tool === 'Pit') await pit(a, b, c, d);
    else if (tool === 'Range') await ridge(a, b, c, d, false);
    else if (tool === 'Trough') await ridge(a, b, c, d, true);
    else if (tool === 'Strait') await strait(a, b);
    else if (tool === 'Add') modify(b, +a, 1);
    else if (tool === 'Multiply') modify(b, 0, +a);
    else if (tool === 'Smooth') smooth(+a);
    else if (tool === 'Mask') mask(+a);
    else throw new Error('地形生成含未审核命令。');
  }
  control?.signal?.throwIfAborted();
  if (heights.length !== n || heights.some(height => height > 100)) throw new Error('地形生成输出无效。');
  return heights;
}
