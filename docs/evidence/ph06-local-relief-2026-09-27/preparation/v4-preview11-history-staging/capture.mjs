import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const stage = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(stage, '../../..');
const evidence = 'evidence/preview11';
const targetArchive = 'docs/evidence/ph06-preview11-generator-history-2026-09-27';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const load = file => fs.readFileSync(path.join(root, file));
const save = (file, bytes) => { const target = path.join(stage, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); };
const json = (file, value) => save(file, `${JSON.stringify(value, null, 2)}\n`);
if (fs.existsSync(path.join(stage, evidence))) throw new Error('Existing immutable preview11 capture; refusing overwrite');
const buildBytes = load('dist/build.json'), build = JSON.parse(buildBytes.toString());
const expectedBuild = 'eaf3025970c2d241a285ecec9f3ab1c1427176410f276262a03e4db6a64222e7';
if (build.version !== '0.5.0-preview.11' || build.commit !== 'cc3dbf64e545328d2d4ed852e20128668fd2be4a' || hash(buildBytes) !== expectedBuild) throw new Error('Expected actual verified preview11 build');
const toolBytes = load('scripts/generator-fingerprint.ts');
const toolJs = ts.transpileModule(toolBytes.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace("from 'typescript'", `from ${JSON.stringify(pathToFileURL(path.join(root, 'node_modules/typescript/lib/typescript.js')).href)}`);
const tool = await import(`data:text/javascript;base64,${Buffer.from(toolJs).toString('base64')}`);
const entries = [
  ['macroGenerator', 'macro-landmass', 'fingerprintMacroGenerator'],
  ['landformGenerator', 'landforms', 'fingerprintLandformGenerator'],
  ['islandGenerator', 'island-chains', 'fingerprintIslandGenerator'],
  ['coastGenerator', 'coast-smoothing', 'fingerprintCoastGenerator'],
  ['shapeGenerator', 'shape-landmass', 'fingerprintShapeGenerator'],
  ['oceanGenerator', 'ocean-floor', 'fingerprintOceanGenerator'],
  ['detailShapeGenerator', 'shape-detail-landmass', 'fingerprintDetailShapeGenerator'],
  ['addDetailGenerator', 'add-detail-landmass', 'fingerprintAddDetailGenerator'],
  ['naturalDetailGenerator', 'shape-detail-landmass@2', 'fingerprintNaturalDetailGenerator'],
  ['addNaturalDetailGenerator', 'add-detail-landmass@2', 'fingerprintAddNaturalDetailGenerator'],
];
const sources = new Map();
const sourceRead = file => { if (!sources.has(file)) sources.set(file, load(file)); return sources.get(file).toString(); };
const closures = entries.map(([key, historyKey, fn]) => {
  const actual = tool[fn](sourceRead);
  if (JSON.stringify(actual) !== JSON.stringify(build[key])) throw new Error(`Actual source closure differs from real build: ${key}`);
  return { key, historyKey, ...actual, matchedBuild: true };
});
const priorBytes = load('docs/evidence/ph06-natural-repair-2026-09-27/raw/root/preflight-repair/build.json');
const prior = JSON.parse(priorBytes.toString());
if (prior.version !== '0.5.0-preview.10' || build.engineFingerprint !== prior.engineFingerprint) throw new Error('Preview10 engine identity mismatch');
for (const [key] of entries) if (JSON.stringify(build[key]) !== JSON.stringify(prior[key])) throw new Error(`Unexpected generator identity change from preview10: ${key}`);
const dist = [];
const walkDist = dir => { for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
  const file = `${dir}/${item.name}`;
  if (item.isSymbolicLink()) throw new Error(`Unexpected dist symlink: ${file}`);
  if (item.isDirectory()) walkDist(file);
  else if (item.isFile()) { const bytes = load(file); dist.push({ path: file, bytes: bytes.length, sha256: hash(bytes) }); }
} };
walkDist('dist'); dist.sort((a, b) => a.path.localeCompare(b.path));
const checked = JSON.parse(load('docs/evidence/ph06-continuous-light-2026-09-27/verification.json').toString());
const verifiedDist = checked.rootRuns.find(row => row.name === checked.latestRoot).v.dist;
if (dist.length !== 25 || dist.length !== verifiedDist.length) throw new Error('Dist file count differs from tested build');
for (const item of dist) if (verifiedDist.find(row => row.path === item.path)?.sha256 !== item.sha256) throw new Error(`Dist differs from verified source: ${item.path}`);
for (const [file, bytes] of sources) if (!load(file).equals(bytes)) throw new Error(`Source changed during capture: ${file}`);
if (!load('dist/build.json').equals(buildBytes) || !load('scripts/generator-fingerprint.ts').equals(toolBytes)) throw new Error('Build/tool changed during capture');
const archivedSources = [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: hash(bytes) }));
if (archivedSources.length !== 37) throw new Error(`Unexpected actual closure source count: ${archivedSources.length}`);
const baselineFile = 'src/world/generation-history.ts';
const baselineBytes = sources.get(baselineFile);
const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--porcelain=v1', '--', ...sources.keys()], { cwd: root, encoding: 'utf8' });
const productStatus = execFileSync('git', ['status', '--porcelain=v1', '--', 'src', 'package.json'], { cwd: root, encoding: 'utf8' });
const closureSourceMatchesHead = [...sources].every(([file, bytes]) => {
  const committed = execFileSync('git', ['show', `${actualHead}:${file}`], { cwd: root });
  return committed.toString().replace(/\r\n/g, '\n') === bytes.toString().replace(/\r\n/g, '\n');
});
save(`${evidence}/build.json`, buildBytes);
save(`${evidence}/frozen-tool/scripts/generator-fingerprint.ts`, toolBytes);
for (const [file, bytes] of sources) save(`${evidence}/frozen-source/${file}`, bytes);
const frozenRead = file => fs.readFileSync(path.join(stage, evidence, 'frozen-source', file), 'utf8');
for (const [key, , fn] of entries) if (JSON.stringify(tool[fn](frozenRead)) !== JSON.stringify(build[key])) throw new Error(`Archived closure mismatch: ${key}`);
const provenance = {
  capturedAt: new Date().toISOString(), version: build.version, actualHead, baseCommit: build.commit,
  buildCommitMetadata: build.commit, sourceIsHead: productStatus.length === 0, closureSourceMatchesHead,
  sourceStatus: 'Actual preview11 product build retains preview10 generator/engine identities. Original closure bytes are frozen. Build commit metadata alone is not the complete product source identity.',
  buildSha256: hash(buildBytes), engineFingerprint: build.engineFingerprint,
  sourceSnapshotSha256: hash(Buffer.from(JSON.stringify(archivedSources))),
  sourceSnapshotHashDefinition: 'SHA256 of UTF8 JSON.stringify(archivedSources), with rows sorted by file, each row {file,bytes,sha256}.',
  fingerprintTool: { file: 'scripts/generator-fingerprint.ts', bytes: toolBytes.length, sha256: hash(toolBytes), archivedPath: 'frozen-tool/scripts/generator-fingerprint.ts' },
  priorPreview10: { path: 'docs/evidence/ph06-natural-repair-2026-09-27/raw/root/preflight-repair/build.json', sha256: hash(priorBytes), allTenGeneratorsAndEngineEqual: true },
  closures, archivedSources, sourceCount: archivedSources.length, closureCount: closures.length,
  capturedSourceGitStatus: status, capturedProductGitStatus: productStatus,
  sourceStableDuringCapture: true, archivedClosuresRecomputed: true,
  dist: { files: dist, count: dist.length, matchedVerifiedPreview11: true, payloadCopied: false },
  scope: 'Actual build provenance only; no tests, lint, build, generation, browser, performance, visual or physical-device acceptance executed.',
};
json(`${evidence}/provenance.json`, provenance);
json('baseline-manifest.json', { capturedAt: provenance.capturedAt, actualHead, baseCommit: build.commit, sourceIsHead: provenance.sourceIsHead, files: [{ path: baselineFile, sha256: hash(baselineBytes) }], newTarget: 'src/world/detail-preview11-history.test.ts', newTargetAbsent: !fs.existsSync(path.join(root, 'src/world/detail-preview11-history.test.ts')) });
let history = baselineBytes.toString();
for (const [key, historyKey] of entries) {
  const fingerprint = build[key].sha256;
  const marker = `  ${historyKey === 'landforms' ? historyKey : `'${historyKey}'`}: Object.freeze([`;
  const line = history.split('\n').find(value => value.includes(marker));
  if (line?.includes(`'${fingerprint}'`)) continue;
  if (!line) throw new Error(`Expected existing history namespace: ${historyKey}`);
  history = history.replace(marker, `${marker}'${fingerprint}', `);
}
history = `/** Preview.11: all ten actual build identities recomputed from 37 frozen source files.\n * Same generator/engine identities as preview.10; separate actual preview.11 build evidence:\n * ${targetArchive}/.\n * Build base ${build.commit}; original source bytes, not base metadata alone, identify it.\n * Storage only. Keep v1 id keys and natural id@2 keys isolated; never execute old recipes. */\n${history}`;
save(baselineFile, history);
const inventory = [
  { path: 'build.json', bytes: buildBytes.length, sha256: hash(buildBytes) },
  { path: 'frozen-tool/scripts/generator-fingerprint.ts', bytes: toolBytes.length, sha256: hash(toolBytes) },
  ...archivedSources.map(({ file, ...record }) => ({ path: `frozen-source/${file}`, ...record })),
  { path: 'provenance.json', bytes: fs.statSync(path.join(stage, evidence, 'provenance.json')).size, sha256: hash(fs.readFileSync(path.join(stage, evidence, 'provenance.json'))) },
];
json(`${evidence}/inventory.json`, { schema: 1, files: inventory, excludesSelf: true });
const result = { capturedAt: provenance.capturedAt, closures: closures.length, sourceFiles: sources.size, buildSha256: provenance.buildSha256, sourceSnapshotSha256: provenance.sourceSnapshotSha256, allClosuresMatched: true, allTenGeneratorsAndEngineEqualPreview10: true, closureSourceMatchesHead, sourceIsHead: provenance.sourceIsHead, distCount: dist.length, productionModified: false, checksRun: [] };
json('capture-result.json', result);
console.log(JSON.stringify(result, null, 2));
