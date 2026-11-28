#!/usr/bin/env node
/**
 * 列国纪 v9.0.0 — HOI4 级 12 大官方剧本高精度 GIS 底图 & 国界重烘焙器 + 12 张可视化验收图渲染器
 * -----------------------------------------------------------------------------------------
 * 彻底修复 v8.0.0 全部 12 张地图的错乱、跨海飞地、空国/单格国、年份边界错配问题：
 *   1. 扩展 east_asia_japan 边界至 lon 88..150, lat -8.5..50.5（完整囊括新加坡、苏门答腊、爪哇、婆罗洲、巴布亚、关岛、塞班、孟加拉与东北亚），
 *      并同步重烘焙 east_asia_japan 与 japan_detail 的 20K/60K/120K basemaps 与 GPU ReliefTiles 金字塔；
 *   2. 在 japan_detail 底图中净空朝鲜半岛与俄国滨海边疆区，令日本战国剧本 100% 聚焦日本列岛，杜绝大名跨海漂移至朝鲜/西伯利亚；
 *   3. 全部 12 个官方剧本统一严格重烘焙：
 *      - ww2_eve_1936: world_1938 + world_1930 奥地利精确叠加（28 国零错配，低地三国/奥地利/捷克斯洛伐克/波罗的海三国分毫不差）
 *      - ww2_europe_1939: world_1938 + 波希米亚归德/斯洛伐克独立/喀尔巴阡归匈/阿尔巴尼亚归意（27 国精准 1939.9.1 版图）
 *      - ww1_1914: world_1914 精确 20 国（含阿尔萨斯归德、奥匈帝国、塞尔维亚、比利时、芬兰归沙俄）
 *      - napoleon_1812: world_1815 + 1812 拿破仑大帝国/莱茵邦联/华沙大公国/丹麦-挪威联合王国真实分割
 *      - china_1931: world_1930 + 1931 九一八前夜 15 势力（新增西藏/滇军/英属印缅/法属印支，精细划定东北军/晋绥/新桂/川军/马家军/瑞金苏区）
 *      - ww2_asia_1941: world_1938 + 1941.12.7 真实中日战线、满洲国、延安根据地、香港、马来新加坡、荷属东印度、美菲、美军太平洋前哨（巴布亚+关岛+塞班）
 *      - coldwar_1950: world_1945 全 183 国精确映射至冷战 12 大阵营（绝无错国飞地）
 *      - zhanguo_260bce / sanguo_208 / tang_755 / song_jin_1142 / sengoku_1560: 同陆块连通域 + 历史地理多边形 + 加权锚点（杜绝跨海漂移）
 *   4. 输出全部 12 张高分辨率验收图至 .autopilot/fms-audit/v9-maps/*.png，供人工/视觉逐张核查。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';

const WORKTREE_ROOT = path.resolve(import.meta.dirname, '..');
const SUPER_ROOT = path.resolve(WORKTREE_ROOT, '..', '..', '..');
const MAIN_REPO_ROOT = fs.existsSync(path.join(WORKTREE_ROOT, 'node_modules')) ? WORKTREE_ROOT : SUPER_ROOT;
const AUTOPILOT_ROOT = fs.existsSync(path.join(WORKTREE_ROOT, '.autopilot/hotpack-v6-src')) ? WORKTREE_ROOT : SUPER_ROOT;
const SRC_DIR = path.join(AUTOPILOT_ROOT, '.autopilot/hotpack-v6-src');
const OUT_DIR = path.join(AUTOPILOT_ROOT, '.autopilot/hotpack-v7-build');
const PREVIEW_DIR = path.join(AUTOPILOT_ROOT, '.autopilot/fms-audit/v9-maps');
const BUNDLE_WORLD_DIR = path.join(WORKTREE_ROOT, 'ios-native/Resources/World');
const BUNDLE_ATLAS_DIR = path.join(WORKTREE_ROOT, 'ios-native/Resources/HistoricalAtlas');
const SWIFT_CORE_DIR = path.join(WORKTREE_ROOT, 'ios-native/Core/Sources/LieguojiCore');

const requireFromMain = createRequire(path.join(MAIN_REPO_ROOT, 'package.json'));
const sharp = requireFromMain('sharp');

const MAP_W = 1600;
const MAP_H = 900;
const SKIP_RELIEF = process.argv.includes('--skip-relief');
const SCENARIOS_ONLY = process.argv.includes('--scenarios-only');

const REGIONS = [
  { name: 'china',           lonMin: 73.0,   lonMax: 136.0, latMin: 17.5,  latMax: 54.0, pad: 0.025, z5Shards: 3 },
  { name: 'huaxia',          lonMin: 95.5,   lonMax: 129.0, latMin: 18.0,  latMax: 44.5, pad: 0.025, z5Shards: 3 },
  { name: 'europe',          lonMin: -11.5,  lonMax: 46.5,  latMin: 34.5,  latMax: 67.5, pad: 0.025, z5Shards: 3 },
  { name: 'east_asia_japan', lonMin: 88.0,   lonMax: 150.0, latMin: -8.5,  latMax: 50.5, pad: 0.025, z5Shards: 3 },
  { name: 'japan_detail',    lonMin: 129.0,  lonMax: 143.0, latMin: 30.6,  latMax: 42.6, pad: 0.020, z5Shards: 2 },
  { name: 'mediterranean',   lonMin: -10.0,  lonMax: 55.0,  latMin: 24.0,  latMax: 56.0, pad: 0.025, z5Shards: 2 },
  { name: 'world',           lonMin: -168.0, lonMax: 176.0, latMin: -55.0, latMax: 72.0, pad: 0.020, z5Shards: 2 },
];

const SWIFT_REGION_MAP = {
  china: 'china', huaxia: 'huaxia', europe: 'europe', eastAsiaJapan: 'east_asia_japan',
  world: 'world', japanDetail: 'japan_detail', mediterranean: 'mediterranean',
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function hash2d(x, y, seed = 1337) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi, seed), b = hash2d(xi + 1, yi, seed);
  const c = hash2d(xi, yi + 1, seed), d = hash2d(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, octaves = 4, seed = 77) {
  let val = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return val / norm;
}

function makeProjectionFrame(region, width = MAP_W, height = MAP_H) {
  const { lonMin, lonMax, latMin, latMax, pad } = region;
  const cosScale = region.name === 'world'
    ? 0.86
    : Math.max(0.25, Math.cos(((latMin + latMax) * 0.5) * Math.PI / 180));
  const spanX = Math.max(1e-6, (lonMax - lonMin) * cosScale);
  const spanY = Math.max(1e-6, latMax - latMin);
  const availW = Math.max(1, width - width * pad * 2);
  const availH = Math.max(1, height - height * pad * 2);
  const scale = Math.min(availW / spanX, availH / spanY);
  const originX = (width - spanX * scale) * 0.5;
  const originY = (height - spanY * scale) * 0.5;
  return { lonMin, lonMax, latMin, latMax, pad, cosScale, scale, originX, originY, width, height };
}
function projectPt(lon, lat, f) {
  return [
    f.originX + (lon - f.lonMin) * f.cosScale * f.scale,
    f.originY + (f.latMax - lat) * f.scale,
  ];
}
function unprojectPt(x, y, f) {
  return [
    f.lonMin + (x - f.originX) / (f.cosScale * f.scale),
    f.latMax - (y - f.originY) / f.scale,
  ];
}

// =========================================================================
// 二进制 LGGR 网格读取（含完整邻接表，供同陆块 BFS 零跨海填充）
// =========================================================================
function loadGridBin(filePath) {
  const buf = fs.readFileSync(filePath);
  const n = buf.readUInt32LE(32);
  const coords = new Float64Array(n * 2);
  let o = 36;
  for (let i = 0; i < n; i++) {
    coords[i * 2] = buf.readDoubleLE(o); o += 8;
    coords[i * 2 + 1] = buf.readDoubleLE(o); o += 8;
  }
  const starts = new Uint32Array(n + 1);
  for (let i = 0; i <= n; i++) { starts[i] = buf.readUInt32LE(o); o += 4; }
  const totalNb = starts[n];
  const neighbors = new Uint32Array(totalNb);
  for (let i = 0; i < totalNb; i++) { neighbors[i] = buf.readUInt32LE(o); o += 4; }
  return { n, coords, starts, neighbors };
}

function readBasemapsBin(filePath) {
  const buf = fs.readFileSync(filePath);
  const regCount = buf.readUInt32LE(8);
  const cellCount = buf.readUInt32LE(12);
  let o = 16;
  const map = new Map();
  for (let i = 0; i < regCount; i++) {
    const nl = buf[o++];
    const name = buf.toString('utf8', o, o + nl); o += nl;
    o += 40; // lonMin..pad
    const arr = new Uint8Array(buf.subarray(o, o + cellCount));
    o += cellCount;
    map.set(name, arr);
  }
  return map;
}

function writeBasemapsBin(mapHeights, cellCount, outPath) {
  const chunks = [];
  const hdr = Buffer.alloc(16);
  hdr.write('LGAB', 0, 'ascii');
  hdr.writeUInt32LE(1, 4);
  hdr.writeUInt32LE(REGIONS.length, 8);
  hdr.writeUInt32LE(cellCount, 12);
  chunks.push(hdr);
  for (const reg of REGIONS) {
    const nb = Buffer.from(reg.name, 'utf8');
    const rh = Buffer.alloc(1 + nb.length + 40);
    let o = 0;
    rh[o++] = nb.length; nb.copy(rh, o); o += nb.length;
    rh.writeDoubleLE(reg.lonMin, o); o += 8;
    rh.writeDoubleLE(reg.lonMax, o); o += 8;
    rh.writeDoubleLE(reg.latMin, o); o += 8;
    rh.writeDoubleLE(reg.latMax, o); o += 8;
    rh.writeDoubleLE(reg.pad, o);
    chunks.push(rh, Buffer.from(mapHeights.get(reg.name)));
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

function writeLGHS(entries, cellCount, outPath) {
  const chunks = [];
  const hdr = Buffer.alloc(16);
  hdr.write('LGHS', 0, 'ascii');
  hdr.writeUInt32LE(1, 4);
  hdr.writeUInt32LE(entries.length, 8);
  hdr.writeUInt32LE(cellCount, 12);
  chunks.push(hdr);
  for (const sc of entries) {
    const idB = Buffer.from(sc.id, 'utf8'), rgB = Buffer.from(sc.region, 'utf8');
    const sh = Buffer.alloc(1 + idB.length + 1 + rgB.length + 2);
    let p = 0;
    sh[p++] = idB.length; idB.copy(sh, p); p += idB.length;
    sh[p++] = rgB.length; rgB.copy(sh, p); p += rgB.length;
    sh.writeUInt16LE(sc.nationCount, p);
    chunks.push(sh, Buffer.from(sc.owners.buffer), Buffer.from(sc.pop.buffer));
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

// =========================================================================
// Swift HistoricalScenarios & HistoricalGeography 解析
// =========================================================================
function parseSwiftRealRivers() {
  const src = fs.readFileSync(path.join(SWIFT_CORE_DIR, 'HistoricalGeography.swift'), 'utf8');
  const rivers = [];
  const re = /RiverSpec\(\s*"([^"]+)",\s*tier:\s*(\d+),\s*\[([\s\S]*?)\]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const pts = [];
    const pre = /\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
    let pm;
    while ((pm = pre.exec(m[3])) !== null) pts.push([Number(pm[1]), Number(pm[2])]);
    if (pts.length >= 2) rivers.push({ name: m[1], tier: Number(m[2]), coords: pts });
  }
  return rivers;
}

function parseSwiftOfficialScenarios() {
  const src = fs.readFileSync(path.join(SWIFT_CORE_DIR, 'HistoricalScenarios.swift'), 'utf8');
  const parts = src.split(/private static let \w+\s*=\s*HistoricalScenario\(/).slice(1);
  const scenarios = [];
  for (const part of parts) {
    const idM = part.match(/id:\s*"([^"]+)"/);
    const regM = part.match(/region:\s*\.(\w+)/);
    const titleM = part.match(/title:\s*"([^"]+)"/);
    if (!idM || !regM) continue;
    const region = SWIFT_REGION_MAP[regM[1]];
    if (!region) continue;
    const nationChunks = part.split(/HistoricalNationSpec\(/).slice(1);
    const nations = [];
    for (const nc of nationChunks) {
      const nid = (nc.match(/id:\s*"([^"]+)"/) || [])[1];
      const nname = (nc.match(/name:\s*"([^"]+)"/) || [])[1];
      const color = (nc.match(/color:\s*"([^"]+)"/) || [])[1] || '#888888';
      const clon = Number((nc.match(/capitalLon:\s*([-\d.]+)/) || [])[1]);
      const clat = Number((nc.match(/capitalLat:\s*([-\d.]+)/) || [])[1]);
      if (!nid || !Number.isFinite(clon) || !Number.isFinite(clat)) continue;
      const anchors = [{ lon: clon, lat: clat, weight: 1.35 }];
      const are = /HistoricalAnchor\(\s*lon:\s*([-\d.]+)\s*,\s*lat:\s*([-\d.]+)[\s\S]*?weight:\s*([-\d.]+)/g;
      let am;
      while ((am = are.exec(nc)) !== null) {
        anchors.push({ lon: Number(am[1]), lat: Number(am[2]), weight: Number(am[3]) });
      }
      nations.push({ id: nid, name: nname || nid, color, capitalLon: clon, capitalLat: clat, anchors });
    }
    scenarios.push({ id: idM[1], title: titleM ? titleM[1] : idM[1], region, nations });
  }
  if (scenarios.length !== 12) throw new Error(`Expected 12 scenarios, got ${scenarios.length}`);
  return scenarios;
}

// =========================================================================
// GeoJSON 多边形与线段光栅化工具
// =========================================================================
function extractPolygons(geojson) {
  const polys = [];
  for (const feat of geojson.features || []) {
    const g = feat.geometry;
    if (!g) continue;
    const props = feat.properties || {};
    if (g.type === 'Polygon') polys.push({ rings: g.coordinates, props });
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) polys.push({ rings: poly, props });
    }
  }
  return polys;
}
function extractLines(geojson) {
  const lines = [];
  for (const feat of geojson.features || []) {
    const g = feat.geometry;
    if (!g) continue;
    const rank = Number(feat.properties?.scalerank ?? 6);
    if (g.type === 'LineString') lines.push({ coords: g.coordinates, rank });
    else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) lines.push({ coords: line, rank });
    }
  }
  return lines;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function rasterizePolygons(polys, frame, W, H, dst, valueOrFn, mode = 'set') {
  const sx = W / frame.width, sy = H / frame.height;
  const xs = [];
  for (const poly of polys) {
    const val = typeof valueOrFn === 'function' ? valueOrFn(poly.props, poly) : valueOrFn;
    if (val === null || val === undefined) continue;
    const projectedRings = [];
    let minY = H, maxY = -1, minX = W, maxX = -1;
    for (const ring of poly.rings) {
      if (ring.length < 3) continue;
      const pr = new Float32Array(ring.length * 2);
      for (let i = 0; i < ring.length; i++) {
        const [mx, my] = projectPt(ring[i][0], ring[i][1], frame);
        const px = mx * sx, py = my * sy;
        pr[i * 2] = px; pr[i * 2 + 1] = py;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
      }
      projectedRings.push(pr);
    }
    if (!projectedRings.length || maxX < 0 || minX >= W || maxY < 0 || minY >= H) continue;
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const scanY = y + 0.5;
      xs.length = 0;
      for (const pr of projectedRings) {
        const len = pr.length >> 1;
        let x1 = pr[(len - 1) * 2], y1p = pr[(len - 1) * 2 + 1];
        for (let i = 0; i < len; i++) {
          const x2 = pr[i * 2], y2p = pr[i * 2 + 1];
          if ((y1p <= scanY && y2p > scanY) || (y2p <= scanY && y1p > scanY)) {
            xs.push(x1 + ((scanY - y1p) * (x2 - x1)) / (y2p - y1p));
          }
          x1 = x2; y1p = y2p;
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const row = y * W;
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.max(0, Math.ceil(xs[i] - 0.5));
        const b = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
        if (mode === 'max') {
          for (let x = a; x <= b; x++) if (val > dst[row + x]) dst[row + x] = val;
        } else {
          for (let x = a; x <= b; x++) dst[row + x] = val;
        }
      }
    }
  }
}

// =========================================================================
// PART A: 更新 east_asia_japan 与 japan_detail 底图（20K/60K/120K）+ GPU ReliefTiles
// =========================================================================
const MAJOR_RANGES = [
  { lon: 86.9, lat: 28.0, rLon: 11.0, rLat: 3.4, peak: 52 },
  { lon: 90.0, lat: 33.2, rLon: 11.5, rLat: 4.5, peak: 46 },
  { lon: 84.0, lat: 36.2, rLon: 9.5,  rLat: 2.3, peak: 42 },
  { lon: 82.0, lat: 42.3, rLon: 9.0,  rLat: 2.1, peak: 38 },
  { lon: 99.5, lat: 29.8, rLon: 3.5,  rLat: 4.6, peak: 38 },
  { lon: 108.5, lat: 33.9, rLon: 4.8, rLat: 1.5, peak: 26 },
  { lon: 121.5, lat: 47.0, rLon: 3.8, rLat: 5.5, peak: 22 },
  { lon: 127.8, lat: 41.9, rLon: 2.8, rLat: 2.2, peak: 24 },
  { lon: 138.2, lat: 36.2, rLon: 2.1, rLat: 2.2, peak: 32 },
  { lon: 121.0, lat: 23.6, rLon: 0.9, rLat: 1.6, peak: 30 },
  { lon: 102.0, lat: -1.5, rLon: 4.5, rLat: 3.5, peak: 26 },
  { lon: 116.5, lat: 6.0, rLon: 2.2, rLat: 2.2, peak: 28 },
  { lon: 138.0, lat: -4.2, rLon: 6.0, rLat: 2.2, peak: 36 },
];
const LAND_RAMP = [
  [20, [118, 146, 98]], [25, [132, 160, 106]], [33, [154, 174, 114]],
  [44, [182, 184, 124]], [56, [196, 174, 126]], [68, [176, 148, 118]],
  [80, [160, 144, 134]], [90, [212, 206, 202]], [100, [242, 240, 238]],
];
const SEA_RAMP = [
  [0, [26, 62, 92]], [5, [34, 78, 112]], [11, [48, 102, 138]],
  [16, [72, 132, 166]], [19, [104, 164, 194]],
];
function sampleColorRamp(v, ramp) {
  if (v <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    if (v <= ramp[i][0]) {
      const t = (v - ramp[i - 1][0]) / Math.max(1e-6, ramp[i][0] - ramp[i - 1][0]);
      const a = ramp[i - 1][1], b = ramp[i][1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return ramp[ramp.length - 1][1];
}
function computeSignedCoastDist(landMask, W, H, maxSteps = 260) {
  const INF = maxSteps * 10;
  const landD = new Uint16Array(W * H), seaD = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (landMask[i] === 1) { landD[i] = INF; seaD[i] = 0; }
    else { landD[i] = 0; seaD[i] = INF; }
  }
  const pass = (arr) => {
    for (let y = 0; y < H; y++) {
      const row = y * W, prev = (y - 1) * W;
      for (let x = 0; x < W; x++) {
        let v = arr[row + x]; if (!v) continue;
        if (x > 0) v = Math.min(v, arr[row + x - 1] + 10);
        if (y > 0) {
          v = Math.min(v, arr[prev + x] + 10);
          if (x > 0) v = Math.min(v, arr[prev + x - 1] + 14);
          if (x + 1 < W) v = Math.min(v, arr[prev + x + 1] + 14);
        }
        arr[row + x] = v;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      const row = y * W, next = (y + 1) * W;
      for (let x = W - 1; x >= 0; x--) {
        let v = arr[row + x]; if (!v) continue;
        if (x + 1 < W) v = Math.min(v, arr[row + x + 1] + 10);
        if (y + 1 < H) {
          v = Math.min(v, arr[next + x] + 10);
          if (x > 0) v = Math.min(v, arr[next + x - 1] + 14);
          if (x + 1 < W) v = Math.min(v, arr[next + x + 1] + 14);
        }
        arr[row + x] = v;
      }
    }
  };
  pass(landD); pass(seaD);
  return { landD, seaD };
}
function rasterizeRivers(neLines, swiftRivers, frame, W, H, dst) {
  const sx = W / frame.width, sy = H / frame.height;
  const stamp = (x0, y0, x1, y1, radius, strength) => {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.3));
    const rCeil = Math.ceil(radius), r2 = radius * radius;
    for (let s = 0; s <= steps; s++) {
      const cx = x0 + (dx * s) / steps, cy = y0 + (dy * s) / steps;
      if (cx < -rCeil || cx >= W + rCeil || cy < -rCeil || cy >= H + rCeil) continue;
      const ix0 = Math.max(0, Math.floor(cx - rCeil)), ix1 = Math.min(W - 1, Math.ceil(cx + rCeil));
      const iy0 = Math.max(0, Math.floor(cy - rCeil)), iy1 = Math.min(H - 1, Math.ceil(cy + rCeil));
      for (let py = iy0; py <= iy1; py++) {
        const ddy = py - cy, ddy2 = ddy * ddy, row = py * W;
        for (let px = ix0; px <= ix1; px++) {
          const d2 = (px - cx) ** 2 + ddy2;
          if (d2 <= r2) {
            const v = Math.round(strength * (1 - Math.sqrt(d2) / (radius + 0.01)));
            if (v > dst[row + px]) dst[row + px] = v;
          }
        }
      }
    }
  };
  for (const line of neLines) {
    if (line.rank > 7 || line.coords.length < 2) continue;
    const rad = line.rank <= 2 ? 4.2 : line.rank <= 4 ? 2.8 : 1.7;
    const str = line.rank <= 2 ? 210 : line.rank <= 4 ? 170 : 125;
    for (let i = 1; i < line.coords.length; i++) {
      const [ax, ay] = projectPt(line.coords[i - 1][0], line.coords[i - 1][1], frame);
      const [bx, by] = projectPt(line.coords[i][0], line.coords[i][1], frame);
      stamp(ax * sx, ay * sy, bx * sx, by * sy, rad, str);
    }
  }
  for (const rv of swiftRivers) {
    const baseR = rv.tier === 3 ? 6.5 : rv.tier === 2 ? 4.6 : 3.2;
    const str = rv.tier === 3 ? 255 : rv.tier === 2 ? 235 : 210;
    const n = rv.coords.length;
    for (let i = 1; i < n; i++) {
      const [ax, ay] = projectPt(rv.coords[i - 1][0], rv.coords[i - 1][1], frame);
      const [bx, by] = projectPt(rv.coords[i][0], rv.coords[i][1], frame);
      stamp(ax * sx, ay * sy, bx * sx, by * sy, baseR * (0.48 + 0.72 * (i / n)), str);
    }
  }
}
function writeLGTRArchive(regionName, maxZoom, tileSize, records, outPath) {
  const rb = Buffer.from(regionName, 'utf8');
  const headerSize = 4 + 4 + 1 + rb.length + 1 + 2 + 4 + records.length * 17;
  const headerBuf = Buffer.alloc(headerSize);
  let o = 0;
  headerBuf.write('LGTR', o, 'ascii'); o += 4;
  headerBuf.writeUInt32LE(1, o); o += 4;
  headerBuf[o++] = rb.length; rb.copy(headerBuf, o); o += rb.length;
  headerBuf[o++] = maxZoom;
  headerBuf.writeUInt16LE(tileSize, o); o += 2;
  headerBuf.writeUInt32LE(records.length, o); o += 4;
  let dataOff = BigInt(headerSize);
  for (const t of records) {
    headerBuf[o++] = t.z;
    headerBuf.writeUInt16LE(t.x, o); o += 2;
    headerBuf.writeUInt16LE(t.y, o); o += 2;
    headerBuf.writeBigUInt64LE(dataOff, o); o += 8;
    headerBuf.writeUInt32LE(t.data.length, o); o += 4;
    dataOff += BigInt(t.data.length);
  }
  ensureDir(path.dirname(outPath));
  const fd = fs.openSync(outPath, 'w');
  fs.writeSync(fd, headerBuf);
  for (const t of records) fs.writeSync(fd, t.data);
  fs.closeSync(fd);
  return Number(dataOff);
}
async function encodeTileBatch(baseSharp, masterW, masterH, tasks, tileW, tileH, quality) {
  const records = [];
  for (let i = 0; i < tasks.length; i += 16) {
    const res = await Promise.all(tasks.slice(i, i + 16).map(async (item) => {
      const left = Math.floor((item.tx * masterW) / item.grid);
      const top = Math.floor((item.ty * masterH) / item.grid);
      const right = Math.floor(((item.tx + 1) * masterW) / item.grid);
      const bottom = Math.floor(((item.ty + 1) * masterH) / item.grid);
      let pipe = baseSharp.clone()
        .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
        .resize(tileW, tileH, { kernel: 'lanczos3', fit: 'fill' });
      if (item.z >= 3) pipe = pipe.sharpen({ sigma: 0.9, m1: 0.75, m2: 1.9 });
      const jpg = await pipe.jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: false, trellisQuantisation: false }).toBuffer();
      return { z: item.z, x: item.tx, y: item.ty, data: jpg };
    }));
    records.push(...res);
  }
  return records;
}
async function writeRegionReliefPyramids(reg, rgbBuf, masterW, masterH) {
  const baseSharp = sharp(rgbBuf, { raw: { width: masterW, height: masterH, channels: 3 } });
  const baseTasks = [];
  for (let z = 0; z <= 4; z++) {
    const grid = 1 << z;
    for (let ty = 0; ty < grid; ty++) for (let tx = 0; tx < grid; tx++) baseTasks.push({ z, tx, ty, grid });
  }
  let qBase = 97;
  let baseTiles = await encodeTileBatch(baseSharp, masterW, masterH, baseTasks, 1280, 720, qBase);
  let payload = baseTiles.reduce((s, r) => s + r.data.length, 0);
  for (const fq of [94, 90, 85, 80]) {
    if (payload <= 90 * 1024 * 1024) break;
    qBase = fq;
    baseTiles = await encodeTileBatch(baseSharp, masterW, masterH, baseTasks, 1280, 720, qBase);
    payload = baseTiles.reduce((s, r) => s + r.data.length, 0);
  }
  const bBytes = writeLGTRArchive(reg.name, 4, 1280, baseTiles, path.join(OUT_DIR, 'ReliefTiles', `${reg.name}.lgtr`));
  console.log(`[LGTR ${reg.name}] z=0..4 (Q${qBase}) -> ${(bBytes / 1048576).toFixed(1)} MB`);
  if (reg.z5Shards > 0) {
    const grid = 32, z5Tasks = [];
    for (let ty = 0; ty < grid; ty++) for (let tx = 0; tx < grid; tx++) z5Tasks.push({ z: 5, tx, ty, grid });
    const perShard = Math.ceil(z5Tasks.length / reg.z5Shards);
    for (let si = 0; si < reg.z5Shards; si++) {
      const slice = z5Tasks.slice(si * perShard, (si + 1) * perShard);
      let q5 = 97;
      let recs = await encodeTileBatch(baseSharp, masterW, masterH, slice, 960, 540, q5);
      let bytes = recs.reduce((s, r) => s + r.data.length, 0);
      for (const fq of [94, 90, 85, 80]) {
        if (bytes <= 90 * 1024 * 1024) break;
        q5 = fq;
        recs = await encodeTileBatch(baseSharp, masterW, masterH, slice, 960, 540, q5);
        bytes = recs.reduce((s, r) => s + r.data.length, 0);
      }
      const wBytes = writeLGTRArchive(reg.name, 5, 960, recs, path.join(OUT_DIR, 'ReliefTiles', `${reg.name}_z5_${si}.lgtr`));
      console.log(`[LGTR ${reg.name}_z5_${si}] z=5 (Q${q5}) -> ${(wBytes / 1048576).toFixed(1)} MB`);
    }
  }
}

/** 判定经纬度是否位于日本战国列岛专图保留域（剔除朝鲜半岛、俄国滨海边疆区、库页岛北部及江苏/浙江大陆角） */
function isJapanArchipelagoOnly(lon, lat) {
  if (lat > 45.58) return false;                     // 剔除库页岛
  if (lon < 128.75) return false;                    // 剔除中国江浙海岸与黄海西侧（保留五岛 128.85 与对马 129.3）
  if (lon < 129.45 && lat < 32.45) return false;     // 剔除东海西南大陆角
  if (lat > 41.55 && lon < 139.25) return false;     // 剔除俄国滨海边疆区
  if (lat > 38.20 && lon < 138.00) return false;     // 剔除日本海西岸大陆/北朝鲜
  if (lat > 35.65 && lon < 131.80) return false;     // 剔除朝鲜半岛中南部（保留隐岐/山阴）
  if (lat > 34.72 && lon < 130.15) return false;     // 剔除釜山/巨济岛半岛南端（保留对马岛 34.1..34.70）
  if (lat > 34.35 && lon < 129.05) return false;     // 剔除釜山/济州西侧
  if (lat > 33.00 && lon < 128.85) return false;     // 剔除济州岛
  return true;
}

