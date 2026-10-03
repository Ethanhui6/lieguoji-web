import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(root);
const batch = ".autopilot/ph06/mountain-area-checks";
const unitFiles = [
  "src/world/generation/terrain-gradient-noise.test.ts",
  "src/world/generation/terrain-massif.test.ts",
  "src/world/generation-preview22-history.test.ts",
  "src/world/hydrology-reader-owned.test.ts",
  "src/world/generation/detail-orography-density.test.ts",
  "src/world/generation/detail-natural-ranges.test.ts",
  "src/world/generation/detail-natural-ranges-writer.test.ts",
  "src/world/generation-preview21-history.test.ts",
  "src/world/generation/regional-coast-plan.test.ts",
  "src/world/generation/regional-coast-field.test.ts",
  "src/world/regional-coast-storage.test.ts",
  "src/world/generation-preview20-history.test.ts",
  "src/world/generation/detail-fine-world-relief.test.ts",
  "src/world/generation-preview18-history.test.ts",
  "src/world/generation/detail-curved-ridge.test.ts",
  "src/world/generation/detail-orography.test.ts",
  "src/world/generation/detail-natural-writer.test.ts",
  "src/world/generation/detail-local-background.test.ts",
  "src/world/generation/detail-local-relief.test.ts",
  "src/world/detail-local-relief-session.test.ts",
  "src/world/detail-coast-locks.test.ts",
  "src/world/generation/detail-natural-coast-plan.test.ts",
  "src/world/generation/detail-shape-natural.test.ts",
  "src/world/generation/detail-natural-visual-repair.test.ts",
  "src/world/detail-natural-integration.test.ts",
  "src/world/detail-natural-history.test.ts",
  "src/world/detail-preview16-history.test.ts",
  "src/world/detail-preview17-history.test.ts",
  "src/world/generation/fingerprint.test.ts",
  "src/world/generation/detail-shape-add.test.ts",
  "src/world/detail-add-integration.test.ts",
  "src/world/detail-add-history.test.ts"
];
const knownCaseCounts = {
  "src/world/generation/terrain-gradient-noise.test.ts": 2,
  "src/world/generation/terrain-massif.test.ts": 4,
  "src/world/generation-preview22-history.test.ts": 5,
  "src/world/hydrology-reader-owned.test.ts": 4,
  "src/world/generation/detail-orography-density.test.ts": 1,
  "src/world/generation/detail-natural-ranges.test.ts": 10,
  "src/world/generation/detail-natural-ranges-writer.test.ts": 1,
  "src/world/generation-preview21-history.test.ts": 5,
  "src/world/generation/regional-coast-plan.test.ts": 3,
  "src/world/generation/regional-coast-field.test.ts": 3,
  "src/world/regional-coast-storage.test.ts": 1,
  "src/world/generation-preview20-history.test.ts": 5,
  "src/world/generation/detail-fine-world-relief.test.ts": 7,
  "src/world/generation-preview18-history.test.ts": 5,
  "src/world/generation/detail-curved-ridge.test.ts": 10,
  "src/world/generation/detail-local-background.test.ts": 6,
  "src/world/generation/detail-local-relief.test.ts": 10,
  "src/world/detail-local-relief-session.test.ts": 3,
  "src/world/detail-coast-locks.test.ts": 16,
  "src/world/generation/detail-natural-coast-plan.test.ts": 8,
  "src/world/generation/detail-shape-natural.test.ts": 13,
  "src/world/generation/detail-natural-visual-repair.test.ts": 5,
  "src/world/detail-preview16-history.test.ts": 5,
  "src/world/detail-preview17-history.test.ts": 5,
  "src/world/generation/detail-natural-writer.test.ts": 6,
  "src/world/generation/detail-orography.test.ts": 16
};

