import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const beforeCommit = 'c88a667';
// Read only this project's already committed predecessor, not an installation.
const beforeCode = execFileSync('git', ['show', `${beforeCommit}:src/fms/naturalize.ts`], { cwd: root, encoding: 'utf8' })
  .replace("'../world/generation/seed'", "'/src/world/generation/seed.ts'")
  .replace("'./model'", "'/src/fms/model.ts'");
const beforeJavaScript = ts.transpileModule(beforeCode, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const server = await createServer({ root, cacheDir: '.autopilot/fms-coast-vite-cache', server: { middlewareMode: true, hmr: false },
  plugins: [{ name: 'scoped-coast-before-reference', resolveId(id) { if (id === 'coast-before-reference') return '\0coast-before-reference'; },
    load(id) { if (id === '\0coast-before-reference') return beforeJavaScript; } }] });
try {
  const { naturalizeFmsTerrain: oldNaturalize } = await server.ssrLoadModule('coast-before-reference');
  const { naturalizeFmsTerrain } = await server.ssrLoadModule('/src/fms/naturalize.ts');
  const { coastFixture, compareLinearCoasts } = await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const { createFmsDocument } = await server.ssrLoadModule('/src/fms/model.ts');
  const cases = [];
  for (const name of ['island', 'neck', 'asymmetric', 'actual-mesh']) {
    const doc = name === 'actual-mesh' ? await createFmsDocument({ yieldTask: async () => {} }) : coastFixture(name);
    if (name === 'actual-mesh') doc.points.forEach(([x, y], id) => {
      if (x > 220 && x < 1300 && y > 200 && y < 1300 && !(x < 650 && y > 600 && y < 800)) doc.elevations[id] = 45;
    });
    const options = { seed: 42, strength: 1 }, sectionX = name === 'island' ? 40 : name === 'actual-mesh' ? 750 : 200;
    const before = oldNaturalize(doc, options), after = naturalizeFmsTerrain(doc, options);
    const measurement = compareLinearCoasts(doc, after.elevations, sectionX);
    if (measurement.maxCrossingDisplacement !== 0 || measurement.absoluteAreaChange !== 0 || measurement.missingCrossings !== 0
      || measurement.crossingCount !== measurement.candidateCrossingCount
      || JSON.stringify(measurement.sectionBefore) !== JSON.stringify(measurement.sectionAfter)) throw new Error(`Coast contract failed: ${name}`);
    cases.push({ name, options, points: doc.points.length, sectionX, oldAlgorithm: before.stats.algorithm, newAlgorithm: after.stats.algorithm,
      old: compareLinearCoasts(doc, before.elevations, sectionX), current: measurement, changedInteriorVertices: after.stats.changedCells });
  }
  const sourceFiles = ['src/fms/coastline.ts', 'src/fms/naturalize.ts', 'src/fms/terrain-client.ts', 'src/fms/terrain-preview.ts', 'src/fms/renderer.ts', 'tests/helpers/fms-coast-metrics.ts'];
  const sourceHashes = {};
  for (const file of sourceFiles) sourceHashes[file] = createHash('sha256').update((await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
  const output = { recordedAt: new Date().toISOString(), beforeCommit, contract: 'fixed-linear-sea-contour-v1',
    allowedGeometricDisplacement: 0, method: 'Independent h=20 triangle clipping and edge crossings using renderer float32 positions; no coast-lock helper in measurement',
    excludes: ['pixel-color equality', 'fixed shading or rivers', 'original FMS equivalence', 'physical iPhone or user visual acceptance'], sourceHashes, cases };
  await fs.writeFile(new URL('./measurements.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(cases.map(c => ({ name: c.name, crossings: c.current.crossingCount,
    oldMaxDisplacement: c.old.maxCrossingDisplacement, currentMaxDisplacement: c.current.maxCrossingDisplacement,
    oldAreaRatio: c.old.landAreaAfter / c.old.landAreaBefore, currentAreaRatio: c.current.landAreaAfter / c.current.landAreaBefore,
    changedInteriorVertices: c.changedInteriorVertices })), null, 2));
} finally { await server.close(); }