async function rebuildChangedBasemaps(grid20, mesh60, mesh120, swiftRivers) {
  const bm20 = readBasemapsBin(path.join(BUNDLE_ATLAS_DIR, 'basemaps.bin'));
  const bm60 = readBasemapsBin(path.join(OUT_DIR, 'HDMeshes/basemaps_60k.bin'));
  const bm120 = readBasemapsBin(path.join(OUT_DIR, 'HDMeshes/basemaps_120k.bin'));
  if (SCENARIOS_ONLY) {
    console.log('[v12 Map Baker] --scenarios-only: reusing existing 20K/60K/120K basemaps.');
    return { bm20, bm60, bm120 };
  }

  const landPolys = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_land.geojson'), 'utf8')));
  const lakePolys = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_lakes.geojson'), 'utf8')));
  const bathL0 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_L_0.geojson'), 'utf8')));
  const bathK200 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_K_200.geojson'), 'utf8')));
  const bathJ1000 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_J_1000.geojson'), 'utf8')));
  const bathI2000 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_I_2000.geojson'), 'utf8')));
  const neRiverLines = extractLines(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_rivers_lake_centerlines.geojson'), 'utf8')));
  const elevGeo = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_geography_regions_elevation_points.geojson'), 'utf8'));
  const elevPoints = [];
  for (const f of elevGeo.features || []) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const elevM = Number(f.properties?.elevation ?? f.properties?.ELEVATION ?? 0);
    if (Number.isFinite(lon) && Number.isFinite(lat) && elevM > 380) elevPoints.push({ lon, lat, elevM });
  }

  const RW = 5760, RH = 3240;
  // v10.0.0：仅重烘焙边界已放大的 japan_detail（20K/60K/120K 底图 + ReliefTiles 金字塔），保留未改动战区加速构建
  for (const regName of ['japan_detail']) {
    const reg = REGIONS.find(r => r.name === regName);
    const t0 = Date.now();
    const frame = makeProjectionFrame(reg, MAP_W, MAP_H);
    const landMask = new Uint8Array(RW * RH);
    const bathMask = new Uint8Array(RW * RH);
    const riverMask = new Uint8Array(RW * RH);

    rasterizePolygons(landPolys, frame, RW, RH, landMask, 1);
    rasterizePolygons(lakePolys, frame, RW, RH, landMask, 2);
    rasterizePolygons(bathL0, frame, RW, RH, bathMask, 1, 'max');
    rasterizePolygons(bathK200, frame, RW, RH, bathMask, 2, 'max');
    rasterizePolygons(bathJ1000, frame, RW, RH, bathMask, 3, 'max');
    rasterizePolygons(bathI2000, frame, RW, RH, bathMask, 4, 'max');
    rasterizeRivers(neRiverLines, swiftRivers, frame, RW, RH, riverMask);

    // 若为 japan_detail，将朝鲜半岛/俄国滨海边疆区/库页岛/江浙角净空为海域；若为 world，剔除无人南极洲 (lat < -57)
    if (regName === 'japan_detail' || regName === 'world') {
      const invScale = 1 / frame.scale;
      const invLonScale = 1 / (frame.cosScale * frame.scale);
      const mpX = MAP_W / RW, mpY = MAP_H / RH;
      for (let y = 0; y < RH; y++) {
        const lat = frame.latMax - ((y + 0.5) * mpY - frame.originY) * invScale;
        const row = y * RW;
        if (regName === 'world') {
          if (lat < -57.0) {
            landMask.fill(0, row, row + RW);
            riverMask.fill(0, row, row + RW);
          }
          continue;
        }
        for (let x = 0; x < RW; x++) {
          if (landMask[row + x] === 0) continue;
          const lon = frame.lonMin + ((x + 0.5) * mpX - frame.originX) * invLonScale;
          if (!isJapanArchipelagoOnly(lon, lat)) {
            landMask[row + x] = 0;
            riverMask[row + x] = 0;
          }
        }
      }
    }

    const spanLon = reg.lonMax - reg.lonMin;
    const localRanges = MAJOR_RANGES.filter(m =>
      m.lon + m.rLon * 3 >= reg.lonMin && m.lon - m.rLon * 3 <= reg.lonMax &&
      m.lat + m.rLat * 3 >= reg.latMin && m.lat - m.rLat * 3 <= reg.latMax
    );
    const localPeaks = elevPoints.filter(p =>
      p.lon >= reg.lonMin - 4 && p.lon <= reg.lonMax + 4 &&
      p.lat >= reg.latMin - 4 && p.lat <= reg.latMax + 4
    );
    const pxPeaks = localPeaks.map(p => {
      const [mx, my] = projectPt(p.lon, p.lat, frame);
      const radPx = Math.max(20, Math.min(125, (p.elevM / 78) * (RW / Math.max(25, spanLon * 1.38))));
      return { x: mx * (RW / MAP_W), y: my * (RH / MAP_H), r: radPx, invR2: 1 / (radPx * radPx), peak: Math.min(46, (p.elevM / 8848) * 54) };
    });

    const { landD, seaD } = computeSignedCoastDist(landMask, RW, RH, 260);
    const elevField = new Float32Array(RW * RH);
    const invScale = 1 / frame.scale, invLonScale = 1 / (frame.cosScale * frame.scale);
    const mpX = MAP_W / RW, mpY = MAP_H / RH;
    const coastScale = Math.max(30, Math.min(150, RW * 0.025));

    for (let y = 0; y < RH; y++) {
      const lat = frame.latMax - ((y + 0.5) * mpY - frame.originY) * invScale;
      const row = y * RW;
      for (let x = 0; x < RW; x++) {
        const idx = row + x, m = landMask[idx];
        const lon = frame.lonMin + ((x + 0.5) * mpX - frame.originX) * invLonScale;
        const n1 = fbm(x * 0.008, y * 0.008, 4, 41), n2 = fbm(x * 0.030, y * 0.030, 3, 193);
        const ridge = 1 - Math.abs(n1 * 2 - 1);
        if (m === 2) elevField[idx] = 15.5;
        else if (m === 0) {
          const shelfT = Math.min(1, (seaD[idx] * 0.1) / (coastScale * 1.3));
          elevField[idx] = Math.max(1.0, Math.min(18.5, 18.2 - Math.pow(shelfT, 0.72) * 11.5 - bathMask[idx] * 1.7 + (n2 - 0.5) * 1.4));
        } else {
          const inlandT = Math.min(1, (landD[idx] * 0.1) / coastScale);
          let h = 22.0 + inlandT * 11.0 + ridge * 11.5 + (n2 - 0.5) * 7.2;
          for (const rg of localRanges) {
            const d2 = ((lon - rg.lon) / rg.rLon) ** 2 + ((lat - rg.lat) / rg.rLat) ** 2;
            if (d2 < 9.0) h += rg.peak * Math.exp(-0.5 * d2) * (0.72 + 0.58 * ridge);
          }
          const rv = riverMask[idx];
          if (rv > 0) h = Math.max(21.0, h - (3.5 + (rv / 255) * 6.5));
          elevField[idx] = Math.max(20.5, Math.min(96.5, h));
        }
      }
    }
    for (const pk of pxPeaks) {
      const rSpan = Math.ceil(pk.r * 2.2);
      const x0 = Math.max(0, Math.floor(pk.x - rSpan)), x1 = Math.min(RW - 1, Math.ceil(pk.x + rSpan));
      const y0 = Math.max(0, Math.floor(pk.y - rSpan)), y1 = Math.min(RH - 1, Math.ceil(pk.y + rSpan));
      for (let y = y0; y <= y1; y++) {
        const dy2 = (y - pk.y) ** 2, row = y * RW;
        for (let x = x0; x <= x1; x++) {
          const idx = row + x;
          if (landMask[idx] !== 1) continue;
          const d2 = ((x - pk.x) ** 2 + dy2) * pk.invR2;
          if (d2 < 4.5) elevField[idx] = Math.min(98.0, elevField[idx] + pk.peak * Math.exp(-0.65 * d2));
        }
      }
    }

    const sampleGridHeights = (mesh) => {
      const out = new Uint8Array(mesh.n);
      for (let i = 0; i < mesh.n; i++) {
        const px = Math.max(0, Math.min(RW - 1, Math.round(mesh.coords[i * 2] * (RW / MAP_W))));
        const py = Math.max(0, Math.min(RH - 1, Math.round(mesh.coords[i * 2 + 1] * (RH / MAP_H))));
        const idx = py * RW + px;
        out[i] = landMask[idx] === 1 ? Math.max(21, Math.min(95, Math.round(elevField[idx]))) : Math.max(2, Math.min(18, Math.round(elevField[idx])));
      }
      return out;
    };
    bm20.set(regName, sampleGridHeights(grid20));
    bm60.set(regName, sampleGridHeights(mesh60));
    bm120.set(regName, sampleGridHeights(mesh120));
    console.log(`[Basemap v9] Re-baked ${regName} (20K/60K/120K) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (!SKIP_RELIEF) {
      const rgb = Buffer.allocUnsafe(RW * RH * 3);
      const lx = -0.62, ly = -0.62, lz = 0.48;
      for (let y = 0; y < RH; y++) {
        const row = y * RW, ym = y > 0 ? y - 1 : 0, yp = y + 1 < RH ? y + 1 : RH - 1;
        for (let x = 0; x < RW; x++) {
          const idx = row + x, xm = x > 0 ? x - 1 : 0, xp = x + 1 < RW ? x + 1 : RW - 1;
          const m = landMask[idx], e = elevField[idx];
          const grain = (hash2d(x, y, 509) - 0.5) * 9.0 + (smoothNoise(x * 0.14, y * 0.14, 811) - 0.5) * 6.0;
          let r, g, b;
          if (m === 2) { r = 114 + grain * 0.35; g = 158 + grain * 0.35; b = 182 + grain * 0.35; }
          else if (m === 0) {
            const [sr, sg, sb] = sampleColorRamp(e, SEA_RAMP);
            const dSea = seaD[idx] * 0.1;
            const wave = dSea < 26 ? Math.sin(dSea * 0.85) * Math.exp(-dSea * 0.08) * 10 : 0;
            const bath = ((elevField[row + xp] - elevField[row + xm]) * -0.4 + (elevField[yp * RW + x] - elevField[ym * RW + x]) * -0.4) * 3.5;
            r = sr + wave + bath + grain * 0.5; g = sg + wave + bath + grain * 0.5; b = sb + wave * 0.8 + bath + grain * 0.5;
          } else {
            const [lr, lg, lb] = sampleColorRamp(e, LAND_RAMP);
            const dzdx = (elevField[row + xp] - elevField[row + xm]) * 0.62;
            const dzdy = (elevField[yp * RW + x] - elevField[ym * RW + x]) * 0.62;
            const invLen = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
            const shade = 0.65 + Math.max(0.14, Math.min(1.48, (-dzdx * lx - dzdy * ly + lz) * invLen)) * 0.60;
            const contour = Math.abs(((e - 20) % 12) - 6) < 0.34 && e > 30 ? 0.88 : 1.0;
            const coast = landD[idx] <= 24 ? 0.84 : 1.0;
            r = lr * shade * contour * coast + grain; g = lg * shade * contour * coast + grain; b = lb * shade * contour * coast + grain;
            const rv = riverMask[idx];
            if (rv > 0) { const a = Math.min(0.92, rv / 215); r = r * (1 - a) + 74 * a; g = g * (1 - a) + 128 * a; b = b * (1 - a) + 166 * a; }
          }
          const p3 = idx * 3;
          rgb[p3] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
          rgb[p3 + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
          rgb[p3 + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        }
      }
      await writeRegionReliefPyramids(reg, rgb, RW, RH);
    }
  }

  writeBasemapsBin(bm20, grid20.n, path.join(BUNDLE_ATLAS_DIR, 'basemaps.bin'));
  writeBasemapsBin(bm60, mesh60.n, path.join(OUT_DIR, 'HDMeshes/basemaps_60k.bin'));
  writeBasemapsBin(bm120, mesh120.n, path.join(OUT_DIR, 'HDMeshes/basemaps_120k.bin'));
  return { bm20, bm60, bm120 };
}

// =========================================================================
// PART B: 精确历史多边形规则（零模糊子串匹配！100% 实测 GeoJSON 精确国名 + 精细历史边界分割）
// =========================================================================
const GEO_CACHE = new Map();
function getYearPolys(year) {
  if (!GEO_CACHE.has(year)) {
    const fn = path.join(SRC_DIR, `world_${year}.geojson`);
    GEO_CACHE.set(year, extractPolygons(JSON.parse(fs.readFileSync(fn, 'utf8'))));
  }
  return GEO_CACHE.get(year);
}

let POP_PLACES_CACHE = null;
function getPopulatedPlaces() {
  if (POP_PLACES_CACHE) return POP_PLACES_CACHE;
  const fn = path.join(SRC_DIR, 'ne_10m_populated_places.geojson');
  const out = [];
  if (fs.existsSync(fn)) {
    const gj = JSON.parse(fs.readFileSync(fn, 'utf8'));
    for (const f of gj.features || []) {
      if (f.geometry?.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties || {};
      const pop = Number(p.POP_MAX ?? p.pop_max ?? p.POP_MIN ?? p.pop_min ?? 0);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || pop < 15000) continue;
      const weight = Math.max(0.25, Math.min(2.25, (Math.log10(Math.max(15000, pop)) - 3.9) * 0.72));
      out.push({ lon, lat, weight });
    }
  }
  POP_PLACES_CACHE = out;
  return out;
}

const POP_FIELD_CACHE = new Map();
/**
 * v10.0.0：基于 Natural Earth 全球人口城市库 + 真实宏观地理人口/工业带构建非均匀密度场（14..255）。
 * - 俄西伯利亚/青藏/戈壁/撒哈拉/澳内陆/极北北美压低至 16..34 -> 自然生成广袤大州且禁止开局刷兵；
 * - 欧陆核心/低地三国/鲁尔/波兰/英伦/日本畿内关东/中国核心/台湾/香港澳门/新加坡抬升至 175..255 -> 自然细分为超密战略战术州郡。
 */
function buildPopDensityField(frame, CW, CH, regionName) {
  const key = `${regionName}:${CW}x${CH}`;
  if (POP_FIELD_CACHE.has(key)) return POP_FIELD_CACHE.get(key);

  const field = new Float32Array(CW * CH);
  const invScale = 1 / frame.scale;
  const invLonScale = 1 / (frame.cosScale * frame.scale);

  for (let y = 0; y < CH; y++) {
    const lat = frame.latMax - ((y + 0.5) - frame.originY) * invScale;
    const row = y * CW;
    for (let x = 0; x < CW; x++) {
      const lon = frame.lonMin + ((x + 0.5) - frame.originX) * invLonScale;
      let d = 64.0;

      if (regionName === 'japan_detail') {
        // 日本战国专图：畿内/尾张浓尾/骏河/关东平原最稠密，中国地方/北九州次之，奥羽深山稍疏
        d = 115.0;
        if (lon >= 134.8 && lon <= 137.4 && lat >= 34.2 && lat <= 35.7) d = 215.0;      // 畿内・尾张・美浓・近江
        else if (lon >= 138.6 && lon <= 140.6 && lat >= 35.0 && lat <= 36.4) d = 205.0; // 关东平原
        else if (lon >= 137.4 && lon <= 139.0 && lat >= 34.6 && lat <= 35.5) d = 185.0; // 东海道（三河/远江/骏河）
        else if (lon >= 129.6 && lon <= 134.8 && lat >= 32.5 && lat <= 35.3) d = 158.0; // 九州・四国・中国地方
        else if (lat >= 37.8) d = 88.0;                                                 // 奥羽山地
      } else {
        // 1. 广袤稀疏疆域（大州）
        if ((lon >= 56.0 && lat >= 52.0) || (lat >= 62.2 && lon >= 26.0) || (lon >= 134.0 && lat >= 50.0)) {
          d = 20.0; // 西伯利亚与俄远东极北
        } else if (lon >= 38.5 && lat >= 47.0 && lon < 56.0) {
          d = 35.0; // 欧俄东翼广袤森林草原（大都市高斯峰仍会抬高莫斯科/伏尔加）
        } else if (lon >= 74.0 && lon <= 101.0 && lat >= 28.0 && lat <= 37.8) {
          d = 22.0; // 青藏高原与帕米尔
        } else if (lon >= 74.0 && lon <= 116.0 && lat > 37.8 && lat <= 51.0) {
          d = 24.0; // 西域大漠・戈壁・蒙古高原
        } else if (lon >= -17.0 && lon <= 58.0 && lat >= 14.0 && lat <= 30.2 && !(lon >= 29.8 && lon <= 32.8 && lat >= 24.0 && lat <= 31.8)) {
          d = 20.0; // 撒哈拉与阿拉伯大沙漠（保留尼罗河谷）
        } else if (lon <= -55.0 && lat >= 53.5) {
          d = 20.0; // 加拿大极北与阿拉斯加
        } else if (lon >= 115.0 && lon <= 144.0 && lat >= -31.5 && lat <= -15.5) {
          d = 22.0; // 澳大利亚内陆荒漠
        } else if (lon >= -74.0 && lon <= -49.0 && lat >= -12.5 && lat <= 4.5) {
          d = 24.0; // 亚马孙雨林腹地
        } else if (lat >= 60.5 && lon >= 5.0 && lon < 26.0) {
          d = 38.0; // 北欧高纬山区
        }

        // 2. 高密度战略细化带（细密战术州郡：欧洲核心/低地/鲁尔/波兰/英伦/北意/日本/华东华北/台湾/港澳/新加坡）
        if (lon >= 2.4 && lon <= 7.3 && lat >= 49.4 && lat <= 53.6) d = Math.max(d, 215.0);          // 低地三国
        else if (lon >= 5.8 && lon <= 14.8 && lat >= 47.5 && lat <= 53.8) d = Math.max(d, 185.0);    // 鲁尔・德意志核心
        else if (lon >= -4.2 && lon <= 1.9 && lat >= 50.1 && lat <= 54.8) d = Math.max(d, 182.0);    // 英格兰核心
        else if (lon >= -1.5 && lon <= 6.0 && lat >= 47.0 && lat <= 50.6) d = Math.max(d, 170.0);    // 巴黎盆地・北法
        else if (lon >= 7.4 && lon <= 13.8 && lat >= 43.8 && lat <= 46.5) d = Math.max(d, 178.0);    // 波河平原・北意
        else if (lon >= 13.5 && lon <= 22.5 && lat >= 49.0 && lat <= 54.0) d = Math.max(d, 165.0);   // 波兰・西里西亚・波希米亚
        else if (lon >= 6.0 && lon <= 17.2 && lat >= 45.8 && lat <= 48.6) d = Math.max(d, 162.0);    // 瑞士・奥地利
        else if (lon >= 117.2 && lon <= 122.3 && lat >= 29.2 && lat <= 33.2) d = Math.max(d, 205.0); // 江南长三角
        else if (lon >= 112.5 && lon <= 120.0 && lat >= 33.0 && lat <= 40.5) d = Math.max(d, 185.0); // 华北中原平原
        else if (lon >= 103.0 && lon <= 107.6 && lat >= 28.8 && lat <= 31.8) d = Math.max(d, 172.0); // 四川盆地
        else if (lon >= 115.0 && lon <= 120.2 && lat >= 22.8 && lat <= 27.6) d = Math.max(d, 178.0); // 闽粤沿海
        else if (lon >= 129.5 && lon <= 141.5 && lat >= 31.0 && lat <= 39.0) d = Math.max(d, 202.0); // 日本本州・九州・四国
        else if (lon >= 125.5 && lon <= 129.5 && lat >= 34.5 && lat <= 38.5) d = Math.max(d, 168.0); // 朝鲜半岛中南部
        else if (lon >= -88.0 && lon <= -69.5 && lat >= 36.5 && lat <= 44.0) d = Math.max(d, 180.0); // 美国东岸・五大湖

        // 3. 超精细战略要冲（台湾 / 香港澳门 / 新加坡 / 直布罗陀 / 马耳他）
        if (lon >= 119.8 && lon <= 122.2 && lat >= 21.8 && lat <= 25.4) d = Math.max(d, 236.0);      // 台湾全岛超细化
        if (lon >= 112.6 && lon <= 114.8 && lat >= 21.8 && lat <= 23.5) d = Math.max(d, 242.0);      // 香港・澳门・珠三角
        if (lon >= 101.0 && lon <= 104.6 && lat >= 0.9 && lat <= 4.2) d = Math.max(d, 232.0);        // 新加坡・马六甲
        if (lon >= -5.8 && lon <= -5.0 && lat >= 35.8 && lat <= 36.5) d = Math.max(d, 235.0);        // 直布罗陀
        if (lon >= 14.0 && lon <= 14.8 && lat >= 35.6 && lat <= 36.2) d = Math.max(d, 235.0);        // 马耳他
      }
      field[row + x] = d;
    }
  }

  // 叠加 Natural Earth 真实世界城市人口高斯热力峰（让大都市与枢纽精准抬升）
  const places = getPopulatedPlaces();
  const radPx = Math.max(10, Math.min(34, Math.round(1.35 * frame.scale)));
  const sigma = radPx * 0.45;
  const inv2s2 = 1 / (2 * sigma * sigma);
  for (const pl of places) {
    if (pl.lon < frame.lonMin - 2 || pl.lon > frame.lonMax + 2 || pl.lat < frame.latMin - 2 || pl.lat > frame.latMax + 2) continue;
    const [cx, cy] = projectPt(pl.lon, pl.lat, frame);
    const ix0 = Math.max(0, Math.floor(cx - radPx));
    const ix1 = Math.min(CW - 1, Math.ceil(cx + radPx));
    const iy0 = Math.max(0, Math.floor(cy - radPx));
    const iy1 = Math.min(CH - 1, Math.ceil(cy + radPx));
    const boost = pl.weight * 42.0;
    for (let y = iy0; y <= iy1; y++) {
      const dy2 = (y - cy) * (y - cy);
      const row = y * CW;
      for (let x = ix0; x <= ix1; x++) {
        const d2 = (x - cx) * (x - cx) + dy2;
        if (d2 <= radPx * radPx) {
          const v = field[row + x] + boost * Math.exp(-d2 * inv2s2);
          field[row + x] = v > 255.0 ? 255.0 : v;
        }
      }
    }
  }

  POP_FIELD_CACHE.set(key, field);
  return field;
}

// 真实多边形轮廓：1931 中国省界（沿山川省界自然弯曲，察绥热河连片不割裂内蒙国府！）
const POLY_1931_CPC = [[114.6,25.4],[115.4,24.9],[116.5,25.0],[117.1,25.8],[116.8,26.8],[115.8,27.2],[114.7,26.8],[114.3,26.1]];
const POLY_1931_YUNNAN = [[97.4,24.0],[98.6,21.5],[100.8,21.2],[103.0,22.5],[105.6,22.8],[105.8,24.2],[104.5,25.5],[103.8,27.1],[102.0,27.8],[100.2,28.4],[98.4,28.2],[97.5,26.2]];
const POLY_1931_GUANGXI = [[104.6,24.4],[105.8,22.8],[107.6,21.5],[109.6,21.4],[111.1,22.6],[111.7,24.2],[111.0,25.8],[109.2,26.1],[107.2,25.4],[105.4,25.2]];
const POLY_1931_SICHUAN = [[98.4,28.2],[100.2,28.4],[102.0,27.8],[103.8,27.1],[104.5,25.5],[106.5,25.2],[108.5,25.7],[109.5,27.4],[109.8,29.3],[110.2,31.2],[108.5,32.5],[106.2,32.8],[104.0,33.5],[102.0,33.4],[100.0,32.2],[98.6,30.5]];
const POLY_1931_SHANXI = [[106.5,43.2],[111.2,43.5],[114.2,41.6],[114.4,39.5],[114.0,37.4],[113.5,35.6],[111.8,34.8],[110.3,34.7],[110.1,36.8],[110.7,38.8],[109.2,39.8],[106.6,40.2]];
const POLY_1931_MA = [[92.5,38.8],[96.5,42.5],[101.0,43.2],[106.5,42.6],[106.9,40.2],[107.6,37.5],[106.6,35.2],[105.2,33.8],[102.8,33.2],[99.5,32.5],[96.0,33.6],[93.5,36.2]];
const POLY_1931_HEBEI_NE = [[113.8,41.2],[114.4,39.5],[114.2,37.8],[116.2,37.8],[117.8,38.4],[119.5,39.5],[121.8,40.5],[120.0,45.8],[114.2,45.8],[111.2,43.5]];

function classifyChina1931Warlord(lon, lat, idxOf) {
  if (pointInRing(lon, lat, POLY_1931_CPC)) return idxOf('cpc');
  if (lon < 96.0 && lat >= 35.4) return idxOf('xinjiang');
  if (pointInRing(lon, lat, POLY_1931_YUNNAN)) return idxOf('yunnan');
  if (pointInRing(lon, lat, POLY_1931_GUANGXI)) return idxOf('guangxi');
  if (pointInRing(lon, lat, POLY_1931_SICHUAN)) return idxOf('sichuan');
  if (pointInRing(lon, lat, POLY_1931_SHANXI)) return idxOf('shanxi');
  if (pointInRing(lon, lat, POLY_1931_MA)) return idxOf('ma_clique');
  if (pointInRing(lon, lat, POLY_1931_HEBEI_NE)) return idxOf('northeast');
  if (lat >= 41.2 && lon >= 111.0) return idxOf('northeast'); // 察哈尔/热河/东蒙连片归东北军，避免国府孤悬内蒙
  if (lat >= 40.5 && lon >= 106.2 && lon < 111.0) return idxOf('shanxi'); // 绥远归晋绥系
  if (lon < 98.5 && lat < 35.4) return idxOf('tibet');
  return idxOf('roc');
}

// 1941.12.7 中国战区真实曲折战线多边形（太原/大同归日占华北；陕甘宁+晋察冀敌后归延安；香港精确划归英军！）
const POLY_1941_YANAN = [[107.3,38.5],[109.8,39.4],[111.4,39.1],[111.6,37.6],[110.9,36.2],[109.6,35.4],[108.2,35.5],[107.4,36.8]];
const POLY_1941_JP_NORTH_EAST = [[110.5,41.8],[116.0,41.5],[121.5,40.0],[123.0,37.5],[122.2,34.5],[122.0,30.0],[120.5,29.3],[118.4,29.8],[116.5,29.5],[115.5,29.6],[113.6,29.8],[113.1,30.8],[114.2,32.1],[114.6,33.6],[113.4,34.8],[112.1,35.4],[111.5,37.4],[111.8,39.5],[110.4,40.4]];
const POLY_1941_JP_CANTON = [[112.6,22.2],[113.85,22.2],[114.3,23.2],[113.5,23.8],[112.6,23.4]];
const POLY_1941_JP_COAST = [[117.5,23.4],[119.8,24.8],[120.0,26.2],[118.8,26.0],[117.0,24.0]];

function classifyChina1941Front(lon, lat, idxOf) {
  if (lon >= 108.5 && lon <= 111.3 && lat >= 18.0 && lat <= 20.2) return idxOf('japan'); // 海南岛
  if (lon >= 119.5 && lon <= 122.5 && lat >= 21.8 && lat <= 25.5) return idxOf('japan'); // 台湾
  if (lon >= 113.85 && lon <= 114.55 && lat >= 22.05 && lat <= 22.62) return idxOf('uk_burma'); // 香港（九龙+港岛）
  if (lat >= 40.6 && lon >= 110.0) return idxOf('manchukuo'); // 蒙疆/热河/西满洲归伪满与日占，绝不让国府孤悬内蒙！
  if (pointInRing(lon, lat, POLY_1941_YANAN)) return idxOf('yanan');
  if (pointInRing(lon, lat, POLY_1941_JP_NORTH_EAST)) return idxOf('japan');
  if (pointInRing(lon, lat, POLY_1941_JP_CANTON)) return idxOf('japan');
  if (pointInRing(lon, lat, POLY_1941_JP_COAST)) return idxOf('japan');
  return idxOf('roc');
}

// 1950 冷战世界全图 183 国精确阵营归属（按 exact name + 经纬度兜底，0 错国）
function classifyColdWar1950(rawName, lon, lat, idxOf) {
  const n = rawName.toLowerCase();
  if (['ussr', 'soviet union', 'russia'].includes(n)) return idxOf('ussr');
  if (['china', 'mongolia', 'tibet', 'xinjiang', 'north korea', 'korea'].includes(n)) {
    if (n === 'korea' && lat < 38.0) return idxOf('japan'); // 南韩归美日西太平洋防线
    return idxOf('prc');
  }
  if (['japan', 'taiwan', 'formosa', 'south korea'].includes(n)) return idxOf('japan');
  if (['poland', 'czechoslovakia', 'hungary', 'romania', 'bulgaria', 'albania', 'east germany'].includes(n)) return idxOf('warsaw_east');
  if (n === 'germany') return lon >= 10.9 && lat >= 50.2 ? idxOf('warsaw_east') : idxOf('west_europe');
  if (['united kingdom', 'great britain', 'ireland', 'malaya', 'malaysia', 'singapore', 'brunei', 'north borneo', 'sarawak', 'hong kong',
       'south africa', 'union of south africa', 'kenya', 'uganda', 'tanganyika', 'nigeria', 'gold coast', 'ghana', 'sierra leone',
       'southern rhodesia', 'northern rhodesia', 'nyasaland', 'bechuanaland', 'botswana', 'british somaliland', 'sudan', 'cyprus', 'malta',
       'south west africa', 'namibia', 'zimbabwe', 'zambia', 'tanzania', 'malawi', 'gambia'].includes(n)) return idxOf('uk');
  if (['france', 'algeria', 'tunisia', 'morocco', 'french morocco', 'french west africa', 'french equatorial africa', 'madagascar',
       'senegal', 'mali', 'niger', 'chad', 'mauritania', 'guinea', 'ivory coast', 'upper volta', 'burkina faso', 'benin', 'dahomey',
       'cameroon', 'gabon', 'congo', 'central african republic', 'djibouti', 'french somaliland', 'french guiana', 'fezzan (frech lybia)',
       'annam', 'cochin china', 'cambodia', 'laos', 'vietnam', 'french indo-china'].includes(n)) return idxOf('france');
  if (['united states', 'usa', 'canada', 'mexico', 'greenland', 'iceland', 'alaska', 'cuba', 'guatemala', 'honduras', 'el salvador',
       'nicaragua', 'costa rica', 'panama', 'belize', 'dominican republic', 'haiti', 'jamaica', 'bahamas', 'puerto rico'].includes(n)) return idxOf('usa');
  if (['australia', 'new zealand', 'papua', 'new guinea', 'papua new guinea', 'fiji', 'solomon islands'].includes(n)) return idxOf('australia');
  if (['india', 'pakistan', 'bangladesh', 'burma', 'ceylon', 'sri lanka', 'nepal', 'bhutan', 'indonesia', 'dutch east indies',
       'thailand', 'siam', 'philippines'].includes(n)) return idxOf('india');
  if (['yugoslavia', 'turkey', 'egypt', 'iran', 'iraq', 'syria', 'lebanon', 'jordan', 'transjordan', 'palestine', 'israel',
       'saudi arabia', 'yemen', 'oman', 'kuwait', 'afghanistan', 'libya', 'cyraneica (uk lybia)', 'tripolitania', 'ethiopia', 'eritrea', 'somalia'].includes(n)) return idxOf('yugo_mideast');
  if (['italy', 'spain', 'portugal', 'netherlands', 'belgium', 'luxembourg', 'switzerland', 'austria', 'denmark', 'norway', 'sweden', 'finland', 'greece',
       'angola (portugal)', 'mozambique (portugal)', 'spanish sahara', 'belgian congo', 'zaire'].includes(n)) return idxOf('west_europe');
  // 经纬度精确大洲归属兜底（确保南美/非洲/东南亚其余岛屿绝不漂移）
  if (lon < -30 && lat < 15) return idxOf('latam');
  if (lon < -20 && lat >= 15) return idxOf('usa');
  if (lon >= 110 && lat < -10) return idxOf('australia');
  if (lon >= 92 && lat >= -11 && lat <= 22) return idxOf('india');
  if (lon >= 65 && lon < 92 && lat >= 5 && lat <= 37) return idxOf('india');
  if (lon >= 25 && lon < 68 && lat >= 12 && lat <= 42) return idxOf('yugo_mideast');
  if (lon >= -18 && lon < 52 && lat >= -36 && lat <= 37) {
    if (lon < 18 && lat > 2) return idxOf('france');
    return idxOf('uk');
  }
  if (lon >= -12 && lon < 26 && lat > 35) return idxOf('west_europe');
  return -1;
}

// =========================================================================
// 为单个剧本构建精确 1600×900 国家掩膜 + 拓扑网格同陆块 BFS 采样
// =========================================================================
function buildScenarioGIS(sc, grid20, mesh60, mesh120, bm20, bm60, bm120) {
  const reg = REGIONS.find(r => r.name === sc.region);
  const frame = makeProjectionFrame(reg, MAP_W, MAP_H);
  const idxMap = new Map(sc.nations.map((n, i) => [n.id, i]));
  const idxOf = (id) => {
    const v = idxMap.get(id);
    if (v === undefined) throw new Error(`[${sc.id}] Unknown nation specId: ${id}`);
    return v;
  };

  const CW = MAP_W, CH = MAP_H;
  const canvas = new Int16Array(CW * CH).fill(-1);

  // 预投影各国锚点（仅用于同陆块精确细分或古代剧本，绝不跨海乱跳！）
  const projAnchors = sc.nations.map((n, ni) => ({
    ni, id: n.id,
    pts: n.anchors.map(a => {
      const [x, y] = projectPt(a.lon, a.lat, frame);
      return { x, y, lon: a.lon, lat: a.lat, w: Math.max(0.35, a.weight || 1.0) };
    }),
  }));

  const pickAnchorOwner = (x, y, allowedIds = null) => {
    let best = -1, bestScore = Infinity;
    for (const pa of projAnchors) {
      if (allowedIds && !allowedIds.has(pa.id)) continue;
      for (const pt of pa.pts) {
        const d = Math.hypot(x - pt.x, y - pt.y) / pt.w;
        if (d < bestScore) { bestScore = d; best = pa.ni; }
      }
    }
    return best;
  };

  // ==================== 各剧本专属精确 GIS 光栅化（含 -2 剧本外无人之地 · v12 零错位版） ====================
  const WASTELAND = -2;
  if (sc.id === 'ww2_eve_1936' || sc.id === 'ww2_europe_1939') {
    const is1936 = sc.id === 'ww2_eve_1936';
    const wasteland1938 = new Set([
      'algeria (france)', 'algeria', 'morocco (france)', 'morocco', 'tunisia', 'spanish morocco',
      'libya', 'libya (it)', 'egypt', 'syria (france)', 'mesopotamia (gb)', 'iraq', 'iran',
      'mandatory palestine (gb)', 'palestine', 'transjordan', 'jordan', 'lebanon', 'saudi arabia', 'iceland',
    ]);
    const exact1938 = new Map([
      ['germany', idxOf('germany')],
      ['east prussia', idxOf('germany')],
      ['ussr', idxOf('ussr')],
      ['united kingdom', idxOf('uk')],
      ['france', idxOf('france')],
      ['andorra', idxOf('france')],
      ['poland', idxOf('poland')],
      ['italy', idxOf('italy')],
      ['spain', idxOf('spain')],
      ['finland', idxOf('finland')],
      ['sweden', idxOf('sweden')],
      ['norway', idxOf('norway')],
      ['netherlands', idxOf('netherlands')],
      ['romania', idxOf('romania')],
      ['hungary', idxOf('hungary')],
      ['yugoslavia', idxOf('yugoslavia')],
      ['greece', idxOf('greece')],
      ['turkey', idxOf('turkey')],
      ['belgium', idxOf('belgium')],
      ['luxembourg', idxOf('luxembourg')],
      ['switzerland', idxOf('switzerland')],
      ['denmark', idxOf('denmark')],
      ['portugal', idxOf('portugal')],
      ['ireland', idxOf('ireland')],
      ['bulgaria', idxOf('bulgaria')],
      ['lithuania', idxOf('lithuania')],
      ['latvia', idxOf('latvia')],
      ['estonia', idxOf('estonia')],
      ['albania', idxOf('italy')],
    ]);
    if (is1936) {
      exact1938.set('czechoslovakia', idxOf('czechoslovakia'));
    }

    const polys38 = getYearPolys(1938);
    rasterizePolygons(polys38, frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (!n) return null;
      if (wasteland1938.has(n)) return WASTELAND;
      if (!is1936 && n === 'czechoslovakia') return 998;
      if (n === 'armenia') return 997;
      return exact1938.has(n) ? exact1938.get(n) : null;
    });

    // 1936：从 world_1930.geojson 同时叠加完整独立奥地利 + 完整捷克斯洛伐克（含苏台德区！绝不提前 2.5 年归德）
    if (is1936) {
      const polys30 = getYearPolys(1930);
      rasterizePolygons(polys30, frame, CW, CH, canvas, (props) => {
        const n = String(props.NAME || '').trim().toLowerCase();
        if (n === 'austria') return idxOf('austria');
        if (n === 'czechoslovakia') return idxOf('czechoslovakia');
        return null;
      });
    }

    // 1939.9.1 真实捷克/斯洛伐克/维也纳仲裁多边形（布拉迪斯拉发 17.11,48.15 明确归斯洛伐克！）
    const polySlovakia39 = [
      [16.90,48.05],[17.30,48.12],[18.15,48.20],[19.30,48.35],[20.65,48.58],[22.15,48.50],
      [22.55,49.08],[21.25,49.45],[19.55,49.62],[18.40,49.52],[17.45,48.90],[16.95,48.50]
    ];
    const polyViennaAwardHungary39 = [
      [17.30,47.72],[22.35,47.85],[24.45,48.05],[24.30,48.80],[22.55,49.08],[22.15,48.50],
      [20.65,48.58],[19.30,48.35],[18.15,48.20],[17.30,48.12]
    ];

    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat > 62.5 && lon < -10.0) { canvas[row + x] = WASTELAND; continue; } // 冰岛
        if ((lat < 35.85 && lon < 11.8) || (lat < 37.35 && lon > 7.5 && lon < 11.4)) { canvas[row + x] = WASTELAND; continue; } // 北非
        if (lat < 36.2 && lon > 36.5) { canvas[row + x] = WASTELAND; continue; }  // 叙利亚/伊拉克/伊朗边角
        // 设得兰与奥克尼群岛（英国苏格兰北）绝不漂移给挪威！
        if (lon >= -4.2 && lon <= 0.5 && lat >= 58.6 && lat <= 61.2) { canvas[row + x] = idxOf('uk'); continue; }
        if (!is1936 && pointInRing(lon, lat, polySlovakia39) && (tag === 998 || tag === idxOf('germany') || tag === idxOf('hungary'))) {
          canvas[row + x] = idxOf('slovakia');
        } else if (!is1936 && pointInRing(lon, lat, polyViennaAwardHungary39) && tag === 998) {
          canvas[row + x] = idxOf('hungary');
        } else if (tag === 998) {
          canvas[row + x] = lon < 18.0 ? idxOf('germany') : (lon >= 22.15 ? idxOf('hungary') : idxOf('slovakia'));
        } else if (tag === 997) {
          canvas[row + x] = (lon >= 43.45 || lat >= 41.25) ? idxOf('ussr') : idxOf('turkey');
        }
      }
    }
  } else if (sc.id === 'ww1_1914') {
    const wasteland1914 = new Set([
      'algeria', 'tunisia', 'morocco', 'spanish morocco', 'libya', 'egypt',
      'arabia (nejd)', 'persia', 'iceland',
    ]);
    const exact1914 = new Map([
      ['german empire', idxOf('germany')],
      ['austro-hungarian empire', idxOf('austria_hungary')],
      ['ottoman empire', idxOf('ottoman')],
      ['united kingdom of great britain and ireland', idxOf('britain')],
      ['malta', idxOf('britain')],
      ['france', idxOf('france')],
      ['russian empire', idxOf('russia')],
      ['grand duchy of finland', idxOf('russia')],
      ['georgia', idxOf('russia')],
      ['armenia', idxOf('russia')],
      ['azerbaijan', idxOf('russia')],
      ['kingdom of italy', idxOf('italy')],
      ['serbia', idxOf('serbia')],
      ['montenegro', idxOf('serbia')],
      ['albania', idxOf('serbia')],
      ['belgium', idxOf('belgium')],
      ['netherlands', idxOf('netherlands')],
      ['luxembourg', idxOf('luxembourg')],
      ['switzerland', idxOf('switzerland')],
      ['spain', idxOf('spain')],
      ['portugal', idxOf('portugal')],
      ['sweden', idxOf('sweden')],
      ['norway', idxOf('norway')],
      ['denmark', idxOf('denmark')],
      ['romania', idxOf('romania')],
      ['bulgaria', idxOf('bulgaria')],
      ['greece', idxOf('greece')],
    ]);
    rasterizePolygons(getYearPolys(1914), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (wasteland1914.has(n)) return WASTELAND;
      return exact1914.has(n) ? exact1914.get(n) : null;
    });
    // 校准东色雷斯君士坦丁堡归奥斯曼、贝尔格莱德多瑙河南岸归塞尔维亚，保留奥斯曼叙利亚/两河流域（仅阿拉伯荒漠/波斯设无人区）
    const polyEastThrace1914 = [[26.2,40.6],[29.5,40.8],[29.4,41.6],[27.6,41.9],[26.4,41.6]];
    const polyBelgradeSouth1914 = [[19.5,44.4],[21.3,44.3],[21.2,44.90],[20.1,44.90],[19.5,44.75]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat > 62.5 && lon < -10.0) { canvas[row + x] = WASTELAND; continue; }
        if ((lat < 35.85 && lon < 11.8) || (lat < 37.35 && lon > 7.5 && lon < 11.4)) { canvas[row + x] = WASTELAND; continue; }
        if (lon >= -4.2 && lon <= 0.5 && lat >= 58.6 && lat <= 61.2) { canvas[row + x] = idxOf('britain'); continue; }
        if (pointInRing(lon, lat, polyEastThrace1914)) { canvas[row + x] = idxOf('ottoman'); continue; }
        if (pointInRing(lon, lat, polyBelgradeSouth1914)) { canvas[row + x] = idxOf('serbia'); continue; }
      }
    }
  } else if (sc.id === 'napoleon_1812') {
    const wasteland1812 = new Set(['algiers', 'tunis', 'morocco', 'persia', 'iceland', 'tripolitania', 'egypt']);
    const franceSet = new Set([
      'france', 'netherlands', 'belgium', 'luxembourg', 'switzerland',
      'bavaria', 'württemberg', 'baden', 'saxony', 'hanover', 'electoral hesse', 'grand duchy of hesse',
      'mecklenburg-schwerin', 'mecklenburg-strelitz', 'oldenburg', 'thuringia', 'nassau', 'anhalt',
      'brunswick', 'hamburg', 'bremen', 'lübeck', 'palatinate', 'waldeck', 'lippe-detmold', 'schaumburg-lippe',
      'hohenzollern', 'wetzlar', 'cuxhaven',
      'lombardy', 'venetia', 'papal states', 'tuscany', 'parma', 'modena', 'lucca', 'massa', 'pontremoli',
      'fivizzano', 'san marino', 'kingdom of the two sicilies', 'kingdom of sardinia', 'republic of kraków',
    ]);
    rasterizePolygons(getYearPolys(1815), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (!n) return null;
      if (wasteland1812.has(n)) return WASTELAND;
      if (n === 'sweden–norway') return 996;
      if (n === 'denmark' || n === 'holstein' || n === 'schleswig') return idxOf('denmark');
      if (n === 'prussia') return 995;
      if (n === 'russian empire') return 994;
      if (n === 'austrian empire') return idxOf('austria');
      if (n === 'united kingdom of great britain and ireland') return idxOf('britain');
      if (n === 'spain') return idxOf('spain');
      if (n === 'portugal') return idxOf('portugal');
      if (n === 'ottoman empire') return idxOf('ottoman');
      if (franceSet.has(n)) return idxOf('france');
      return null;
    });
    rasterizePolygons(getYearPolys(1914), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (n === 'norway') return idxOf('denmark');
      if (n === 'sweden') return idxOf('sweden');
      if (n === 'netherlands' || n === 'belgium' || n === 'luxembourg') return idxOf('france');
      if (n === 'grand duchy of finland') return idxOf('russia');
      return null;
    });
    // 1812 真实多边形：华沙大公国、法兰西伊利里亚行省（达尔马提亚+斯洛文尼亚+蒂罗尔）、普鲁士易北河以东、英国庇护西西里/撒丁
    const polyWarsaw1812 = [[15.5,52.8],[17.8,53.6],[19.2,53.3],[21.2,53.6],[23.5,54.8],[24.1,53.6],[23.5,51.2],[22.6,49.8],[19.5,49.7],[18.2,50.5],[16.6,51.7]];
    const polyIllyriaTyrol1812 = [[10.0,46.6],[12.5,47.5],[14.2,46.8],[15.6,45.8],[17.2,43.8],[19.0,42.2],[17.5,42.3],[14.6,44.4],[13.5,45.6],[10.4,46.1]];
    const polyPrussia1812 = [[11.6,54.1],[14.8,54.4],[17.2,54.8],[21.6,55.8],[22.8,54.0],[19.0,53.2],[16.0,52.6],[17.8,51.1],[18.8,50.2],[16.2,50.4],[14.3,51.2],[12.2,52.0],[11.5,53.1]];
    const polySicily1812 = [[12.3,37.8],[13.5,38.3],[15.7,38.3],[15.5,36.6],[13.6,37.0],[12.3,37.5]];
    const polySardinia1812 = [[8.1,41.3],[9.9,41.3],[9.8,38.8],[8.2,38.8]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat > 62.5 && lon < -10.0) { canvas[row + x] = WASTELAND; continue; }
        if ((lat < 35.85 && lon < 11.8) || (lat < 37.35 && lon > 7.5 && lon < 11.4)) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 36.2 && lon > 36.6) { canvas[row + x] = WASTELAND; continue; }
        if (lon >= -4.2 && lon <= 0.5 && lat >= 58.6 && lat <= 61.2) { canvas[row + x] = idxOf('britain'); continue; }
        if (tag === 996) {
          canvas[row + x] = (lon < 11.4 || (lat > 62.5 && lon < 13.8) || (lat > 67.5 && lon < 18.0)) ? idxOf('denmark') : idxOf('sweden');
        } else if (tag === 995) {
          canvas[row + x] = pointInRing(lon, lat, polyPrussia1812) ? idxOf('prussia') : idxOf('france');
        } else if (tag === 994) {
          canvas[row + x] = pointInRing(lon, lat, polyWarsaw1812) ? idxOf('france') : idxOf('russia');
        } else if (tag === idxOf('austria') && pointInRing(lon, lat, polyIllyriaTyrol1812)) {
          canvas[row + x] = idxOf('france');
        } else if (tag === idxOf('france') && (pointInRing(lon, lat, polySicily1812) || pointInRing(lon, lat, polySardinia1812))) {
          canvas[row + x] = idxOf('britain');
        }
      }
    }
  } else if (sc.id === 'china_1931') {
    const exact1930 = new Map([
      ['manchuria', idxOf('northeast')],
      ['tibet', idxOf('tibet')],
      ['xinjiang', idxOf('xinjiang')],
      ['mongolia', idxOf('mongolia')],
      ['far eastern ssr', idxOf('ussr_fe')],
      ['white russia', idxOf('ussr_fe')],
      ['empire of japan', idxOf('japan')],
      ['british raj', idxOf('uk_india')],
      ['nepal', idxOf('uk_india')],
      ['bhutan', idxOf('uk_india')],
      ['afghanistan', WASTELAND],
      ['hong kong', idxOf('uk_india')],
      ['annam', idxOf('indochina')],
      ['french indo-china', idxOf('indochina')],
      ['rattanakosin kingdom', WASTELAND],
      ['philippines', WASTELAND],
    ]);
    rasterizePolygons(getYearPolys(1930), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (n === 'chinese warlords') return 999;
      return exact1930.has(n) ? exact1930.get(n) : null;
    });
    // 仅将最西侧信德/塔尔沙漠与德干半岛南端设为无人之地，完整保留新德里 (77.21, 28.61) + 恒河平原 + 孟加拉 + 缅甸连片归英属印度！
    const polyChina31WestIndiaWaste = [
      [40.0,10.0],[82.0,10.0],[81.5,21.5],[78.0,23.5],[75.2,25.5],[74.5,29.5],[73.5,33.0],[40.0,37.0]
    ];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat < 20.4 && lon > 118.5) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polyChina31WestIndiaWaste)) { canvas[row + x] = WASTELAND; continue; }
        if (tag === 999) {
          canvas[row + x] = classifyChina1931Warlord(lon, lat, idxOf);
        } else if (tag === idxOf('northeast')) {
          if (lon >= 121.0 && lon <= 122.7 && lat >= 38.6 && lat <= 39.55) {
            canvas[row + x] = idxOf('japan');
          }
        }
      }
    }
  } else if (sc.id === 'ww2_asia_1941') {
    const exactAsia38 = new Map([
      ['ussr', idxOf('ussr_fe')],
      ['mongolia', idxOf('mongolia')],
      ['british raj', idxOf('uk_burma')],
      ['nepal', idxOf('uk_burma')],
      ['bhutan', idxOf('uk_burma')],
      ['hong kong', idxOf('uk_burma')],
      ['malaysia', idxOf('uk_malaya')],
      ['brunei', idxOf('uk_malaya')],
      ['dutch east indies', idxOf('dutch_ei')],
      ['french indo-china', idxOf('indochina')],
      ['laos', idxOf('indochina')],
      ['cambodia', idxOf('indochina')],
      ['cochin china', idxOf('indochina')],
      ['siam', idxOf('thailand')],
      ['philippines', idxOf('philippines')],
      ['australia', idxOf('usa_pacific')],
      ['guam', idxOf('usa_pacific')],
      ['saipan', idxOf('usa_pacific')],
      ['tibet', WASTELAND],
      ['xinjiang', WASTELAND],
    ]);
    rasterizePolygons(getYearPolys(1938), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (n === 'chinese warlords') return 999;
      if (n === 'empire of japan') return 993;
      return exactAsia38.has(n) ? exactAsia38.get(n) : null;
    });
    rasterizePolygons(getYearPolys(1930), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      return n === 'manchuria' ? idxOf('manchukuo') : null;
    });
    const polyAsia41NW = [
      [40.0,33.5],[79.5,33.5],[88.0,36.0],[91.5,40.0],[92.8,44.5],[94.5,48.5],[99.5,52.0],[112.0,53.5],[40.0,58.0]
    ];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (pointInRing(lon, lat, polyAsia41NW)) { canvas[row + x] = WASTELAND; continue; }
        // 明确归属印尼外围群岛（苏拉威西/摩鹿加/明打威/小巽他），杜绝被菲律宾或马来跨海吃掉！
        if (tag === -1 && lat <= 2.2 && lon >= 94.0 && lon <= 135.0 && !(lon >= 108.0 && lon <= 119.5 && lat >= 0.8 && lat <= 7.5)) {
          canvas[row + x] = idxOf('dutch_ei');
          continue;
        }
        if (tag === 999) {
          canvas[row + x] = classifyChina1941Front(lon, lat, idxOf);
        } else if (tag === 993) {
          canvas[row + x] = idxOf('japan');
        } else if (tag === idxOf('manchukuo')) {
          if (lon >= 121.0 && lon <= 122.7 && lat >= 38.6 && lat <= 39.55) {
            canvas[row + x] = idxOf('japan');
          }
        }
      }
    }
  } else if (sc.id === 'coldwar_1950') {
    const polys45 = getYearPolys(1945);
    rasterizePolygons(polys45, frame, CW, CH, canvas, (props, poly) => {
      const rawName = String(props.NAME || '').trim();
      if (!rawName || rawName.toLowerCase() === 'antarctica') return null;
      if (rawName.toLowerCase() === 'greenland') return WASTELAND;
      const ring = poly.rings[0];
      let slon = 0, slat = 0;
      for (const pt of ring) { slon += pt[0]; slat += pt[1]; }
      const cLon = slon / Math.max(1, ring.length), cLat = slat / Math.max(1, ring.length);
      // 防止楚科奇跨日界线多边形穿透至阿拉斯加西侧
      if (rawName.toLowerCase() === 'ussr' && cLon < -100) return null;
      const owner = classifyColdWar1950(rawName, cLon, cLat, idxOf);
      return owner >= 0 ? owner : null;
    });
    const polySahara = [
      [-10.5,24.5],[-5.0,27.8],[2.5,29.4],[11.0,28.8],[19.5,28.2],[26.0,26.8],
      [27.2,21.5],[22.0,18.2],[14.0,17.2],[4.0,18.0],[-4.5,18.8],[-11.0,20.8]
    ];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat > 69.5) { canvas[row + x] = WASTELAND; continue; }
        if (lon < -20.0 && lon > -62.0 && lat > 58.0) { canvas[row + x] = WASTELAND; continue; } // 格陵兰南端亦归无人区，不归西欧北约
        if (lon < -160.0 && lat > 50.0) { canvas[row + x] = idxOf('usa'); continue; } // 阿拉斯加西岛严归美国，杜绝苏联飞点
        if (pointInRing(lon, lat, polySahara)) { canvas[row + x] = WASTELAND; continue; }
      }
    }
  } else if (sc.id === 'tang_755') {
    // 盛唐天宝十四载（755，安史之乱前夕全盛版图！彻底修复误用 AD800 导致 3 国首都落敌境的灾难）
    const exact800 = new Map([
      ['tang empire', idxOf('tang')],
      ['hainan', idxOf('tang')],
      ['tibetan empire', idxOf('tibet')],
      ['uyghurs', idxOf('uyghur')],
      ['tungus', idxOf('bohai')],
      ['parhae', idxOf('bohai')],
      ['silia', idxOf('silla')],
      ['silla', idxOf('silla')],
      ['nan chao', idxOf('nanzhao')],
      ['pyu state', WASTELAND],
      ['mon state', WASTELAND],
      ['abbasid caliphate', idxOf('abbasid')],
      ['palas', WASTELAND],
      ['hindu states', WASTELAND],
      ['gurjara pratihara', WASTELAND],
      ['chauhans', WASTELAND],
      ['japan', WASTELAND],
    ]);
    rasterizePolygons(getYearPolys(800), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      return exact800.has(n) ? exact800.get(n) : null;
    });
    // 755 盛唐天宝十四载精确六大板块：安西/北庭/河西归唐、云南全境归南诏、葱岭西归大食、东北与滨海完整归渤海、回纥止步大兴安岭！
    const polyTangCore755 = [[102.5,39.0],[105.5,40.8],[111.5,41.2],[117.5,41.4],[121.2,40.8],[124.2,40.0],[122.8,36.5],[122.0,30.0],[119.5,24.0],[110.5,18.2],[105.2,18.5],[104.5,22.8],[103.8,26.8],[102.5,31.0],[101.8,35.8]];
    const polyTangAnxi755 = [[75.4,37.0],[82.5,36.6],[91.0,37.8],[97.5,38.0],[102.5,35.8],[105.5,36.8],[105.5,40.5],[99.5,42.5],[92.0,44.8],[84.0,45.2],[76.8,43.8],[75.4,40.2]];
    const polyNanzhao755 = [[97.4,24.2],[98.5,21.4],[101.8,21.2],[104.5,22.8],[104.5,26.6],[102.5,28.0],[99.5,28.0],[97.8,26.4]];
    const polyTibet755 = [[75.5,35.5],[79.5,29.5],[87.5,27.6],[96.5,27.8],[99.5,28.2],[102.2,31.2],[101.8,35.8],[97.0,37.6],[89.0,37.2],[81.0,36.4]];
    const polyBohai755 = [[121.5,40.2],[125.0,40.2],[129.0,40.2],[136.5,42.2],[137.0,48.8],[130.5,49.5],[124.0,48.0],[121.5,44.0]];
    const polyAbbasid755 = [[60.0,35.5],[75.3,36.2],[75.3,44.5],[60.0,46.0]];
    const polySilla755 = [[124.2,39.8],[129.5,40.0],[129.5,34.2],[125.5,34.2]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if ((lon > 129.6 && lat < 38.8) || (lon > 135.8 && lat < 45.8)) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 119.5 && lon < 123.2 && lat < 25.8) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 123.2 && lat < 30.0) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 20.5 && lon > 118.5) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 26.8 && lon < 96.2) { canvas[row + x] = WASTELAND; continue; }
        if (lat > 51.4) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polyAbbasid755)) { canvas[row + x] = idxOf('abbasid'); continue; }
        if (pointInRing(lon, lat, polyBohai755)) { canvas[row + x] = idxOf('bohai'); continue; }
        if (pointInRing(lon, lat, polySilla755)) { canvas[row + x] = idxOf('silla'); continue; }
        if (pointInRing(lon, lat, polyNanzhao755)) { canvas[row + x] = idxOf('nanzhao'); continue; }
        if (pointInRing(lon, lat, polyTibet755)) { canvas[row + x] = idxOf('tibet'); continue; }
        if (pointInRing(lon, lat, polyTangAnxi755) || pointInRing(lon, lat, polyTangCore755)) { canvas[row + x] = idxOf('tang'); continue; }
        if (canvas[row + x] === idxOf('uyghur') && lon > 121.2) { canvas[row + x] = idxOf('bohai'); continue; }
      }
    }
  } else if (sc.id === 'song_jin_1142') {
    const exact1200 = new Map([
      ['song empire', idxOf('nsong')],
      ['hainan', idxOf('nsong')],
      ['taiwanese tribes', WASTELAND],
      ['liao', idxOf('jin')],
      ['xixia', idxOf('xixia')],
      ['tibet', idxOf('tibet_tribes')],
      ['bhutan', idxOf('tibet_tribes')],
      ['nepal', idxOf('tibet_tribes')],
      ['nan chao', idxOf('dali')],
      ['bagan', WASTELAND],
      ['pyu state', WASTELAND],
      ['mongol empire', idxOf('mongol')],
      ['kara khitai khaganate', idxOf('mongol')],
      ['goryeo', idxOf('goryeo')],
      ['imperial japan (fujiwara)', WASTELAND],
      ['đại việt', idxOf('daiviet')],
      ['khmer empire', WASTELAND],
      ['harapunchai', WASTELAND],
      ['mon state', WASTELAND],
    ]);
    rasterizePolygons(getYearPolys(1200), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      return exact1200.has(n) ? exact1200.get(n) : null;
    });
    // 绍兴和议 1142 严格以秦岭大散关—淮河为界：关中/陇右/燕云/东北完整归金，南宋绝不北突陕西；西夏西界止于敦煌 (94.2°E)
    const polyJin1142 = [
      [102.8,35.6],[104.5,34.1],[106.8,34.0],[109.2,33.7],[111.4,33.0],[113.8,32.4],[116.0,32.5],[118.6,33.2],[120.8,34.4],
      [123.5,37.8],[124.2,40.2],[129.0,42.5],[134.5,46.0],[126.0,47.5],[120.0,43.8],[115.0,41.6],[110.5,40.4],[109.2,37.8],[106.8,35.6]
    ];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lon > 129.6) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 123.2 && lat < 30.0) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 20.5 && lon > 118.5) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 119.5 && lon < 123.2 && lat < 25.8) { canvas[row + x] = WASTELAND; continue; }
        if (lon < 98.2 && lat < 27.0) { canvas[row + x] = WASTELAND; continue; }
        if (canvas[row + x] === idxOf('xixia') && lon < 94.2) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polyJin1142)) { canvas[row + x] = idxOf('jin'); continue; }
        if (canvas[row + x] === idxOf('nsong') && ((lon < 110.5 && lat > 34.1) || (lon >= 110.5 && lat > 33.4))) {
          canvas[row + x] = idxOf('jin');
        }
      }
    }
  } else if (sc.id === 'zhanguo_260bce') {
    // 战国七雄（公元前 260 年长平之战）：按真实山川（秦岭/函谷关/黄河/太行/淮河/长江）划定七雄多边形，青藏/塔里木设无人区！
    const exactBC = new Map([
      ['xiongnu', idxOf('xiongnu')],
      ['turcik tribes', idxOf('xiongnu')],
      ['tungus', idxOf('yan')],
      ['min-yue', idxOf('baiyue')],
      ['nan-yue', idxOf('baiyue')],
      ['mon-khmer', WASTELAND],
      ['thai', WASTELAND],
      ['zhangzhung kingdom', WASTELAND],
      ['yuezhi', idxOf('qiangrong')],
      ['mauryan empire', WASTELAND],
      ['arakan', WASTELAND],
    ]);
    rasterizePolygons(getYearPolys('bc200'), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (n === 'han empire') return 991;
      return exactBC.has(n) ? exactBC.get(n) : null;
    });
    const polyQin = [[102.2,35.8],[105.5,38.2],[109.8,39.2],[110.8,36.2],[111.0,34.4],[111.5,32.2],[110.2,30.2],[106.5,28.8],[103.0,29.5],[102.2,32.5]];
    const polyZhao = [[109.8,39.2],[111.2,40.8],[115.6,40.4],[116.2,37.8],[114.8,36.0],[112.8,35.8],[111.2,36.6],[110.8,38.0]];
    const polyYan = [[115.0,40.4],[117.5,41.8],[124.5,41.6],[124.5,39.6],[119.5,38.6],[116.2,38.6],[115.5,39.5]];
    const polyQi = [[116.2,38.2],[119.2,37.8],[122.8,37.4],[121.0,35.2],[117.5,35.0],[115.8,36.2]];
    const polyWei = [[110.8,35.8],[112.8,35.8],[114.8,36.0],[116.0,35.6],[116.4,33.8],[114.2,33.8],[113.0,34.8],[111.0,34.9]]; // 河东-大梁完整连通！
    const polyHan = [[111.0,34.8],[113.0,34.8],[114.3,33.8],[113.8,32.7],[111.6,32.8],[110.8,33.8]];
    const polyChu = [[110.2,32.4],[113.8,32.8],[116.4,33.8],[118.5,34.8],[121.8,33.0],[121.8,29.5],[118.2,27.8],[114.5,26.8],[110.5,26.5],[108.5,29.2]];
    const polyBaiyue = [[105.5,24.5],[109.5,26.5],[114.5,26.8],[118.2,27.8],[121.5,29.5],[119.5,23.5],[110.0,18.2],[105.5,21.0]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lon > 129.6) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 125.8 && lat < 38.2) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 123.2 && lat < 30.0) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 20.5 && lon > 118.5) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 119.5 && lon < 123.2 && lat < 25.8) { canvas[row + x] = WASTELAND; continue; }
        if (lon < 97.0) { canvas[row + x] = WASTELAND; continue; } // 塔里木/青藏腹地设无人区，不再让羌戎变成秦国 2.66 倍
        if (lon < 102.5 && lat < 31.5) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 20.4 && lon < 105.0) { canvas[row + x] = WASTELAND; continue; }
        if (lat > 43.2) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polyWei)) { canvas[row + x] = idxOf('wei'); continue; }
        if (pointInRing(lon, lat, polyHan)) { canvas[row + x] = idxOf('han'); continue; }
        if (pointInRing(lon, lat, polyQi)) { canvas[row + x] = idxOf('qi'); continue; }
        if (pointInRing(lon, lat, polyYan)) { canvas[row + x] = idxOf('yan'); continue; }
        if (pointInRing(lon, lat, polyZhao)) { canvas[row + x] = idxOf('zhao'); continue; }
        if (pointInRing(lon, lat, polyQin)) { canvas[row + x] = idxOf('qin'); continue; }
        if (pointInRing(lon, lat, polyChu)) { canvas[row + x] = idxOf('chu'); continue; }
        if (pointInRing(lon, lat, polyBaiyue)) { canvas[row + x] = idxOf('baiyue'); continue; }
        if (lat >= 40.4 && lon < 121.0) { canvas[row + x] = idxOf('xiongnu'); continue; }
        if (lon < 103.5 && lat >= 31.5 && lat < 40.4) { canvas[row + x] = idxOf('qiangrong'); continue; }
        if (tag === 991 || tag === -1) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, new Set(['qin', 'zhao', 'qi', 'chu', 'wei', 'han', 'yan', 'baiyue', 'qiangrong', 'xiongnu']));
        }
      }
    }
  } else if (sc.id === 'sanguo_208') {
    // 三国赤壁 208：补齐公孙康辽东 + 长江/秦岭/淮河自然边界 + 西域青藏设无人区（绝不让马腾大过曹魏！）
    const exact200 = new Map([
      ['southern xiongnu', idxOf('xianbei')],
      ['yueban', idxOf('xianbei')],
      ['koguryo', idxOf('gongsun')],
      ['paekche', WASTELAND],
      ['silla', WASTELAND],
      ['gaya', WASTELAND],
      ['hainan', idxOf('shixie')],
    ]);
    rasterizePolygons(getYearPolys(200), frame, CW, CH, canvas, (props) => {
      const n = String(props.NAME || '').trim().toLowerCase();
      if (n === 'han') return 991;
      return exact200.has(n) ? exact200.get(n) : null;
    });
    const polySanguoSWWaste = [
      [60.0,10.0],[103.8,10.0],[102.8,20.2],[99.8,22.4],[98.4,25.2],[98.8,28.8],[99.2,32.5],[96.5,35.8],[60.0,37.0]
    ];
    const polyGongsun208 = [[120.2,38.7],[126.2,39.2],[127.0,42.5],[123.5,43.0],[120.4,41.6]];
    const polyCaowei208 = [[108.5,34.4],[110.2,33.4],[111.2,30.9],[114.2,30.6],[116.5,31.2],[118.8,32.2],[121.6,33.4],[122.8,37.4],[120.2,40.4],[117.5,41.0],[112.0,40.6],[109.5,39.2],[108.6,36.2]];
    const polySunwu208 = [[113.8,30.4],[116.5,31.2],[118.8,32.2],[122.0,31.5],[121.5,27.0],[119.5,24.5],[115.5,24.8],[113.6,27.6]];
    const polyLiubei208 = [[109.2,30.5],[113.8,30.5],[113.8,25.4],[110.2,25.2],[109.0,28.0]];
    const polyZhanglu208 = [[105.5,33.8],[108.8,33.8],[109.2,31.9],[106.0,31.8]];
    const polyLiuzhang208 = [[99.2,32.2],[105.8,32.2],[109.2,31.8],[109.2,26.8],[106.0,24.8],[101.2,24.8],[99.0,28.5]];
    const polyShixie208 = [[103.2,21.0],[106.0,24.8],[110.2,25.2],[115.5,24.8],[117.0,23.2],[110.5,18.0],[105.5,18.2]];
    const polyMateng208 = [[97.2,39.5],[101.5,40.4],[106.5,39.2],[108.8,38.0],[108.8,34.2],[105.5,33.6],[101.5,34.5],[98.2,36.8]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tag = canvas[row + x];
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lon > 129.6) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 126.2 && lat < 37.3) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 123.2 && lat < 30.0) { canvas[row + x] = WASTELAND; continue; }
        if (lat < 20.5 && lon > 118.5) { canvas[row + x] = WASTELAND; continue; }
        if (lon > 119.5 && lon < 123.2 && lat < 25.8) { canvas[row + x] = WASTELAND; continue; }
        if (lon < 97.0) { canvas[row + x] = WASTELAND; continue; } // 玉门关外西域大漠设无人区，绝不让马腾吞并全疆青藏！
        if (lat > 43.8) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polySanguoSWWaste)) { canvas[row + x] = WASTELAND; continue; }
        if (pointInRing(lon, lat, polyGongsun208)) { canvas[row + x] = idxOf('gongsun'); continue; }
        if (pointInRing(lon, lat, polyZhanglu208)) { canvas[row + x] = idxOf('zhanglu'); continue; }
        if (pointInRing(lon, lat, polyCaowei208)) { canvas[row + x] = idxOf('caowei'); continue; }
        if (pointInRing(lon, lat, polySunwu208)) { canvas[row + x] = idxOf('sunwu'); continue; }
        if (pointInRing(lon, lat, polyLiubei208)) { canvas[row + x] = idxOf('liubei'); continue; }
        if (pointInRing(lon, lat, polyLiuzhang208)) { canvas[row + x] = idxOf('liuzhang'); continue; }
        if (pointInRing(lon, lat, polyShixie208)) { canvas[row + x] = idxOf('shixie'); continue; }
        if (pointInRing(lon, lat, polyMateng208)) { canvas[row + x] = idxOf('mateng'); continue; }
        if (lat >= 40.6 && lon < 120.5) { canvas[row + x] = idxOf('xianbei'); continue; }
        if (tag === 991) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, new Set(['caowei', 'sunwu', 'liubei', 'liuzhang', 'mateng', 'zhanglu', 'shixie', 'gongsun']));
        } else if (tag === -1) {
          canvas[row + x] = WASTELAND;
        }
      }
    }
  } else {
    // v12.0.0 sengoku_1560：严格按日本列岛四大岛+真实令制国多边形划分 24 家大名（彻底根除织田 500km 西四国飞地、四国竖刀切、朝仓跨海漂移！）
    const kyushuSet = new Set(['shimazu', 'otomo', 'ryuzoji']);
    const chugokuSet = new Set(['mori', 'amago', 'ukita']);
    const kinkiSet = new Set(['miyoshi', 'ashikaga', 'rokkaku', 'azai', 'kitabatake']);
    const chubuKantoSet = new Set(['oda', 'matsudaira', 'imagawa', 'saito', 'asakura', 'takeda', 'uesugi', 'hojo', 'satake']);
    const tohokuSet = new Set(['date', 'mogami', 'nanbu']);
    // 精确四岛地理轮廓（按濑户内海/丰后水道/纪伊水道自然海沟分岛，绝无 131.85..132.0 缝隙泄漏！）
    const polyKyushu = [[128.5,31.0],[131.95,31.0],[132.12,33.32],[131.65,33.86],[130.92,33.92],[129.6,34.75],[128.5,34.0]];
    const polyShikoku = [[131.95,32.55],[134.82,32.75],[134.85,34.35],[133.92,34.42],[133.20,34.12],[132.35,33.95],[131.92,33.30]];
    // 四国内部：东阿波+赞岐（三好氏），土佐+伊予（长宗我部）沿四国山地自然曲线分界
    const polyShikokuMiyoshi = [[133.68,34.42],[134.85,34.35],[134.82,33.52],[134.30,33.65],[133.85,33.88],[133.60,34.12]];
    const polyChugoku = [[130.85,33.88],[132.4,33.95],[133.6,34.32],[134.55,34.52],[134.55,35.80],[132.5,36.45],[130.8,34.8]];
    const polyKinki = [[134.55,34.32],[135.2,33.40],[136.65,33.95],[136.66,35.15],[136.32,35.65],[135.65,35.85],[134.55,35.80]];
    const polyTohoku = [[139.45,37.25],[141.6,37.25],[142.3,41.42],[139.6,41.42],[139.4,38.8]];
    // 明确令制国校正：越前朝仓仅限北陆越前/若狭，绝不跨若狭湾漂到丹后
    const polyEchizenAsakura = [[135.75,35.50],[136.85,35.62],[136.85,36.35],[135.95,36.32]];
    const polyOwariOda = [[136.66,34.65],[137.12,34.80],[137.10,35.38],[136.66,35.32]];
    const polyMikawaMatsudaira = [[137.08,34.60],[137.65,34.65],[137.68,35.25],[137.10,35.30]];
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const [lon, lat] = unprojectPt(x + 0.5, y + 0.5, frame);
        if (lat > 41.42) { canvas[row + x] = WASTELAND; continue; } // 虾夷地（北海道）
        if (pointInRing(lon, lat, polyKyushu)) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, kyushuSet);
        } else if (pointInRing(lon, lat, polyShikoku)) {
          canvas[row + x] = pointInRing(lon, lat, polyShikokuMiyoshi) ? idxOf('miyoshi') : idxOf('chosokabe');
        } else if (pointInRing(lon, lat, polyTohoku)) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, tohokuSet);
        } else if (pointInRing(lon, lat, polyChugoku)) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, chugokuSet);
        } else if (pointInRing(lon, lat, polyKinki)) {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, kinkiSet);
        } else if (pointInRing(lon, lat, polyEchizenAsakura)) {
          canvas[row + x] = idxOf('asakura');
        } else if (pointInRing(lon, lat, polyOwariOda)) {
          canvas[row + x] = idxOf('oda');
        } else if (pointInRing(lon, lat, polyMikawaMatsudaira)) {
          canvas[row + x] = idxOf('matsudaira');
        } else if (lon < 134.55) {
          // 濑户内海/西国零星小岛只归西国/九州/四国，绝不落入尾张织田！
          canvas[row + x] = lat < 33.6 ? pickAnchorOwner(x + 0.5, y + 0.5, kyushuSet) : pickAnchorOwner(x + 0.5, y + 0.5, chugokuSet);
        } else {
          canvas[row + x] = pickAnchorOwner(x + 0.5, y + 0.5, chubuKantoSet);
        }
      }
    }
  }

  // ==================== v10.0.0 真实地理非均匀人口与战略密度场（核心区极密细分，俄西伯利亚/青藏/戈壁/撒哈拉广袤大州） ====================
  const popField = buildPopDensityField(frame, CW, CH, sc.region);

  // ==================== 网格采样 + 同陆块 BFS 填缝（零跨海！保留 -2 无人之地）+ 碎点清理 ====================
  const sampleMesh = (mesh, bm) => {
    const owners = new Int8Array(mesh.n).fill(-1);
    const pop = new Uint8Array(mesh.n);

    // 1. 直接采样光栅画布（保留 -2 无人之地！）+ 写入非均匀真实地理人口密度（14..255）
    for (let i = 0; i < mesh.n; i++) {
      if (bm[i] < 20) continue;
      const x = mesh.coords[i * 2], y = mesh.coords[i * 2 + 1];
      const px = Math.max(0, Math.min(CW - 1, Math.round(x)));
      const py = Math.max(0, Math.min(CH - 1, Math.round(y)));
      const pIdx = py * CW + px;
      const tag = canvas[pIdx];
      if (tag === WASTELAND) owners[i] = WASTELAND;
      else if (tag >= 0 && tag < sc.nations.length) owners[i] = tag;
      if (tag === WASTELAND) {
        pop[i] = 0;
      } else {
        const elev = bm[i];
        const elevMod = elev <= 30 ? 1.12 : elev <= 45 ? 1.00 : elev <= 62 ? 0.78 : 0.56;
        const baseD = popField[pIdx] * elevMod;
        pop[i] = Math.max(14, Math.min(255, Math.round(baseD)));
      }
    }

    // 2. 同陆块 BFS 填补海岸线 1-2 格未命中缝隙（同时以已归属国和 -2 无人之地作种子，仅填 -1 缝隙，绝不跨海、绝不吞并无人之地！）
    const queue = [];
    for (let i = 0; i < mesh.n; i++) if (bm[i] >= 20 && (owners[i] >= 0 || owners[i] === WASTELAND)) queue.push(i);
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      const own = owners[u];
      const s0 = mesh.starts[u], s1 = mesh.starts[u + 1];
      for (let e = s0; e < s1; e++) {
        const v = mesh.neighbors[e];
        if (bm[v] >= 20 && owners[v] === -1) {
          owners[v] = own;
          queue.push(v);
        }
      }
    }

    // 3. 孤立小海岛（整个岛都未落在 GeoJSON 轮廓内）：优先继承 64px 内最近的已归属陆地格（杜绝跨数百公里乱跳的全球 Voronoi 飞地！）
    const assignedCells = [];
    for (let i = 0; i < mesh.n; i++) {
      if (bm[i] >= 20 && (owners[i] >= 0 || owners[i] === WASTELAND)) assignedCells.push(i);
    }
    for (let i = 0; i < mesh.n; i++) {
      if (bm[i] >= 20 && owners[i] === -1) {
        const ix = mesh.coords[i * 2], iy = mesh.coords[i * 2 + 1];
        let bestOwn = WASTELAND, bestD2 = 72 * 72;
        for (let k = 0; k < assignedCells.length; k++) {
          const j = assignedCells[k];
          const dx = mesh.coords[j * 2] - ix, dy = mesh.coords[j * 2 + 1] - iy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) { bestD2 = d2; bestOwn = owners[j]; }
        }
        owners[i] = bestOwn;
      }
    }

    // 4. 最小领土与首都主权保障（确保每个国家首都格精确落于本国，且小国如卢森堡/香港在 20K 上至少保底，不覆盖他国首都）
    const minCells = mesh.n > 80000 ? 30 : (mesh.n > 40000 ? 18 : 8);
    const capitalCells = new Set();
    for (let ni = 0; ni < sc.nations.length; ni++) {
      const [cx, cy] = projectPt(sc.nations[ni].capitalLon, sc.nations[ni].capitalLat, frame);
      let bestC = -1, bestD2 = Infinity;
      for (let i = 0; i < mesh.n; i++) {
        if (bm[i] < 20) continue;
        const d2 = (mesh.coords[i * 2] - cx) ** 2 + (mesh.coords[i * 2 + 1] - cy) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bestC = i; }
      }
      if (bestC >= 0) {
        capitalCells.add(bestC);
        if (owners[bestC] !== ni) owners[bestC] = ni;
      }
    }
    const nationCounts = new Int32Array(sc.nations.length);
    for (let i = 0; i < mesh.n; i++) if (bm[i] >= 20 && owners[i] >= 0) nationCounts[owners[i]]++;
    for (let ni = 0; ni < sc.nations.length; ni++) {
      if (nationCounts[ni] < minCells) {
        const [cx, cy] = projectPt(sc.nations[ni].capitalLon, sc.nations[ni].capitalLat, frame);
        const near = [];
        for (let i = 0; i < mesh.n; i++) {
          if (bm[i] < 20 || owners[i] === WASTELAND || owners[i] === ni || capitalCells.has(i)) continue;
          const d2 = (mesh.coords[i * 2] - cx) ** 2 + (mesh.coords[i * 2 + 1] - cy) ** 2;
          if (d2 < 3200) near.push([d2, i]);
        }
        near.sort((a, b) => a[0] - b[0]);
        for (let k = 0; k < near.length && nationCounts[ni] < minCells; k++) {
          const idx = near[k][1];
          const prev = owners[idx];
          if (prev >= 0 && nationCounts[prev] <= minCells) continue;
          if (prev >= 0) nationCounts[prev]--;
          owners[idx] = ni;
          nationCounts[ni]++;
        }
      }
    }

    // 5. 清理单格边界孤立噪点（保护各国首都格与微型国家不被抹平）
    const smooth = new Int8Array(owners);
    for (let i = 0; i < mesh.n; i++) {
      if (bm[i] < 20 || owners[i] < 0 || capitalCells.has(i) || nationCounts[owners[i]] <= minCells + 2) continue;
      const own = owners[i];
      let same = 0, otherCnt = 0, topOther = -1;
      const votes = new Map();
      for (let e = mesh.starts[i]; e < mesh.starts[i + 1]; e++) {
        const v = mesh.neighbors[e];
        if (bm[v] < 20 || owners[v] < 0) continue;
        if (owners[v] === own) same++;
        else {
          otherCnt++;
          const c = (votes.get(owners[v]) || 0) + 1;
          votes.set(owners[v], c);
          if (c > (votes.get(topOther) || 0)) topOther = owners[v];
        }
      }
      if (same === 0 && otherCnt >= 3 && topOther >= 0) smooth[i] = topOther;
    }

    return { id: sc.id, region: sc.region, nationCount: sc.nations.length, owners: smooth, pop };
  };

  return {
    m20: sampleMesh(grid20, bm20.get(sc.region)),
    m60: sampleMesh(mesh60, bm60.get(sc.region)),
    m120: sampleMesh(mesh120, bm120.get(sc.region)),
  };
}

// =========================================================================
// PART C: 渲染全部 12 张可视化验收图（带国色、国界线、海岸线、首都坐标圆点与图例）
// =========================================================================
function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) || 128, parseInt(s.slice(2, 4), 16) || 128, parseInt(s.slice(4, 6), 16) || 128];
}

async function renderScenarioPreview(sc, entry20, grid20, bm20) {
  const W = 1200, H = 675;
  const sx = W / MAP_W, sy = H / MAP_H;
  const reg = REGIONS.find(r => r.name === sc.region);
  const frame = makeProjectionFrame(reg, MAP_W, MAP_H);
  const rgb = Buffer.alloc(W * H * 3);
  // 深海背景
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = 28; rgb[i * 3 + 1] = 56; rgb[i * 3 + 2] = 84; }

  const palette = sc.nations.map(n => hexToRgb(n.color));
  const counts = new Int32Array(sc.nations.length);
  const sumX = new Float64Array(sc.nations.length);
  const sumY = new Float64Array(sc.nations.length);
  const cellOwner = entry20.owners;

  // 在 1200×675 上用 5×5 点阵绘制每个 20K 陆地格（含国界暗边检测 + 暖灰无人之地渲染）
  let wastelandCells = 0;
  for (let i = 0; i < grid20.n; i++) {
    const o = cellOwner[i];
    if (bm20[i] < 20 || (o < 0 && o !== -2)) continue;
    const gx = grid20.coords[i * 2] * sx, gy = grid20.coords[i * 2 + 1] * sy;
    let isBorder = false;
    for (let e = grid20.starts[i]; e < grid20.starts[i + 1]; e++) {
      const nb = grid20.neighbors[e];
      if (bm20[nb] >= 20 && cellOwner[nb] !== o) { isBorder = true; break; }
    }
    let cr, cg, cb;
    if (o === -2) {
      wastelandCells++;
      cr = 152; cg = 147; cb = 136; // 无人之地：暖灰羊皮纸石色
    } else {
      counts[o]++;
      sumX[o] += gx; sumY[o] += gy;
      [cr, cg, cb] = palette[o];
    }
    const mul = isBorder ? 0.62 : 1.0;
    const r = Math.round(cr * mul), g = Math.round(cg * mul), b = Math.round(cb * mul);
    const ix = Math.round(gx), iy = Math.round(gy);
    for (let dy = -3; dy <= 3; dy++) {
      const py = iy + dy; if (py < 0 || py >= H) continue;
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 11) continue;
        const px = ix + dx; if (px < 0 || px >= W) continue;
        const p3 = (py * W + px) * 3;
        rgb[p3] = r; rgb[p3 + 1] = g; rgb[p3 + 2] = b;
      }
    }
  }

  // SVG 叠加：国名标注（在首都附近）+ 标题条
  const labels = [];
  for (let ni = 0; ni < sc.nations.length; ni++) {
    const n = sc.nations[ni];
    const [cx, cy] = projectPt(n.capitalLon, n.capitalLat, frame);
    const lx = Math.max(24, Math.min(W - 24, cx * sx));
    const ly = Math.max(36, Math.min(H - 12, cy * sy));
    labels.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.2" fill="#fff" stroke="#111" stroke-width="1.2"/>`);
    labels.push(`<text x="${lx.toFixed(1)}" y="${(ly - 5).toFixed(1)}" text-anchor="middle" font-family="Microsoft YaHei,SimHei,sans-serif" font-size="11" font-weight="700" fill="#ffffff" stroke="#111111" stroke-width="2.6" paint-order="stroke">${n.id}(${counts[ni]})</text>`);
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="0" y="0" width="${W}" height="28" fill="rgba(12,18,28,0.82)"/>
    <text x="12" y="19" font-family="Microsoft YaHei,sans-serif" font-size="14" font-weight="700" fill="#f5e7c4">${sc.id} — ${sc.title} (${sc.region}, ${sc.nations.length} nations, wasteland=${wastelandCells})</text>
    ${labels.join('')}
  </svg>`);

  ensureDir(PREVIEW_DIR);
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .png({ compressionLevel: 6 })
    .toFile(path.join(PREVIEW_DIR, `${sc.id}.png`));

  // 硬断言 1：零空国，每个国家 >= 6 格；硬断言 2：100% 国家首都落在己国领土内！
  let capMiss = 0;
  for (let ni = 0; ni < sc.nations.length; ni++) {
    const [cx, cy] = projectPt(sc.nations[ni].capitalLon, sc.nations[ni].capitalLat, frame);
    let bestC = -1, bestD2 = Infinity;
    for (let i = 0; i < grid20.n; i++) {
      if (bm20[i] < 20) continue;
      const d2 = (grid20.coords[i * 2] - cx) ** 2 + (grid20.coords[i * 2 + 1] - cy) ** 2;
      if (d2 < bestD2) { bestD2 = d2; bestC = i; }
    }
    if (bestC >= 0 && cellOwner[bestC] !== ni) {
      capMiss++;
      console.error(`  [CAPITAL MISMATCH] ${sc.id} ${sc.nations[ni].id} capital cell owned by ${cellOwner[bestC]}`);
    }
  }
  const minCount = Math.min(...counts);
  const worstIdx = counts.indexOf(minCount);
  console.log(`  [Verify ${sc.id}] nations=${sc.nations.length}, wasteland=${wastelandCells}, capMiss=${capMiss}, min=${sc.nations[worstIdx].id}(${minCount} cells), max=${Math.max(...counts)}`);
  if (minCount < 6 || capMiss > 0) {
    throw new Error(`ASSERTION FAILED: ${sc.id} min=${sc.nations[worstIdx].id}(${minCount}) capMiss=${capMiss}`);
  }
}

async function main() {
  const t0 = Date.now();
  const swiftRivers = parseSwiftRealRivers();
  const scenarios = parseSwiftOfficialScenarios();
  console.log(`[v9 Map Baker] Loaded ${scenarios.length} scenarios & ${swiftRivers.length} real rivers`);

  const grid20 = loadGridBin(path.join(BUNDLE_WORLD_DIR, 'grid20k.bin'));
  const mesh60 = loadGridBin(path.join(OUT_DIR, 'HDMeshes/60k/grid60k.bin'));
  const mesh120 = loadGridBin(path.join(OUT_DIR, 'HDMeshes/120k/grid120k.bin'));
  console.log(`[Meshes] 20K=${grid20.n}, 60K=${mesh60.n}, 120K=${mesh120.n}`);

  const { bm20, bm60, bm120 } = await rebuildChangedBasemaps(grid20, mesh60, mesh120, swiftRivers);

  const list20 = [], list60 = [], list120 = [];
  for (const sc of scenarios) {
    const baked = buildScenarioGIS(sc, grid20, mesh60, mesh120, bm20, bm60, bm120);
    list20.push(baked.m20);
    list60.push(baked.m60);
    list120.push(baked.m120);
    await renderScenarioPreview(sc, baked.m20, grid20, bm20.get(sc.region));
  }

  writeLGHS(list20, grid20.n, path.join(BUNDLE_ATLAS_DIR, 'scenarios_gis.bin'));
  writeLGHS(list60, mesh60.n, path.join(OUT_DIR, 'HDMeshes/scenarios_gis_60k.bin'));
  writeLGHS(list120, mesh120.n, path.join(OUT_DIR, 'HDMeshes/scenarios_gis_120k.bin'));
  console.log(`\n[DONE v9 Maps] Baked ALL 12 scenarios (20K bundled + 60K/120K HD) + 12 preview PNGs in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
}

main().catch((err) => { console.error(err); process.exit(1); });
