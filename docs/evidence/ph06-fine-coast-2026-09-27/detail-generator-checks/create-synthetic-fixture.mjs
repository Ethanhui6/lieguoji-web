// Evidence fixture only. This is not an Atlas save or a playable-world acceptance.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const evidence = resolve('.autopilot/ph06/detail-generator-checks');
const target = resolve(evidence, 'synthetic');
await mkdir(target, { recursive: true });
const bundled = await build({
  stdin: { contents: "export {generateDetailShape} from './src/world/generation/detail-shape.ts'; export {encodeDetailCoastTile} from './src/world/detail-coast-codec.ts'; export {pickDetailCoastSurface} from './src/world/detail-coast-geometry.ts';", resolveDir: process.cwd(), loader: 'ts' },
  outfile: resolve(target, 'kernel-bundle.mjs'), bundle: true, platform: 'node', format: 'esm', metafile: true,
});
await writeFile(resolve(target, 'bundle-metafile.json'), JSON.stringify(bundled.metafile, null, 2));
const { generateDetailShape, encodeDetailCoastTile, pickDetailCoastSurface } = await import(pathToFileURL(resolve(target, 'kernel-bundle.mjs')).href);
const size = 128, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size);
for (let id = 0; id < heights.length; id++) {
  centers[id * 2] = (id % size * 32 + 16) * 256 + (id % 3 - 1) * 64;
  centers[id * 2 + 1] = (Math.floor(id / size) * 32 + 16) * 256 + (id % 5 - 2) * 32;
  heights[id] = -2000 - id % 7;
}
const recipe = {
  seed: 'natural-coast-contract',
  pointsQ: [[1200, 1200], [1268, 1200], [1268, 1248], [1280, 1248], [1280, 1200], [1380, 1200], [1380, 1360], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })),
  coastRoughnessWorld: 18, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 1, islandsPerChain: 4,
};
const base = { format: 'lieguoji-empty-detail-shape-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
const phases = new Map();
const generated = await generateDetailShape({ base, recipe }, { batchWork: 512, yieldControl: async () => {}, onProgress: (phase, completed, total) => phases.set(phase, { completed, total }) });
const files = [];
async function save(name, contents) {
  const bytes = contents instanceof ArrayBuffer ? new Uint8Array(contents) : contents;
  await writeFile(resolve(target, name), bytes);
  files.push({ name, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await save('input-centers-q8.int32-native.bin', centers.buffer);
await save('input-coarse-elevations.int32-native.bin', heights.buffer);
await save('output-coarse-elevations.int32-native.bin', generated.coarseElevations.buffer);
await save('diagnostic-target-coast.uint32-native.bin', generated.targetCoast);
const tileRefs = [];
for (const [key, tile] of generated.detailCoast) {
  const name = `coast-${tile.bx}-${tile.by}.bin`;
  await save(name, encodeDetailCoastTile(tile));
  tileRefs.push({ key, bx: tile.bx, by: tile.by, mode: tile.mode, file: name });
}
const field = { tiles: generated.detailCoast, sampleBaseElevation: generated.sampleBaseElevation };
const witnesses = [
  { name: 'interior land', x: 1240, y: 1280 },
  { name: 'drawn 12 world wide bay', x: 1274, y: 1220 },
  { name: 'outer sea', x: 1000, y: 1000 },
].map(point => ({ ...point, pick: pickDetailCoastSurface(field, point) }));
const sourceHashes = [];
for (const file of Object.keys(bundled.metafile.inputs).filter(file => file !== '<stdin>')) {
  sourceHashes.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
const fixture = {
  format: 'lieguoji-synthetic-generator-evidence', version: 1,
  scope: 'Synthetic kernel output only; not an Atlas document, UI save, rendered screenshot, performance acceptance, or playable-world acceptance.',
  arrayByteOrder: 'native little-endian on this Windows host',
  source: 'same synthetic outline as detail-shape.test.ts; explicitly generated once for later renderer comparison',
  size, worldSize: 4096, coordinateScale: 256, stepWorld: 2,
  baseSampler: 'centroid-compact-idw-v1', recipe, summary: generated.summary,
  areaUnit: 'twice Q8 squared; divide by 131072 for world squared',
  tiles: tileRefs, files, sourceHashes, witnesses, phases: Object.fromEntries(phases),
  cameraSuggestion: { centerWorld: { x: 1290, y: 1280 }, visibleWorldWidth: 460, detailBay: { x: 1274, y: 1220, visibleWorldWidth: 80 } },
  limitations: ['First empty contour only; no additive union.', 'islandsPlaced counts accepted ellipse primitives, not independently verified connected islands.', 'No browser, GPU, ordinary-entry persistence, or real-device acceptance.'],
};
await writeFile(resolve(target, 'fixture.json'), JSON.stringify(fixture, null, 2));
console.log(JSON.stringify({ scope: fixture.scope, summary: generated.summary, witnesses, fileCount: files.length, tileCount: tileRefs.length }, null, 2));
