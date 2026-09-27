// src/world/detail-coast-types.ts
function detailCoastKey(bx, by) {
  if (!Number.isInteger(bx) || !Number.isInteger(by) || bx < 0 || by < 0 || bx >= 64 || by >= 64) throw new Error("\u7EC6\u6D77\u5CB8 tile \u5750\u6807\u65E0\u6548\u3002");
  return `coast:${bx}:${by}`;
}
function detailCoastOwnerLayout(bx, by) {
  detailCoastKey(bx, by);
  const startX = bx * 32 + (bx === 0 ? 0 : 1), startY = by * 32 + (by === 0 ? 0 : 1);
  const width = bx === 0 ? 33 : 32, height = by === 0 ? 33 : 32;
  return { startX, startY, width, height, count: width * height };
}
function detailCoastNodeOwner(nodeX, nodeY) {
  if (!Number.isInteger(nodeX) || !Number.isInteger(nodeY) || nodeX < 0 || nodeY < 0 || nodeX > 2048 || nodeY > 2048) throw new Error("\u7EC6\u6D77\u5CB8\u8282\u70B9\u5750\u6807\u65E0\u6548\u3002");
  const bx = Math.floor(Math.max(0, nodeX - 1) / 32), by = Math.floor(Math.max(0, nodeY - 1) / 32);
  const { startX, startY, width } = detailCoastOwnerLayout(bx, by);
  return { key: detailCoastKey(bx, by), bx, by, slot: (nodeY - startY) * width + nodeX - startX };
}

// src/world/detail-coast-codec.ts
function exactRecord(value, keys) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("\u7EC6\u6D77\u5CB8\u8BB0\u5F55\u5FC5\u987B\u662F\u666E\u901A\u5BF9\u8C61\u3002");
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) throw new Error("\u7EC6\u6D77\u5CB8\u8BB0\u5F55\u542B\u672A\u77E5\u6216\u7F3A\u5931\u5B57\u6BB5\u3002");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new Error("\u7EC6\u6D77\u5CB8\u8BB0\u5F55\u4EC5\u63A5\u53D7\u53EF\u679A\u4E3E\u6570\u636E\u5B57\u6BB5\u3002");
  }
}
function ownedInt16(value, length) {
  if (!value || Object.getPrototypeOf(value) !== Int16Array.prototype) throw new Error("\u7EC6\u6D77\u5CB8\u6837\u672C\u5FC5\u987B\u662F\u672C\u5730 Int16Array\u3002");
  const array = value;
  if (Object.getPrototypeOf(array.buffer) !== ArrayBuffer.prototype || array.length !== length || array.byteOffset !== 0 || array.byteLength !== length * 2 || array.buffer.byteLength !== array.byteLength || Reflect.ownKeys(array).length !== length) throw new Error("\u7EC6\u6D77\u5CB8\u6837\u672C\u6570\u7EC4\u5FC5\u987B\u72EC\u5360\u4E14\u5177\u6709\u7CBE\u786E\u957F\u5EA6\u3002");
}
function assertEnvelope(value) {
  if (!value || typeof value !== "object") throw new Error("\u7EC6\u6D77\u5CB8 tile \u65E0\u6548\u3002");
  const mode = Object.getOwnPropertyDescriptor(value, "mode");
  if (!mode || !Object.hasOwn(mode, "value")) throw new Error("\u7EC6\u6D77\u5CB8 tile mode \u65E0\u6548\u3002");
  const keys = ["format", "version", "bx", "by", "mode"];
  if (mode.value === "samples") keys.push("coverageQ", "elevationMeters");
  else if (mode.value !== "land") throw new Error("\u7EC6\u6D77\u5CB8 tile mode \u4E0D\u53D7\u652F\u6301\u3002");
  exactRecord(value, keys);
  if (value.format !== "lieguoji-detail-coast-tile" || value.version !== 1 || typeof value.bx !== "number" || typeof value.by !== "number") throw new Error("\u7EC6\u6D77\u5CB8 tile \u7248\u672C\u65E0\u6548\u3002");
  const layout = detailCoastOwnerLayout(value.bx, value.by);
  if (value.mode === "samples") {
    ownedInt16(value.coverageQ, layout.count);
    ownedInt16(value.elevationMeters, layout.count);
  }
}
function validateValues(tile) {
  if (tile.mode !== "samples") return;
  for (let index = 0; index < tile.coverageQ.length; index++) {
    const coverage = tile.coverageQ[index], height = tile.elevationMeters[index];
    if (coverage === -32768 || height < -12e3 || height > 12e3 || coverage > 0 && height < 0 || coverage < 0 && height > -1 || coverage === 0 && height !== 0) throw new Error("\u7EC6\u6D77\u5CB8\u8986\u76D6\u503C\u4E0E\u5DF2\u5B58\u9AD8\u7A0B\u4E0D\u4E00\u81F4\u3002");
  }
}
function validateDetailCoastTile(value) {
  assertEnvelope(value);
  validateValues(value);
}
function encodeDetailCoastTile(tile) {
  validateDetailCoastTile(tile);
  const count = tile.mode === "samples" ? tile.coverageQ.length : 0;
  const bytes = new Uint8Array(16 + count * 4), view = new DataView(bytes.buffer);
  bytes.set([76, 71, 68, 67, 1, tile.mode === "land" ? 0 : 1, tile.bx, tile.by]);
  view.setUint16(8, count, true);
  if (tile.mode === "samples") for (let index = 0; index < count; index++) {
    view.setInt16(16 + index * 2, tile.coverageQ[index], true);
    view.setInt16(16 + count * 2 + index * 2, tile.elevationMeters[index], true);
  }
  return bytes;
}

// src/world/detail-coast-field.ts
function sampleDetailCoastNode(field, nodeX, nodeY) {
  const owner = detailCoastNodeOwner(nodeX, nodeY), tile = field.tiles.get(owner.key), xQ = nodeX * 512, yQ = nodeY * 512;
  if (tile?.mode === "samples") {
    const coverageQ = tile.coverageQ[owner.slot], heightMeters = tile.elevationMeters[owner.slot];
    if (!Number.isInteger(coverageQ) || coverageQ < -32767 || coverageQ > 32767 || !Number.isInteger(heightMeters) || heightMeters < -12e3 || heightMeters > 12e3 || coverageQ > 0 && heightMeters < 0 || coverageQ < 0 && heightMeters > -1 || coverageQ === 0 && heightMeters !== 0) throw new Error("\u7EC6\u6D77\u5CB8\u8282\u70B9\u6837\u672C\u65E0\u6548\u3002");
    return { xQ, yQ, coverageQ, heightMeters };
  }
  const baseHeight = field.sampleBaseElevation(xQ, yQ);
  if (!Number.isFinite(baseHeight) || baseHeight < -12e3 || baseHeight > 12e3) throw new Error("\u7EC6\u6D77\u5CB8\u57FA\u7840\u9AD8\u7A0B\u65E0\u6548\u3002");
  return tile ? { xQ, yQ, coverageQ: 32767, heightMeters: Math.max(0, Math.round(baseHeight)) } : { xQ, yQ, coverageQ: -32767, heightMeters: Math.min(-1, Math.round(baseHeight)) };
}

