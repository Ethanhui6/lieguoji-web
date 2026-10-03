// Run once from the project root: node docs/evidence/fms-naturalization-2026-10-04/hill-trial.mjs
// One synthetic shape only. No original game, native DLL, or save is executed.
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (path.resolve(process.cwd()) !== path.resolve(root)) throw new Error('Run this trial from the project root.');
const outputPath = fileURLToPath(new URL('./hill-trial.json', import.meta.url));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rounded = value => Math.round(value * 100) / 100;
const contours = [
  [[260, 265], [430, 195], [580, 280], [790, 210], [980, 250], [1270, 330], [1300, 500], [1080, 610],
    [1220, 710], [1070, 810], [1280, 1040], [1090, 1250], [900, 1180], [710, 1330], [550, 1170],
    [350, 1240], [245, 1060], [360, 865], [210, 660], [300, 495]],
  [[1390, 1150], [1460, 1170], [1475, 1240], [1425, 1270], [1370, 1230]],
];
const requestedCenters = [[520, 500], [930, 360], [800, 1100]];
const seed = 1337, centerHeight = 80, decayFactor = 0.98;

function contains([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function injectedRandom(initialSeed) {
  let state = initialSeed >>> 0, calls = 0;
  return {
    value() {
      calls += 1; state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ state >>> 15, state | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return Math.fround(((value ^ value >>> 14) >>> 0) / 4294967296);
    },
    calls: () => calls,
  };
}
function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted.at(-1), mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)] };
}
function summarize(doc, original, elevations, land) {
  const heights = [], landEdgeJumps = [], coastEdgeJumps = [], coastHeights = [];
  let changedCells = 0, maskViolations = 0, rangeViolations = 0, seaChanges = 0, unchangedLandCells = 0, saturatedLandCells = 0;
  for (let cell = 0; cell < elevations.length; cell += 1) {
    const height = elevations[cell];
    if (height !== original[cell]) changedCells += 1;
    if ((height >= 20) !== land.has(cell)) maskViolations += 1;
    if (!Number.isInteger(height) || height < 0 || height > 100) rangeViolations += 1;
    if (!land.has(cell)) { if (height !== original[cell]) seaChanges += 1; continue; }
    heights.push(height);
    if (height === original[cell]) unchangedLandCells += 1;
    if (height >= 100) saturatedLandCells += 1;
    let coastal = false;
    for (const neighbor of doc.neighbors[cell]) {
      if (!land.has(neighbor)) { coastEdgeJumps.push(Math.abs(height - elevations[neighbor])); coastal = true; }
      else if (neighbor > cell) landEdgeJumps.push(Math.abs(height - elevations[neighbor]));
    }
    if (coastal) coastHeights.push(height);
  }
  return {
    elevationsSha256: hash(Array.from(elevations)), changedCells, maskViolations, rangeViolations, seaChanges,
    landHeight: distribution(heights), distinctLandHeights: new Set(heights).size,
    unchangedLandCells, unchangedLandFraction: unchangedLandCells / land.size,
    saturatedLandCells, saturatedLandFraction: saturatedLandCells / land.size,
    coastalLandHeight: distribution(coastHeights),
    seaLandEdgeHeightJump: distribution(coastEdgeJumps), landNeighborHeightJump: distribution(landEdgeJumps),
    landHeightHistogram: Object.fromEntries([[20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 99], [100, Infinity]]
      .map(([min, max]) => [`${min}-${max}`, heights.filter(height => height >= min && height <= max).length])),
  };
}

const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
  cacheDir: '.autopilot/fms-hill-trial-vite-cache' });