async function runBatch() {
  const label = process.argv[2] ?? 'first';
  if (process.argv.length > 3 || !/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid round label');
  const directory = `${batch}/${label}`, history = 'docs/evidence/ph06-preview22-generator-history-2026-09-28';
  if (fs.existsSync(directory)) throw new Error('Round exists; never overwrite previous failure/evidence');
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source/dist symlink: ${dir}/${entry.name}`);
    const file = `${dir}/${entry.name}`; return entry.isDirectory() ? walk(file) : [{ path: file, sha256: hash(file) }];
  });
  const snapshot = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(file => ({ path: file, sha256: hash(file) }))];
  const baseline = read(`${batch}/baseline-build.json`);
  if (baseline.version !== '0.5.0-preview.22' || hash(`${batch}/baseline-build.json`) !== '517215bfffe6125531d90b8540ad53f358547c3739ff63f3ca64a4c60f410be2' || hash(`${history}/build.json`) !== hash(`${batch}/baseline-build.json`)) throw new Error('Actual frozen preview22 baseline not bound');
  if (read('package.json').version !== '0.5.0-preview.23') throw new Error('Expected promoted preview23');
  for (const file of unitFiles) if (!fs.existsSync(file)) throw new Error(`Selected test missing: ${file}`);
  fs.mkdirSync(directory);
  const save = (file, value) => fs.writeFileSync(`${directory}/${file}`, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  const before = snapshot(); save('source-before.json', before);
  const previous = 'docs/evidence/ph06-natural-range-sea-2026-09-28';
  const rendererRows = read(`${previous}/unified/repair-1/source-after.json`).filter(row =>
    /^src\/world\/(?:terrain-|ocean-|detail-terrain-|renderer[.-]|test-fixtures\/preview21-terrain-material)/.test(row.path));
  const reusedRenderer = rendererRows.map(row => ({ ...row, currentSha256: hash(row.path), unchanged: hash(row.path) === row.sha256 }));
  const reusedTests = ['terrain-material', 'terrain-mesh', 'ocean-material', 'ocean-material-cache', 'detail-terrain-shader',
    'detail-terrain-light', 'detail-terrain-pages', 'detail-terrain-backend', 'renderer', 'renderer-detail-reuse'];
  if (reusedTests.some(name => !reusedRenderer.some(row => row.path === `src/world/${name}.test.ts`))
    || reusedRenderer.some(row => !row.unchanged)) throw Error('Changed/missing renderer material sources cannot reuse preview22 evidence');
  save('reused-renderer-evidence.json', { source: `${previous}/unified/repair-1/verification.json`,
    sourceSha256: hash(`${previous}/unified/repair-1/verification.json`),
    gpuSource: `${previous}/gpu`, unitAssertionsReused: 140,
    scope: 'Exact unchanged renderer/material sources and tests only. New height data needs its own actual browser observation; no new GPU, natural visual or device pass is claimed.',
    sourceChecks: reusedRenderer });
  fs.copyFileSync(`${batch}/baseline-build.json`, `${directory}/prior-build.json`, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync('dist/build.json', `${directory}/pre-run-build.json`, fs.constants.COPYFILE_EXCL);
  save('scope.json', { unitFiles, knownCaseCounts, numericEvidenceLabel: `mountain-area-${label}`,
    scope: 'Physical area mountains, deterministic generation and old unflagged behavior, coast/locks/additive preservation, actual preview22 storage-only history, private reader import integration. All eleven closures and engine recomputed. Renderer/GPU unchanged and separately reused; native browser and subjective image review remain separate.',
    inheritedNotRerun: 'Unchanged preview22 renderer/material 140 unit cases and GPU evidence, plus the prior PH07 94-case receiver batch except the newly integrated reader. Source hashes must be compared before reusing this evidence.', cloudWrites: false });
  const commands = [
    ['plan', ['scripts/check-plan.mjs']], ['lint', ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'scripts']],
    ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
    ['unit', ['node_modules/vitest/vitest.mjs', 'run', ...unitFiles, '--reporter=json', `--outputFile=${directory}/unit.json`]],
    ['build', ['node_modules/vite/bin/vite.js', 'build']], ['dist-audit', ['scripts/check-dist.mjs']],
  ];
  const results = [];
  for (const [name, args] of commands) {
    const startedAt = new Date().toISOString(), start = performance.now();
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024,
      env: { ...process.env, ...(name === 'unit' ? { NATURAL_VISUAL_EVIDENCE_LABEL: `mountain-area-${label}` } : {}) } });
    fs.writeFileSync(`${directory}/${name}.log`, (result.stdout ?? '') + (result.stderr ?? ''), { flag: 'wx' });
    const row = { name, args, startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, exitCode: result.status, signal: result.signal, error: result.error?.message };
    results.push(row); console.log(JSON.stringify(row)); if (result.status !== 0) break;
  }
  const built = results.some(row => row.name === 'dist-audit' && row.exitCode === 0), build = built ? read('dist/build.json') : null;
  if (build) fs.copyFileSync('dist/build.json', `${directory}/build.json`, fs.constants.COPYFILE_EXCL);
  let unit = { available: false, passed: false };
  if (fs.existsSync(`${directory}/unit.json`)) {
    const raw = read(`${directory}/unit.json`), assertions = (raw.testResults ?? []).flatMap(file => file.assertionResults ?? []);
    const observed = (raw.testResults ?? []).map(file => ({ path: path.relative(root, file.name).replaceAll('\\', '/'), assertions: file.assertionResults?.length ?? 0 }));
    const scopeMatches = same(observed.map(file => file.path).sort(), [...unitFiles].sort());
    const knownCountsMatch = Object.entries(knownCaseCounts).every(([file, count]) => observed.find(row => row.path === file)?.assertions === count);
    unit = { available: true, files: observed, scopeMatches, knownCountsMatch, total: raw.numTotalTests, passedAssertions: raw.numPassedTests, failedAssertions: raw.numFailedTests, pendingAssertions: raw.numPendingTests,
      passed: scopeMatches && knownCountsMatch && raw.success === true && raw.numTotalTests > 0 && assertions.length === raw.numTotalTests && raw.numPassedTests === raw.numTotalTests && raw.numFailedTests === 0 && raw.numPendingTests === 0 && raw.numFailedTestSuites === 0 && assertions.every(row => row.status === 'passed') };
  }
  // Recompute all actual and frozen closures, then reverse only the history
  // source to classify the remaining change. No assumed changed-closure count.
  const identities = { available: false, passed: false, checks: [], errors: [], classificationCounts: {} };
  if (build) try {
    const toolFile = 'scripts/generator-fingerprint.ts', frozenTool = `${history}/frozen-tool/${toolFile}`;
    if (hash(toolFile) !== hash(frozenTool)) throw new Error('Fingerprint algorithm/tool changed; needs its own compatibility review');
    const toolSource = fs.readFileSync(toolFile, 'utf8');
    const compiled = ts.transpileModule(toolSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace("from 'typescript'", `from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/typescript/lib/typescript.js')).href)}`);
    const tool = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    const entries = [
      ['macroGenerator', 'fingerprintMacroGenerator'], ['landformGenerator', 'fingerprintLandformGenerator'],
      ['islandGenerator', 'fingerprintIslandGenerator'], ['coastGenerator', 'fingerprintCoastGenerator'],
      ['shapeGenerator', 'fingerprintShapeGenerator'], ['oceanGenerator', 'fingerprintOceanGenerator'],
      ['detailShapeGenerator', 'fingerprintDetailShapeGenerator'], ['addDetailGenerator', 'fingerprintAddDetailGenerator'],
      ['naturalDetailGenerator', 'fingerprintNaturalDetailGenerator'], ['addNaturalDetailGenerator', 'fingerprintAddNaturalDetailGenerator'],
      ['localDetailReliefGenerator', 'fingerprintLocalDetailReliefGenerator'],
    ];
    const keys = entries.map(([key]) => key).sort();
    if (!same(Object.keys(build).filter(key => key.endsWith('Generator')).sort(), keys) || !same(Object.keys(baseline).filter(key => key.endsWith('Generator')).sort(), keys)) throw new Error('Actual registry differs from complete eleven-function recomputation');
    const inventory = read(`${history}/inventory.json`);
    for (const row of inventory.files) {
      const relative = row.path ?? row.dest;
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..') || hash(`${history}/${relative}`) !== row.sha256) throw new Error('Frozen history original byte mismatch');
    }
    const current = file => fs.readFileSync(file, 'utf8'), frozen = file => fs.readFileSync(`${history}/frozen-source/${file}`, 'utf8');
    const historyFile = 'src/world/generation-history.ts', originalHistory = frozen(historyFile);
    const reversed = file => file === historyFile ? originalHistory : current(file);
    identities.available = true;
    for (const [key, fn] of entries) {
      const actual = tool[fn](current), old = tool[fn](frozen), withoutHistory = tool[fn](reversed);
      const classification = actual.sha256 === old.sha256 ? 'unchanged' : withoutHistory.sha256 === old.sha256 ? 'history-only' : 'non-history-runtime-change';
      const runtimeSourceChanges = [...new Set([...actual.files, ...old.files])].filter(file => file !== historyFile).flatMap(file => {
        const existsCurrent = fs.existsSync(file), existsOld = fs.existsSync(`${history}/frozen-source/${file}`);
        const a = existsCurrent ? current(file).replace(/\r\n/g, '\n') : null, b = existsOld ? frozen(file).replace(/\r\n/g, '\n') : null;
        return a === b ? [] : [{ path: file, currentSha256: existsCurrent ? hash(file) : null, frozenSha256: existsOld ? hash(`${history}/frozen-source/${file}`) : null }];
      });
      const row = { key, function: fn, actual, frozen: old, historyReversedSha256: withoutHistory.sha256, currentMatchesBuild: same(actual, build[key]), frozenMatchesPrior: same(old, baseline[key]), classification, runtimeSourceChanges };
      identities.checks.push(row); identities.classificationCounts[classification] = (identities.classificationCounts[classification] ?? 0) + 1;
    }
    const helper = 'src/world/generation/terrain-massif.ts';
    identities.requiredOrographyClosures = ['naturalDetailGenerator', 'addNaturalDetailGenerator', 'localDetailReliefGenerator'].map(key => ({ key, helper, includedInActualRuntimeClosure: identities.checks.find(row => row.key === key)?.actual.files.includes(helper) === true, includedInBuild: build[key]?.files.includes(helper) === true }));
    identities.orographyIncluded = identities.requiredOrographyClosures.every(row => row.includedInActualRuntimeClosure && row.includedInBuild);
    identities.engineUnchanged = build.engineFingerprint === baseline.engineFingerprint;
    identities.passed = identities.checks.length === entries.length && identities.checks.every(row => row.currentMatchesBuild && row.frozenMatchesPrior) && identities.engineUnchanged && identities.orographyIncluded;
  } catch (error) { identities.errors.push(error instanceof Error ? error.message : String(error)); }
  const after = snapshot(), sourceStable = same(before, after), dist = built ? walk('dist') : null;
  save('source-after.json', after); save('identity-verification.json', { recordedAt: new Date().toISOString(), ...identities, sourceStable,
    buildSha256: build ? hash('dist/build.json') : null, priorBuildSha256: hash(`${batch}/baseline-build.json`), sourceSnapshotSha256: hash(`${directory}/source-after.json`), checksRerunForIdentity: false });
  const allCommandsPassed = results.length === commands.length && results.every(row => row.exitCode === 0 && !row.signal);
  const passed = allCommandsPassed && unit.passed && sourceStable && identities.passed && build?.version === '0.5.0-preview.23' && Array.isArray(dist) && dist.length > 5;
  save('verification.json', { results, unit, sourceStable, allCommandsPassed, passed, dist, buildJsonSha256: build ? hash('dist/build.json') : null,
    engineUnchanged: identities.engineUnchanged ?? false, generatorIdentityVerified: identities.passed, identityVerificationSha256: hash(`${directory}/identity-verification.json`), classificationCounts: identities.classificationCounts,
    scope: 'Affected branching relief, natural/additive/local height and locks, stored compatibility and actual helper runtime closure checks only; not natural visual, performance, physical device, PH or cloud acceptance.',
    naturalVisualAccepted: false, visualAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false });
  console.log(JSON.stringify({ directory, passed, unitAssertions: unit.total ?? null, classificationCounts: identities.classificationCounts, sourceStable }));
  process.exitCode = passed ? 0 : 1;
}

await runBatch();