// src/world/detail-coast-geometry.ts
var cross = (a, b, c) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
var same = (a, b) => a.xQ === b.xQ && a.yQ === b.yQ;
var CELL_AREA_TWICE = 2 * 512 * 512;
var WORLD_AREA_TWICE = 2 * (4096 * 256) ** 2;
function validateRectangle(rect, limit) {
  if (![rect.column, rect.row, rect.columns, rect.rows].every(Number.isInteger) || rect.column < 0 || rect.row < 0 || rect.columns < 1 || rect.rows < 1 || rect.column + rect.columns > 2048 || rect.row + rect.rows > 2048 || rect.columns * rect.rows > limit) throw new Error("\u7EC6\u6D77\u5CB8\u8BF7\u6C42\u8D85\u8FC7\u6709\u6548\u8303\u56F4\u6216\u5355\u6279\u9650\u989D\u3002");
}
function memoSampler(sample) {
  const nodes = /* @__PURE__ */ new Map();
  return (x, y) => {
    const key = y * 2049 + x, known = nodes.get(key);
    if (known) return known;
    const node = sample(x, y);
    nodes.set(key, node);
    return node;
  };
}
function sourceTriangles(sample, column, row) {
  const nw = sample(column, row), ne = sample(column + 1, row), se = sample(column + 1, row + 1), sw = sample(column, row + 1);
  return [[nw, ne, se], [nw, se, sw]];
}
function crossing(a, b) {
  if (a.coverageQ === 0) return a;
  if (b.coverageQ === 0) return b;
  if (a.coverageQ > 0 === b.coverageQ > 0) throw new Error("\u7EC6\u6D77\u5CB8\u4EA4\u70B9\u9700\u8981\u5F02\u53F7\u8986\u76D6\u503C\u3002");
  if (a.xQ > b.xQ || a.xQ === b.xQ && a.yQ > b.yQ) [a, b] = [b, a];
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length !== 512 || dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) throw new Error("\u7EC6\u6D77\u5CB8\u6E90\u8FB9\u4E0D\u7B26\u5408\u56FA\u5B9A\u4E09\u89D2\u5408\u540C\u3002");
  const numerator = length * Math.abs(a.coverageQ), denominator = Math.abs(a.coverageQ - b.coverageQ);
  const offset = Math.max(1, Math.min(length - 1, Math.floor((2 * numerator + denominator) / (2 * denominator))));
  return { xQ: a.xQ + Math.sign(dx) * offset, yQ: a.yQ + Math.sign(dy) * offset, coverageQ: 0, heightMeters: 0 };
}
function clip(triangle, land) {
  const points = [], inside = (v) => land ? v.coverageQ >= 0 : v.coverageQ <= 0;
  for (let index = 0; index < 3; index++) {
    const a = triangle[index], b = triangle[(index + 1) % 3];
    if (inside(a)) points.push(a);
    if (inside(a) !== inside(b)) points.push(crossing(a, b));
  }
  return points.filter((point, index) => !same(point, points[(index + points.length - 1) % points.length]));
}
function triangulate(points) {
  const triangles = [];
  for (let index = 1; index + 1 < points.length; index++) {
    const triangle = [points[0], points[index], points[index + 1]], area = cross(...triangle);
    if (!Number.isSafeInteger(area) || area < 0) throw new Error("\u7EC6\u6D77\u5CB8\u88C1\u5207\u7247\u9762\u79EF\u65E0\u6548\u3002");
    if (area > 0) triangles.push(triangle);
  }
  return triangles;
}
function neighbourTriangle(column, row, orientation, edge) {
  const candidates = orientation === 0 ? [{ column, row: row - 1, orientation: 1 }, { column: column + 1, row, orientation: 1 }, { column, row, orientation: 1 }] : [{ column, row, orientation: 0 }, { column, row: row + 1, orientation: 0 }, { column: column - 1, row, orientation: 0 }];
  const next = candidates[edge];
  return next.column < 0 || next.row < 0 || next.column >= 2048 || next.row >= 2048 ? null : next;
}
function shoreline(sample, triangle, column, row, orientation) {
  if (!triangle.some((v) => v.coverageQ < 0)) return [];
  const ownerTriangleId = (row * 2048 + column) * 2 + orientation;
  const zeroPoints = [];
  for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverageQ === 0) zeroPoints.push(a);
    if (a.coverageQ * b.coverageQ < 0) zeroPoints.push(crossing(a, b));
    if (a.coverageQ === 0 && b.coverageQ === 0) {
      const next = neighbourTriangle(column, row, orientation, edge);
      if (next) {
        const nextId = (next.row * 2048 + next.column) * 2 + next.orientation;
        if (nextId < ownerTriangleId && sourceTriangles(sample, next.column, next.row)[next.orientation].some((v) => v.coverageQ < 0)) return [];
      }
      return [{ a, b, ownerTriangleId }];
    }
  }
  const unique = zeroPoints.filter((point, index) => zeroPoints.findIndex((candidate) => same(point, candidate)) === index);
  return unique.length === 2 ? [{ a: unique[0], b: unique[1], ownerTriangleId }] : [];
}
function buildCell(sample, column, row, withShore) {
  const land = [], sea = [], shore = [];
  const sources = sourceTriangles(sample, column, row);
  for (let orientation = 0; orientation < 2; orientation++) {
    const triangle = sources[orientation];
    if (triangle.every((v) => v.coverageQ >= 0)) land.push(triangle);
    else {
      land.push(...triangulate(clip(triangle, true)));
      sea.push(...triangulate(clip(triangle, false)));
    }
    if (withShore) shore.push(...shoreline(sample, triangle, column, row, orientation));
  }
  const landAreaTwiceQ2 = land.reduce((sum, triangle) => sum + cross(...triangle), 0), seaAreaTwiceQ2 = sea.reduce((sum, triangle) => sum + cross(...triangle), 0);
  if (landAreaTwiceQ2 + seaAreaTwiceQ2 !== CELL_AREA_TWICE) throw new Error("\u7EC6\u6D77\u5CB8\u88C1\u5207\u9762\u79EF\u4E0D\u5B88\u6052\u3002");
  return { cellId: row * 2048 + column, column, row, land, sea, shore, landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2: CELL_AREA_TWICE };
}
function buildDetailCoastSurface(field, rectangle) {
  validateRectangle(rectangle, 4096);
  const sample = memoSampler((x, y) => sampleDetailCoastNode(field, x, y)), cells = [];
  let landAreaTwiceQ2 = 0, seaAreaTwiceQ2 = 0;
  for (let row = rectangle.row; row < rectangle.row + rectangle.rows; row++) for (let column = rectangle.column; column < rectangle.column + rectangle.columns; column++) {
    const cell = buildCell(sample, column, row, true);
    cells.push(cell);
    landAreaTwiceQ2 += cell.landAreaTwiceQ2;
    seaAreaTwiceQ2 += cell.seaAreaTwiceQ2;
  }
  return { cells, landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2: landAreaTwiceQ2 + seaAreaTwiceQ2 };
}
function contains(triangle, point) {
  return cross(triangle[0], triangle[1], point) >= 0 && cross(triangle[1], triangle[2], point) >= 0 && cross(triangle[2], triangle[0], point) >= 0;
}
function heightAt(triangle, point) {
  const area = cross(...triangle);
  return (cross(point, triangle[1], triangle[2]) * triangle[0].heightMeters + cross(triangle[0], point, triangle[2]) * triangle[1].heightMeters + cross(triangle[0], triangle[1], point) * triangle[2].heightMeters) / area;
}
function pickDetailCoastSurface(field, point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 4096 || point.y > 4096) return null;
  const column = Math.min(2047, Math.floor(point.x / 2)), row = Math.min(2047, Math.floor(point.y / 2));
  const sample = memoSampler((x, y) => sampleDetailCoastNode(field, x, y)), target = { xQ: point.x * 256, yQ: point.y * 256 };
  const result = { fineCellId: row * 2048 + column, column, row };
  const cell = buildCell(sample, column, row, false);
  for (const triangle of cell.land) if (contains(triangle, target)) return { ...result, land: true, height: heightAt(triangle, target) };
  for (const triangle of sourceTriangles(sample, column, row)) for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverageQ === 0 && same(a, target) || a.coverageQ === 0 && b.coverageQ === 0 && cross(a, b, target) === 0 && target.xQ >= Math.min(a.xQ, b.xQ) && target.xQ <= Math.max(a.xQ, b.xQ) && target.yQ >= Math.min(a.yQ, b.yQ) && target.yQ <= Math.max(a.yQ, b.yQ)) return { ...result, land: true, height: 0 };
  }
  for (const triangle of cell.sea) if (contains(triangle, target)) return { ...result, land: false, height: heightAt(triangle, target) };
  throw new Error("\u7EC6\u6D77\u5CB8\u70B9\u672A\u88AB\u6743\u5A01\u88C1\u5207\u7247\u8986\u76D6\u3002");
}