try {
  const { createFmsDocument } = await server.ssrLoadModule('/src/fms/model.ts');
  const { naturalizeFmsTerrain } = await server.ssrLoadModule('/src/fms/naturalize.ts');
  const { generateFmsHillContributions, applyFmsHillBrush } = await server.ssrLoadModule('/src/world/fms-native-brush.ts');
  const doc = await createFmsDocument({ yieldTask: async () => {} });
  doc.points.forEach((point, cell) => { if (contours.some(contour => contains(point, contour))) doc.elevations[cell] = 45; });
  const original = doc.elevations.slice(), originalHash = hash(Array.from(original));
  const land = new Set(Array.from(original.keys()).filter(cell => original[cell] >= 20)), landIds = [...land];
  const centers = requestedCenters.map(requested => {
    let cell = -1, distanceSquared = Infinity;
    for (const id of land) {
      const point = doc.points[id], distance = (point[0] - requested[0]) ** 2 + (point[1] - requested[1]) ** 2;
      if (distance < distanceSquared) { cell = id; distanceSquared = distance; }
    }
    if (cell < 0 || distanceSquared > 100) throw new Error('Requested center was not inside the authored fixture.');
    return { requested, cell, actual: doc.points[cell], distanceToRequested: Math.sqrt(distanceSquared) };
  });
  const random = injectedRandom(seed), contributions = [], perCenter = [];
  const generationStart = performance.now();
  for (const center of centers) {
    const callsBefore = random.calls(), started = performance.now();
    const map = generateFmsHillContributions({ selectedCells: land, centerCell: center.cell, centerHeight, decayFactor,
      orderedNeighbors: cell => doc.neighbors[cell], randomValue: () => random.value() });
    const values = landIds.map(cell => map.get(cell));
    const positive = values.filter(value => value > 0);
    contributions.push(values);
    perCenter.push({ ...center, elapsedMs: rounded(performance.now() - started), randomCalls: random.calls() - callsBefore,
      reachedSelectedCells: positive.length, unreachedSelectedCells: values.length - positive.length, positiveHeight: distribution(positive), contributionsSha256: hash(values) });
  }
  const generationMs = rounded(performance.now() - generationStart);
  const variants = [];
  for (const mode of ['add', 'max']) {
    const started = performance.now();
    let values = landIds.map(cell => original[cell]);
    for (const contribution of contributions) values = applyFmsHillBrush(values, contribution, mode);
    const elevations = original.slice(); landIds.forEach((cell, index) => { elevations[cell] = values[index]; });
    const compositionMs = rounded(performance.now() - started);
    variants.push({ method: `recovered-Hill-${mode}`, generationMs, compositionMs, totalNumericMs: rounded(generationMs + compositionMs),
      addedClamp: false, summary: summarize(doc, original, elevations, land) });
  }
  const webStarted = performance.now(), naturalized = naturalizeFmsTerrain(doc, { seed, strength: 1 });
  const webElapsedMs = rounded(performance.now() - webStarted);
  if (hash(Array.from(doc.elevations)) !== originalHash) throw new Error('Trial modified its source elevations.');
  const result = {
    schema: 'fms-hill-whole-landmass-trial', version: 1, generatedAt: new Date().toISOString(),
    evidenceLevel: 'LOCAL_WEB_ADAPTER_NUMERIC_EXECUTION_NOT_ORIGINAL_GAME',
    scope: 'One authored synthetic mask on one square-v1 web topology; no native game/DLL execution, no source recovery, no visual or physical-device acceptance.',
    environment: { runtime: process.version, platform: process.platform, architecture: process.arch,
      measurement: 'Local Node SSR CPU timings; excludes topology creation/module startup. Naturalize includes its document validator; Hill timings include contribution generation and composition only.' },
    inputs: { layout: 'square-v1', width: doc.width, height: doc.height, points: doc.points.length, triangles: doc.triangles.length / 3,
      contours, classification: 'site inside either polygon => elevation 45; otherwise 0; land >=20', landCells: land.size, seaCells: doc.points.length - land.size,
      topologySha256: hash({ points: doc.points, triangles: Array.from(doc.triangles), neighbors: doc.neighbors }), originalElevationsSha256: originalHash,
      selectedCells: 'All land cell IDs, ascending; the disconnected island is included but no Hill center is placed on it.',
      centerHeight, decayFactorRequested: decayFactor, decayFactorFloat32: Math.fround(decayFactor), seed,
      randomSource: 'Explicit shared Mulberry32 stream; state initialized to seed; each output rounded to float32. This is not Unity RNG or its original seed sequence.',
      centerSelection: 'nearest land site to each listed requested coordinate, maximum permitted displacement 10 world units', centers,
      parameterOrigin: 'centerHeight=80 and decayFactor=0.98 are experimental choices, not recovered original UI defaults.' },
    recoveredKernel: { source: 'src/world/fms-native-brush.ts', perCenter, totalRandomCalls: random.calls(),
      limits: 'General Math.pow/float32 adaptation is not proven bit-identical to native powf. Collider selection, world entities, and native rendering are absent.' },
    variants,
    webNaturalization: { method: naturalized.stats.algorithm, seed, strength: 1, elapsedMs: webElapsedMs, stats: naturalized.stats,
      summary: summarize(doc, original, naturalized.elevations, land) },
    inputUnchanged: true,
    interpretation: {
      measuredOnly: 'Mask preservation, numeric ranges, unchanged plateaus, adjacency height jumps and timings. These metrics do not certify natural appearance.',
      selectionIsWebAdaptation: 'Limiting composition to the explicit land mask is a trial wrapper, not a recovered original selection rule.',
      whyKeepHillAsBrush: 'The original numeric kernel propagates a contribution from selected centers. Its Add and Max modes preserve the existing drawing base outside those contributions; neither provides a whole-world coast-distance relief contract by itself.',
      defaultDecision: 'Retain the shape-constrained continuous web relief as the current whole-landmass default. Keep recovered Hill numeric behavior available for future localized brush integration; do not identify this trial with original game equivalence.',
      contourLimit: 'Equal sample masks do not prove identical interpolated coastline positions. Current visual coast and original similarity remain separate pending checks.',
    },
    sources: ['src/fms/naturalize.ts', 'src/world/fms-native-brush.ts', 'src/world/recovered-terrain/topology.ts', 'src/world/generation/seed.ts', 'src/fms/model.ts']
      .map(file => ({ file, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') })),
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: path.relative(root, outputPath).replaceAll('\\', '/'), points: doc.points.length, landCells: land.size,
    hill: variants.map(value => ({ method: value.method, totalNumericMs: value.totalNumericMs, rangeViolations: value.summary.rangeViolations,
      maskViolations: value.summary.maskViolations, height: value.summary.landHeight, unchangedLandFraction: value.summary.unchangedLandFraction,
      coastJump: value.summary.seaLandEdgeHeightJump, neighborJump: value.summary.landNeighborHeightJump })),
    web: { elapsedMs: webElapsedMs, maskViolations: result.webNaturalization.summary.maskViolations, rangeViolations: result.webNaturalization.summary.rangeViolations,
      height: result.webNaturalization.summary.landHeight, unchangedLandFraction: result.webNaturalization.summary.unchangedLandFraction,
      coastJump: result.webNaturalization.summary.seaLandEdgeHeightJump, neighborJump: result.webNaturalization.summary.landNeighborHeightJump },
    inputUnchanged: result.inputUnchanged }, null, 2));
} finally { await server.close(); }
