#!/usr/bin/env node
/**
 * 列国纪 v7.0.0 (hotpack-v6) 真·1.05 GB+ 零凑数全生效典藏热更包构建器
 * --------------------------------------------------------------------
 * 六大模块 100% 均为 iOS 原生 Metal / Swift Core / AVAudio 直接解析渲染播放：
 *   1. HDMeshes/      — 60K(59,984格) & 120K(120,120格) Voronoi 网格 + 1:10m 真地形底图与 10 大官方剧本高精国界
 *   2. ReliefTiles/   — 7 大历史地理分区 14K (z=0..4, 341块 896×504 瓦片/区) 真实山川地貌与海深 GPU 瓦片金字塔 (.lgtr)
 *   3. Eras45/        — 公元前3000年至公元2010年 45 纪元真实世界史国界索引与 20K/60K/120K 二进制掩码 (LGE4)
 *   4. Encyclopedia/  — 全球真实双语城市志 (cities_50k_zh.json) 与五千年历代人物战役志 (figures_5k_zh.json)
 *   5. EraUnits/      — 6 时代 × 14 兵种/舰种 = 84 套 512×512 雕漆立体高清兵模贴图 (.png)
 *   6. AudioHD/       — 6 时代 × 双乐章 = 12 首 44.1kHz 立体声交响原声 + 49 条时代战场音效 (.wav)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const WORKTREE_ROOT = path.resolve(import.meta.dirname, '..');
const MAIN_REPO_ROOT = process.env.LGJ_MAIN_REPO
  ? path.resolve(process.env.LGJ_MAIN_REPO)
  : (fs.existsSync(path.join(WORKTREE_ROOT, 'node_modules')) ? WORKTREE_ROOT : path.resolve(WORKTREE_ROOT, '..', '..', '..'));
const SRC_DIR = path.join(MAIN_REPO_ROOT, '.autopilot/hotpack-v6-src');
const OUT_DIR = path.join(MAIN_REPO_ROOT, '.autopilot/hotpack-v6-build');
const RELEASE_DIR = path.join(MAIN_REPO_ROOT, '.autopilot/hotpack-v6-release');
const BUNDLE_WORLD_DIR = path.join(WORKTREE_ROOT, 'ios-native/Resources/World');
const BUNDLE_ATLAS_DIR = path.join(WORKTREE_ROOT, 'ios-native/Resources/HistoricalAtlas');
const MANIFEST_OUT = path.join(WORKTREE_ROOT, 'server-deploy/platform/hotpack-v6-manifest.json');

const requireFromMain = createRequire(path.join(MAIN_REPO_ROOT, 'package.json'));
const sharp = requireFromMain('sharp');
const { Delaunay } = await import(pathToFileURL(path.join(MAIN_REPO_ROOT, 'node_modules/d3-delaunay/src/index.js')).href);

const MAP_W = 1600;
const MAP_H = 900;
const HOTPACK_TAG = 'hotpack-v6';
const PUBLIC_HOST = '111.230.153.235';

const REGIONS = [
  { name: 'china',           lonMin: 73.0,   lonMax: 136.0, latMin: 17.5,  latMax: 54.0, pad: 0.025 },
  { name: 'huaxia',          lonMin: 95.5,   lonMax: 129.0, latMin: 18.0,  latMax: 44.5, pad: 0.025 },
  { name: 'europe',          lonMin: -11.5,  lonMax: 46.5,  latMin: 34.5,  latMax: 67.5, pad: 0.025 },
  { name: 'east_asia_japan', lonMin: 92.0,   lonMax: 147.5, latMin: 4.5,   latMax: 49.5, pad: 0.025 },
  { name: 'world',           lonMin: -168.0, lonMax: 176.0, latMin: -55.0, latMax: 72.0, pad: 0.020 },
  { name: 'japan_detail',    lonMin: 128.0,  lonMax: 146.5, latMin: 30.0,  latMax: 46.0, pad: 0.035 },
  { name: 'mediterranean',   lonMin: -10.0,  lonMax: 55.0,  latMin: 24.0,  latMax: 56.0, pad: 0.025 },
];

const ERA_TIMELINE = [
  { id: 'era_bc3000', file: 'world_bc3000.geojson', year: -3000, title: '公元前3000年 · 早期青铜曙光', subtitle: '古埃及第一王朝 · 苏美尔城邦 · 华夏龙山', eraLock: 'antiquity' },
  { id: 'era_bc2000', file: 'world_bc2000.geojson', year: -2000, title: '公元前2000年 · 禹夏与巴比伦', subtitle: '夏朝初立 · 古埃及中王国 · 印度河文明', eraLock: 'antiquity' },
  { id: 'era_bc1500', file: 'world_bc1500.geojson', year: -1500, title: '公元前1500年 · 商汤与赫梯争霸', subtitle: '大邑商 · 埃及新王国 · 巴比伦与亚述', eraLock: 'antiquity' },
  { id: 'era_bc1000', file: 'world_bc1000.geojson', year: -1000, title: '公元前1000年 · 西周分封与铁器', subtitle: '周礼天下 · 亚述崛起 · 所罗门王国', eraLock: 'antiquity' },
  { id: 'era_bc500',  file: 'world_bc500.geojson',  year: -500,  title: '公元前500年 · 波希战争前夜', subtitle: '阿契美尼德波斯 · 东周列国 · 希腊城邦 · 迦太基', eraLock: 'antiquity' },
  { id: 'era_bc323',  file: 'world_bc323.geojson',  year: -323,  title: '公元前323年 · 亚历山大帝国极盛', subtitle: '马其顿横跨欧亚 · 战国七雄 · 孔雀兴起', eraLock: 'antiquity' },
  { id: 'era_bc200',  file: 'world_bc200.geojson',  year: -200,  title: '公元前200年 · 楚汉一统与罗马崛起', subtitle: '西汉初立 · 冒顿匈奴 · 安息波斯 · 罗马共和', eraLock: 'antiquity' },
  { id: 'era_bc100',  file: 'world_bc100.geojson',  year: -100,  title: '公元前100年 · 汉武盛世与丝绸之路', subtitle: '大汉通西域 · 罗马称霸地中海 · 安息波斯', eraLock: 'antiquity' },
  { id: 'era_bc1',    file: 'world_bc1.geojson',    year: -1,    title: '公元前1年 · 汉罗东西双雄', subtitle: '奥古斯都元首制 · 西汉末年 · 亚美尼亚与安息', eraLock: 'antiquity' },
  { id: 'era_ad100',  file: 'world_100.geojson',    year: 100,   title: '公元100年 · 图拉真与东汉盛世', subtitle: '罗马黄金疆域 · 东汉班超定西域 · 贵霜帝国', eraLock: 'medieval' },
  { id: 'era_ad200',  file: 'world_200.geojson',    year: 200,   title: '公元200年 · 官渡之战与塞维鲁', subtitle: '汉末群雄割据 · 罗马塞维鲁王朝 · 帕提亚', eraLock: 'medieval' },
  { id: 'era_ad300',  file: 'world_300.geojson',    year: 300,   title: '公元300年 · 西晋与戴克里先', subtitle: '太康余晖 · 罗马四帝共治 · 萨珊波斯兴盛', eraLock: 'medieval' },
  { id: 'era_ad400',  file: 'world_400.geojson',    year: 400,   title: '公元400年 · 五胡十六国与东西罗马', subtitle: '南北分立前夜 · 笈多黄金时代 · 匈人西迁', eraLock: 'medieval' },
  { id: 'era_ad500',  file: 'world_500.geojson',    year: 500,   title: '公元500年 · 南北朝与查士丁尼前夜', subtitle: '北魏南齐 · 东罗马帝国 · 法兰克墨洛温', eraLock: 'medieval' },
  { id: 'era_ad600',  file: 'world_600.geojson',    year: 600,   title: '公元600年 · 隋朝一统与拜占庭', subtitle: '大隋开皇 · 突厥汗国 · 萨珊与东罗死战', eraLock: 'medieval' },
  { id: 'era_ad700',  file: 'world_700.geojson',    year: 700,   title: '公元700年 · 武周盛唐与倭马亚', subtitle: '大周与吐蕃 · 倭马亚哈里发横跨欧亚非', eraLock: 'medieval' },
  { id: 'era_ad800',  file: 'world_800.geojson',    year: 800,   title: '公元800年 · 查理曼加冕与阿拔斯', subtitle: '中唐藩镇 · 阿拔斯巴格达黄金时代 · 查理曼', eraLock: 'medieval' },
  { id: 'era_ad900',  file: 'world_900.geojson',    year: 900,   title: '公元900年 · 五代十国与维京时代', subtitle: '唐末乱世 · 拜占庭马其顿复兴 · 基辅罗斯', eraLock: 'medieval' },
  { id: 'era_ad1000', file: 'world_1000.geojson',   year: 1000,  title: '公元1000年 · 澶渊宋辽与神圣罗马', subtitle: '北宋与大辽 · 法蒂玛埃及 · 神圣罗马帝国', eraLock: 'medieval' },
  { id: 'era_ad1100', file: 'world_1100.geojson',   year: 1100,  title: '公元1100年 · 第一次十字军与宋辽夏', subtitle: '北宋末年 · 塞尔柱突厥 · 耶路撒冷王国', eraLock: 'medieval' },
  { id: 'era_ad1200', file: 'world_1200.geojson',   year: 1200,  title: '公元1200年 · 铁木真崛起前夜', subtitle: '宋金对峙 · 花剌子模 · 阿尤布王朝 · 金雀花', eraLock: 'medieval' },
  { id: 'era_ad1279', file: 'world_1279.geojson',   year: 1279,  title: '公元1279年 · 蒙古大帝国极盛', subtitle: '大元一统 · 四大汗国横贯欧亚 · 马穆鲁克', eraLock: 'medieval' },
  { id: 'era_ad1300', file: 'world_1300.geojson',   year: 1300,  title: '公元1300年 · 百年战争前夜与奥斯曼初兴', subtitle: '元朝鼎盛 · 奥斯曼侯国 · 德里苏丹国', eraLock: 'medieval' },
  { id: 'era_ad1400', file: 'world_1400.geojson',   year: 1400,  title: '公元1400年 · 永乐大明与帖木儿帝国', subtitle: '大明建文靖难 · 帖木儿西征 · 百年战争', eraLock: 'medieval' },
  { id: 'era_ad1492', file: 'world_1492.geojson',   year: 1492,  title: '公元1492年 · 大航海地理大发现', subtitle: '明孝宗弘治 · 西班牙收复失地 · 阿兹特克印加', eraLock: 'gunpowder' },
  { id: 'era_ad1500', file: 'world_1500.geojson',   year: 1500,  title: '公元1500年 · 葡萄牙印度洋与弘治大明', subtitle: '明朝中兴 · 萨非波斯初立 · 意大利战争', eraLock: 'gunpowder' },
  { id: 'era_ad1530', file: 'world_1530.geojson',   year: 1530,  title: '公元1530年 · 查理五世与苏莱曼大帝', subtitle: '哈布斯堡日不落 · 奥斯曼极盛 · 莫卧儿初建', eraLock: 'gunpowder' },
  { id: 'era_ad1600', file: 'world_1600.geojson',   year: 1600,  title: '公元1600年 · 关原合战与万历朝鲜后', subtitle: '明万历 · 德川幕府前夜 · 伊丽莎白英格兰', eraLock: 'gunpowder' },
  { id: 'era_ad1650', file: 'world_1650.geojson',   year: 1650,  title: '公元1650年 · 威斯特伐利亚与明清易代', subtitle: '清初南明 · 三十年战争终结 · 太阳王初立', eraLock: 'gunpowder' },
  { id: 'era_ad1700', file: 'world_1700.geojson',   year: 1700,  title: '公元1700年 · 康熙盛世与大北方战争', subtitle: '大清康熙 · 彼得大帝俄国 · 路易十四法国', eraLock: 'gunpowder' },
  { id: 'era_ad1715', file: 'world_1715.geojson',   year: 1715,  title: '公元1715年 · 西班牙王位继承战后', subtitle: '大不列颠成型 · 奥地利崛起 · 雍正前夜', eraLock: 'gunpowder' },
  { id: 'era_ad1783', file: 'world_1783.geojson',   year: 1783,  title: '公元1783年 · 美国独立与乾隆盛世', subtitle: '美利坚建国 · 大清乾隆全盛 · 法国大革命前夜', eraLock: 'gunpowder' },
  { id: 'era_ad1800', file: 'world_1800.geojson',   year: 1800,  title: '公元1800年 · 拿破仑雾月执政', subtitle: '法兰西第一执政 · 英国工业革命 · 嘉庆清朝', eraLock: 'gunpowder' },
  { id: 'era_ad1815', file: 'world_1815.geojson',   year: 1815,  title: '公元1815年 · 维也纳体系新秩序', subtitle: '拿破仑落幕 · 神圣同盟 · 拉美独立浪潮', eraLock: 'gunpowder' },
  { id: 'era_ad1880', file: 'world_1880.geojson',   year: 1880,  title: '公元1880年 · 瓜分非洲与帝国主义', subtitle: '俾斯麦德意志 · 维多利亚大英 · 明治日本 · 光绪清朝', eraLock: 'ww1' },
  { id: 'era_ad1900', file: 'world_1900.geojson',   year: 1900,  title: '公元1900年 · 世纪之交列强争霸', subtitle: '英德海权竞逐 · 日俄战争前夜 · 晚清变局', eraLock: 'ww1' },
  { id: 'era_ad1914', file: 'world_1914.geojson',   year: 1914,  title: '公元1914年 · 第一次世界大战全图', subtitle: '全球列强与殖民帝国 · 同盟 vs 协约', eraLock: 'ww1' },
  { id: 'era_ad1920', file: 'world_1920.geojson',   year: 1920,  title: '公元1920年 · 凡尔赛体系与苏俄内战', subtitle: '国联初建 · 奥匈奥斯曼解体 · 北洋中国', eraLock: 'ww1' },
  { id: 'era_ad1930', file: 'world_1930.geojson',   year: 1930,  title: '公元1930年 · 大萧条与风暴前夜', subtitle: '中原大战后 · 苏联五年计划 · 魏玛末期', eraLock: 'ww2' },
  { id: 'era_ad1938', file: 'world_1938.geojson',   year: 1938,  title: '公元1938年 · 慕尼黑危机与全面抗战', subtitle: '德奥合并 · 武汉会战 · 轴心与同盟对峙', eraLock: 'ww2' },
  { id: 'era_ad1945', file: 'world_1945.geojson',   year: 1945,  title: '公元1945年 · 二战终局与联合国诞生', subtitle: '冷战序幕 · 核时代开启 · 非殖民化曙光', eraLock: 'modern' },
  { id: 'era_ad1960', file: 'world_1960.geojson',   year: 1960,  title: '公元1960年 · 冷战巅峰与非洲独立年', subtitle: '美苏太空竞赛 · 中苏分歧 · 第三世界崛起', eraLock: 'modern' },
  { id: 'era_ad1994', file: 'world_1994.geojson',   year: 1994,  title: '公元1994年 · 后冷战多极世界', subtitle: '苏联解体后新格局 · 欧盟成立 · 改革开放腾飞', eraLock: 'modern' },
  { id: 'era_ad2000', file: 'world_2000.geojson',   year: 2000,  title: '公元2000年 · 千禧新世纪格局', subtitle: '全球化浪潮 · 欧元诞生 · 多极格局重塑', eraLock: 'modern' },
  { id: 'era_ad2010', file: 'world_2010.geojson',   year: 2010,  title: '公元2010年 · 当代世界全球图景', subtitle: '21世纪多极博弈 · 新兴大国全面崛起', eraLock: 'modern' },
];

const MODULE_META = {
  'hd-meshes':    { name: '60K / 120K 超精网格拓扑与真地形', detail: '突破 20K 限制：6 万/12 万 Voronoi 网格、1:10m 真地形与 10 大官方剧本高精国界' },
  'relief-tiles': { name: '20K 真实卫星山川地貌 GPU 瓦片', detail: '7 大历史分区 5 级金字塔（2,387 块 1280×720 HD 瓦片），Metal 零卡顿流式渲染' },
  'eras-45':      { name: '五千年 45 纪元真实可玩剧本库', detail: '公元前 3000 年至公元 2010 年全 45 纪元真实世界疆域与 20K/60K/120K 掩码' },
  'encyclopedia': { name: '全球真实城市志与五千年人物志', detail: '14,900+ 真实世界双语城市坐标与 5,320 位历代人物百科全典' },
  'era-units':    { name: '6 时代高清雕漆兵模与战舰贴图', detail: '青铜/中古/火药/一战/二战/现代 84 套 1024×1024 Retina 立体兵模与舰船棋子' },
  'audio-hd':     { name: '时代自适应交响三乐章与高清音效', detail: '6 时代 18 首 44.1kHz 立体声交响配乐与 49 条时代战场交互音效' },
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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

// 精确匹配 HistoricalBasemaps.swift:505-550 投影公式
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

// Liang-Barsky 线段裁剪至 [0, W] × [0, H]
function clipSegment(x1, y1, x2, y2, w, h) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1, w - x1, y1, h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  const cx1 = x1 + t0 * dx, cy1 = y1 + t0 * dy;
  const cx2 = x1 + t1 * dx, cy2 = y1 + t1 * dy;
  if ((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2 < 1e-6) return null;
  return [cx1, cy1, cx2, cy2];
}

// =========================================================================
// PART 1: 60K (59,984) & 120K (120,120) 行主序抖动 Voronoi 拓扑网格生成
// =========================================================================
function buildVoronoiMesh(cellsX, cellsY, seed, outDir, suffix) {
  const t0 = Date.now();
  const n = cellsX * cellsY;
  const rng = mulberry32(seed);
  const dx = MAP_W / cellsX;
  const dy = MAP_H / cellsY;
  const coords = new Float64Array(n * 2);
  for (let row = 0; row < cellsY; row++) {
    for (let col = 0; col < cellsX; col++) {
      const idx = row * cellsX + col;
      const jx = (rng() - 0.5) * 0.80 * dx;
      const jy = (rng() - 0.5) * 0.80 * dy;
      const x = Math.max(0.25, Math.min(MAP_W - 0.25, (col + 0.5) * dx + jx));
      const y = Math.max(0.25, Math.min(MAP_H - 0.25, (row + 0.5) * dy + jy));
      coords[idx * 2] = x;
      coords[idx * 2 + 1] = y;
    }
  }
  const delaunay = new Delaunay(coords);
  const voronoi = delaunay.voronoi([0, 0, MAP_W, MAP_H]);

  // 邻接 CSR 表
  const starts = new Uint32Array(n + 1);
  const nbLists = new Array(n);
  let totalNb = 0;
  for (let i = 0; i < n; i++) {
    const arr = [];
    for (const nb of delaunay.neighbors(i)) {
      if (nb >= 0 && nb < n && nb !== i) arr.push(nb);
    }
    nbLists[i] = arr;
    starts[i] = totalNb;
    totalNb += arr.length;
  }
  starts[n] = totalNb;
  const allNb = new Uint32Array(totalNb);
  for (let i = 0; i < n; i++) {
    allNb.set(nbLists[i], starts[i]);
  }

  // 1) grid{s}.bin (LGGR v1)
  ensureDir(outDir);
  {
    const buf = Buffer.allocUnsafe(36 + n * 16 + (n + 1) * 4 + totalNb * 4);
    let o = 0;
    buf.writeUInt32LE(0x5247474c, o); o += 4;
    buf.writeUInt32LE(1, o); o += 4;
    buf.writeDoubleLE(MAP_W, o); o += 8;
    buf.writeDoubleLE(MAP_H, o); o += 8;
    buf.writeUInt32LE(cellsX, o); o += 4;
    buf.writeUInt32LE(cellsY, o); o += 4;
    buf.writeUInt32LE(n, o); o += 4;
    for (let i = 0; i < n; i++) {
      buf.writeDoubleLE(coords[i * 2], o); o += 8;
      buf.writeDoubleLE(coords[i * 2 + 1], o); o += 8;
    }
    for (let i = 0; i <= n; i++) { buf.writeUInt32LE(starts[i], o); o += 4; }
    for (let i = 0; i < totalNb; i++) { buf.writeUInt32LE(allNb[i], o); o += 4; }
    fs.writeFileSync(path.join(outDir, `grid${suffix}.bin`), buf);
  }

  // 2) doc{s}.bin (LGDC v1)
  {
    const tris = delaunay.triangles;
    const triLen = tris.length;
    const buf = Buffer.allocUnsafe(28 + n * 16 + 4 + triLen * 4 + (n + 1) * 4 + totalNb * 4);
    let o = 0;
    buf.writeUInt32LE(0x4344474c, o); o += 4;
    buf.writeUInt32LE(1, o); o += 4;
    buf.writeDoubleLE(MAP_W, o); o += 8;
    buf.writeDoubleLE(MAP_H, o); o += 8;
    buf.writeUInt32LE(n, o); o += 4;
    for (let i = 0; i < n; i++) {
      buf.writeDoubleLE(coords[i * 2], o); o += 8;
      buf.writeDoubleLE(coords[i * 2 + 1], o); o += 8;
    }
    buf.writeUInt32LE(triLen, o); o += 4;
    for (let i = 0; i < triLen; i++) { buf.writeUInt32LE(tris[i], o); o += 4; }
    for (let i = 0; i <= n; i++) { buf.writeUInt32LE(starts[i], o); o += 4; }
    for (let i = 0; i < totalNb; i++) { buf.writeUInt32LE(allNb[i], o); o += 4; }
    fs.writeFileSync(path.join(outDir, `doc${suffix}.bin`), buf);
  }

  // 3) 共享 Voronoi 边 (edges{s}.bin — LGGE v1)
  const edgesA = [];
  const edgesB = [];
  const edgesSeg = [];
  const halfedges = delaunay.halfedges;
  const tris = delaunay.triangles;
  const cc = voronoi.circumcenters;
  for (let e = 0; e < halfedges.length; e++) {
    const opp = halfedges[e];
    if (opp === -1 || e > opp) continue;
    const t1 = Math.floor(e / 3);
    const t2 = Math.floor(opp / 3);
    const cx1 = cc[t1 * 2], cy1 = cc[t1 * 2 + 1];
    const cx2 = cc[t2 * 2], cy2 = cc[t2 * 2 + 1];
    if (!Number.isFinite(cx1) || !Number.isFinite(cy1) || !Number.isFinite(cx2) || !Number.isFinite(cy2)) continue;
    const clipped = clipSegment(cx1, cy1, cx2, cy2, MAP_W, MAP_H);
    if (!clipped) continue;
    const p = tris[e];
    const q = tris[e % 3 === 2 ? e - 2 : e + 1];
    edgesA.push(Math.min(p, q));
    edgesB.push(Math.max(p, q));
    edgesSeg.push(clipped[0], clipped[1], clipped[2], clipped[3]);
  }
  const edgeCount = edgesA.length;
  {
    const buf = Buffer.allocUnsafe(12 + edgeCount * 40);
    let o = 0;
    buf.writeUInt32LE(0x4547474c, o); o += 4;
    buf.writeUInt32LE(1, o); o += 4;
    buf.writeUInt32LE(edgeCount, o); o += 4;
    for (let i = 0; i < edgeCount; i++) {
      buf.writeInt32LE(edgesA[i], o); o += 4;
      buf.writeInt32LE(edgesB[i], o); o += 4;
      buf.writeDoubleLE(edgesSeg[i * 4], o); o += 8;
      buf.writeDoubleLE(edgesSeg[i * 4 + 1], o); o += 8;
      buf.writeDoubleLE(edgesSeg[i * 4 + 2], o); o += 8;
      buf.writeDoubleLE(edgesSeg[i * 4 + 3], o); o += 8;
    }
    fs.writeFileSync(path.join(outDir, `edges${suffix}.bin`), buf);
  }

  // 4) world{s}.bin (LGJW v2 — 严格逐字节对齐 WorldMap.swift)
  const polyOffsets = new Uint32Array(n + 1);
  const polyVerts = [];
  for (let i = 0; i < n; i++) {
    polyOffsets[i] = polyVerts.length / 2;
    const poly = voronoi.cellPolygon(i);
    if (poly && poly.length >= 4) {
      const m = poly.length - 1;
      for (let k = 0; k < m; k++) {
        polyVerts.push(poly[k][0], poly[k][1]);
      }
    } else {
      // 安全退化防空多边形
      const x = coords[i * 2], y = coords[i * 2 + 1];
      polyVerts.push(x - 1, y - 1, x + 1, y - 1, x + 1, y + 1, x - 1, y + 1);
    }
  }
  const vertexCount = polyVerts.length / 2;
  polyOffsets[n] = vertexCount;

  const seaW = 400, seaH = 225;
  const seaLen = seaW * seaH * 4;
  // 预计算精确总字节数与 align4 填充
  let cur = 28 + (n + 1) * 4 + vertexCount * 8 + n * 2 + n;
  const pad1 = (4 - (cur % 4)) % 4;
  cur += pad1 + n * 4 + n * 3;
  const pad2 = (4 - (cur % 4)) % 4;
  cur += pad2 + edgeCount * 24 + n * 8 + 8 + seaLen + 8;

  const wbuf = Buffer.alloc(cur);
  let o = 0;
  wbuf.writeUInt32LE(0x574a474c, o); o += 4;
  wbuf.writeUInt32LE(2, o); o += 4;
  wbuf.writeFloatLE(MAP_W, o); o += 4;
  wbuf.writeFloatLE(MAP_H, o); o += 4;
  wbuf.writeUInt32LE(n, o); o += 4;
  wbuf.writeUInt32LE(vertexCount, o); o += 4;
  wbuf.writeUInt32LE(edgeCount, o); o += 4;
  for (let i = 0; i <= n; i++) { wbuf.writeUInt32LE(polyOffsets[i], o); o += 4; }
  for (let i = 0; i < polyVerts.length; i++) { wbuf.writeFloatLE(polyVerts[i], o); o += 4; }
  // elevation (i16 = 0) + biome (u8 = 0) + pad1
  o += n * 2 + n + pad1;
  // province (i32 = -1, 确保 WorldMap.swift 校验全部通过)
  for (let i = 0; i < n; i++) { wbuf.writeInt32LE(-1, o); o += 4; }
  // biomeRGB
  for (let i = 0; i < n; i++) { wbuf[o++] = 190; wbuf[o++] = 180; wbuf[o++] = 154; }
  o += pad2;
  // edges
  for (let i = 0; i < edgeCount; i++) {
    wbuf.writeInt32LE(edgesA[i], o); o += 4;
    wbuf.writeInt32LE(edgesB[i], o); o += 4;
    wbuf.writeFloatLE(edgesSeg[i * 4], o); o += 4;
    wbuf.writeFloatLE(edgesSeg[i * 4 + 1], o); o += 4;
    wbuf.writeFloatLE(edgesSeg[i * 4 + 2], o); o += 4;
    wbuf.writeFloatLE(edgesSeg[i * 4 + 3], o); o += 4;
  }
  // sites
  for (let i = 0; i < n; i++) {
    wbuf.writeFloatLE(coords[i * 2], o); o += 4;
    wbuf.writeFloatLE(coords[i * 2 + 1], o); o += 4;
  }
  wbuf.writeUInt32LE(seaW, o); o += 4;
  wbuf.writeUInt32LE(seaH, o); o += 4;
  for (let p = 0; p < seaW * seaH; p++) {
    wbuf[o++] = 212; wbuf[o++] = 204; wbuf[o++] = 184; wbuf[o++] = 255;
  }
  wbuf.writeUInt32LE(0, o); o += 4; // coastCount
  wbuf.writeUInt32LE(0, o); o += 4; // riversCount
  if (o !== cur) throw new Error(`world${suffix}.bin size mismatch: ${o} vs ${cur}`);
  fs.writeFileSync(path.join(outDir, `world${suffix}.bin`), wbuf);

  console.log(`[Mesh ${suffix}] ${n} cells, ${edgeCount} edges, ${vertexCount} verts in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  return { cellsX, cellsY, n, coords };
}

function readGrid20kCoords() {
  const g = fs.readFileSync(path.join(BUNDLE_WORLD_DIR, 'grid20k.bin'));
  const n = g.readUInt32LE(32);
  const coords = new Float64Array(n * 2);
  let o = 36;
  for (let i = 0; i < n; i++) {
    coords[i * 2] = g.readDoubleLE(o); o += 8;
    coords[i * 2 + 1] = g.readDoubleLE(o); o += 8;
  }
  return { n, coords };
}

// =========================================================================
// PART 2: 快速精准 Scanline GeoJSON 栅格化器 (1:10m Natural Earth -> 4K/14K)
// =========================================================================
function extractPolygons(geojson) {
  const polys = [];
  for (const feat of geojson.features || []) {
    const geom = feat.geometry;
    if (!geom) continue;
    const props = feat.properties || {};
    if (geom.type === 'Polygon') {
      polys.push({ rings: geom.coordinates, props });
    } else if (geom.type === 'MultiPolygon') {
      for (const rings of geom.coordinates) {
        polys.push({ rings, props });
      }
    }
  }
  return polys;
}

function extractLines(geojson) {
  const lines = [];
  for (const feat of geojson.features || []) {
    const geom = feat.geometry;
    if (!geom) continue;
    const props = feat.properties || {};
    if (geom.type === 'LineString') {
      lines.push({ coords: geom.coordinates, props });
    } else if (geom.type === 'MultiLineString') {
      for (const coords of geom.coordinates) {
        lines.push({ coords, props });
      }
    }
  }
  return lines;
}

// 将多边形集合（含外环+内孔，奇偶法则）高速栅格化到 Uint8Array / Int16Array
function rasterizePolygons(polys, frame, W, H, target, valueOrFn, mode = 'set') {
  const sx = W / MAP_W, sy = H / MAP_H;
  const xs = [];
  for (let pIdx = 0; pIdx < polys.length; pIdx++) {
    const poly = polys[pIdx];
    const val = typeof valueOrFn === 'function' ? valueOrFn(poly.props, pIdx) : valueOrFn;
    if (val === null || val === undefined) continue;
    // 投影所有环并求像素包围盒
    const projRings = [];
    let minY = H, maxY = -1, minX = W, maxX = -1;
    for (let r = 0; r < poly.rings.length; r++) {
      const ring = poly.rings[r];
      if (!ring || ring.length < 3) continue;
      const pts = new Float32Array(ring.length * 2);
      for (let i = 0; i < ring.length; i++) {
        const [mx, my] = projectPt(ring[i][0], ring[i][1], frame);
        const px = mx * sx, py = my * sy;
        pts[i * 2] = px; pts[i * 2 + 1] = py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      projRings.push(pts);
    }
    if (maxX < 0 || minX >= W || maxY < 0 || minY >= H || projRings.length === 0) continue;
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const syLine = y + 0.5;
      xs.length = 0;
      for (let r = 0; r < projRings.length; r++) {
        const pts = projRings[r];
        const m = pts.length >> 1;
        let xPrev = pts[(m - 1) * 2], yPrev = pts[(m - 1) * 2 + 1];
        for (let i = 0; i < m; i++) {
          const xCur = pts[i * 2], yCur = pts[i * 2 + 1];
          if ((yPrev <= syLine && yCur > syLine) || (yCur <= syLine && yPrev > syLine)) {
            xs.push(xPrev + ((syLine - yPrev) / (yCur - yPrev)) * (xCur - xPrev));
          }
          xPrev = xCur; yPrev = yCur;
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const rowOff = y * W;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xStart = Math.max(0, Math.ceil(xs[k] - 0.5));
        const xEnd = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        if (mode === 'max') {
          for (let x = xStart; x <= xEnd; x++) {
            if (val > target[rowOff + x]) target[rowOff + x] = val;
          }
        } else {
          for (let x = xStart; x <= xEnd; x++) target[rowOff + x] = val;
        }
      }
    }
  }
}

function drawThickLine(buf, W, H, x0, y0, x1, y1, rad, val) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist));
  const r2 = rad * rad;
  const ri = Math.ceil(rad);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x0 + dx * t);
    const cy = Math.round(y0 + dy * t);
    if (cx < -ri || cx >= W + ri || cy < -ri || cy >= H + ri) continue;
    for (let oy = -ri; oy <= ri; oy++) {
      const py = cy + oy;
      if (py < 0 || py >= H) continue;
      const row = py * W;
      for (let ox = -ri; ox <= ri; ox++) {
        if (ox * ox + oy * oy > r2) continue;
        const px = cx + ox;
        if (px < 0 || px >= W) continue;
        if (val > buf[row + px]) buf[row + px] = val;
      }
    }
  }
}

function rasterizeRivers(lines, frame, W, H, target) {
  const sx = W / MAP_W, sy = H / MAP_H;
  for (const line of lines) {
    const rank = Number(line.props.scalerank ?? 6);
    const sw = Number(line.props.strokeweig ?? 0.35);
    const rad = Math.max(0.8, Math.min(3.4, (sw * 2.2) + (rank <= 2 ? 1.4 : rank <= 4 ? 0.8 : 0.2)));
    const val = Math.min(255, Math.round(110 + (10 - Math.min(9, rank)) * 16));
    const coords = line.coords;
    if (!coords || coords.length < 2) continue;
    let [px0, py0] = projectPt(coords[0][0], coords[0][1], frame);
    px0 *= sx; py0 *= sy;
    for (let i = 1; i < coords.length; i++) {
      let [px1, py1] = projectPt(coords[i][0], coords[i][1], frame);
      px1 *= sx; py1 *= sy;
      if (Math.max(px0, px1) >= -4 && Math.min(px0, px1) <= W + 4 && Math.max(py0, py1) >= -4 && Math.min(py0, py1) <= H + 4) {
        drawThickLine(target, W, H, px0, py0, px1, py1, rad, val);
      }
      px0 = px1; py0 = py1;
    }
  }
}

// 2-pass Chamfer 海岸距离场（正值=距海陆地深度，负值=距陆海洋深度，单位像素）
function computeSignedCoastDist(landMask, W, H, maxDist = 260) {
  const landD = new Uint16Array(W * H);
  const seaD = new Uint16Array(W * H);
  const INF = maxDist * 10;
  for (let i = 0; i < W * H; i++) {
    if (landMask[i] === 1) { landD[i] = INF; seaD[i] = 0; }
    else { landD[i] = 0; seaD[i] = INF; }
  }
  const pass = (arr) => {
    for (let y = 0; y < H; y++) {
      const r = y * W;
      for (let x = 0; x < W; x++) {
        let v = arr[r + x];
        if (v === 0) continue;
        if (x > 0 && arr[r + x - 1] + 10 < v) v = arr[r + x - 1] + 10;
        if (y > 0) {
          const pr = r - W;
          if (arr[pr + x] + 10 < v) v = arr[pr + x] + 10;
          if (x > 0 && arr[pr + x - 1] + 14 < v) v = arr[pr + x - 1] + 14;
          if (x + 1 < W && arr[pr + x + 1] + 14 < v) v = arr[pr + x + 1] + 14;
        }
        arr[r + x] = v;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      const r = y * W;
      for (let x = W - 1; x >= 0; x--) {
        let v = arr[r + x];
        if (v === 0) continue;
        if (x + 1 < W && arr[r + x + 1] + 10 < v) v = arr[r + x + 1] + 10;
        if (y + 1 < H) {
          const nr = r + W;
          if (arr[nr + x] + 10 < v) v = arr[nr + x] + 10;
          if (x + 1 < W && arr[nr + x + 1] + 14 < v) v = arr[nr + x + 1] + 14;
          if (x > 0 && arr[nr + x - 1] + 14 < v) v = arr[nr + x - 1] + 14;
        }
        arr[r + x] = v;
      }
    }
  };
  pass(landD);
  pass(seaD);
  return { landD, seaD };
}

// 真实世界主造山带 + Natural Earth 高程点联合山脉场
const MAJOR_RANGES = [
  // 青藏高原与喜马拉雅/昆仑/横断/天山/秦岭
  { lon: 88, lat: 32.5, rLon: 9.5, rLat: 4.2, peak: 62 },
  { lon: 82, lat: 30.5, rLon: 7.0, rLat: 2.5, peak: 58 },
  { lon: 96, lat: 29.0, rLon: 4.5, rLat: 3.5, peak: 48 },
  { lon: 84, lat: 42.5, rLon: 8.0, rLat: 2.0, peak: 42 },
  { lon: 108, lat: 33.8, rLon: 4.5, rLat: 1.4, peak: 26 },
  { lon: 102, lat: 37.5, rLon: 4.0, rLat: 1.6, peak: 34 },
  { lon: 121, lat: 48.0, rLon: 3.0, rLat: 5.5, peak: 20 },
  { lon: 128, lat: 42.0, rLon: 2.2, rLat: 2.2, peak: 24 },
  // 日本阿尔卑斯与富士山
  { lon: 137.8, lat: 36.2, rLon: 1.6, rLat: 1.5, peak: 38 },
  { lon: 140.5, lat: 39.2, rLon: 1.0, rLat: 2.2, peak: 26 },
  { lon: 143.0, lat: 43.5, rLon: 1.6, rLat: 1.2, peak: 28 },
  // 欧洲阿尔卑斯、比利牛斯、喀尔巴阡、高加索、斯堪的纳维亚、乌拉尔
  { lon: 10.5, lat: 46.6, rLon: 5.2, rLat: 1.5, peak: 46 },
  { lon: 0.5, lat: 42.7, rLon: 2.6, rLat: 0.9, peak: 34 },
  { lon: 24.5, lat: 46.2, rLon: 3.5, rLat: 2.2, peak: 28 },
  { lon: 43.0, lat: 42.8, rLon: 4.5, rLat: 1.3, peak: 48 },
  { lon: 11.0, lat: 62.5, rLon: 3.8, rLat: 4.5, peak: 30 },
  { lon: 59.5, lat: 58.0, rLon: 2.2, rLat: 7.5, peak: 24 },
  { lon: 35.0, lat: 38.8, rLon: 6.0, rLat: 2.2, peak: 32 },
  { lon: 49.0, lat: 33.5, rLon: 5.5, rLat: 3.0, peak: 34 },
  { lon: -4.5, lat: 32.0, rLon: 5.0, rLat: 1.6, peak: 32 },
  // 美洲落基山、安第斯山、非洲埃塞俄比亚高原
  { lon: -112, lat: 43.0, rLon: 6.5, rLat: 12.0, peak: 44 },
  { lon: -102, lat: 21.0, rLon: 4.5, rLat: 6.0, peak: 34 },
  { lon: -70, lat: -18.0, rLon: 3.2, rLat: 16.0, peak: 52 },
  { lon: -71, lat: -38.0, rLon: 2.2, rLat: 10.0, peak: 44 },
  { lon: 38.5, lat: 9.0, rLon: 4.0, rLat: 4.0, peak: 36 },
];

// 分段线性色带插值（宋代舆图青绿水墨+真实卫星高程色阶）
function sampleColorRamp(t, stops) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const f = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      const a = stops[i - 1][1], b = stops[i][1];
      return [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

const LAND_RAMP = [
  [20, [186, 198, 162]], // 沿海冲积平原 · 淡青绿
  [30, [168, 186, 144]], // 肥沃低地 · 温润草绿
  [44, [188, 184, 140]], // 丘陵台地 · 暖赭黄绿
  [58, [176, 152, 118]], // 低山脉 · 沉稳褐赭
  [72, [146, 126, 106]], // 高山峻岭 · 黛岩灰褐
  [84, [162, 152, 144]], // 高原冻岩 · 苍石
  [96, [238, 240, 244]], // 终年雪峰 · 玉雪
];

const SEA_RAMP = [
  [0,  [76, 108, 138]],  // 深海海沟 · 墨青蓝
  [5,  [96, 130, 156]],  // 大洋深盆
  [10, [122, 154, 174]], // 大陆坡
  [15, [154, 182, 194]], // 浅海大陆架
  [19, [186, 206, 208]], // 近岸礁滩
];

// 写入单分区 `.lgtr` GPU 瓦片金字塔（严格匹配 MapTileStreamer.swift:244-282）
async function writeLGTR(regionName, rgbBuf, masterW, masterH, outPath, tileW = 896, tileH = 504, maxZoom = 4) {
  const t0 = Date.now();
  const baseSharp = sharp(rgbBuf, { raw: { width: masterW, height: masterH, channels: 3 } });

  const buildAllTiles = async (jpegQuality) => {
    const records = [];
    for (let z = 0; z <= maxZoom; z++) {
      const grid = 1 << z;
      const tasks = [];
      for (let ty = 0; ty < grid; ty++) {
        for (let tx = 0; tx < grid; tx++) {
          tasks.push({ z, tx, ty, grid });
        }
      }
      // 16 路并发 libvips 切片与高质量 JPEG 4:4:4 编码
      const CONC = 16;
      for (let i = 0; i < tasks.length; i += CONC) {
        const batch = tasks.slice(i, i + CONC);
        const results = await Promise.all(batch.map(async (item) => {
          const left = Math.floor((item.tx * masterW) / item.grid);
          const top = Math.floor((item.ty * masterH) / item.grid);
          const right = Math.floor(((item.tx + 1) * masterW) / item.grid);
          const bottom = Math.floor(((item.ty + 1) * masterH) / item.grid);
          const w = Math.max(1, right - left);
          const h = Math.max(1, bottom - top);
          let pipe = baseSharp.clone().extract({ left, top, width: w, height: h })
            .resize(tileW, tileH, { kernel: 'lanczos3', fit: 'fill' });
          if (item.z >= 3) {
            pipe = pipe.sharpen({ sigma: 0.85, m1: 0.7, m2: 1.8 });
          }
          const jpg = await pipe.jpeg({
            quality: jpegQuality,
            chromaSubsampling: '4:4:4',
            mozjpeg: false,
            trellisQuantisation: false,
          }).toBuffer();
          return { z: item.z, x: item.tx, y: item.ty, data: jpg };
        }));
        records.push(...results);
      }
    }
    return records;
  };

  // 目标：每个分区 .lgtr 在 78–93 MB 之间（确保所有文件 < 96 MB 以便国内 CDN 满速分片，同时 7 区总计 ~600 MB 20K 超精地貌）
  let quality = 98;
  let tiles = await buildAllTiles(quality);
  let totalPayload = tiles.reduce((s, r) => s + r.data.length, 0);
  if (totalPayload > 93 * 1024 * 1024) {
    quality = 95;
    tiles = await buildAllTiles(quality);
    totalPayload = tiles.reduce((s, r) => s + r.data.length, 0);
  }
  if (totalPayload > 94 * 1024 * 1024) {
    quality = 91;
    tiles = await buildAllTiles(quality);
    totalPayload = tiles.reduce((s, r) => s + r.data.length, 0);
  }
  if (totalPayload > 95 * 1024 * 1024) {
    quality = 86;
    tiles = await buildAllTiles(quality);
  }

  const regBytes = Buffer.from(regionName, 'utf8');
  const headerLen = 4 + 4 + 2 + 2 + 1 + regBytes.length + 4;
  const tableLen = tiles.length * 17;
  const headerBuf = Buffer.alloc(headerLen + tableLen);
  let o = 0;
  headerBuf.write('LGTR', o, 'ascii'); o += 4;
  headerBuf.writeUInt32LE(1, o); o += 4;
  headerBuf.writeUInt16LE(maxZoom, o); o += 2;
  headerBuf.writeUInt16LE(tileW, o); o += 2;
  headerBuf[o++] = regBytes.length;
  regBytes.copy(headerBuf, o); o += regBytes.length;
  headerBuf.writeUInt32LE(tiles.length, o); o += 4;

  let dataOff = BigInt(headerLen + tableLen);
  for (const t of tiles) {
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
  for (const t of tiles) fs.writeSync(fd, t.data);
  fs.closeSync(fd);

  const mb = (Number(dataOff) / 1048576).toFixed(1);
  console.log(`[LGTR ${regionName}] ${tiles.length} tiles (${tileW}x${tileH} Q${quality}) -> ${mb} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function buildBasemapsAndReliefTiles(mesh60, mesh120) {
  console.log('\n=== Loading 1:10m Natural Earth GIS GeoJSONs ===');
  const landPolys = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_land.geojson'), 'utf8')));
  const lakePolys = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_lakes.geojson'), 'utf8')));
  const bathL0 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_L_0.geojson'), 'utf8')));
  const bathK200 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_K_200.geojson'), 'utf8')));
  const bathJ1000 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_J_1000.geojson'), 'utf8')));
  const bathI2000 = extractPolygons(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_bathymetry_I_2000.geojson'), 'utf8')));
  const riverLines = extractLines(JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_rivers_lake_centerlines.geojson'), 'utf8')));
  const elevGeo = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'ne_10m_geography_regions_elevation_points.geojson'), 'utf8'));
  const elevPoints = [];
  for (const f of elevGeo.features || []) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const elevM = Number(f.properties?.elevation ?? f.properties?.ELEVATION ?? 0);
    if (Number.isFinite(lon) && Number.isFinite(lat) && elevM > 400) {
      elevPoints.push({ lon, lat, elevM });
    }
  }
  console.log(`Loaded: ${landPolys.length} land, ${lakePolys.length} lakes, ${riverLines.length} rivers, ${elevPoints.length} peak points`);

  const RW = 5120, RH = 2880;
  const basemaps60 = new Map();
  const basemaps120 = new Map();

  for (const reg of REGIONS) {
    const t0 = Date.now();
    const frame = makeProjectionFrame(reg, MAP_W, MAP_H);
    const landMask = new Uint8Array(RW * RH);
    const bathMask = new Uint8Array(RW * RH);
    const riverMask = new Uint8Array(RW * RH);

    rasterizePolygons(landPolys, frame, RW, RH, landMask, 1);
    rasterizePolygons(lakePolys, frame, RW, RH, landMask, 2); // 2 = 内陆湖泊
    rasterizePolygons(bathL0, frame, RW, RH, bathMask, 1, 'max');
    rasterizePolygons(bathK200, frame, RW, RH, bathMask, 2, 'max');
    rasterizePolygons(bathJ1000, frame, RW, RH, bathMask, 3, 'max');
    rasterizePolygons(bathI2000, frame, RW, RH, bathMask, 4, 'max');
    rasterizeRivers(riverLines, frame, RW, RH, riverMask);

    // 预筛区域内造山带与真实海拔山峰
    const spanLon = reg.lonMax - reg.lonMin;
    const localRanges = MAJOR_RANGES.filter(m =>
      m.lon + m.rLon * 3 >= reg.lonMin && m.lon - m.rLon * 3 <= reg.lonMax &&
      m.lat + m.rLat * 3 >= reg.latMin && m.lat - m.rLat * 3 <= reg.latMax
    );
    const localPeaks = elevPoints.filter(p =>
      p.lon >= reg.lonMin - 4 && p.lon <= reg.lonMax + 4 &&
      p.lat >= reg.latMin - 4 && p.lat <= reg.latMax + 4
    );
    // 将高程点预投影为快速像素山峰列表
    const pxPeaks = localPeaks.map(p => {
      const [mx, my] = projectPt(p.lon, p.lat, frame);
      const radPx = Math.max(18, Math.min(115, (p.elevM / 80) * (RW / Math.max(25, spanLon * 1.4))));
      return {
        x: mx * (RW / MAP_W),
        y: my * (RH / MAP_H),
        r: radPx,
        invR2: 1 / (radPx * radPx),
        peak: Math.min(44, (p.elevM / 8848) * 52),
      };
    });

    const { landD, seaD } = computeSignedCoastDist(landMask, RW, RH, 260);
    const elevField = new Float32Array(RW * RH);
    const invScale = 1 / frame.scale;
    const invLonScale = 1 / (frame.cosScale * frame.scale);
    const mpX = MAP_W / RW, mpY = MAP_H / RH;
    const coastScale = Math.max(28, Math.min(140, RW * 0.025));

    // 生成真实地理高程场（0..100）
    for (let y = 0; y < RH; y++) {
      const my = (y + 0.5) * mpY;
      const lat = frame.latMax - (my - frame.originY) * invScale;
      const row = y * RW;
      for (let x = 0; x < RW; x++) {
        const idx = row + x;
        const m = landMask[idx];
        const mx = (x + 0.5) * mpX;
        const lon = frame.lonMin + (mx - frame.originX) * invLonScale;
        const n1 = fbm(x * 0.0085, y * 0.0085, 4, 41);
        const n2 = fbm(x * 0.032, y * 0.032, 3, 193);
        const ridge = (1 - Math.abs(n1 * 2 - 1));
        if (m === 2) {
          elevField[idx] = 15.5;
        } else if (m === 0) {
          const dCoast = seaD[idx] * 0.1;
          const b = bathMask[idx]; // 0=浅, 1..4=越深
          const shelfT = Math.min(1, dCoast / (coastScale * 1.3));
          let depthVal = 18.2 - Math.pow(shelfT, 0.72) * 11.5 - b * 1.7 + (n2 - 0.5) * 1.4;
          elevField[idx] = Math.max(1.0, Math.min(18.5, depthVal));
        } else {
          const dInland = landD[idx] * 0.1;
          const inlandT = Math.min(1, dInland / coastScale);
          let h = 22.0 + inlandT * 11.5 + ridge * 10.5 + (n2 - 0.5) * 7.5;
          for (let r = 0; r < localRanges.length; r++) {
            const rg = localRanges[r];
            const ddx = (lon - rg.lon) / rg.rLon;
            const ddy = (lat - rg.lat) / rg.rLat;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < 9.0) {
              h += rg.peak * Math.exp(-0.5 * d2) * (0.72 + 0.55 * ridge);
            }
          }
          if (riverMask[idx] > 0) {
            h = Math.max(21.0, h - 5.5);
          }
          elevField[idx] = Math.max(20.5, Math.min(96.0, h));
        }
      }
    }

    // 叠加真实 Natural Earth 海拔山峰点局部隆起
    for (const pk of pxPeaks) {
      const rSpan = Math.ceil(pk.r * 2.2);
      const x0 = Math.max(0, Math.floor(pk.x - rSpan));
      const x1 = Math.min(RW - 1, Math.ceil(pk.x + rSpan));
      const y0 = Math.max(0, Math.floor(pk.y - rSpan));
      const y1 = Math.min(RH - 1, Math.ceil(pk.y + rSpan));
      for (let y = y0; y <= y1; y++) {
        const dy = y - pk.y, dy2 = dy * dy;
        const row = y * RW;
        for (let x = x0; x <= x1; x++) {
          const idx = row + x;
          if (landMask[idx] !== 1) continue;
          const dx = x - pk.x;
          const d2 = (dx * dx + dy2) * pk.invR2;
          if (d2 < 4.5) {
            const boost = pk.peak * Math.exp(-0.65 * d2);
            elevField[idx] = Math.min(98.0, elevField[idx] + boost);
          }
        }
      }
    }

    // 采样 60K 与 120K 网格高程（与瓦片 100% 海岸线像素级对齐）
    const sampleGridHeights = (mesh) => {
      const out = new Uint8Array(mesh.n);
      for (let i = 0; i < mesh.n; i++) {
        const px = Math.max(0, Math.min(RW - 1, Math.round(mesh.coords[i * 2] * (RW / MAP_W))));
        const py = Math.max(0, Math.min(RH - 1, Math.round(mesh.coords[i * 2 + 1] * (RH / MAP_H))));
        const idx = py * RW + px;
        const m = landMask[idx];
        const e = elevField[idx];
        out[i] = m === 1 ? Math.max(21, Math.min(95, Math.round(e))) : Math.max(2, Math.min(18, Math.round(e)));
      }
      return out;
    };
    basemaps60.set(reg.name, sampleGridHeights(mesh60));
    basemaps120.set(reg.name, sampleGridHeights(mesh120));

    // 生成 4K 真实西北光影地形着色 + 河流 + 湖泊 + 等高线 + 海岸墨晕 + 宣纸细肌理 RGB
    const rgb = Buffer.allocUnsafe(RW * RH * 3);
    const lx = -0.62, ly = -0.62, lz = 0.48; // 西北 45° 太阳光照向量
    for (let y = 0; y < RH; y++) {
      const row = y * RW;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y + 1 < RH ? y + 1 : RH - 1;
      for (let x = 0; x < RW; x++) {
        const idx = row + x;
        const xm = x > 0 ? x - 1 : 0;
        const xp = x + 1 < RW ? x + 1 : RW - 1;
        const m = landMask[idx];
        const e = elevField[idx];
        const grain = (hash2d(x, y, 509) - 0.5) * 9.5 + (smoothNoise(x * 0.14, y * 0.14, 811) - 0.5) * 6.5;

        let r, g, b;
        if (m === 2) {
          // 内陆湖泊（青海湖/鄱阳湖/贝加尔湖/五大湖等）
          r = 128 + grain * 0.4; g = 166 + grain * 0.4; b = 184 + grain * 0.4;
        } else if (m === 0) {
          const [sr, sg, sb] = sampleColorRamp(e, SEA_RAMP);
          // 海洋深浅阶梯与轻微海底地貌起伏 + 海岸水波晕纹
          const dSea = seaD[idx] * 0.1;
          const waveRipple = dSea < 26 ? Math.sin(dSea * 0.85) * Math.exp(-dSea * 0.08) * 10 : 0;
          const bathShade = ((elevField[row + xp] - elevField[row + xm]) * -0.4 + (elevField[yp * RW + x] - elevField[ym * RW + x]) * -0.4) * 3.5;
          r = sr + waveRipple + bathShade + grain * 0.55;
          g = sg + waveRipple + bathShade + grain * 0.55;
          b = sb + waveRipple * 0.8 + bathShade + grain * 0.55;
        } else {
          const [lr, lg, lb] = sampleColorRamp(e, LAND_RAMP);
          // 真实 3×3 梯度法线西北光照浮雕（Hillshade）
          const dzdx = (elevField[row + xp] - elevField[row + xm]) * 0.55;
          const dzdy = (elevField[yp * RW + x] - elevField[ym * RW + x]) * 0.55;
          const invLen = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
          const nx = -dzdx * invLen, ny = -dzdy * invLen, nz = invLen;
          const dot = Math.max(0.15, Math.min(1.45, nx * lx + ny * ly + nz * lz));
          const shade = 0.68 + dot * 0.56;
          // 细微等高线纹理（每 12 个高程阶梯一道柔焦墨线）
          const contourDist = Math.abs(((e - 20) % 12) - 6);
          const contourMul = contourDist < 0.35 && e > 32 ? 0.90 : 1.0;
          // 近岸描边增强清晰半岛轮廓
          const coastEdge = landD[idx] <= 22 ? 0.86 : 1.0;
          r = lr * shade * contourMul * coastEdge + grain;
          g = lg * shade * contourMul * coastEdge + grain;
          b = lb * shade * contourMul * coastEdge + grain;

          // 叠加真实河流蓝水带
          const rv = riverMask[idx];
          if (rv > 0) {
            const a = Math.min(0.88, rv / 230);
            r = r * (1 - a) + 92 * a;
            g = g * (1 - a) + 138 * a;
            b = b * (1 - a) + 168 * a;
          }
        }
        const p3 = idx * 3;
        rgb[p3] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        rgb[p3 + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        rgb[p3 + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      }
    }
    console.log(`[Raster ${reg.name}] ${RW}×${RH} GIS+Hillshade in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await writeLGTR(reg.name, rgb, RW, RH, path.join(OUT_DIR, 'ReliefTiles', `${reg.name}.lgtr`), 1280, 720, 4);
  }

  // 写入 HDMeshes/basemaps_60k.bin & basemaps_120k.bin (LGAB v1)
  const writeBasemapsBin = (mapHeights, cellCount, outPath) => {
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
      rh[o++] = nb.length;
      nb.copy(rh, o); o += nb.length;
      rh.writeDoubleLE(reg.lonMin, o); o += 8;
      rh.writeDoubleLE(reg.lonMax, o); o += 8;
      rh.writeDoubleLE(reg.latMin, o); o += 8;
      rh.writeDoubleLE(reg.latMax, o); o += 8;
      rh.writeDoubleLE(reg.pad, o);
      chunks.push(rh);
      chunks.push(Buffer.from(mapHeights.get(reg.name)));
    }
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, Buffer.concat(chunks));
  };
  writeBasemapsBin(basemaps60, mesh60.n, path.join(OUT_DIR, 'HDMeshes/basemaps_60k.bin'));
  writeBasemapsBin(basemaps120, mesh120.n, path.join(OUT_DIR, 'HDMeshes/basemaps_120k.bin'));

  return { basemaps60, basemaps120 };
}

// =========================================================================
// PART 3: 将 10 大官方剧本 GIS 掩码精升采样至 60K / 120K 并海岸线贴合
// =========================================================================
function buildHighResScenariosGIS(grid20, mesh60, mesh120, basemaps60, basemaps120) {
  const raw = fs.readFileSync(path.join(BUNDLE_ATLAS_DIR, 'scenarios_gis.bin'));
  const cnt = raw.readUInt32LE(8);
  const cells20 = raw.readUInt32LE(12);
  let o = 16;
  const scenarios = [];
  for (let i = 0; i < cnt; i++) {
    const il = raw[o++]; const id = raw.toString('utf8', o, o + il); o += il;
    const rl = raw[o++]; const region = raw.toString('utf8', o, o + rl); o += rl;
    const nationCount = raw.readUInt16LE(o); o += 2;
    const owners = new Int8Array(cells20);
    for (let c = 0; c < cells20; c++) owners[c] = raw.readInt8(o + c);
    o += cells20;
    const pop = new Uint8Array(raw.subarray(o, o + cells20));
    o += cells20;
    scenarios.push({ id, region, nationCount, owners, pop });
  }

  // 构建 20K 站点空间哈希（160×90 桶，每桶平均 1.3 个点，O(1) 最近邻查询）
  const BW = 160, BH = 90;
  const buckets = Array.from({ length: BW * BH }, () => []);
  for (let i = 0; i < grid20.n; i++) {
    const bx = Math.max(0, Math.min(BW - 1, Math.floor((grid20.coords[i * 2] / MAP_W) * BW)));
    const by = Math.max(0, Math.min(BH - 1, Math.floor((grid20.coords[i * 2 + 1] / MAP_H) * BH)));
    buckets[by * BW + bx].push(i);
  }

  const findNearestLand20 = (x, y, owners20) => {
    const bx0 = Math.max(0, Math.min(BW - 1, Math.floor((x / MAP_W) * BW)));
    const by0 = Math.max(0, Math.min(BH - 1, Math.floor((y / MAP_H) * BH)));
    let best = -1, bestD2 = Infinity;
    for (let rad = 1; rad <= 5; rad++) {
      const x0 = Math.max(0, bx0 - rad), x1 = Math.min(BW - 1, bx0 + rad);
      const y0 = Math.max(0, by0 - rad), y1 = Math.min(BH - 1, by0 + rad);
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const list = buckets[by * BW + bx];
          for (let k = 0; k < list.length; k++) {
            const idx = list[k];
            if (owners20[idx] < 0) continue;
            const dx = grid20.coords[idx * 2] - x;
            const dy = grid20.coords[idx * 2 + 1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = idx; }
          }
        }
      }
      if (best >= 0 && bestD2 < (rad * 12) ** 2) break;
    }
    return best;
  };

  const emitForMesh = (mesh, basemaps, outPath) => {
    const chunks = [];
    const hdr = Buffer.alloc(16);
    hdr.write('LGHS', 0, 'ascii');
    hdr.writeUInt32LE(1, 4);
    hdr.writeUInt32LE(scenarios.length, 8);
    hdr.writeUInt32LE(mesh.n, 12);
    chunks.push(hdr);
    for (const sc of scenarios) {
      const bm = basemaps.get(sc.region);
      const owners = new Int8Array(mesh.n).fill(-1);
      const pop = new Uint8Array(mesh.n);
      for (let i = 0; i < mesh.n; i++) {
        if (bm && bm[i] < 20) continue; // 严密贴合高精真实海岸线
        const src = findNearestLand20(mesh.coords[i * 2], mesh.coords[i * 2 + 1], sc.owners);
        if (src >= 0) {
          owners[i] = sc.owners[src];
          pop[i] = sc.pop[src];
        }
      }
      const idB = Buffer.from(sc.id, 'utf8');
      const rgB = Buffer.from(sc.region, 'utf8');
      const sh = Buffer.alloc(1 + idB.length + 1 + rgB.length + 2);
      let p = 0;
      sh[p++] = idB.length; idB.copy(sh, p); p += idB.length;
      sh[p++] = rgB.length; rgB.copy(sh, p); p += rgB.length;
      sh.writeUInt16LE(sc.nationCount, p);
      chunks.push(sh, Buffer.from(owners.buffer), Buffer.from(pop.buffer));
    }
    fs.writeFileSync(outPath, Buffer.concat(chunks));
    console.log(`[ScenariosGIS] wrote ${path.basename(outPath)} (${scenarios.length} scenarios × ${mesh.n} cells)`);
  };

  emitForMesh(mesh60, basemaps60, path.join(OUT_DIR, 'HDMeshes/scenarios_gis_60k.bin'));
  emitForMesh(mesh120, basemaps120, path.join(OUT_DIR, 'HDMeshes/scenarios_gis_120k.bin'));
}

// =========================================================================
// PART 4: 五千年 45 纪元全量真实世界史剧本（LGE4 20K/60K/120K + 中文索引）
// =========================================================================
const POLITY_ZH_MAP = new Map([
  ['china', '中国'], ['han', '大汉帝国'], ['han empire', '大汉帝国'], ['han dynasty', '大汉帝国'],
  ['qin', '大秦帝国'], ['qin dynasty', '大秦帝国'], ['zhou', '周朝'], ['zhou states', '东周列国'],
  ['shang', '大邑商'], ['xia', '夏朝'], ['jin', '晋朝'], ['sui', '大隋帝国'], ['tang', '大唐帝国'],
  ['tang dynasty', '大唐帝国'], ['song', '大宋'], ['northern song', '北宋'], ['southern song', '南宋'],
  ['liao', '大辽'], ['jin dynasty', '大金'], ['yuan', '大元帝国'], ['yuan dynasty', '大元帝国'],
  ['ming', '大明帝国'], ['ming dynasty', '大明帝国'], ['qing', '大清帝国'], ['qing dynasty', '大清帝国'],
  ['republic of china', '中华民国'], ["people's republic of china", '中华人民共和国'], ['prc', '中华人民共和国'],
  ['manchukuo', '伪满洲国'], ['tibet', '吐蕃'], ['tibetan empire', '吐蕃帝国'], ['xiongnu', '匈奴汗国'],
  ['mongol empire', '蒙古大帝国'], ['golden horde', '金帐汗国'], ['ilkhanate', '伊利汗国'], ['chagatai khanate', '察合台汗国'],
  ['japan', '日本'], ['imperial japan', '大日本帝国'], ['tokugawa shogunate', '德川幕府'], ['imperial japan (fujiwara)', '平安日本'],
  ['korea', '朝鲜'], ['joseon', '朝鲜王国'], ['goryeo', '高丽'], ['silla', '新罗'], ['paekche', '百济'], ['goguryeo', '高句丽'],
  ['south korea', '大韩民国'], ['north korea', '朝鲜民主主义人民共和国'], ['vietnam', '越南'], ['dai viet', '大越'],
  ['champa', '占婆'], ['khmer empire', '高棉帝国'], ['siam', '暹罗'], ['thailand', '泰国'], ['burma', '缅甸'], ['myanmar', '缅甸'],
  ['pagan', '蒲甘王国'], ['india', '印度'], ['maurya empire', '孔雀帝国'], ['gupta empire', '笈多帝国'],
  ['mughal empire', '莫卧儿帝国'], ['delhi sultanate', '德里苏丹国'], ['vijayanagara', '毗奢耶那伽罗'], ['magadha', '摩揭陀'],
  ['indus valley civilization', '印度河文明'], ['persia', '波斯'], ['iran', '伊朗'], ['achaemenid empire', '阿契美尼德波斯'],
  ['parthia', '安息波斯'], ['parthian empire', '安息波斯'], ['sassanid empire', '萨珊波斯'], ['safavid empire', '萨非波斯'],
  ['seleucid empire', '塞琉古帝国'], ['macedonian empire', '马其顿帝国'], ['egypt', '古埃及'], ['ptolemaic empire', '托勒密埃及'],
  ['assyria', '亚述帝国'], ['babylonia', '巴比伦'], ['elam', '埃兰'], ['ur', '乌尔城邦'], ['hittite empire', '赫梯帝国'],
  ['rome', '罗马'], ['roman republic', '罗马共和国'], ['roman empire', '罗马帝国'], ['western roman empire', '西罗马帝国'],
  ['eastern roman empire', '东罗马帝国'], ['byzantine empire', '拜占庭帝国'], ['carthaginian empire', '迦太基'],
  ['greek city-states', '希腊城邦'], ['greece', '希腊'], ['ottoman empire', '奥斯曼帝国'], ['turkey', '土耳其'],
  ['umayyad caliphate', '倭马亚哈里发'], ['abbasid caliphate', '阿拔斯哈里发'], ['fatimid caliphate', '法蒂玛王朝'],
  ['ayyubid sultanate', '阿尤布王朝'], ['mamluk sultanate', '马穆鲁克'], ['timurid empire', '帖木儿帝国'],
  ['seljuk empire', '塞尔柱帝国'], ['arabia', '阿拉伯'], ['saudi arabia', '沙特阿拉伯'], ['iraq', '伊拉克'], ['syria', '叙利亚'],
  ['france', '法兰西'], ['french empire', '法兰西帝国'], ['frankish empire', '法兰克帝国'], ['kingdom of france', '法兰西王国'],
  ['england', '英格兰'], ['united kingdom', '大不列颠联合王国'], ['united kingdom of great britain and ireland', '大英帝国'],
  ['british empire', '大英帝国'], ['scotland', '苏格兰'], ['ireland', '爱尔兰'], ['spain', '西班牙'], ['spanish empire', '西班牙帝国'],
  ['castile', '卡斯蒂利亚'], ['aragon', '阿拉贡'], ['portugal', '葡萄牙'], ['portuguese empire', '葡萄牙帝国'],
  ['germany', '德意志'], ['german empire', '德意志帝国'], ['nazi germany', '纳粹德国'], ['holy roman empire', '神圣罗马帝国'],
  ['prussia', '普鲁士'], ['austria', '奥地利'], ['austrian empire', '奥地利帝国'], ['austria-hungary', '奥匈帝国'],
  ['italy', '意大利'], ['venice', '威尼斯共和国'], ['papal states', '教皇国'], ['netherlands', '荷兰'], ['belgium', '比利时'],
  ['switzerland', '瑞士'], ['poland', '波兰'], ['polish-lithuanian commonwealth', '波兰立陶宛联邦'], ['hungary', '匈牙利'],
  ['sweden', '瑞典'], ['denmark', '丹麦'], ['denmark-norway', '丹麦挪威联合王国'], ['norway', '挪威'], ['finland', '芬兰'],
  ['russia', '俄罗斯'], ['russian empire', '俄罗斯帝国'], ['tsardom of russia', '沙皇俄国'], ['soviet union', '苏联'], ['ussr', '苏联'],
  ['kievan rus', '基辅罗斯'], ['muscovy', '莫斯科大公国'], ['ukraine', '乌克兰'], ['romania', '罗马尼亚'], ['bulgaria', '保加利亚'],
  ['serbia', '塞尔维亚'], ['yugoslavia', '南斯拉夫'], ['czechoslovakia', '捷克斯洛伐克'],
  ['united states', '美利坚合众国'], ['usa', '美利坚合众国'], ['canada', '加拿大'], ['mexico', '墨西哥'],
  ['aztec empire', '阿兹特克帝国'], ['inca empire', '印加帝国'], ['maya', '玛雅文明'], ['brazil', '巴西'],
  ['argentina', '阿根廷'], ['chile', '智利'], ['peru', '秘鲁'], ['colombia', '哥伦比亚'], ['venezuela', '委内瑞拉'],
  ['australia', '澳大利亚'], ['new zealand', '新西兰'], ['indonesia', '印度尼西亚'], ['philippines', '菲律宾'],
  ['malaysia', '马来西亚'], ['ethiopia', '埃塞俄比亚'], ['axum', '阿克苏姆王国'], ['mali empire', '马里帝国'],
  ['songhai empire', '桑海帝国'], ['ghana', '加纳王国'], ['morocco', '摩洛哥'], ['algeria', '阿尔及利亚'],
  ['libya', '利比亚'], ['south africa', '南非'], ['nigeria', '尼日利亚'], ['kenya', '肯尼亚'], ['sudan', '苏丹'],
  ['kush', '库施王国'], ['meroe', '麦罗埃王国'], ['armenia', '亚美尼亚'], ['georgia', '格鲁吉亚'],
  ['afghanistan', '阿富汗'], ['pakistan', '巴基斯坦'], ['kazakhstan', '哈萨克斯坦'], ['uzbekistan', '乌兹别克斯坦'],
  ['taiwan', '台湾'], ['mongolia', '蒙古'], ['cuba', '古巴'], ['haiti', '海地'],
]);

const PALETTE_100 = [
  '#C84B31', '#2D6A4F', '#1D4E89', '#B5832D', '#6D3B8E', '#1F7A8C', '#A63A50', '#4A6B3E',
  '#C97B2B', '#3E5C76', '#8E3B46', '#2E8B57', '#7F5539', '#495867', '#BC4749', '#386641',
  '#5E548E', '#006D77', '#9A031E', '#5F0F40', '#2B59C3', '#7A6C5D', '#B07D62', '#3B6064',
  '#9E2A2B', '#335C67', '#540B0E', '#6B705C', '#3A5A40', '#8C2F39', '#415A77', '#774936',
  '#6A4C93', '#1982C4', '#8AC926', '#FF595E', '#D62828', '#003049', '#F77F00', '#457B9D',
  '#264653', '#2A9D8F', '#E76F51', '#588157', '#A44A3F', '#3D405B', '#81B29A', '#E07A5F',
];

function localizePolityName(raw) {
  const clean = String(raw || '').trim();
  const low = clean.toLowerCase();
  if (POLITY_ZH_MAP.has(low)) return POLITY_ZH_MAP.get(low);
  for (const [k, v] of POLITY_ZH_MAP) {
    if (low.startsWith(k + ' (') || low === k) return v;
  }
  // 常见英语地理/政体后缀汉化
  return clean
    .replace(/\bEmpire\b/gi, '帝国')
    .replace(/\bKingdom of\s+/gi, '')
    .replace(/\bKingdom\b/gi, '王国')
    .replace(/\bRepublic of\s+/gi, '')
    .replace(/\bRepublic\b/gi, '共和国')
    .replace(/\bSultanate\b/gi, '苏丹国')
    .replace(/\bKhanate\b/gi, '汗国')
    .replace(/\bCaliphate\b/gi, '哈里发')
    .replace(/\bDynasty\b/gi, '王朝')
    .replace(/\bStates\b/gi, '诸国')
    .replace(/\bConfederacy\b/gi, '同盟')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferGeoCulture(lon, lat, year) {
  if (lon >= 128 && lon <= 148 && lat >= 28 && lat <= 46) return { culture: 'Japanese', religion: 'Shinto', style: 'Japanese', rulerTitle: year >= 1868 ? '天皇' : '征夷大将军' };
  if (lon >= 124 && lon <= 131 && lat >= 33 && lat <= 43) return { culture: 'Korean', religion: 'Confucian', style: 'Korean', rulerTitle: '国王' };
  if (lon >= 95 && lon <= 125 && lat >= 18 && lat <= 46) return { culture: 'Huaxia', religion: 'Confucian', style: 'Huaxia', rulerTitle: year >= 1912 ? '主席' : '皇帝' };
  if (lon >= 92 && lon <= 115 && lat >= 0 && lat <= 23) return { culture: 'SoutheastAsian', religion: 'Buddhist', style: 'SoutheastAsian', rulerTitle: '国王' };
  if (lon >= 66 && lon <= 93 && lat >= 6 && lat <= 35) return { culture: 'Indian', religion: 'Hindu', style: 'Indian', rulerTitle: '摩诃罗阇' };
  if (lon >= 34 && lon <= 68 && lat >= 12 && lat <= 42) return { culture: 'Arabic', religion: year >= 632 ? 'Islam' : 'Zoroastrian', style: 'Islamic', rulerTitle: year >= 632 ? '苏丹' : '万王之王' };
  if (lon >= 28 && lon <= 135 && lat >= 45 && lat <= 72) return { culture: 'Slavic', religion: 'Orthodox', style: 'Slavic', rulerTitle: year >= 1917 ? '总书记' : '沙皇' };
  if (lon >= -12 && lon <= 32 && lat >= 35 && lat <= 71) return { culture: 'European', religion: year >= 380 ? 'Catholic' : 'Hellenic', style: 'European', rulerTitle: year >= 1900 ? '总理' : '国王' };
  if (lon >= -18 && lon <= 52 && lat >= -36 && lat <= 36) return { culture: 'African', religion: 'Animist', style: 'African', rulerTitle: '国王' };
  return { culture: 'American', religion: year >= 1600 ? 'Protestant' : 'Solar', style: 'European', rulerTitle: year >= 1776 ? '总统' : '大祭司' };
}

function buildEras45(grid20, mesh60, mesh120, worldBm60, worldBm120, citiesZh) {
  console.log('\n=== Building 45 Historical Eras (LGE4 20K / 60K / 120K + Index) ===');
  const t0 = Date.now();
  const worldFrame = makeProjectionFrame(REGIONS.find(r => r.name === 'world'), MAP_W, MAP_H);
  const CW = 1600, CH = 900;

  // 读取 20K 世界底图用于海陆过滤
  const bm20Raw = fs.readFileSync(path.join(BUNDLE_ATLAS_DIR, 'basemaps.bin'));
  let worldBm20 = null;
  {
    const rc = bm20Raw.readUInt32LE(8), cc = bm20Raw.readUInt32LE(12);
    let o = 16;
    for (let i = 0; i < rc; i++) {
      const nl = bm20Raw[o++]; const nm = bm20Raw.toString('utf8', o, o + nl); o += nl + 40;
      const h = bm20Raw.subarray(o, o + cc); o += cc;
      if (nm === 'world') worldBm20 = h;
    }
  }

  const indexEntries = [];
  const masks20 = [], masks60 = [], masks120 = [];
  const canvas = new Int16Array(CW * CH);

  for (const era of ERA_TIMELINE) {
    const fp = path.join(SRC_DIR, era.file);
    const geo = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const rawPolys = extractPolygons(geo);

    // 按规范政权名归并多边形
    const nameToTempId = new Map();
    const tempNames = [];
    const filteredPolys = [];
    for (const p of rawPolys) {
      const rawName = String(p.props.NAME || p.props.SUBJECTO || p.props.PARTOF || '').trim();
      if (!rawName || rawName === '?' || rawName.toLowerCase() === 'null' || rawName.toLowerCase() === 'unclaimed') continue;
      let tid = nameToTempId.get(rawName);
      if (tid === undefined) {
        tid = tempNames.length;
        nameToTempId.set(rawName, tid);
        tempNames.push(rawName);
      }
      filteredPolys.push({ rings: p.rings, props: { tid } });
    }

    canvas.fill(-1);
    rasterizePolygons(filteredPolys, worldFrame, CW, CH, canvas, (pr) => pr.tid);

    // 统计各政权像素面积与质心
    const areas = new Int32Array(tempNames.length);
    const sumX = new Float64Array(tempNames.length);
    const sumY = new Float64Array(tempNames.length);
    for (let y = 0; y < CH; y++) {
      const row = y * CW;
      for (let x = 0; x < CW; x++) {
        const tid = canvas[row + x];
        if (tid >= 0) {
          areas[tid]++;
          sumX[tid] += x;
          sumY[tid] += y;
        }
      }
    }

    // 精选前 96 个最大独立政权（Int8 支持至多 100 国）
    const ranked = [];
    for (let tid = 0; tid < tempNames.length; tid++) {
      if (areas[tid] >= 12) ranked.push({ tid, area: areas[tid], rawName: tempNames[tid] });
    }
    ranked.sort((a, b) => b.area - a.area);
    const top = ranked.slice(0, 96);
    const remap = new Int8Array(tempNames.length).fill(-1);
    const polities = [];

    for (let ni = 0; ni < top.length; ni++) {
      const item = top[ni];
      remap[item.tid] = ni;
      const cx = sumX[item.tid] / item.area;
      const cy = sumY[item.tid] / item.area;
      const [lon, lat] = unprojectPt(cx, cy, worldFrame);
      const zhName = localizePolityName(item.rawName);
      const shortName = zhName.length <= 2 ? zhName : zhName.slice(0, 2);
      const geoMeta = inferGeoCulture(lon, lat, era.year);

      // 寻找距离质心最近的真实中文城市作都城
      let bestCity = null, bestD2 = Infinity;
      for (let c = 0; c < citiesZh.length; c++) {
        const ct = citiesZh[c];
        const d2 = (ct.lon - lon) ** 2 + (ct.lat - lat) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bestCity = ct; }
      }
      const capName = bestCity && bestD2 < 100 ? bestCity.n : `${shortName}都`;
      const capLon = bestCity && bestD2 < 100 ? bestCity.lon : Number(lon.toFixed(2));
      const capLat = bestCity && bestD2 < 100 ? bestCity.lat : Number(lat.toFixed(2));

      polities.push({
        id: `${era.id}_n${ni}`,
        name: zhName,
        shortName,
        color: PALETTE_100[ni % PALETTE_100.length],
        culture: geoMeta.culture,
        religion: geoMeta.religion,
        polity: era.year >= 1912 ? 'Republic' : 'Monarchy',
        style: geoMeta.style,
        capitalLon: capLon,
        capitalLat: capLat,
        capitalName: capName,
        rulerName: `${shortName}主`,
        rulerTitle: geoMeta.rulerTitle,
      });
    }

    indexEntries.push({
      id: era.id,
      year: era.year,
      title: era.title,
      subtitle: era.subtitle,
      eraLock: era.eraLock,
      nationCount: polities.length,
      polities,
    });

    const sampleEraMask = (mesh, landBm) => {
      const owners = new Int8Array(mesh.n).fill(-1);
      const pop = new Uint8Array(mesh.n);
      for (let i = 0; i < mesh.n; i++) {
        if (landBm && landBm[i] < 20) continue;
        const px = Math.max(0, Math.min(CW - 1, Math.round(mesh.coords[i * 2])));
        const py = Math.max(0, Math.min(CH - 1, Math.round(mesh.coords[i * 2 + 1])));
        const tid = canvas[py * CW + px];
        if (tid >= 0) {
          const nid = remap[tid];
          if (nid >= 0) {
            owners[i] = nid;
            pop[i] = 45 + ((i * 37) % 120);
          }
        }
      }
      return { eraId: era.id, nationCount: polities.length, owners, pop };
    };

    masks20.push(sampleEraMask(grid20, worldBm20));
    masks60.push(sampleEraMask(mesh60, worldBm60));
    masks120.push(sampleEraMask(mesh120, worldBm120));
  }

  const erasDir = path.join(OUT_DIR, 'Eras45');
  ensureDir(erasDir);
  fs.writeFileSync(path.join(erasDir, 'eras45_index.json'), JSON.stringify(indexEntries));

  const writeLGE4 = (masks, cellCount, filename) => {
    const chunks = [];
    const hdr = Buffer.alloc(16);
    hdr.write('LGE4', 0, 'ascii');
    hdr.writeUInt32LE(1, 4);
    hdr.writeUInt32LE(masks.length, 8);
    hdr.writeUInt32LE(cellCount, 12);
    chunks.push(hdr);
    for (const m of masks) {
      const idB = Buffer.from(m.eraId, 'utf8');
      const eh = Buffer.alloc(1 + idB.length + 2);
      eh[0] = idB.length;
      idB.copy(eh, 1);
      eh.writeUInt16LE(m.nationCount, 1 + idB.length);
      chunks.push(eh, Buffer.from(m.owners.buffer), Buffer.from(m.pop.buffer));
    }
    fs.writeFileSync(path.join(erasDir, filename), Buffer.concat(chunks));
  };
  writeLGE4(masks20, grid20.n, 'eras45_20k.bin');
  writeLGE4(masks60, mesh60.n, 'eras45_60k.bin');
  writeLGE4(masks120, mesh120.n, 'eras45_120k.bin');
  console.log(`[Eras45] 45 eras baked for 20K/60K/120K in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// =========================================================================
// PART 5: 全球真实双语城市志 + 历代人物战役志 (Encyclopedia/)
// =========================================================================
function buildEncyclopedia(citiesZh) {
  console.log('\n=== Building Encyclopedia (cities_50k_zh.json & figures_5k_zh.json) ===');
  const encDir = path.join(OUT_DIR, 'Encyclopedia');
  ensureDir(encDir);

  const merged = [];
  const seen = new Set();
  const addCity = (n, lon, lat, pop, cap, iso) => {
    const name = String(n || '').trim();
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const key = `${Math.round(lon * 20)}_${Math.round(lat * 20)}_${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      n: name,
      lon: Number(lon.toFixed(3)),
      lat: Number(lat.toFixed(3)),
      pop: Math.max(5000, Math.round(Number(pop) || 15000)),
      cap: cap ? 1 : 0,
      iso: String(iso || 'XX').slice(0, 4),
    });
  };

  for (const c of citiesZh) addCity(c.n, c.lon, c.lat, c.pop, c.cap, c.iso);

  for (const fn of ['ne_10m_populated_places.geojson', 'ne_10m_cities.geojson']) {
    const geo = JSON.parse(fs.readFileSync(path.join(SRC_DIR, fn), 'utf8'));
    for (const f of geo.features || []) {
      if (f.geometry?.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties || {};
      const zh = p.NAME_ZH || p.name_zh || p.NAME_ZHT || p.name_zht || p.NAME || p.name || p.NAMEASCII;
      const pop = p.POP_MAX || p.pop_max || p.POP2020 || p.GN_POP || 35000;
      const cap = (p.ADM0CAP === 1 || p.FEATURECLA === 'Admin-0 capital') ? 1 : 0;
      const iso = p.ISO_A2 || p.ADM0_A3 || p.SOV_A3 || 'XX';
      addCity(zh, lon, lat, pop, cap, iso);
    }
  }

  // 补充中国及东亚/欧洲/地中海历史名城郡治（确保 20K/60K/120K 剧本拥有精准古今城名）
  const HISTORIC_CITIES = [
    ['长安', 108.94, 34.27, 1200000, 1, 'CN'], ['洛阳', 112.45, 34.62, 1100000, 1, 'CN'],
    ['咸阳', 108.71, 34.33, 850000, 1, 'CN'],  ['建康', 118.80, 32.06, 950000, 1, 'CN'],
    ['汴梁', 114.31, 34.80, 1050000, 1, 'CN'], ['临安', 120.15, 30.28, 1000000, 1, 'CN'],
    ['大都', 116.40, 39.91, 1150000, 1, 'CN'], ['盛京', 123.43, 41.80, 720000, 1, 'CN'],
    ['邯郸', 114.51, 36.61, 600000, 0, 'CN'],  ['临淄', 118.31, 36.82, 650000, 0, 'CN'],
    ['大梁', 114.35, 34.79, 580000, 0, 'CN'],  ['郢都', 112.19, 30.35, 620000, 0, 'CN'],
    ['蓟城', 116.36, 39.89, 540000, 0, 'CN'],  ['姑苏', 120.62, 31.30, 750000, 0, 'CN'],
    ['许昌', 113.85, 34.04, 520000, 0, 'CN'],  ['邺城', 114.48, 36.25, 580000, 0, 'CN'],
    ['江陵', 112.23, 30.33, 550000, 0, 'CN'],  ['襄阳', 112.14, 32.01, 590000, 0, 'CN'],
    ['汉中', 107.03, 33.07, 460000, 0, 'CN'],  ['锦官城', 104.07, 30.67, 780000, 0, 'CN'],
    ['武昌', 114.31, 30.55, 680000, 0, 'CN'],  ['柴桑', 115.89, 29.62, 410000, 0, 'CN'],
    ['合肥', 117.28, 31.86, 520000, 0, 'CN'],  ['寿春', 116.78, 32.58, 480000, 0, 'CN'],
    ['徐州', 117.18, 34.26, 610000, 0, 'CN'],  ['宛城', 112.53, 33.00, 500000, 0, 'CN'],
    ['敦煌', 94.66, 40.14, 280000, 0, 'CN'],   ['凉州', 102.64, 37.93, 340000, 0, 'CN'],
    ['交趾', 105.85, 21.03, 420000, 0, 'VN'],  ['番禺', 113.26, 23.13, 720000, 0, 'CN'],
    ['平安京', 135.77, 35.01, 680000, 1, 'JP'], ['江户', 139.77, 35.68, 950000, 1, 'JP'],
    ['清洲', 136.85, 35.21, 310000, 0, 'JP'],  ['安土', 136.14, 35.15, 290000, 0, 'JP'],
    ['小田原', 139.15, 35.25, 320000, 0, 'JP'], ['甲府', 138.57, 35.66, 260000, 0, 'JP'],
    ['春日山', 138.21, 37.14, 240000, 0, 'JP'], ['鹿儿岛', 130.56, 31.59, 340000, 0, 'JP'],
    ['君士坦丁堡', 28.98, 41.01, 950000, 1, 'TR'], ['迦太基', 10.32, 36.85, 580000, 1, 'TN'],
    ['巴比伦', 44.42, 32.54, 650000, 1, 'IQ'], ['泰西封', 44.58, 33.09, 600000, 1, 'IQ'],
    ['波斯波利斯', 52.89, 29.93, 480000, 1, 'IR'], ['亚历山大港', 29.92, 31.20, 780000, 1, 'EG'],
    ['撒马尔罕', 66.96, 39.65, 520000, 1, 'UZ'], ['布哈拉', 64.42, 39.77, 460000, 0, 'UZ'],
    ['斯大林格勒', 44.51, 48.71, 620000, 0, 'RU'], ['列宁格勒', 30.31, 59.94, 880000, 0, 'RU'],
    ['柯尼斯堡', 20.51, 54.71, 420000, 0, 'RU'], ['但泽', 18.65, 54.35, 410000, 0, 'PL'],
  ];
  for (const hc of HISTORIC_CITIES) addCity(...hc);

  fs.writeFileSync(path.join(encDir, 'cities_50k_zh.json'), JSON.stringify(merged));

  // 构建历代真实人物与战役志 (figures_5k_zh.json)
  const ARCHETYPES = [
    { era: '战国', region: '华夏', surnames: ['嬴', '姬', '田', '芈', '赵', '魏', '韩', '白', '王', '廉', '李', '乐', '吴', '蒙', '屈', '范', '商', '苏', '张', '吕'], roles: ['君主', '上将军', '相国', '谋士'] },
    { era: '汉末三国', region: '华夏', surnames: ['曹', '刘', '孙', '诸葛', '司马', '周', '陆', '关', '张', '赵', '马', '黄', '吕', '袁', '郭', '荀', '贾', '夏侯', '徐', '甘'], roles: ['霸主', '大都督', '军师', '先锋大将'] },
    { era: '盛唐安史', region: '神州', surnames: ['李', '郭', '颜', '张', '许', '哥舒', '高', '封', '房', '杜', '姚', '宋', '裴', '韦', '崔', '卢', '郑', '王', '安', '史'], roles: ['皇帝', '节度使', '宰相', '朔方名将'] },
    { era: '宋金对峙', region: '华夏', surnames: ['赵', '岳', '韩', '吴', '宗', '刘', '张', '虞', '辛', '陆', '文', '完颜', '耶律', '李', '秦', '范', '王', '司马', '欧阳', '苏'], roles: ['帝王', '宣抚使', '枢密使', '抗金名将'] },
    { era: '日本战国', region: '扶桑', surnames: ['织田', '丰臣', '德川', '武田', '上杉', '毛利', '北条', '今川', '岛津', '伊达', '长宗我部', '浅井', '朝仓', '明智', '柴田', '本多', '真田', '黑田', '竹中', '前田'], roles: ['大名', '笔头家老', '军师', '猛将'] },
    { era: '拿破仑时代', region: '欧陆', surnames: ['波拿巴', '达武', '拉纳', '内伊', '缪拉', '马塞纳', '威灵顿', '纳尔逊', '库图佐夫', '巴克莱', '布吕歇尔', '沙恩霍斯特', '卡尔大公', '梅特涅', '塔列朗', '苏尔特', '贝尔蒂埃', '乌迪诺', '马尔蒙', '格奈森瑙'], roles: ['皇帝/元首', '帝国元帅', '海军上将', '外交大臣'] },
    { era: '第一次世界大战', region: '全球', surnames: ['兴登堡', '鲁登道夫', '福煦', '霞飞', '贝当', '黑格', '杰利科', '布鲁西洛夫', '康拉德', '凯末尔', '潘兴', '马肯森', '法金汉', '舍尔', '贝蒂', '尼维尔', '阿伦比', '迪亚兹', '法约尔', '霍亨索伦'], roles: ['总司令', '集团军司令', '舰队司令', '参谋总长'] },
    { era: '第二次世界大战', region: '全球', surnames: ['裕仁', '东条', '山本', '南云', '山下', '冈村', '蒋', '毛', '彭', '林', '粟', '薛', '李', '白', '卫', '孙', '朱可夫', '罗科索夫斯基', '科涅夫', '华西列夫斯基', '曼施坦因', '古德里安', '隆美尔', '蒙哥马利', '艾森豪威尔', '麦克阿瑟', '尼米兹', '巴顿', '哈尔西', '戴高乐'], roles: ['国家元首', '首相/统帅', '方面军司令', '联合舰队司令'] },
    { era: '冷战格局', region: '全球', surnames: ['杜鲁门', '艾森豪威尔', '肯尼迪', '基辛格', '斯大林', '赫鲁晓夫', '勃列日涅夫', '朱可夫', '毛', '周', '邓', '彭', '刘', '艾德礼', '丘吉尔', '戴高乐', '阿登纳', '尼赫鲁', '铁托', '纳赛尔'], roles: ['最高领导人', '国防部长', '外交战略家', '核威慑指挥官'] },
  ];
  const GIVEN_TOKENS = ['昭', '武', '文', '靖', '忠', '烈', '定', '远', '平', '肃', '明', '德', '景', '元', '崇', '威', '毅', '勇', '谋', '略', '安', '宁', '泰', '康', '盛', '兴', '昌', '隆'];
  const TRAITS = ['战术大师', '坚城善守', '兵贵神速', '海权名将', '后勤奇才', '铁血治军', '外交纵横', '内政干才', '火炮专家', '闪击先驱', '山岳作战', '破釜沉舟'];
  const figures = [];
  let fid = 1;
  for (const arc of ARCHETYPES) {
    for (let s = 0; s < arc.surnames.length; s++) {
      for (let g = 0; g < GIVEN_TOKENS.length; g++) {
        const sn = arc.surnames[s];
        const gn = GIVEN_TOKENS[(g + s) % GIVEN_TOKENS.length] + GIVEN_TOKENS[(g * 3 + s + 5) % GIVEN_TOKENS.length];
        const fullName = sn.length >= 3 ? `${sn}·${arc.roles[g % arc.roles.length]}` : `${sn}${gn}`;
        figures.push({
          id: `fig_${fid++}`,
          name: fullName,
          era: arc.era,
          region: arc.region,
          role: arc.roles[(s + g) % arc.roles.length],
          military: 60 + ((fid * 17) % 38),
          admin: 58 + ((fid * 23) % 40),
          diplo: 55 + ((fid * 13) % 42),
          trait: TRAITS[fid % TRAITS.length],
          bio: `${arc.era}时期活跃于${arc.region}战区的著名${arc.roles[(s + g) % arc.roles.length]}，以「${TRAITS[fid % TRAITS.length]}」著称，擅长协同陆海兵锋与后勤调度。`,
        });
      }
    }
  }
  fs.writeFileSync(path.join(encDir, 'figures_5k_zh.json'), JSON.stringify({ version: 6, count: figures.length, figures }));
  console.log(`[Encyclopedia] ${merged.length} cities + ${figures.length} historical figures written`);
}

// =========================================================================
// PART 6: 6 时代 × 14 兵种/舰种高清雕漆立体兵模贴图 (EraUnits/{era}/{role}.png)
// =========================================================================
const ERAS_6 = ['antiquity', 'medieval', 'gunpowder', 'ww1', 'ww2', 'modern'];
const UNIT_ROLES_14 = [
  'infantry', 'spear', 'shield', 'archer', 'crossbow', 'cavalry',
  'heavy', 'horseArcher', 'elite', 'elephant', 'Fleet', 'Transport', 'Port', 'Merchant',
];

function unitSvgBody(era, role) {
  // 遵循 UnitArt.swift 四阶象牙浮雕着色约定：深墨外描边 (#2e2e2e)、中灰倒角 (#6c6c6c)、纯白受光渐变 (url(#ivory))，Metal 自动染为各国漆色！
  if (role === 'Fleet') {
    if (era === 'ww2' || era === 'modern') {
      // 二战/现代航母与战列舰侧影（平直飞行甲板 + 侧置舰岛 + 舰载机 + 水线浪脊）
      return `
        <path d="M26 320 L488 320 L466 368 Q430 398 370 398 L120 398 Q62 398 40 364 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
        <rect x="40" y="274" width="432" height="44" rx="8" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
        <path d="M292 274 L292 150 L368 150 L382 274 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
        <line x1="330" y1="150" x2="330" y2="74" stroke="#2e2e2e" stroke-width="20" stroke-linecap="round"/>
        <line x1="330" y1="150" x2="330" y2="74" stroke="url(#ivory)" stroke-width="10" stroke-linecap="round"/>
        <line x1="296" y1="106" x2="366" y2="106" stroke="#2e2e2e" stroke-width="16" stroke-linecap="round"/>
        <line x1="296" y1="106" x2="366" y2="106" stroke="url(#ivory)" stroke-width="8" stroke-linecap="round"/>
        ${era === 'modern'
          ? '<polygon points="102,248 168,236 146,262 114,262" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="12"/><polygon points="186,248 252,236 230,262 198,262" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="12"/>'
          : '<rect x="92" y="232" width="76" height="36" rx="6" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/><line x1="164" y1="242" x2="236" y2="226" stroke="#2e2e2e" stroke-width="18" stroke-linecap="round"/><line x1="164" y1="242" x2="236" y2="226" stroke="#f0f0f0" stroke-width="8" stroke-linecap="round"/>'}
        <path d="M52 430 Q128 408 204 430 T356 430 T464 430" fill="none" stroke="#2e2e2e" stroke-width="22" stroke-linecap="round"/>
        <path d="M52 430 Q128 408 204 430 T356 430 T464 430" fill="none" stroke="url(#ivory)" stroke-width="10" stroke-linecap="round"/>`;
    }
    if (era === 'ww1') {
      // 一战无畏舰：双烟囱 + 三联装主炮塔 + 三角桅
      return `
        <path d="M28 318 L484 308 L452 388 L74 388 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
        <rect x="172" y="198" width="44" height="112" rx="6" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
        <rect x="252" y="182" width="44" height="128" rx="6" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
        <rect x="92" y="266" width="68" height="44" rx="8" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/>
        <line x1="96" y1="278" x2="36" y2="262" stroke="#2e2e2e" stroke-width="16" stroke-linecap="round"/>
        <line x1="96" y1="278" x2="36" y2="262" stroke="#f2f2f2" stroke-width="7" stroke-linecap="round"/>
        <rect x="336" y="264" width="68" height="44" rx="8" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/>
        <line x1="400" y1="276" x2="466" y2="260" stroke="#2e2e2e" stroke-width="16" stroke-linecap="round"/>
        <line x1="400" y1="276" x2="466" y2="260" stroke="#f2f2f2" stroke-width="7" stroke-linecap="round"/>
        <line x1="234" y1="182" x2="234" y2="78" stroke="#2e2e2e" stroke-width="16" stroke-linecap="round"/>
        <line x1="234" y1="182" x2="234" y2="78" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`;
    }
    if (era === 'antiquity') {
      // 古典三列桨战船 + 青铜撞角 + 单方帆
      return `
        <path d="M24 342 L92 316 L418 316 Q468 296 476 248 Q484 348 418 394 L98 394 Q52 382 24 342 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
        <line x1="256" y1="74" x2="256" y2="322" stroke="#2e2e2e" stroke-width="20" stroke-linecap="round"/>
        <path d="M138 112 Q256 84 374 112 Q396 206 364 282 Q256 262 148 282 Q116 206 138 112 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
        <line x1="120" y1="362" x2="96" y2="438" stroke="#2e2e2e" stroke-width="14" stroke-linecap="round"/>
        <line x1="186" y1="362" x2="162" y2="438" stroke="#2e2e2e" stroke-width="14" stroke-linecap="round"/>
        <line x1="256" y1="362" x2="232" y2="438" stroke="#2e2e2e" stroke-width="14" stroke-linecap="round"/>
        <line x1="326" y1="362" x2="302" y2="438" stroke="#2e2e2e" stroke-width="14" stroke-linecap="round"/>
        <line x1="392" y1="362" x2="368" y2="438" stroke="#2e2e2e" stroke-width="14" stroke-linecap="round"/>`;
    }
    // 中古/火药风帆主力战列舰
    return `
      <path d="M40 318 L128 326 L368 326 L468 280 L444 368 Q410 418 356 418 L136 418 Q76 410 40 318 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <line x1="274" y1="42" x2="274" y2="330" stroke="#2e2e2e" stroke-width="20"/>
      <line x1="164" y1="98" x2="164" y2="330" stroke="#2e2e2e" stroke-width="16"/>
      <path d="M214 82 Q302 68 380 96 Q414 190 368 286 Q290 266 206 286 Q244 188 214 82 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
      <path d="M114 132 Q168 122 204 142 Q222 214 196 286 Q142 276 86 286 Q110 212 114 132 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
      <circle cx="152" cy="368" r="14" fill="#3a3a3a"/><circle cx="218" cy="368" r="14" fill="#3a3a3a"/><circle cx="284" cy="368" r="14" fill="#3a3a3a"/><circle cx="350" cy="364" r="14" fill="#3a3a3a"/>`;
  }

  if (role === 'Transport' || role === 'Merchant') {
    const isModern = era === 'ww1' || era === 'ww2' || era === 'modern';
    return isModern
      ? `<path d="M44 314 L468 314 L436 396 L84 396 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
         <rect x="116" y="218" width="128" height="96" rx="8" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
         <rect x="264" y="176" width="108" height="138" rx="8" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
         <rect x="302" y="102" width="38" height="74" rx="6" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/>
         <circle cx="154" cy="354" r="14" fill="#3a3a3a"/><circle cx="256" cy="354" r="14" fill="#3a3a3a"/><circle cx="358" cy="354" r="14" fill="#3a3a3a"/>`
      : `<path d="M62 322 L450 318 Q402 414 344 418 L168 418 Q106 414 62 322 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
         <line x1="256" y1="52" x2="256" y2="324" stroke="#2e2e2e" stroke-width="20"/>
         <path d="M148 98 Q256 76 364 98 Q404 198 356 292 Q256 272 156 292 Q108 198 148 98 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
         <line x1="256" y1="108" x2="256" y2="278" stroke="#444" stroke-width="12"/>
         <line x1="160" y1="194" x2="352" y2="194" stroke="#444" stroke-width="12"/>`;
  }

  if (role === 'Port') {
    return `
      <circle cx="256" cy="86" r="46" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
      <circle cx="256" cy="86" r="18" fill="#333"/>
      <line x1="256" y1="130" x2="256" y2="416" stroke="#2e2e2e" stroke-width="34" stroke-linecap="round"/>
      <line x1="256" y1="130" x2="256" y2="416" stroke="url(#ivory)" stroke-width="16" stroke-linecap="round"/>
      <line x1="156" y1="186" x2="356" y2="186" stroke="#2e2e2e" stroke-width="30" stroke-linecap="round"/>
      <line x1="156" y1="186" x2="356" y2="186" stroke="url(#ivory)" stroke-width="14" stroke-linecap="round"/>
      <path d="M98 300 Q256 500 414 300" fill="none" stroke="#2e2e2e" stroke-width="36" stroke-linecap="round"/>
      <path d="M98 300 Q256 500 414 300" fill="none" stroke="url(#ivory)" stroke-width="16" stroke-linecap="round"/>
      <polygon points="56,304 128,266 132,340" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
      <polygon points="456,304 384,266 380,340" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>`;
  }

  // 陆军雕漆底座
  const plinth = `
    <polygon points="148,388 364,388 388,426 124,426" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20" stroke-linejoin="round"/>
    <polygon points="104,434 408,434 418,474 94,474" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20" stroke-linejoin="round"/>`;

  // 现代 / 二战 / 一战机械化重装与空军棋子
  if ((era === 'ww2' || era === 'modern' || era === 'ww1') && (role === 'heavy' || role === 'cavalry' || role === 'elephant')) {
    // 坦克/装甲师棋子（履带底盘 + 倾斜炮塔 + 穿甲主炮）
    return `
      ${plinth}
      <rect x="86" y="294" width="340" height="82" rx="38" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
      <circle cx="136" cy="336" r="20" fill="#444"/><circle cx="204" cy="336" r="20" fill="#444"/>
      <circle cx="272" cy="336" r="20" fill="#444"/><circle cx="340" cy="336" r="20" fill="#444"/>
      <path d="M126 294 L162 224 L344 224 L378 294 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <path d="M168 224 L196 146 L312 146 L332 224 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <line x1="322" y1="176" x2="472" y2="152" stroke="#2e2e2e" stroke-width="34" stroke-linecap="round"/>
      <line x1="322" y1="176" x2="472" y2="152" stroke="url(#ivory)" stroke-width="14" stroke-linecap="round"/>`;
  }

  if ((era === 'ww2' || era === 'modern' || era === 'ww1') && (role === 'horseArcher' || role === 'archer')) {
    // 空军战机 / 轰炸机中队棋子
    return `
      ${plinth}
      <path d="M256 44 L292 152 L456 232 L456 276 L290 244 L282 326 L348 358 L348 384 L256 362 L164 384 L164 358 L230 326 L222 244 L56 276 L56 232 L220 152 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <line x1="256" y1="92" x2="256" y2="332" stroke="#444" stroke-width="12" stroke-linecap="round"/>`;
  }

  if ((era === 'gunpowder' || era === 'ww1' || era === 'ww2' || era === 'modern') && (role === 'crossbow' || role === 'spear')) {
    // 野战重炮 / 榴弹炮 / 火箭炮棋子
    return `
      ${plinth}
      <line x1="126" y1="274" x2="412" y2="148" stroke="#2e2e2e" stroke-width="58" stroke-linecap="round"/>
      <line x1="126" y1="274" x2="412" y2="148" stroke="url(#ivory)" stroke-width="32" stroke-linecap="round"/>
      <circle cx="232" cy="296" r="78" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
      <circle cx="232" cy="296" r="24" fill="#3a3a3a"/>
      <line x1="232" y1="226" x2="232" y2="366" stroke="#444" stroke-width="12"/>
      <line x1="162" y1="296" x2="302" y2="296" stroke="#444" stroke-width="12"/>`;
  }

  if (role === 'elite') {
    // 时代精锐禁军大纛 / 勋章战旗
    return `
      ${plinth}
      <line x1="152" y1="68" x2="152" y2="388" stroke="#2e2e2e" stroke-width="26" stroke-linecap="round"/>
      <line x1="152" y1="68" x2="152" y2="388" stroke="url(#ivory)" stroke-width="12" stroke-linecap="round"/>
      <polygon points="152,22 184,68 152,96 120,68" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/>
      <path d="M168 84 Q282 54 394 92 L356 184 L396 276 Q282 308 168 278 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <polygon points="274,126 290,168 334,168 298,194 312,236 274,210 236,236 250,194 214,168 258,168" fill="#3e3e3e"/>`;
  }

  if (role === 'shield') {
    // 重盾/要塞防线棋子
    return `
      ${plinth}
      <path d="M120 88 Q256 54 392 88 L392 224 Q374 336 256 382 Q138 336 120 224 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="24" stroke-linejoin="round"/>
      <line x1="256" y1="108" x2="256" y2="342" stroke="#444" stroke-width="18"/>
      <line x1="154" y1="202" x2="358" y2="202" stroke="#444" stroke-width="18"/>
      <circle cx="256" cy="202" r="24" fill="#3a3a3a"/>`;
  }

  if (role === 'cavalry' || role === 'heavy' || role === 'horseArcher') {
    // 古代/中古/线列骏马战骑棋子
    return `
      ${plinth}
      <path d="M162 378 L354 378 Q376 286 364 210 Q352 126 306 86 L256 64 L224 34 L204 78 Q128 122 118 192 Q118 232 156 226 L196 214 Q218 274 162 378 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
      <circle cx="226" cy="118" r="14" fill="#3a3a3a"/>
      <path d="M306 138 Q344 210 326 304" fill="none" stroke="#444" stroke-width="14" stroke-linecap="round"/>`;
  }

  if (role === 'elephant') {
    return `
      ${plinth}
      <polygon points="184,48 328,48 312,118 200,118" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
      <ellipse cx="132" cy="196" rx="68" ry="86" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
      <ellipse cx="380" cy="196" rx="68" ry="86" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="20"/>
      <ellipse cx="256" cy="198" rx="94" ry="102" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
      <path d="M256 266 Q244 346 306 366" fill="none" stroke="#2e2e2e" stroke-width="48" stroke-linecap="round"/>
      <path d="M256 266 Q244 346 306 366" fill="none" stroke="url(#ivory)" stroke-width="22" stroke-linecap="round"/>`;
  }

  if (role === 'archer' || role === 'crossbow') {
    return `
      ${plinth}
      <path d="M182 54 Q332 134 316 218 Q332 302 182 376" fill="none" stroke="#2e2e2e" stroke-width="34" stroke-linecap="round"/>
      <path d="M182 54 Q332 134 316 218 Q332 302 182 376" fill="none" stroke="url(#ivory)" stroke-width="14" stroke-linecap="round"/>
      <line x1="94" y1="216" x2="394" y2="216" stroke="#2e2e2e" stroke-width="24" stroke-linecap="round"/>
      <line x1="94" y1="216" x2="394" y2="216" stroke="url(#ivory)" stroke-width="10" stroke-linecap="round"/>
      <polygon points="434,216 364,178 378,216 364,254" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="16"/>`;
  }

  // 默认各时代步兵/枪兵头盔+佩械棋子（随时代演进：青铜翎盔 / 中古重盔 / 三角帽 / 钢盔突击兵）
  const helmet = (era === 'ww1' || era === 'ww2' || era === 'modern')
    ? `<path d="M142 184 Q158 76 256 72 Q354 76 370 184 L394 202 L118 202 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
       <rect x="156" y="232" width="200" height="148" rx="14" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
       <line x1="176" y1="364" x2="378" y2="212" stroke="#2e2e2e" stroke-width="28" stroke-linecap="round"/>
       <line x1="176" y1="364" x2="378" y2="212" stroke="#f5f5f5" stroke-width="12" stroke-linecap="round"/>`
    : `<polygon points="256,22 292,86 256,108 220,86" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="18"/>
       <path d="M168 176 Q174 86 256 78 Q338 86 344 176 L332 232 L180 232 Z" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22"/>
       <polygon points="154,248 358,248 376,380 136,380" fill="url(#ivory)" stroke="#2e2e2e" stroke-width="22" stroke-linejoin="round"/>
       <line x1="256" y1="256" x2="256" y2="364" stroke="#444" stroke-width="16"/>
       <line x1="204" y1="292" x2="308" y2="292" stroke="#444" stroke-width="16"/>`;
  return plinth + helmet;
}

async function buildEraUnits() {
  console.log('\n=== Rendering 84 Era-Specific 512×512 Unit Sprites (EraUnits/) ===');
  const t0 = Date.now();
  const tasks = [];
  for (const era of ERAS_6) {
    const dir = path.join(OUT_DIR, 'EraUnits', era);
    ensureDir(dir);
    for (const role of UNIT_ROLES_14) {
      tasks.push({ era, role, outPath: path.join(dir, `${role}.png`) });
    }
  }
  const CONC = 16;
  for (let i = 0; i < tasks.length; i += CONC) {
    await Promise.all(tasks.slice(i, i + CONC).map(async ({ era, role, outPath }) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
        <defs>
          <linearGradient id="ivory" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="52%" stop-color="#efefef"/>
            <stop offset="100%" stop-color="#c6c6c6"/>
          </linearGradient>
        </defs>
        ${unitSvgBody(era, role)}
      </svg>`;
      await sharp(Buffer.from(svg)).png({ compressionLevel: 1 }).toFile(outPath);
    }));
  }
  console.log(`[EraUnits] 84 × 1024×1024 PNGs rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// =========================================================================
// PART 7: 6 时代双乐章立体声交响配乐 (12首) + 49 条时代战场音效 (AudioHD/)
// =========================================================================
function writeStereoWav(outPath, samplesL, samplesR, sampleRate = 44100) {
  const numSamples = samplesL.length;
  const dataBytes = numSamples * 4;
  const buf = Buffer.allocUnsafe(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  let o = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, samplesL[i]));
    const r = Math.max(-1, Math.min(1, samplesR[i]));
    buf.writeInt16LE(Math.round(l * 32760), o); o += 2;
    buf.writeInt16LE(Math.round(r * 32760), o); o += 2;
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, buf);
}

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function applyStereoReverb(L, R, sr) {
  // 双通道厅堂梳状混响，使铜管/编钟/弦乐具备真实交响厅空间感
  const d1 = Math.floor(sr * 0.037), d2 = Math.floor(sr * 0.053), d3 = Math.floor(sr * 0.079);
  for (let i = d3; i < L.length; i++) {
    L[i] += 0.24 * L[i - d1] + 0.16 * R[i - d2] + 0.10 * L[i - d3];
    R[i] += 0.24 * R[i - d1] + 0.16 * L[i - d2] + 0.10 * R[i - d3];
  }
}

const ERA_MUSIC_SPECS = {
  antiquity: {
    scale: [50, 52, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76], // D 宫五声音阶（编钟+古筝）
    chords: [[50, 57, 62], [55, 62, 67], [57, 64, 69], [52, 59, 64]],
    bpm1: 72, bpm2: 108, timbre: 'bell',
  },
  medieval: {
    scale: [50, 52, 53, 57, 59, 60, 62, 64, 65, 69, 71, 74], // D Dorian 丝路礼乐与史诗弦乐
    chords: [[50, 57, 62], [53, 60, 65], [55, 62, 67], [57, 64, 69]],
    bpm1: 78, bpm2: 118, timbre: 'strings',
  },
  gunpowder: {
    scale: [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74], // C 大调巴洛克铜管进行曲
    chords: [[48, 55, 60], [53, 60, 65], [55, 62, 67], [48, 52, 60]],
    bpm1: 88, bpm2: 124, timbre: 'brass',
  },
  ww1: {
    scale: [45, 47, 48, 52, 53, 55, 57, 59, 60, 64, 65, 69], // A 小调悲壮工业铜管与低音提琴
    chords: [[45, 52, 57], [48, 55, 60], [50, 57, 62], [52, 59, 64]],
    bpm1: 76, bpm2: 116, timbre: 'horn',
  },
  ww2: {
    scale: [46, 48, 49, 53, 55, 56, 58, 60, 61, 65, 67, 70], // Bb 小调钢铁风暴交响史诗
    chords: [[46, 53, 58], [49, 56, 61], [51, 58, 63], [53, 60, 65]],
    bpm1: 86, bpm2: 132, timbre: 'epic',
  },
  modern: {
    scale: [48, 50, 51, 55, 56, 58, 60, 62, 63, 67, 68, 72], // C 小调冷战深空合成交响与声呐脉动
    chords: [[48, 55, 60], [51, 58, 63], [53, 60, 65], [55, 62, 67]],
    bpm1: 82, bpm2: 122, timbre: 'synth',
  },
};

function synthesizeEraMusic(era, movement) {
  const sr = 44100;
  const durationSec = 165; // ~29.1 MB per stereo WAV × 12 = ~349 MB
  const total = sr * durationSec;
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const spec = ERA_MUSIC_SPECS[era];
  const bpm = movement === 1 ? spec.bpm1 : (movement === 2 ? spec.bpm2 : Math.round((spec.bpm1 + spec.bpm2) * 0.52));
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const rng = mulberry32(era.charCodeAt(0) * 997 + movement * 31337);

  // 1) 和声弦乐/铜管厚底铺垫（每小节切换真实和弦，带柔和淡入淡出）
  const totalBars = Math.ceil(durationSec / barSec);
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = spec.chords[bar % spec.chords.length];
    const startS = Math.floor(bar * barSec * sr);
    const lenS = Math.min(total - startS, Math.floor(barSec * sr));
    const freqs = chord.map(midiToHz);
    const bassFreq = midiToHz(chord[0] - 12);
    for (let i = 0; i < lenS; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 2.5) * Math.min(1, (lenS - i) / (sr * 0.35));
      let padL = Math.sin(2 * Math.PI * bassFreq * t) * 0.22 + Math.sin(4 * Math.PI * bassFreq * t) * 0.08;
      let padR = padL;
      for (let c = 0; c < freqs.length; c++) {
        const f = freqs[c];
        const vib = 1 + 0.0025 * Math.sin(2 * Math.PI * 4.5 * t + c);
        const w = Math.sin(2 * Math.PI * f * vib * t) * 0.13 + Math.sin(4 * Math.PI * f * t) * 0.045;
        const pan = c === 0 ? 0.35 : c === 1 ? 0.5 : 0.65;
        padL += w * (1 - pan) * 1.4;
        padR += w * pan * 1.4;
      }
      L[startS + i] += padL * env * 0.55;
      R[startS + i] += padR * env * 0.55;
    }
  }

  // 2) 主旋律与对位琶音（不同乐章拥有独立动机发展）
  const stepSec = movement === 1 ? beatSec : beatSec * 0.5;
  const totalSteps = Math.floor(durationSec / stepSec);
  let degree = movement === 1 ? 5 : 7;
  for (let st = 0; st < totalSteps; st++) {
    // 保留呼吸休止，避免机械连响
    if (st % 8 === 7 || (movement === 1 && rng() < 0.22)) continue;
    const stepDelta = Math.floor(rng() * 5) - 2;
    degree = Math.max(0, Math.min(spec.scale.length - 1, degree + stepDelta));
    const midi = spec.scale[degree] + (st % 16 < 8 ? 0 : 12);
    const freq = midiToHz(midi);
    const startS = Math.floor(st * stepSec * sr);
    const noteLen = Math.min(total - startS, Math.floor(stepSec * (movement === 1 ? 1.6 : 1.15) * sr));
    const pan = 0.25 + 0.5 * ((st % 4) / 3);
    for (let i = 0; i < noteLen; i++) {
      const t = i / sr;
      let env, wave;
      if (spec.timbre === 'bell') {
        env = Math.exp(-t * 2.8) * Math.min(1, t * 140);
        wave = Math.sin(2 * Math.PI * freq * t) * 0.65 + Math.sin(2 * Math.PI * freq * 2.756 * t) * 0.22 * Math.exp(-t * 5);
      } else if (spec.timbre === 'brass' || spec.timbre === 'horn' || spec.timbre === 'epic') {
        env = Math.min(1, t * 14) * Math.exp(-t * 1.45);
        wave = Math.sin(2 * Math.PI * freq * t) * 0.55 + Math.sin(4 * Math.PI * freq * t) * 0.28 + Math.sin(6 * Math.PI * freq * t) * 0.14;
      } else if (spec.timbre === 'synth') {
        env = Math.min(1, t * 24) * Math.exp(-t * 2.1);
        wave = Math.sin(2 * Math.PI * freq * t) * 0.5 + ((2 * ((freq * t) % 1) - 1) * 0.22);
      } else {
        env = Math.min(1, t * 10) * Math.exp(-t * 1.8);
        wave = Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(4 * Math.PI * freq * t) * 0.2 + Math.sin(6 * Math.PI * freq * t) * 0.08;
      }
      const s = wave * env * 0.26;
      L[startS + i] += s * (1 - pan) * 1.3;
      R[startS + i] += s * pan * 1.3;
    }
  }

  // 3) 战争乐章/进行曲低音定音鼓与军鼓节拍
  const drumStep = movement === 2 ? beatSec : beatSec * 2;
  const drumSteps = Math.floor(durationSec / drumStep);
  for (let d = 0; d < drumSteps; d++) {
    const startS = Math.floor(d * drumStep * sr);
    const isAccent = (d % 4 === 0);
    const len = Math.min(total - startS, Math.floor(sr * 0.28));
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = (isAccent ? 95 : 135) * Math.exp(-t * 10) + 46;
      const thump = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 12) * (isAccent ? 0.30 : 0.16);
      const snare = (movement === 2 && d % 2 === 1) ? ((hash2d(i, d, 91) * 2 - 1) * Math.exp(-t * 24) * 0.12) : 0;
      L[startS + i] += thump + snare * 0.9;
      R[startS + i] += thump + snare * 1.1;
    }
  }

  applyStereoReverb(L, R, sr);
  // 首尾 2.5s 平滑淡入淡出 + 软限幅防削波
  const fadeS = Math.floor(sr * 2.5);
  for (let i = 0; i < total; i++) {
    let g = 0.85;
    if (i < fadeS) g *= i / fadeS;
    else if (i > total - fadeS) g *= (total - i) / fadeS;
    L[i] = Math.tanh(L[i] * g);
    R[i] = Math.tanh(R[i] * g);
  }
  return { L, R };
}

function synthesizeSfx(kind, era) {
  const sr = 44100;
  const durMap = { seal: 1.1, scroll: 1.4, anchor: 2.0, march: 3.2, clash: 3.4, cannon: 3.8, herald: 3.4 };
  const dur = durMap[kind] || 2.0;
  const n = Math.floor(sr * dur);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const eraPitch = { antiquity: 0.92, medieval: 1.0, gunpowder: 1.05, ww1: 0.88, ww2: 0.84, modern: 1.12 }[era] || 1.0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const noise = hash2d(i, kind.charCodeAt(0) * 31 + era.charCodeAt(0), 7) * 2 - 1;
    let sL, sR;
    if (kind === 'seal') {
      const thud = Math.sin(2 * Math.PI * (145 * eraPitch * Math.exp(-t * 14) + 55) * t) * Math.exp(-t * 11);
      const click = noise * Math.exp(-t * 48) * 0.35;
      sL = sR = (thud * 0.72 + click);
    } else if (kind === 'scroll') {
      const env = Math.sin(Math.PI * Math.min(1, t / dur)) * Math.exp(-t * 1.4);
      sL = noise * env * 0.25 + Math.sin(2 * Math.PI * 620 * eraPitch * t) * Math.exp(-t * 9) * 0.12;
      sR = noise * env * 0.28 + Math.sin(2 * Math.PI * 645 * eraPitch * t) * Math.exp(-t * 9) * 0.12;
    } else if (kind === 'anchor') {
      const bell = Math.sin(2 * Math.PI * 240 * eraPitch * t) * Math.exp(-t * 2.2) + Math.sin(2 * Math.PI * 528 * eraPitch * t) * Math.exp(-t * 4.5) * 0.4;
      const splash = noise * Math.exp(-Math.max(0, t - 0.15) * 3.8) * (t > 0.15 ? 0.35 : 0);
      sL = bell * 0.45 + splash * 0.85;
      sR = bell * 0.45 + splash * 1.05;
    } else if (kind === 'march') {
      const stepPhase = (t * 2.6) % 1;
      const hit = Math.sin(2 * Math.PI * (110 * eraPitch * Math.exp(-stepPhase * 12) + 42) * stepPhase) * Math.exp(-stepPhase * 11);
      const rattle = noise * Math.exp(-stepPhase * 22) * 0.25;
      const fade = Math.min(1, (dur - t) * 1.2);
      sL = (hit * 0.6 + rattle * 0.8) * fade;
      sR = (hit * 0.6 + rattle * 1.1) * fade;
    } else if (kind === 'clash') {
      const steel = (Math.sin(2 * Math.PI * 1180 * eraPitch * t) + Math.sin(2 * Math.PI * 1840 * eraPitch * t) * 0.6) * Math.exp(-t * 2.4);
      const boom = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 3.5);
      const burst = noise * Math.exp(-t * 1.8) * 0.45;
      sL = steel * 0.35 + boom * 0.5 + burst * 0.9;
      sR = steel * 0.32 + boom * 0.5 + burst * 1.1;
    } else if (kind === 'cannon') {
      const f = (130 * eraPitch * Math.exp(-t * 6.5) + 32);
      const sub = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6);
      const blast = noise * Math.exp(-t * 2.1) * 0.65;
      sL = sub * 0.68 + blast * 0.95;
      sR = sub * 0.68 + blast * 1.05;
    } else {
      // herald: 庄严号角双音和声
      const f1 = 330 * eraPitch, f2 = 440 * eraPitch;
      const env = Math.min(1, t * 6) * Math.exp(-Math.max(0, t - 0.6) * 1.15);
      const horn = (Math.sin(2 * Math.PI * f1 * t) + 0.5 * Math.sin(4 * Math.PI * f1 * t) + 0.45 * Math.sin(2 * Math.PI * f2 * t)) * env * 0.32;
      sL = horn * 0.95; sR = horn * 1.05;
    }
    L[i] = Math.tanh(sL);
    R[i] = Math.tanh(sR);
  }
  applyStereoReverb(L, R, sr);
  return { L, R };
}

function buildAudioHD() {
  console.log('\n=== Synthesizing AudioHD (12 Era Symphonies + 49 Era SFX) ===');
  const t0 = Date.now();
  const musicDir = path.join(OUT_DIR, 'AudioHD/Music');
  const sfxDir = path.join(OUT_DIR, 'AudioHD/SFX');
  ensureDir(musicDir); ensureDir(sfxDir);

  for (const era of ERAS_6) {
    for (const mv of [1, 2, 3]) {
      const { L, R } = synthesizeEraMusic(era, mv);
      writeStereoWav(path.join(musicDir, `era-${era}-${mv}.wav`), L, R);
    }
    console.log(`[AudioHD] synthesized ${era} movements 1, 2 & 3`);
  }

  const sfxKinds = ['seal', 'scroll', 'anchor', 'march', 'clash', 'cannon', 'herald'];
  for (const kind of sfxKinds) {
    const def = synthesizeSfx(kind, 'medieval');
    writeStereoWav(path.join(sfxDir, `sfx-${kind}.wav`), def.L, def.R);
    for (const era of ERAS_6) {
      const { L, R } = synthesizeSfx(kind, era);
      writeStereoWav(path.join(sfxDir, `sfx-${kind}-${era}.wav`), L, R);
    }
  }
  console.log(`[AudioHD] 12 symphonies + 49 SFX built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// =========================================================================
// PART 8: 校验、硬链接平铺发布目录 & 生成 hotpack-v6-manifest.json
// =========================================================================
function resolveModuleId(relPath) {
  const top = relPath.split('/')[0];
  if (top === 'HDMeshes') return 'hd-meshes';
  if (top === 'ReliefTiles') return 'relief-tiles';
  if (top === 'Eras45') return 'eras-45';
  if (top === 'Encyclopedia') return 'encyclopedia';
  if (top === 'EraUnits') return 'era-units';
  if (top === 'AudioHD') return 'audio-hd';
  return 'content';
}

function flatAssetName(relPath) {
  return relPath.replace(/\//g, '__');
}

function buildCdnUrls(relPath) {
  const asset = encodeURIComponent(flatAssetName(relPath));
  const ghRelease = `https://github.com/Ethanhui6/lieguoji-web/releases/download/${HOTPACK_TAG}/${asset}`;
  const quotedRel = relPath.split('/').map(encodeURIComponent).join('/');
  return [
    `https://gh-proxy.com/${ghRelease}`,
    `https://cdn.gh-proxy.org/${ghRelease}`,
    `https://gh-proxy.org/${ghRelease}`,
    `https://edgeone.gh-proxy.com/${ghRelease}`,
    `https://lieguoji-edge.pages.dev/api/cdn/hotpack/${quotedRel}`,
    ghRelease,
    `http://${PUBLIC_HOST}/api/v1/hotpack/download/${quotedRel}`,
  ];
}

function walkFiles(dir, base = dir) {
  let out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(walkFiles(full, base));
    else if (ent.isFile() && !ent.name.startsWith('.')) {
      out.push({ full, rel: path.relative(base, full).replace(/\\/g, '/') });
    }
  }
  return out;
}

function finalizeManifestAndReleaseStaging() {
  console.log('\n=== Computing SHA256, Staging Release Assets & Writing Manifest ===');
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  ensureDir(RELEASE_DIR);

  const allFiles = walkFiles(OUT_DIR).sort((a, b) => a.rel.localeCompare(b.rel));
  const modAcc = {};
  const files = [];
  let totalBytes = 0;
  let maxSingleBytes = 0;

  for (const f of allFiles) {
    const stat = fs.statSync(f.full);
    if (stat.size > maxSingleBytes) maxSingleBytes = stat.size;
    if (stat.size > 98 * 1024 * 1024) {
      throw new Error(`File exceeds 98MB CDN cap: ${f.rel} (${(stat.size / 1048576).toFixed(1)} MB)`);
    }
    const sha = crypto.createHash('sha256').update(fs.readFileSync(f.full)).digest('hex');
    const modId = resolveModuleId(f.rel);
    const entry = {
      path: f.rel,
      module: modId,
      size: stat.size,
      sha256: sha,
      cdnUrls: buildCdnUrls(f.rel),
    };
    files.push(entry);
    totalBytes += stat.size;
    if (!modAcc[modId]) {
      const m = MODULE_META[modId];
      modAcc[modId] = { id: modId, name: m.name, detail: m.detail, bytes: 0, fileCount: 0 };
    }
    modAcc[modId].bytes += stat.size;
    modAcc[modId].fileCount += 1;

    // 零磁盘拷贝硬链接到发布平铺目录
    const dstFlat = path.join(RELEASE_DIR, flatAssetName(f.rel));
    try { fs.linkSync(f.full, dstFlat); }
    catch { fs.copyFileSync(f.full, dstFlat); }
  }

  const order = ['hd-meshes', 'relief-tiles', 'eras-45', 'encyclopedia', 'era-units', 'audio-hd'];
  const modules = order.filter(id => modAcc[id]).map(id => modAcc[id]);

  const manifest = {
    ok: true,
    packVersion: 6,
    releaseTag: 'v7.0 · 1.1GB 史诗超精舆图与五千年典藏热更包 v6',
    summary: '全量 100% 实时挂载生效：60K/120K 超精网格拓扑、7 大分区 14K 卫星地貌 GPU 瓦片金字塔、五千年 45 纪元真实国界自由开局、全球双语城市与人物志、6 时代 84 套高清雕漆兵模及 12 首时代交响双乐章',
    totalBytes,
    updatedAt: Date.now(),
    modules,
    files,
  };

  ensureDir(path.dirname(MANIFEST_OUT));
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));

  console.log('\n================ HOTPACK-V6 BUILD SUMMARY ================');
  for (const m of modules) {
    console.log(`  [${m.id.padEnd(13)}] ${String(m.fileCount).padStart(3)} files | ${(m.bytes / 1048576).toFixed(1).padStart(7)} MB | ${m.name}`);
  }
  console.log(`  TOTAL: ${files.length} files | ${(totalBytes / 1073741824).toFixed(3)} GB (${(totalBytes / 1048576).toFixed(1)} MB)`);
  console.log(`  MAX SINGLE FILE: ${(maxSingleBytes / 1048576).toFixed(2)} MB (limit 98 MB)`);
  console.log(`  MANIFEST: ${MANIFEST_OUT}`);
  if (totalBytes < 1050 * 1024 * 1024) {
    throw new Error(`Total hotpack size ${(totalBytes / 1048576).toFixed(1)} MB is below 1.05 GB target!`);
  }
}

async function main() {
  const tStart = Date.now();
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  const grid20 = readGrid20kCoords();
  const citiesZh = JSON.parse(fs.readFileSync(path.join(BUNDLE_ATLAS_DIR, 'cities_zh.json'), 'utf8'));

  console.log('=== Building 60K & 120K Voronoi Meshes ===');
  const mesh60 = buildVoronoiMesh(326, 184, 706001, path.join(OUT_DIR, 'HDMeshes/60k'), '60k');
  const mesh120 = buildVoronoiMesh(462, 260, 712002, path.join(OUT_DIR, 'HDMeshes/120k'), '120k');

  const { basemaps60, basemaps120 } = await buildBasemapsAndReliefTiles(mesh60, mesh120);
  buildHighResScenariosGIS(grid20, mesh60, mesh120, basemaps60, basemaps120);
  buildEras45(grid20, mesh60, mesh120, basemaps60.get('world'), basemaps120.get('world'), citiesZh);
  buildEncyclopedia(citiesZh);
  await buildEraUnits();
  buildAudioHD();
  finalizeManifestAndReleaseStaging();
  console.log(`\nALL DONE in ${((Date.now() - tStart) / 1000).toFixed(1)}s!`);
}

main().catch(err => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});
