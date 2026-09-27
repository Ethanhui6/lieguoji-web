import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';

const folder = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(folder, '../../..');
const out = path.join(folder, 'first');
if (existsSync(out)) throw new Error('Preserve the existing first diagnostic; no automatic repeat.');
mkdirSync(path.join(out, 'runtime'), { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['src/world/generation/detail-shape-height.ts', 'src/world/detail-coast-field.ts', 'src/world/detail-coast-types.ts',
  'src/world/detail-terrain-pages.ts', 'src/world/detail-terrain-shader.ts', 'src/world/detail-terrain-backend.ts', 'src/world/detail-coast-base.ts',
  'src/world/generation/quality.ts', 'src/world/model.ts', 'src/world/generation-contract.ts', 'src/world/generation-format.ts',
  'src/world/atlas-format.ts', 'src/world/detail-coast-locks.ts', 'src/world/storage.ts', 'docs/adr/0016-sparse-detail-coast.md',
  'docs/adr/0018-natural-landscape-v2.md', 'docs/adr/0020-local-detail-relief.md', '.autopilot/ph06/preview16-ridge-grid-observation.md',
  '.autopilot/ph06/height-plane-diagnostic/probe.mjs'];
const snapshot = () => files.map(file => ({ path: file, sha256: hash(readFileSync(path.join(root, file))) }));
const save = (name, value) => writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const before = snapshot(); save('source-before.json', before);
const transpiled = [];
function emit(original, outputName, sourceOverride) {
  const source = sourceOverride ?? readFileSync(path.join(root, original), 'utf8');
  let emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  // Only the two genuine local ESM links need an extension for Node execution.
  emitted = emitted.replace(/(['"])\.\/(detail-coast-types|detail-coast-field)\1/g, '$1./$2.mjs$1');
  const output = `runtime/${outputName}`; writeFileSync(path.join(out, output), emitted, { flag: 'wx' });
  transpiled.push({ original, output, sourceSha256: hash(source), emittedSha256: hash(emitted) });
}
emit(files[0], 'detail-shape-height.mjs'); emit(files[1], 'detail-coast-field.mjs');
emit(files[2], 'detail-coast-types.mjs'); emit(files[3], 'detail-terrain-pages.mjs');
const shader = readFileSync(path.join(root, files[4]), 'utf8');
const ast = ts.createSourceFile('detail-terrain-shader.ts', shader, ts.ScriptTarget.Latest, true);
const names = ['displayLight', 'SideLights', 'lightCrossing', 'detailTerrainNodeLights'];
const selected = names.map(name => {
  const statement = ast.statements.find(node => (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name));
  if (!statement) throw new Error(`Actual shader CPU declaration missing: ${name}`);
  return { name, start: statement.getStart(ast), end: statement.end, source: shader.slice(statement.getStart(ast), statement.end) };
});
save('shader-cpu-extraction.json', selected.map(({ source, ...location }) => ({ ...location, sha256: hash(source) })));
const oracleSource = selected.map(item => item.source).join('\n');
writeFileSync(path.join(out, 'runtime/shader-cpu-oracle.ts.txt'), oracleSource, { flag: 'wx' });
emit(files[4], 'shader-cpu-oracle.mjs', oracleSource); save('runtime-provenance.json', transpiled);

const { createDetailShapeBaseSampler, DETAIL_SHAPE_BASE_SAMPLER } = await import(pathToFileURL(path.join(out, 'runtime/detail-shape-height.mjs')).href);
const { sampleDetailCoastNode } = await import(pathToFileURL(path.join(out, 'runtime/detail-coast-field.mjs')).href);
const { detailCoastKey, detailCoastNodeOwner } = await import(pathToFileURL(path.join(out, 'runtime/detail-coast-types.mjs')).href);
const { packDetailTerrainNodeRange, readDetailTerrainSample } = await import(pathToFileURL(path.join(out, 'runtime/detail-terrain-pages.mjs')).href);
const { detailTerrainNodeLights } = await import(pathToFileURL(path.join(out, 'runtime/shader-cpu-oracle.mjs')).href);
const size = 256, stepWorld = 4096 / size, centers = new Int32Array(size ** 2 * 2), heights = new Int32Array(size ** 2);
const plane = (x, y) => 512 + x + y / 2;
for (let id = 0; id < size ** 2; id++) {
  // True area centroid of each regular shared quad; regular geometry is a
  // valid format layout, not a claim about the screenshot's jittered world.
  const x = (id % size + .5) * stepWorld, y = (Math.floor(id / size) + .5) * stepWorld;
  centers.set([x * 256, y * 256], id * 2); heights[id] = plane(x, y);
  if (!Number.isInteger(plane(x, y))) throw new Error('Coarse plane quantization would confound the probe.');
}
function saveInt32(name, values) {
  const bytes = Buffer.alloc(values.length * 4); for (let i = 0; i < values.length; i++) bytes.writeInt32LE(values[i], i * 4);
  writeFileSync(path.join(out, name), bytes, { flag: 'wx' }); return { path: name, sha256: hash(bytes), bytes: bytes.length, encoding: 'int32-little-endian' };
}
const inputs = [saveInt32('centers-q8.bin', centers), saveInt32('plane-elevations-meters.bin', heights)];
const sampler = createDetailShapeBaseSampler(size, centers.buffer, heights.buffer);
const flatHeights = new Int32Array(size ** 2).fill(2048), flat = createDetailShapeBaseSampler(size, centers.buffer, flatHeights.buffer);
const tiles = new Map();
// Only four implicit land owners around the tiny 64x64-world probe and halo.
for (const by of [15, 16]) for (const bx of [15, 16]) tiles.set(detailCoastKey(bx, by), { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'land', bx, by });
const field = { tiles, sampleBaseElevation: sampler }, nodes = new Map(), packedRows = [];
for (let y = 1006; y <= 1074; y += 2) {
  const first = y / 2 * 2049 + 1006 / 2, chunk = packDetailTerrainNodeRange(field, first, 35);
  packedRows.push({ startNode: first, nodeCount: 35, offset: packedRows.length * 35 * 4 });
  for (let offset = 0; offset < 35; offset++) {
    const x = 1006 + offset * 2, packed = readDetailTerrainSample(chunk.bytes, offset * 4), direct = sampleDetailCoastNode(field, x / 2, y / 2);
    if (packed.heightMeters !== direct.heightMeters || packed.coverageQ !== 32767 || direct.coverageQ !== 32767) throw new Error('Real node packing or inland premise failed.');
    nodes.set(`${x},${y}`, { xQ: x * 256, yQ: y * 256, ...packed });
  }
  writeFileSync(path.join(out, `row-${y}.bin`), chunk.bytes, { flag: 'wx' });
}
const at = (x, y) => { const value = nodes.get(`${x},${y}`); if (!value) throw new Error('Probe exceeded its real fine-node halo.'); return value; };
const truthNode = (x, y) => ({ xQ: x * 256, yQ: y * 256, coverageQ: 32767, heightMeters: plane(x, y) });
const grid = [], directProfiles = [];
for (let y = 1008; y <= 1072; y += 2) for (let x = 1008; x <= 1072; x += 2) {
  const expected = plane(x, y); if (!Number.isInteger(expected)) throw new Error('Fine true plane rounding is not zero.');
  const raw = sampler(x * 256, y * 256), center = at(x, y), w = at(x - 2, y), e = at(x + 2, y), n = at(x, y - 2), s = at(x, y + 2);
  const gx = (e.heightMeters - w.heightMeters) / 4, gy = (s.heightMeters - n.heightMeters) / 4;
  const rawGx = (sampler(x * 256 + 1, y * 256) - sampler(x * 256 - 1, y * 256)) * 128;
  const rawGy = (sampler(x * 256, y * 256 + 1) - sampler(x * 256, y * 256 - 1)) * 128;
  const light = detailTerrainNodeLights(center, w, e, n, s)[0];
  const expectedLight = detailTerrainNodeLights(truthNode(x, y), truthNode(x - 2, y), truthNode(x + 2, y), truthNode(x, y - 2), truthNode(x, y + 2))[0];
  const owner = detailCoastNodeOwner(x / 2, y / 2);
  grid.push({ xWorld: x, yWorld: y, ownerKey: owner.key, ownerSlot: owner.slot, phaseXWorld: x % 16, phaseYWorld: y % 16,
    trueHeight: expected, rawHeight: raw, rawHeightError: raw - expected, packedHeight: center.heightMeters, packedHeightError: center.heightMeters - expected,
    rawDerivativeX: rawGx, rawDerivativeY: rawGy, fineCentralSlopeX: gx, fineCentralSlopeY: gy, landLight: light, trueLandLight: expectedLight,
    constantHeightError: flat(x * 256, y * 256) - 2048 });
}
for (let x = 1008; x <= 1072; x += .5) {
  const y = 1016, value = sampler(x * 256, y * 256);
  directProfiles.push({ xWorld: x, yWorld: y, value, error: value - plane(x, y), derivativeX: (sampler(x * 256 + 1, y * 256) - sampler(x * 256 - 1, y * 256)) * 128 });
}
const range = values => ({ min: Math.min(...values), max: Math.max(...values), span: Math.max(...values) - Math.min(...values),
  maxAbs: Math.max(...values.map(Math.abs)), rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) });
const lookup = new Map(grid.map(point => [`${point.xWorld},${point.yWorld}`, point]));
const metrics = ['rawHeightError', 'packedHeightError', 'rawDerivativeX', 'rawDerivativeY', 'fineCentralSlopeX', 'fineCentralSlopeY', 'landLight'];
const period = {};
for (const axis of ['x', 'y']) {
  const pairs = grid.flatMap(point => { const next = lookup.get(`${point.xWorld + (axis === 'x' ? 16 : 0)},${point.yWorld + (axis === 'y' ? 16 : 0)}`); return next ? [[point, next]] : []; });
  period[axis] = { periodWorld: 16, pairCount: pairs.length, maxAbsoluteDifferences: Object.fromEntries(metrics.map(key => [key, Math.max(...pairs.map(([a, b]) => Math.abs(a[key] - b[key])))])) };
}
const centroids = grid.filter(point => point.phaseXWorld === 8 && point.phaseYWorld === 8);
const result = { scope: 'Bounded synthetic mathematical property probe; not screenshot diagnosis, natural-world acceptance, GPU execution or performance measurement.',
  sampler: DETAIL_SHAPE_BASE_SAMPLER, fixture: { size, stepWorld, coordinateScale: 256, fineStepWorld: 2, plane: '512 + xWorld + 0.5*yWorld', trueGradient: [1, .5],
    layout: 'Exact area centroids of valid regular shared quads; not captured screenshot geometry', inputHeightQuantizationError: 0, fineTruthRoundingError: 0,
    worldGenerated: false, inputBytes: centers.byteLength + heights.byteLength, grid: { xMin: 1008, xMax: 1072, yMin: 1008, yMax: 1072, rows: 33, columns: 33 },
    packedNodeCount: nodes.size, uniformLandTiles: tiles.size, allSampledNeighboursLand: true, finiteDifferenceDeltaWorld: 1 / 256 },
  inputs, packedRows, stats: Object.fromEntries([...metrics, 'constantHeightError'].map(key => [key, range(grid.map(point => point[key]))])),
  centroidChecks: { count: centroids.length, maxHeightError: Math.max(...centroids.map(point => Math.abs(point.rawHeightError))),
    maxNumericDerivativeX: Math.max(...centroids.map(point => Math.abs(point.rawDerivativeX))), maxNumericDerivativeY: Math.max(...centroids.map(point => Math.abs(point.rawDerivativeY))) },
  period, trueLandLight: grid[0].trueLandLight, finite: grid.every(point => Object.values(point).every(value => typeof value !== 'number' || Number.isFinite(value))),
  cpuOracle: 'Exact production detailTerrainNodeLights and helpers AST-extracted with source offsets/hashes; GLSL was only read, not executed.',
  visualCauseConfirmed: false, performanceClaimed: false };
save('fine-node-grid.raw.json', grid); save('continuous-x-profile.raw.json', directProfiles); save('inputs.json', result.fixture);
const after = snapshot(); save('source-after.json', after); result.sourcesStable = JSON.stringify(before) === JSON.stringify(after);
if (!result.sourcesStable || !result.finite || result.centroidChecks.maxHeightError !== 0) throw new Error('Diagnostic source/premise integrity failed.');
save('result.json', result); console.log(JSON.stringify({ sampler: result.sampler, fixture: result.fixture, stats: result.stats, centroidChecks: result.centroidChecks, period: result.period, trueLandLight: result.trueLandLight, sourcesStable: result.sourcesStable }, null, 2));