// src/world/generation/detail-shape-distance.ts
var DETAIL_DISTANCE_WORLD_Q = 4096 * 256;
var DETAIL_DISTANCE_LIMIT_Q = 32767;
var DETAIL_DISTANCE_MAX_SEGMENTS = 131072;
var MAX_SEGMENT_AXIS_Q = 512;
var LEAF_SEGMENTS = 8;
var LIMIT_SQUARED = DETAIL_DISTANCE_LIMIT_Q ** 2;
var MAX_LENGTH_SQUARED = 2 * MAX_SEGMENT_AXIS_Q ** 2;
var MAX_ROUNDING_NUMERATOR = Math.floor(Number.MAX_SAFE_INTEGER / 4);
function checkAbort(control) {
  if (control?.signal?.aborted) throw new DOMException("\u7EC6\u6D77\u5CB8\u8DDD\u79BB\u7D22\u5F15\u5DF2\u53D6\u6D88\u3002", "AbortError");
}
async function checkpoint(control, phase, completed, total) {
  checkAbort(control);
  control?.onProgress?.(phase, completed, total);
  checkAbort(control);
  if (control?.yieldControl) await control.yieldControl();
  else await new Promise((resolve) => setTimeout(resolve, 0));
  checkAbort(control);
}
function ownInput(raw) {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u8F93\u5165\u5FC5\u987B\u662F\u666E\u901A\u8BB0\u5F55\u3002");
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes("coordinates") || !keys.includes("segmentCount")) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u8F93\u5165\u5B57\u6BB5\u65E0\u6548\u3002");
  for (const key of ["coordinates", "segmentCount"]) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u8F93\u5165\u4E0D\u63A5\u53D7\u8BBF\u95EE\u5668\u6216\u9690\u85CF\u5B57\u6BB5\u3002");
  }
  const segmentCount = raw.segmentCount, buffer = raw.coordinates;
  if (!Number.isInteger(segmentCount) || segmentCount < 0 || segmentCount > DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u6570\u91CF\u8D85\u8FC7\u5408\u540C\u8303\u56F4\u3002");
  if (!buffer || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || Reflect.ownKeys(buffer).length !== 0 || buffer.byteLength !== segmentCount * 16) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u9700\u8981\u7CBE\u786E\u957F\u5EA6\u7684\u975E\u5171\u4EAB ArrayBuffer\u3002");
  const copy = ArrayBuffer.prototype.slice.call(buffer, 0);
  return { coordinates: new Uint32Array(copy), segmentCount };
}
function spread16(value) {
  value &= 65535;
  value = (value | value << 8) & 16711935;
  value = (value | value << 4) & 252645135;
  value = (value | value << 2) & 858993459;
  value = (value | value << 1) & 1431655765;
  return value;
}
function mortonCode(ax, ay, bx, by) {
  const x = Math.min(65535, ax + bx >>> 5), y = Math.min(65535, ay + by >>> 5);
  return (spread16(x) | spread16(y) << 1) >>> 0;
}
function floorRatio(numerator, denominator) {
  let result = Math.floor(numerator / denominator);
  while ((result + 1) * denominator <= numerator) result++;
  while (result * denominator > numerator) result--;
  return result;
}
function integerSqrt(value) {
  let root = Math.floor(Math.sqrt(value));
  while ((root + 1) ** 2 <= value) root++;
  while (root ** 2 > value) root--;
  return root;
}
function roundDetailDistanceSquaredQ8(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || numerator > MAX_ROUNDING_NUMERATOR || !Number.isSafeInteger(denominator) || denominator < 1 || denominator > MAX_LENGTH_SQUARED) throw new Error("\u77ED\u5CB8\u6BB5\u8DDD\u79BB\u5206\u6570\u8D85\u51FA\u5B89\u5168\u6574\u6570\u5408\u540C\u3002");
  if (numerator === 0) return 0;
  if (numerator >= LIMIT_SQUARED * denominator) return DETAIL_DISTANCE_LIMIT_Q;
  let root = integerSqrt(floorRatio(numerator, denominator));
  if (4 * numerator >= (2 * root + 1) ** 2 * denominator) root++;
  return Math.max(1, Math.min(DETAIL_DISTANCE_LIMIT_Q, root));
}
function boxDistanceSquared(x, y, minX, minY, maxX, maxY) {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dy = y < minY ? minY - y : y > maxY ? y - maxY : 0;
  return dx * dx + dy * dy;
}
function segmentDistanceQ(coordinates, id, x, y) {
  const start = id * 4, ax = coordinates[start], ay = coordinates[start + 1], bx = coordinates[start + 2], by = coordinates[start + 3];
  const dx = bx - ax, dy = by - ay, px = x - ax, py = y - ay, lengthSquared = dx * dx + dy * dy, dot = px * dx + py * dy;
  if (dot <= 0) return roundDetailDistanceSquaredQ8(px * px + py * py, 1);
  if (dot >= lengthSquared) return roundDetailDistanceSquaredQ8((x - bx) ** 2 + (y - by) ** 2, 1);
  const cross3 = px * dy - py * dx;
  return roundDetailDistanceSquaredQ8(cross3 * cross3, lengthSquared);
}
var OwnedDetailShapeDistanceIndex = class {
  segmentCount;
  #coordinates;
  #order;
  #tree;
  #description;
  constructor(coordinates, order, tree, leafCount) {
    this.segmentCount = order.length;
    this.#coordinates = coordinates;
    this.#order = order;
    this.#tree = tree;
    this.#description = { segmentCount: order.length, nodeCount: tree.count.length, leafCount, leafCapacity: 8, sort: "morton16-original-id-v1", retainedArrayBytes: coordinates.byteLength + order.byteLength + Object.values(tree).reduce((sum, array) => sum + array.byteLength, 0) };
    Object.freeze(this);
  }
  describe() {
    return { ...this.#description };
  }
  sample(xQ, yQ, sign) {
    if (!Number.isInteger(xQ) || !Number.isInteger(yQ) || xQ < 0 || yQ < 0 || xQ > DETAIL_DISTANCE_WORLD_Q || yQ > DETAIL_DISTANCE_WORLD_Q || sign !== -1 && sign !== 1) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u8DDD\u79BB\u67E5\u8BE2\u9700\u8981\u4E16\u754C\u5185 Q8 \u6574\u6570\u70B9\u4E0E\u660E\u786E\u6B63\u8D1F\u7C7B\u522B\u3002");
    const stats = { nodeBoundsTests: 0, poppedNodes: 0, prunedNodes: 0, segmentBoundsTests: 0, exactSegmentTests: 0, maximumStackLength: 0 };
    const tree = this.#tree, coordinates = this.#coordinates;
    let best = DETAIL_DISTANCE_LIMIT_Q;
    const lowerBound = (node) => {
      stats.nodeBoundsTests++;
      return boxDistanceSquared(xQ, yQ, tree.minX[node], tree.minY[node], tree.maxX[node], tree.maxY[node]);
    };
    const stack = this.segmentCount ? [{ node: 0, lowerSquared: lowerBound(0) }] : [];
    stats.maximumStackLength = stack.length;
    while (stack.length && best !== 0) {
      const entry = stack.pop();
      stats.poppedNodes++;
      if (entry.lowerSquared > best * best) {
        stats.prunedNodes++;
        continue;
      }
      const node = entry.node;
      if (tree.count[node]) {
        const end = tree.start[node] + tree.count[node];
        for (let offset = tree.start[node]; offset < end; offset++) {
          const id = this.#order[offset], source = id * 4, ax = coordinates[source], ay = coordinates[source + 1], bx = coordinates[source + 2], by = coordinates[source + 3];
          stats.segmentBoundsTests++;
          const lowerSquared = boxDistanceSquared(xQ, yQ, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
          if (lowerSquared > best * best) continue;
          stats.exactSegmentTests++;
          best = Math.min(best, segmentDistanceQ(coordinates, id, xQ, yQ));
          if (best === 0) break;
        }
      } else {
        const left = tree.left[node], right = tree.right[node], a = { node: left, lowerSquared: lowerBound(left) }, b = { node: right, lowerSquared: lowerBound(right) };
        if (a.lowerSquared < b.lowerSquared || a.lowerSquared === b.lowerSquared && a.node < b.node) stack.push(b, a);
        else stack.push(a, b);
        stats.maximumStackLength = Math.max(stats.maximumStackLength, stack.length);
      }
    }
    return { coverageQ: best === 0 ? 0 : sign * best, distanceQ: best, onCoast: best === 0, stats };
  }
};
async function buildDetailShapeDistanceIndex(raw, control) {
  checkAbort(control);
  const batch = control?.batchWork ?? 2048;
  if (!Number.isInteger(batch) || batch < 64 || batch > 8192) throw new Error("\u8DDD\u79BB\u7D22\u5F15\u6279\u6B21\u9700\u8981 64\u20148192 \u4E2A\u5DE5\u4F5C\u5355\u5143\u3002");
  const { coordinates, segmentCount } = ownInput(raw);
  await checkpoint(control, "takeover", 1, 1);
  const codes = new Uint32Array(segmentCount);
  let order = new Uint32Array(segmentCount), scratch = new Uint32Array(segmentCount);
  for (let id = 0; id < segmentCount; id++) {
    const start = id * 4, ax = coordinates[start], ay = coordinates[start + 1], bx = coordinates[start + 2], by = coordinates[start + 3];
    if (ax > DETAIL_DISTANCE_WORLD_Q || ay > DETAIL_DISTANCE_WORLD_Q || bx > DETAIL_DISTANCE_WORLD_Q || by > DETAIL_DISTANCE_WORLD_Q || Math.abs(bx - ax) > MAX_SEGMENT_AXIS_Q || Math.abs(by - ay) > MAX_SEGMENT_AXIS_Q || ax === bx && ay === by) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u5FC5\u987B\u975E\u9000\u5316\u3001\u4F4D\u4E8E\u4E16\u754C\u5185\u4E14\u6BCF\u8F74\u8DE8\u5EA6\u4E0D\u8D85\u8FC7 512 Q8\u3002");
    codes[id] = mortonCode(ax, ay, bx, by);
    order[id] = id;
    if ((id + 1) % batch === 0) await checkpoint(control, "validate-segments", id + 1, segmentCount);
  }
  await checkpoint(control, "validate-segments", segmentCount, segmentCount);
  const counts = new Uint32Array(256), positions = new Uint32Array(256), sortTotal = segmentCount * 8;
  let sortDone = 0;
  for (let pass = 0; pass < 4; pass++) {
    counts.fill(0);
    const shift = pass * 8;
    for (let offset = 0; offset < segmentCount; offset++) {
      counts[codes[order[offset]] >>> shift & 255]++;
      sortDone++;
      if (sortDone % batch === 0) await checkpoint(control, "sort-segments", sortDone, sortTotal);
    }
    let position = 0;
    for (let bucket = 0; bucket < 256; bucket++) {
      positions[bucket] = position;
      position += counts[bucket];
    }
    for (let offset = 0; offset < segmentCount; offset++) {
      const id = order[offset];
      scratch[positions[codes[id] >>> shift & 255]++] = id;
      sortDone++;
      if (sortDone % batch === 0) await checkpoint(control, "sort-segments", sortDone, sortTotal);
    }
    [order, scratch] = [scratch, order];
  }
  await checkpoint(control, "sort-segments", sortDone, sortTotal);
  const leafCount = Math.ceil(segmentCount / LEAF_SEGMENTS), nodeCount = leafCount ? 2 * leafCount - 1 : 0;
  const tree = { minX: new Uint32Array(nodeCount), minY: new Uint32Array(nodeCount), maxX: new Uint32Array(nodeCount), maxY: new Uint32Array(nodeCount), left: new Uint32Array(nodeCount), right: new Uint32Array(nodeCount), start: new Uint32Array(nodeCount), count: new Uint32Array(nodeCount) };
  const pending = leafCount ? [{ node: 0, firstLeaf: 0, leaves: leafCount }] : [];
  let nextNode = 1, built = 0;
  while (pending.length) {
    const task = pending.pop();
    if (task.leaves === 1) {
      tree.start[task.node] = task.firstLeaf * LEAF_SEGMENTS;
      tree.count[task.node] = Math.min(LEAF_SEGMENTS, segmentCount - tree.start[task.node]);
    } else {
      const leftLeaves = Math.floor(task.leaves / 2), left = nextNode++, right = nextNode++;
      tree.left[task.node] = left;
      tree.right[task.node] = right;
      pending.push({ node: right, firstLeaf: task.firstLeaf + leftLeaves, leaves: task.leaves - leftLeaves }, { node: left, firstLeaf: task.firstLeaf, leaves: leftLeaves });
    }
    built++;
    if (built % batch === 0) await checkpoint(control, "build-tree", built, nodeCount);
  }
  if (nodeCount && nextNode !== nodeCount) throw new Error("\u76EE\u6807\u5CB8\u6BB5\u7D22\u5F15\u8282\u70B9\u8BA1\u6570\u5F02\u5E38\u3002");
  await checkpoint(control, "build-tree", built, nodeCount);
  let bound = 0;
  for (let node = nodeCount - 1; node >= 0; node--) {
    if (tree.count[node]) {
      let minX = DETAIL_DISTANCE_WORLD_Q, minY = DETAIL_DISTANCE_WORLD_Q, maxX = 0, maxY = 0;
      const end = tree.start[node] + tree.count[node];
      for (let offset = tree.start[node]; offset < end; offset++) {
        const start = order[offset] * 4;
        minX = Math.min(minX, coordinates[start], coordinates[start + 2]);
        minY = Math.min(minY, coordinates[start + 1], coordinates[start + 3]);
        maxX = Math.max(maxX, coordinates[start], coordinates[start + 2]);
        maxY = Math.max(maxY, coordinates[start + 1], coordinates[start + 3]);
      }
      tree.minX[node] = minX;
      tree.minY[node] = minY;
      tree.maxX[node] = maxX;
      tree.maxY[node] = maxY;
    } else {
      const left = tree.left[node], right = tree.right[node];
      tree.minX[node] = Math.min(tree.minX[left], tree.minX[right]);
      tree.minY[node] = Math.min(tree.minY[left], tree.minY[right]);
      tree.maxX[node] = Math.max(tree.maxX[left], tree.maxX[right]);
      tree.maxY[node] = Math.max(tree.maxY[left], tree.maxY[right]);
    }
    bound++;
    if (bound % batch === 0) await checkpoint(control, "bound-tree", bound, nodeCount);
  }
  await checkpoint(control, "bound-tree", bound, nodeCount);
  return new OwnedDetailShapeDistanceIndex(coordinates, order, tree, leafCount);
}

// src/world/generation/detail-shape-height.ts
var WORLD_Q = 4096 * 256;
function copyBuffer(value, length) {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || value.byteLength !== length * 4) throw new Error("\u57FA\u7840\u9AD8\u7A0B\u9700\u8981\u7CBE\u786E\u975E\u5171\u4EAB\u7F13\u51B2\u533A\u3002");
  return new Int32Array(ArrayBuffer.prototype.slice.call(value, 0));
}
function createDetailShapeBaseSampler(size, centersQ, elevationsMeters) {
  if (![128, 256, 512].includes(size)) throw new Error("\u57FA\u7840\u9AD8\u7A0B\u7C97\u91C7\u6837\u89C4\u683C\u65E0\u6548\u3002");
  const centers = copyBuffer(centersQ, size * size * 2), heights = copyBuffer(elevationsMeters, size * size), step = WORLD_Q / size, radius2 = (2.5 * step) ** 2;
  for (let id = 0; id < heights.length; id++) {
    const x = id % size, y = Math.floor(id / size);
    if (centers[id * 2] <= x * step || centers[id * 2] >= (x + 1) * step || centers[id * 2 + 1] <= y * step || centers[id * 2 + 1] >= (y + 1) * step || heights[id] < -12e3 || heights[id] > 12e3) throw new Error("\u57FA\u7840\u9AD8\u7A0B\u771F\u5B9E\u91CD\u5FC3\u6216\u9AD8\u5EA6\u8D8A\u754C\u3002");
  }
  return (xQ, yQ) => {
    if (!Number.isFinite(xQ) || !Number.isFinite(yQ) || xQ < 0 || yQ < 0 || xQ > WORLD_Q || yQ > WORLD_Q) throw new Error("\u57FA\u7840\u9AD8\u7A0B\u4F4D\u7F6E\u8D8A\u754C\u3002");
    const column = Math.min(size - 1, Math.floor(xQ / step)), row = Math.min(size - 1, Math.floor(yQ / step));
    let sum = 0, weighted = 0;
    for (let y = Math.max(0, row - 3); y <= Math.min(size - 1, row + 3); y++) for (let x = Math.max(0, column - 3); x <= Math.min(size - 1, column + 3); x++) {
      const id = y * size + x, distance2 = (centers[id * 2] - xQ) ** 2 + (centers[id * 2 + 1] - yQ) ** 2;
      if (distance2 === 0) return heights[id];
      if (distance2 >= radius2) continue;
      const support = 1 - distance2 / radius2, weight = support * support / distance2;
      sum += weight;
      weighted += weight * heights[id];
    }
    if (!(sum > 0)) throw new Error("\u57FA\u7840\u9AD8\u7A0B\u7F3A\u5C11\u5B9E\u9645\u91CD\u5FC3\u652F\u6301\u3002");
    return weighted / sum;
  };
}

// src/world/generation/seed.ts
var FIELD_Q = 4096;
var WORLD_Q2 = 4096 * 256;
var roundRatio = (numerator, denominator) => Math.floor(numerator / denominator + 0.5);
function mix32(value) {
  value = Math.imul(value ^ value >>> 16, 2146121005) >>> 0;
  value = Math.imul(value ^ value >>> 15, 2221713035) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}
function seedHash(text) {
  const seed = new TextEncoder().encode(text), prefix = new TextEncoder().encode("macro-landmass@1\0");
  let value = 2166136261;
  const add = (byte) => {
    value = Math.imul(value ^ byte, 16777619) >>> 0;
  };
  for (const byte of prefix) add(byte);
  for (let i = 0; i < 4; i++) add(seed.length >>> 8 * i & 255);
  for (const byte of seed) add(byte);
  return value;
}
function hashAt(seed, tag, x, y) {
  return mix32(seed ^ Math.imul(tag, 2654435769) ^ Math.imul(x, 2246822507) ^ Math.imul(y, 3266489909));
}
function smoothQ(value, q = FIELD_Q) {
  const t = Math.max(0, Math.min(q, value));
  return Math.floor(t * t * (3 * q - 2 * t) / (q * q));
}
function noiseQ12(seed, tag, xQ, yQ, wavelengthQ) {
  const x = Math.floor(xQ / wavelengthQ), y = Math.floor(yQ / wavelengthQ);
  const tx = smoothQ(Math.floor((xQ - x * wavelengthQ) * FIELD_Q / wavelengthQ));
  const ty = smoothQ(Math.floor((yQ - y * wavelengthQ) * FIELD_Q / wavelengthQ));
  const value = (a, b) => hashAt(seed, tag, a, b) % (2 * FIELD_Q + 1) - FIELD_Q;
  const lerp = (a, b, t) => a + roundRatio((b - a) * t, FIELD_Q);
  return lerp(lerp(value(x, y), value(x + 1, y), tx), lerp(value(x, y + 1), value(x + 1, y + 1), tx), ty);
}
function integerSqrt2(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("\u5730\u7406\u8DDD\u79BB\u8D85\u51FA\u5B89\u5168\u6574\u6570\u8303\u56F4\u3002");
  let root = Math.floor(Math.sqrt(value));
  while ((root + 1) * (root + 1) <= value) root++;
  while (root * root > value) root--;
  return root;
}

// src/world/generation/detail-shape.ts
var WORLD_Q3 = 4096 * 256;
var STEP_Q = 512;
var TILE_Q = 64 * 256;
var Q20 = 1048576;
function exact(raw, keys) {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) || Reflect.ownKeys(raw).length !== keys.length) throw new Error("\u7EC6\u5927\u9646\u8F93\u5165\u8BB0\u5F55\u5B57\u6BB5\u65E0\u6548\u3002");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("\u7EC6\u5927\u9646\u8F93\u5165\u62D2\u7EDD\u8BBF\u95EE\u5668\u6216\u7F3A\u5931\u5B57\u6BB5\u3002");
  }
}
function int(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function ownBuffer(value, length) {
  if (!value || Object.getPrototypeOf(value) !== ArrayBuffer.prototype || Reflect.ownKeys(value).length || value.byteLength !== length * 4) throw new Error("\u7EC6\u5927\u9646\u9700\u8981\u7CBE\u786E\u975E\u5171\u4EAB\u7F13\u51B2\u533A\u3002");
  return new Int32Array(ArrayBuffer.prototype.slice.call(value, 0));
}
function ownRecipe(raw) {
  exact(raw, ["seed", "pointsQ", "coastRoughnessWorld", "reliefMeters", "shelfWidthWorld", "islandChainCount", "islandsPerChain"]);
  if (typeof raw.seed !== "string" || !raw.seed.trim() || raw.seed.length > 120 || !int(raw.coastRoughnessWorld, 0, 64) || !int(raw.reliefMeters, 200, 6e3) || !int(raw.shelfWidthWorld, 16, 128) || !int(raw.islandChainCount, 0, 3) || !int(raw.islandsPerChain, 2, 6)) throw new Error("\u7EC6\u5927\u9646\u53C2\u6570\u8D85\u51FA\u8303\u56F4\u3002");
  if (!Array.isArray(raw.pointsQ) || Object.getPrototypeOf(raw.pointsQ) !== Array.prototype || !int(raw.pointsQ.length, 3, 2048) || Reflect.ownKeys(raw.pointsQ).length !== raw.pointsQ.length + 1) throw new Error("\u7EC6\u5927\u9646\u8F6E\u5ED3\u9700\u8981 3\u20142048 \u4E2A\u666E\u901A Q8 \u70B9\u3002");
  const margin = (raw.coastRoughnessWorld + 4) * 256, pointsQ = [], seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < raw.pointsQ.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw.pointsQ, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("\u8F6E\u5ED3\u70B9\u6570\u7EC4\u62D2\u7EDD\u8BBF\u95EE\u5668\u6216\u7A7A\u6D1E\u3002");
    const point = descriptor.value;
    exact(point, ["xQ", "yQ"]);
    if (!int(point.xQ, margin, WORLD_Q3 - margin) || !int(point.yQ, margin, WORLD_Q3 - margin)) throw new Error("\u8BF7\u8BA9\u8F6E\u5ED3\u79BB\u4E16\u754C\u8FB9\u7F18\u4FDD\u7559\u7C97\u7CD9\u5EA6\u52A0 4 world \u7684\u6D77\u6D0B\u8FB9\u5E26\u3002");
    const key = `${point.xQ}:${point.yQ}`;
    if (seen.has(key)) throw new Error("\u95ED\u5408\u8F6E\u5ED3\u4E0D\u80FD\u542B\u91CD\u590D\u70B9\uFF1B\u672B\u70B9\u65E0\u9700\u91CD\u590D\u8D77\u70B9\u3002");
    seen.add(key);
    pointsQ.push({ xQ: point.xQ, yQ: point.yQ });
  }
  return { seed: raw.seed, pointsQ, coastRoughnessWorld: raw.coastRoughnessWorld, reliefMeters: raw.reliefMeters, shelfWidthWorld: raw.shelfWidthWorld, islandChainCount: raw.islandChainCount, islandsPerChain: raw.islandsPerChain };
}
function checkAbort2(control) {
  if (control?.signal?.aborted) throw new DOMException("\u7EC6\u5927\u9646\u751F\u6210\u5DF2\u53D6\u6D88\u3002", "AbortError");
}
async function checkpoint2(control, phase, completed, total) {
  checkAbort2(control);
  control?.onProgress?.(phase, completed, total);
  checkAbort2(control);
  if (control?.yieldControl) await control.yieldControl();
  else await new Promise((resolve) => setTimeout(resolve, 0));
  checkAbort2(control);
}
var cross2 = (a, b, c) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
var onSegment = (a, b, p) => p.xQ >= Math.min(a.xQ, b.xQ) && p.xQ <= Math.max(a.xQ, b.xQ) && p.yQ >= Math.min(a.yQ, b.yQ) && p.yQ <= Math.max(a.yQ, b.yQ);
function intersects(a, b, c, d) {
  const abC = cross2(a, b, c), abD = cross2(a, b, d), cdA = cross2(c, d, a), cdB = cross2(c, d, b);
  return abC === 0 && onSegment(a, b, c) || abD === 0 && onSegment(a, b, d) || cdA === 0 && onSegment(c, d, a) || cdB === 0 && onSegment(c, d, b) || (abC < 0 && abD > 0 || abC > 0 && abD < 0) && (cdA < 0 && cdB > 0 || cdA > 0 && cdB < 0);
}
function pointDistance(a, b, x, y) {
  const dx = b.xQ - a.xQ, dy = b.yQ - a.yQ, dot = (x - a.xQ) * dx + (y - a.yQ) * dy, length2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(Q20, Math.floor(dot / length2 * Q20 + 0.5)));
  if (dot >= 0 && dot <= length2 && dx * (y - a.yQ) - dy * (x - a.xQ) === 0) return { distance: 0, t };
  const px = a.xQ + roundRatio(dx * t, Q20), py = a.yQ + roundRatio(dy * t, Q20);
  return { distance: integerSqrt2((x - px) ** 2 + (y - py) ** 2), t };
}
function boxDistance(node, x, y) {
  const dx = Math.max(node.minX - x, 0, x - node.maxX), dy = Math.max(node.minY - y, 0, y - node.maxY);
  return dx * dx + dy * dy;
}
async function prepareOutline(recipe, batch, control, counters) {
  const points = recipe.pointsQ, count = points.length, edges = [];
  let perimeter = 0, area2 = 0, work = 0;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count], previous = points[(i + count - 1) % count];
    if (cross2(previous, a, b) === 0 && (previous.xQ - a.xQ) * (b.xQ - a.xQ) + (previous.yQ - a.yQ) * (b.yQ - a.yQ) > 0) throw new Error("\u624B\u7ED8\u8F6E\u5ED3\u4E0D\u80FD\u6CBF\u539F\u8FB9\u6298\u56DE\u3002");
    area2 += a.xQ * b.yQ - b.xQ * a.yQ;
    const length = integerSqrt2((b.xQ - a.xQ) ** 2 + (b.yQ - a.yQ) ** 2);
    edges.push({ a, b, length, arc: perimeter });
    perimeter += length;
    for (let j = i + 1; j < count; j++) {
      if (j !== i + 1 && !(i === 0 && j === count - 1) && intersects(a, b, points[j], points[(j + 1) % count])) throw new Error("\u624B\u7ED8\u8F6E\u5ED3\u4E0D\u80FD\u81EA\u4EA4\u6216\u63A5\u89E6\u975E\u76F8\u90BB\u8FB9\u3002");
      if (++work % batch === 0) await checkpoint2(control, "validate-outline", work, count * (count - 1) / 2);
    }
  }
  if (!Number.isSafeInteger(area2) || Math.abs(area2) < 2 * 64 * 256 ** 2) throw new Error("\u9996\u4E2A\u5927\u9646\u8F6E\u5ED3\u7684\u9762\u79EF\u9700\u8981\u81F3\u5C11 64 world\xB2\u3002");
  const treeSizes = [count];
  let totalTreeNodes = 0;
  while (treeSizes.length) {
    const length = treeSizes.pop();
    totalTreeNodes++;
    if (length > 8) treeSizes.push(Math.floor(length / 2), Math.ceil(length / 2));
  }
  const root = { minX: 0, minY: 0, maxX: 0, maxY: 0 }, pending = [{ node: root, ids: edges.map((_, id) => id) }];
  let built = 0;
  while (pending.length) {
    const { node, ids } = pending.pop();
    node.minX = Math.min(...ids.map((id) => Math.min(edges[id].a.xQ, edges[id].b.xQ)));
    node.minY = Math.min(...ids.map((id) => Math.min(edges[id].a.yQ, edges[id].b.yQ)));
    node.maxX = Math.max(...ids.map((id) => Math.max(edges[id].a.xQ, edges[id].b.xQ)));
    node.maxY = Math.max(...ids.map((id) => Math.max(edges[id].a.yQ, edges[id].b.yQ)));
    if (ids.length <= 8) node.ids = ids;
    else {
      const axis = node.maxX - node.minX >= node.maxY - node.minY ? "xQ" : "yQ";
      ids.sort((a, b) => edges[a].a[axis] + edges[a].b[axis] - edges[b].a[axis] - edges[b].b[axis] || a - b);
      const middle = Math.floor(ids.length / 2);
      node.left = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      node.right = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      pending.push({ node: node.right, ids: ids.slice(middle) }, { node: node.left, ids: ids.slice(0, middle) });
    }
    if (++built % 32 === 0) await checkpoint2(control, "index-outline", built, totalTreeNodes);
  }
  await checkpoint2(control, "index-outline", built, totalTreeNodes);
  const nearest = (x, y) => {
    let best = DETAIL_DISTANCE_LIMIT_Q, edge = -1, t = 0;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (boxDistance(node, x, y) > (best + 2) ** 2) continue;
      if (node.ids) for (const id of node.ids) {
        counters.originalEdgeTests++;
        const value = pointDistance(edges[id].a, edges[id].b, x, y);
        if (value.distance < best || value.distance === best && (edge < 0 || id < edge)) {
          best = value.distance;
          edge = id;
          t = value.t;
        }
      }
      else {
        const a = node.left, b = node.right;
        if (boxDistance(a, x, y) <= boxDistance(b, x, y)) stack.push(b, a);
        else stack.push(a, b);
      }
    }
    return { distance: best, edge, t };
  };
  const rowBins = Array.from({ length: 64 }, () => []), rows = /* @__PURE__ */ new Map();
  edges.forEach((edge, id) => {
    for (let row = Math.floor(Math.min(edge.a.yQ, edge.b.yQ) / TILE_Q); row <= Math.min(63, Math.floor(Math.max(edge.a.yQ, edge.b.yQ) / TILE_Q)); row++) rowBins[row].push(id);
  });
  const inside = (x, y) => {
    let crossings = y % STEP_Q === 0 ? rows.get(y) : void 0;
    if (!crossings) {
      crossings = [];
      for (const id of rowBins[Math.max(0, Math.min(63, Math.floor(y / TILE_Q)))]) {
        const { a, b } = edges[id];
        if (a.yQ > y !== b.yQ > y) crossings.push(a.xQ + (y - a.yQ) * (b.xQ - a.xQ) / (b.yQ - a.yQ));
      }
      crossings.sort((a, b) => a - b);
      if (y % STEP_Q === 0) rows.set(y, crossings);
    }
    let low = 0, high = crossings.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if (crossings[middle] <= x) low = middle + 1;
      else high = middle;
    }
    return (low & 1) === 1;
  };
  const roughness = recipe.coastRoughnessWorld * 256, edgeCaps = new Int32Array(count).fill(roughness);
  work = 0;
  if (roughness) for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    const a = edges[i], b = edges[j], arc = Math.min(Math.abs(a.arc - b.arc), perimeter - Math.abs(a.arc - b.arc));
    const dot = (a.b.xQ - a.a.xQ) * (b.b.xQ - b.a.xQ) + (a.b.yQ - a.a.yQ) * (b.b.yQ - b.a.yQ);
    if (j !== i + 1 && !(i === 0 && j === count - 1) && !(arc < (8 * recipe.coastRoughnessWorld + 16) * 256 && dot >= 0)) {
      const distance = Math.min(pointDistance(a.a, a.b, b.a.xQ, b.a.yQ).distance, pointDistance(a.a, a.b, b.b.xQ, b.b.yQ).distance, pointDistance(b.a, b.b, a.a.xQ, a.a.yQ).distance, pointDistance(b.a, b.b, a.b.xQ, a.b.yQ).distance);
      edgeCaps[i] = Math.min(edgeCaps[i], Math.floor(distance / 4));
      edgeCaps[j] = Math.min(edgeCaps[j], Math.floor(distance / 4));
    }
    if (++work % batch === 0) await checkpoint2(control, "protect-outline-features", work, count * (count - 1) / 2);
  }
  const caps = edges.map((_, id) => Math.min(edgeCaps[id], edgeCaps[(id + count - 1) % count]));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) caps[(i + 1) % count] = Math.min(caps[(i + 1) % count], caps[i] + Math.floor(edges[i].length / 4));
    for (let i = count - 1; i >= 0; i--) caps[i] = Math.min(caps[i], caps[(i + 1) % count] + Math.floor(edges[i].length / 4));
  }
  await checkpoint2(control, "prepare-outline", count, count);
  return { edges, inside, nearest, caps, area2, perimeter };
}
function physicalHeight(seed, recipe, xQ, yQ, land, distanceQ, oldSea) {
  const width = Math.min(DETAIL_DISTANCE_LIMIT_Q, recipe.shelfWidthWorld * 256), rise = smoothQ(roundRatio(distanceQ * FIELD_Q, width));
  if (!land) return Math.max(-12e3, Math.min(-1, roundRatio(oldSea * rise, FIELD_Q)));
  const ridge = FIELD_Q - Math.abs(noiseQ12(seed, 6201, xQ, yQ, 384 * 256)), rolling = Math.floor((noiseQ12(seed, 6202, xQ, yQ, 144 * 256) + FIELD_Q) / 2);
  const profile = roundRatio(2 * FIELD_Q + 5 * roundRatio(ridge * ridge, FIELD_Q) + 3 * rolling, 10);
  return Math.max(0, Math.min(recipe.reliefMeters, roundRatio(recipe.reliefMeters * rise * profile, FIELD_Q * FIELD_Q)));
}
async function generateDetailShape(input, control) {
  checkAbort2(control);
  exact(input, ["base", "recipe"]);
  const base = input.base;
  exact(base, ["format", "version", "size", "centersQ", "elevationsMeters", "detailCoast", "locksPresent", "entitiesPresent", "generationPresent"]);
  if (base.format !== "lieguoji-empty-detail-shape-base" || base.version !== 1 || ![128, 256, 512].includes(base.size) || base.locksPresent !== false || base.entitiesPresent !== false || base.generationPresent !== false || !base.detailCoast || Object.getPrototypeOf(base.detailCoast) !== Map.prototype || Reflect.ownKeys(base.detailCoast).length || base.detailCoast.size !== 0) throw new Error("\u6B64\u751F\u6210\u5668\u53EA\u63A5\u53D7\u5DF2\u6838\u9A8C\u7684\u65B0\u7A7A v4 \u4E16\u754C\uFF1B\u4E0D\u66FF\u6362\u3001\u5408\u5E76\u6216\u89E3\u9501\u5DF2\u6709\u5730\u56FE\u3002");
  const size = base.size, total = size * size, centers = ownBuffer(base.centersQ, total * 2), oldHeights = ownBuffer(base.elevationsMeters, total), recipe = ownRecipe(input.recipe);
  const batch = control?.batchWork ?? 256;
  if (!int(batch, 64, 2048)) throw new Error("\u7EC6\u5927\u9646\u6279\u6B21\u9700\u8981 64\u20142048 \u4E2A\u5B9E\u9645\u5DE5\u4F5C\u5355\u5143\u3002");
  await checkpoint2(control, "takeover-empty-world", 1, 1);
  const step = WORLD_Q3 / size;
  for (let id = 0; id < total; id++) {
    const x = id % size, y = Math.floor(id / size);
    if (oldHeights[id] >= 0 || oldHeights[id] < -12e3) throw new Error("\u9996\u4E2A\u7EC6\u5927\u9646\u751F\u6210\u8981\u6C42\u5B9E\u9645\u7C97\u9AD8\u7A0B\u5168\u90E8\u4E3A\u6D77\uFF1B\u5DF2\u6709\u5927\u9646\u4E0D\u80FD\u88AB\u66FF\u6362\u3002");
    if (centers[id * 2] <= x * step || centers[id * 2] >= (x + 1) * step || centers[id * 2 + 1] <= y * step || centers[id * 2 + 1] >= (y + 1) * step) throw new Error("\u5B9E\u9645\u7C97\u91CD\u5FC3\u4E0D\u5728\u5176\u91C7\u6837\u5355\u5143\u5185\u90E8\u3002");
    if ((id + 1) % batch === 0) await checkpoint2(control, "verify-empty-world", id + 1, total);
  }
  const counters = { originalEdgeTests: 0 }, outline = await prepareOutline(recipe, batch, control, counters), seed = seedHash(`shape-detail-landmass@1\0${recipe.seed}`);
  const islands = [], skippedIslands = [];
  for (let chain = 0; chain < recipe.islandChainCount; chain++) {
    const arc = hashAt(seed, 6101, chain, 0) % outline.perimeter;
    const edge = outline.edges.find((item) => item.arc + item.length > arc) ?? outline.edges[outline.edges.length - 1];
    const t = roundRatio((arc - edge.arc) * FIELD_Q, edge.length), tangentX = roundRatio((edge.b.xQ - edge.a.xQ) * FIELD_Q, edge.length), tangentY = roundRatio((edge.b.yQ - edge.a.yQ) * FIELD_Q, edge.length);
    const direction = outline.area2 > 0 ? 1 : -1, normalX = tangentY * direction, normalY = -tangentX * direction;
    const anchorX = edge.a.xQ + roundRatio((edge.b.xQ - edge.a.xQ) * t, FIELD_Q), anchorY = edge.a.yQ + roundRatio((edge.b.yQ - edge.a.yQ) * t, FIELD_Q);
    for (let island = 0; island < recipe.islandsPerChain; island++) {
      const radius = (6 + hashAt(seed, 6102, chain, island) % 23) * 256;
      const along = (island - (recipe.islandsPerChain - 1) / 2) * 64 * 256;
      const outward = (recipe.coastRoughnessWorld + 48 + island * island * 3) * 256;
      const x = Math.round(anchorX + (along * tangentX + outward * normalX) / FIELD_Q), y = Math.round(anchorY + (along * tangentY + outward * normalY) / FIELD_Q);
      const reach = radius * 2;
      let reason = "";
      if (x - reach < 2 * 256 || y - reach < 2 * 256 || x + reach > WORLD_Q3 - 2 * 256 || y + reach > WORLD_Q3 - 2 * 256) reason = "outside-world-margin";
      else if (outline.inside(x, y) || outline.nearest(x, y).distance <= reach + recipe.coastRoughnessWorld * 256) reason = "near-mainland";
      else if (islands.some((other) => (other.x - x) ** 2 + (other.y - y) ** 2 < (2 * other.radius + reach + 4 * 256) ** 2)) reason = "near-existing-island";
      if (reason) skippedIslands.push({ chain, island, reason });
      else islands.push({ x, y, radius, ux: tangentX, uy: tangentY });
    }
    await checkpoint2(control, "place-island-chains", chain + 1, recipe.islandChainCount);
  }
  let designNodesEvaluated = 0;
  const design = (x, y) => {
    designNodesEvaluated++;
    const nearest = outline.nearest(x, y), signed = outline.inside(x, y) ? nearest.distance : -nearest.distance;
    let value = signed;
    if (nearest.distance <= recipe.coastRoughnessWorld * 256 + STEP_Q && nearest.edge >= 0) {
      const id = nearest.edge, amplitude = outline.caps[id] + roundRatio((outline.caps[(id + 1) % outline.caps.length] - outline.caps[id]) * nearest.t, Q20);
      const u = roundRatio(3 * x - 4 * y, 5), v = roundRatio(4 * x + 3 * y, 5);
      const broad = noiseQ12(seed, 6111, u, v, 192 * 256), middle = noiseQ12(seed, 6112, roundRatio(5 * x + 12 * y, 13), roundRatio(-12 * x + 5 * y, 13), 48 * 256), fine = noiseQ12(seed, 6113, u, v, 12 * 256);
      value += roundRatio(amplitude * (8 * broad + 5 * middle + 3 * fine), 16 * FIELD_Q);
    }
    for (let id = 0; id < islands.length; id++) {
      const island = islands[id], dx = x - island.x, dy = y - island.y;
      if (Math.abs(dx) > 2 * island.radius || Math.abs(dy) > 2 * island.radius) continue;
      const u = roundRatio(dx * island.ux + dy * island.uy, FIELD_Q), v = roundRatio(-dx * island.uy + dy * island.ux, FIELD_Q);
      const radius = integerSqrt2(roundRatio(u * u * 4, 9) + v * v);
      const wobble = roundRatio(island.radius * noiseQ12(seed, 6120 + id, x, y, 12 * 256), 6 * FIELD_Q);
      value = Math.max(value, island.radius - radius + wobble);
    }
    return Math.max(-DETAIL_DISTANCE_LIMIT_Q, Math.min(DETAIL_DISTANCE_LIMIT_Q, value));
  };
  const designSign = (x, y, value = design(x, y)) => {
    if (value !== 0) return value > 0 ? 1 : -1;
    return [[-STEP_Q, 0], [STEP_Q, 0], [0, -STEP_Q], [0, STEP_Q]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx <= WORLD_Q3 && y + dy <= WORLD_Q3 && design(x + dx, y + dy) > 0) ? 1 : -1;
  };
  const displays = new Uint8Array(4096), addBox = (minX, minY, maxX, maxY, flags) => {
    for (let by = Math.max(0, Math.floor(minY / TILE_Q)); by <= Math.min(63, Math.floor(maxY / TILE_Q)); by++) for (let bx = Math.max(0, Math.floor(minX / TILE_Q)); bx <= Math.min(63, Math.floor(maxX / TILE_Q)); bx++) flags[by * 64 + bx] = 1;
  };
  for (const edge of outline.edges) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(edge.b.xQ - edge.a.xQ), Math.abs(edge.b.yQ - edge.a.yQ)) / TILE_Q)), margin = (recipe.coastRoughnessWorld + 68) * 256;
    for (let index = 0; index <= steps; index++) {
      const x = edge.a.xQ + roundRatio((edge.b.xQ - edge.a.xQ) * index, steps), y = edge.a.yQ + roundRatio((edge.b.yQ - edge.a.yQ) * index, steps);
      addBox(x - margin, y - margin, x + margin, y + margin, displays);
    }
  }
  for (const island of islands) addBox(island.x - island.radius * 2 - STEP_Q, island.y - island.radius * 2 - STEP_Q, island.x + island.radius * 2 + STEP_Q, island.y + island.radius * 2 + STEP_Q, displays);
  const neededOwners = /* @__PURE__ */ new Set();
  for (let tile = 0; tile < 4096; tile++) if (displays[tile]) {
    const bx = tile % 64, by = Math.floor(tile / 64);
    for (let y = Math.max(0, by - 1); y <= by; y++) for (let x = Math.max(0, bx - 1); x <= bx; x++) neededOwners.add(y * 64 + x);
  }
  const designNodeTotal = [...neededOwners].reduce((sum, tile) => sum + detailCoastOwnerLayout(tile % 64, Math.floor(tile / 64)).count, 0);
  const designOwners = /* @__PURE__ */ new Map();
  let evaluated = 0;
  const ensureOwner = async (bx, by) => {
    if (bx < 0 || by < 0) return;
    const key = detailCoastKey(bx, by);
    if (designOwners.has(key)) return;
    const layout = detailCoastOwnerLayout(bx, by), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let slot = 0; slot < layout.count; slot++) {
      const value = design((layout.startX + slot % layout.width) * STEP_Q, (layout.startY + Math.floor(slot / layout.width)) * STEP_Q);
      coverageQ[slot] = value;
      elevationMeters[slot] = value > 0 ? 1 : value < 0 ? -1 : 0;
      if (++evaluated % batch === 0) await checkpoint2(control, "sample-design-field", evaluated, designNodeTotal);
    }
    designOwners.set(key, { format: "lieguoji-detail-coast-tile", version: 1, bx, by, mode: "samples", coverageQ, elevationMeters });
  };
  const target = new Uint32Array(DETAIL_DISTANCE_MAX_SEGMENTS * 4);
  let targetCount = 0, finishedDisplays = 0;
  const displayCount = displays.reduce((sum, value) => sum + value, 0);
  for (let tile = 0; tile < 4096; tile++) if (displays[tile]) {
    const bx = tile % 64, by = Math.floor(tile / 64);
    for (const [key, value] of designOwners) if (value.by < by - 1) designOwners.delete(key);
    await ensureOwner(bx - 1, by - 1);
    await ensureOwner(bx, by - 1);
    await ensureOwner(bx - 1, by);
    await ensureOwner(bx, by);
    for (let row = 0; row < 32; row += 4) {
      const surface = buildDetailCoastSurface({ tiles: designOwners, sampleBaseElevation: () => -1 }, { column: bx * 32, row: by * 32 + row, columns: 32, rows: 4 });
      for (const cell of surface.cells) for (const edge of cell.shore) {
        if (targetCount >= DETAIL_DISTANCE_MAX_SEGMENTS) throw new Error("\u81EA\u7136\u5316\u5CB8\u6BB5\u8D85\u8FC7 131072 \u6761\uFF1B\u5019\u9009\u5DF2\u62D2\u7EDD\uFF0C\u672A\u964D\u91C7\u6837\u6216\u8986\u76D6\u539F\u56FE\u3002");
        target.set([edge.a.xQ, edge.a.yQ, edge.b.xQ, edge.b.yQ], targetCount++ * 4);
      }
      await checkpoint2(control, "extract-target-coast", finishedDisplays * 8 + row / 4 + 1, displayCount * 8);
    }
    finishedDisplays++;
  }
  designOwners.clear();
  if (!targetCount) throw new Error("\u8F6E\u5ED3\u6CA1\u6709\u4EA7\u751F\u53EF\u7528\u7684\u7EC6\u6D77\u5CB8\uFF1B\u539F\u4E16\u754C\u672A\u6539\u53D8\u3002");
  const targetCoast = target.slice(0, targetCount * 4).buffer;
  const distanceIndex = await buildDetailShapeDistanceIndex({ coordinates: targetCoast, segmentCount: targetCount }, { signal: control?.signal, yieldControl: control?.yieldControl, batchWork: batch, onProgress: (phase, done, total2) => control?.onProgress?.(`target-${phase}`, done, total2) });
  const band = new Uint8Array(4096), expansion = DETAIL_DISTANCE_LIMIT_Q + STEP_Q;
  for (let id = 0; id < targetCount; id++) {
    const source = id * 4;
    addBox(Math.min(target[source], target[source + 2]) - expansion, Math.min(target[source + 1], target[source + 3]) - expansion, Math.max(target[source], target[source + 2]) + expansion, Math.max(target[source + 1], target[source + 3]) + expansion, band);
    if ((id + 1) % batch === 0) await checkpoint2(control, "register-distance-band", id + 1, targetCount);
  }
  const detailCoast = /* @__PURE__ */ new Map();
  let sampledTiles = 0, uniformLandTiles = 0, distanceSamples = 0, exactTargetSegmentTests = 0, maximumQuerySegmentTests = 0;
  const distanceAt = (x, y, sign) => {
    const result = distanceIndex.sample(x, y, sign);
    distanceSamples++;
    exactTargetSegmentTests += result.stats.exactSegmentTests;
    maximumQuerySegmentTests = Math.max(maximumQuerySegmentTests, result.stats.exactSegmentTests);
    return result;
  };
  const distanceNodeTotal = band.reduce((sum, active, tile) => sum + (active ? detailCoastOwnerLayout(tile % 64, Math.floor(tile / 64)).count : 0), 0);
  let written = 0;
  for (let tile = 0; tile < 4096; tile++) {
    const bx = tile % 64, by = Math.floor(tile / 64), key = detailCoastKey(bx, by), layout = detailCoastOwnerLayout(bx, by);
    if (!band[tile]) {
      if (designSign(layout.startX * STEP_Q, layout.startY * STEP_Q) > 0) {
        detailCoast.set(key, { format: "lieguoji-detail-coast-tile", version: 1, bx, by, mode: "land" });
        uniformLandTiles++;
      }
    } else {
      const coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
      for (let slot = 0; slot < layout.count; slot++) {
        const x = (layout.startX + slot % layout.width) * STEP_Q, y = (layout.startY + Math.floor(slot / layout.width)) * STEP_Q;
        const coverage = distanceAt(x, y, designSign(x, y)).coverageQ;
        coverageQ[slot] = coverage;
        elevationMeters[slot] = coverage > 0 ? 1 : coverage < 0 ? -1 : 0;
        if (++written % batch === 0) await checkpoint2(control, "write-true-distance", written, distanceNodeTotal);
      }
      detailCoast.set(key, { format: "lieguoji-detail-coast-tile", version: 1, bx, by, mode: "samples", coverageQ, elevationMeters });
      sampledTiles++;
    }
    if ((tile + 1) % 64 === 0) await checkpoint2(control, "write-owner-tiles", tile + 1, 4096);
  }
  const originalBase = createDetailShapeBaseSampler(size, centers.buffer, oldHeights.buffer), coarseHeights = oldHeights.slice();
  let coarseLandSamples = 0, changedCoarseSamples = 0;
  const temporaryField = { tiles: detailCoast, sampleBaseElevation: () => -1 };
  for (let id = 0; id < total; id++) {
    const x = centers[id * 2], y = centers[id * 2 + 1], land = pickDetailCoastSurface(temporaryField, { x: x / 256, y: y / 256 }).land, distance = distanceAt(x, y, land ? 1 : -1).distanceQ;
    coarseHeights[id] = physicalHeight(seed, recipe, x, y, land, distance, oldHeights[id]);
    if (land) coarseLandSamples++;
    if (coarseHeights[id] !== oldHeights[id]) changedCoarseSamples++;
    if ((id + 1) % batch === 0) await checkpoint2(control, "write-coarse-reference", id + 1, total);
  }
  const sampleBaseElevation = createDetailShapeBaseSampler(size, centers.buffer, coarseHeights.buffer);
  let elevated = 0;
  for (const tile of detailCoast.values()) if (tile.mode === "samples") {
    const layout = detailCoastOwnerLayout(tile.bx, tile.by);
    for (let slot = 0; slot < layout.count; slot++) {
      const x = (layout.startX + slot % layout.width) * STEP_Q, y = (layout.startY + Math.floor(slot / layout.width)) * STEP_Q, coverage = tile.coverageQ[slot];
      if (coverage === 0) tile.elevationMeters[slot] = 0;
      else {
        const land = coverage > 0, baseHeight = sampleBaseElevation(x, y), blend = smoothQ(roundRatio(Math.abs(coverage) * FIELD_Q, DETAIL_DISTANCE_LIMIT_Q));
        const nearHeight = physicalHeight(seed, recipe, x, y, land, Math.abs(coverage), land ? -1 : originalBase(x, y));
        const height = Math.round((nearHeight * (FIELD_Q - blend) + baseHeight * blend) / FIELD_Q);
        tile.elevationMeters[slot] = land ? Math.max(0, height) : Math.min(-1, height);
      }
      if (++elevated % batch === 0) await checkpoint2(control, "write-continuous-heights", elevated, written);
    }
  }
  const signs = new Int8Array(4096).fill(-1);
  for (const tile of detailCoast.values()) signs[tile.by * 64 + tile.bx] = tile.mode === "land" || tile.coverageQ.every((v) => v >= 0) ? 1 : tile.coverageQ.every((v) => v < 0) ? -1 : 0;
  let landAreaTwiceQ2 = 0, seaAreaTwiceQ2 = 0, auditedFineCells = 0;
  for (let tile = 0; tile < 4096; tile++) {
    const bx = tile % 64, by = Math.floor(tile / 64), sign = signs[tile], dependencies = [sign];
    if (bx) dependencies.push(signs[tile - 1]);
    if (by) dependencies.push(signs[tile - 64]);
    if (bx && by) dependencies.push(signs[tile - 65]);
    if (sign && dependencies.every((value) => value === sign)) {
      if (sign > 0) landAreaTwiceQ2 += 2 * TILE_Q ** 2;
      else seaAreaTwiceQ2 += 2 * TILE_Q ** 2;
    } else for (let row = 0; row < 32; row += 4) {
      const surface = buildDetailCoastSurface({ tiles: detailCoast, sampleBaseElevation }, { column: bx * 32, row: by * 32 + row, columns: 32, rows: 4 });
      landAreaTwiceQ2 += surface.landAreaTwiceQ2;
      seaAreaTwiceQ2 += surface.seaAreaTwiceQ2;
      auditedFineCells += 128;
      await checkpoint2(control, "audit-final-pieces", tile * 8 + row / 4 + 1, 4096 * 8);
    }
    if ((tile + 1) % 64 === 0) await checkpoint2(control, "audit-final-area", tile + 1, 4096);
  }
  const totalAreaTwiceQ2 = 2 * WORLD_Q3 ** 2;
  if (landAreaTwiceQ2 + seaAreaTwiceQ2 !== totalAreaTwiceQ2 || landAreaTwiceQ2 < 2 * 16 * 256 ** 2) throw new Error("\u6700\u7EC8\u7EC6\u7247\u9762\u79EF\u4E0D\u5B88\u6052\u6216\u5927\u9646\u592A\u5C0F\uFF0C\u5019\u9009\u5DF2\u62D2\u7EDD\u3002");
  checkAbort2(control);
  return { detailCoast, coarseElevations: coarseHeights.slice(), sampleBaseElevation, targetCoast, summary: { landAreaTwiceQ2, seaAreaTwiceQ2, totalAreaTwiceQ2, targetSegments: targetCount, sampledTiles, uniformLandTiles, coarseLandSamples, changedCoarseSamples, islandsRequested: recipe.islandChainCount * recipe.islandsPerChain, islandsPlaced: islands.length, skippedIslands, designNodesEvaluated, originalEdgeTests: counters.originalEdgeTests, distanceSamples, exactTargetSegmentTests, maximumQuerySegmentTests, auditedFineCells } };
}
export {
  encodeDetailCoastTile,
  generateDetailShape,
  pickDetailCoastSurface
};
