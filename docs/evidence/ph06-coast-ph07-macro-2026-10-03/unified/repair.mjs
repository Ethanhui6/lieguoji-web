import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(root);
const batch = ".autopilot/ph07/macro-coast-checks";
const unitFiles = ['src/world/hydrology-macro-worker.test.ts', 'src/world/hydrology-reader-owned.test.ts'];
const knownCaseCounts = { 'src/world/hydrology-macro-worker.test.ts': 7, 'src/world/hydrology-reader-owned.test.ts': 7 };

async function runBatch() {
  const label = process.argv[2] ?? 'first';
  if (process.argv.length > 3 || !/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid round label');
  const directory = `${batch}/${label}`, history = 'docs/evidence/ph06-preview23-generator-history-2026-10-03';
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
  if (baseline.version !== '0.5.0-preview.23' || hash(`${batch}/baseline-build.json`) !== '6be150d0e278ea1d6b67f27fe2c2e50599adca77c6f647d9cbe6c8d5f9277f1f' || hash(`${history}/build.json`) !== hash(`${batch}/baseline-build.json`)) throw new Error('Actual frozen preview23 baseline not bound');
  if (read('package.json').version !== '0.5.0-preview.24') throw new Error('Expected promoted preview24');
  for (const file of unitFiles) if (!fs.existsSync(file)) throw new Error(`Selected test missing: ${file}`);
  fs.mkdirSync(directory);
  const save = (file, value) => fs.writeFileSync(`${directory}/${file}`, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  const before = snapshot(); save('source-before.json', before);
  const firstPath = batch + '/first', first = read(firstPath + '/unit.json'), original = read(firstPath + '/source-after.json');
  const allowed = new Set(['src/editor/AtlasStudio.tsx', 'tests/atlas-hydrology-macro.spec.ts', ...unitFiles]);
  const currentHashes = new Map(before.map(row => [row.path, row.sha256]));
  const changed = original.filter(row => currentHashes.get(row.path) !== row.sha256).map(row => row.path);
  const originalPaths = new Set(original.map(row => row.path));
  changed.push(...before.filter(row => !originalPaths.has(row.path)).map(row => row.path));
  if (changed.some(file => !allowed.has(file))) throw new Error('Repair changed outside reviewed UI/test scope: ' + changed.join(', '));
  const reused = first.testResults.filter(file => !unitFiles.includes(path.relative(root, file.name).replaceAll('\\', '/')));
  const reusedAssertions = reused.flatMap(file => file.assertionResults);
  if (reused.length !== 53 || reusedAssertions.length !== 425 || !reusedAssertions.every(row => row.status === 'passed')) throw new Error('Original unchanged unit evidence incomplete');
  const reuse = { source: firstPath, sourceUnitSha256: hash(firstPath + '/unit.json'), sourceSnapshotSha256: hash(firstPath + '/source-after.json'), files: reused.map(file => path.relative(root, file.name).replaceAll('\\', '/')), passedAssertions: reusedAssertions.length, changed, dependenciesUnchangedExceptReviewedUiAndTestFiles: true };
  save('reused-unit-evidence.json', reuse);
  fs.copyFileSync(`${batch}/baseline-build.json`, `${directory}/prior-build.json`, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync('dist/build.json', `${directory}/pre-run-build.json`, fs.constants.COPYFILE_EXCL);
  save('scope.json', { unitFiles, knownCaseCounts, numericEvidenceLabel: `macro-coast-${label}`,
    scope: 'Broader coastal rounding with unchanged protected narrow features; preserved preview23 storage; real full-world fixed16 macro sampling, read-only Worker/bridge, map overlays, shared downstream picking and all affected fine hydrology and terrain renderer regressions. All eleven generation closures recomputed. Browser and subjective review separate.',
    inheritedNotRerun: 'Previous unit pass counts are not newly executed evidence. Terrain shader/material GPU22 probes remain historical; new macro overlay will be checked by native browser. No new GPU acceptance is claimed.', cloudWrites: false });
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
      env: { ...process.env, ...(name === 'unit' ? { NATURAL_VISUAL_EVIDENCE_LABEL: `macro-coast-${label}` } : {}) } });
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
  unit = { ...unit, rerunAssertions: unit.total, reused: reuse, aggregatePassedAssertions: (unit.passedAssertions ?? 0) + reuse.passedAssertions };
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
  const passed = allCommandsPassed && unit.passed && sourceStable && identities.passed && build?.version === '0.5.0-preview.24' && Array.isArray(dist) && dist.length > 5;
  save('verification.json', { results, unit, sourceStable, allCommandsPassed, passed, dist, buildJsonSha256: build ? hash('dist/build.json') : null,
    engineUnchanged: identities.engineUnchanged ?? false, generatorIdentityVerified: identities.passed, identityVerificationSha256: hash(`${directory}/identity-verification.json`), classificationCounts: identities.classificationCounts,
    scope: 'Affected coast, terrain/renderer, fixed16 macro-flow reader/kernel/protocol/view, old fine hydrology and stored compatibility; not natural visual, physical device, whole-PH, persistent river/lake simulation or cloud acceptance.',
    naturalVisualAccepted: false, visualAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false });
  console.log(JSON.stringify({ directory, passed, unitAssertions: unit.total ?? null, classificationCounts: identities.classificationCounts, sourceStable }));
  process.exitCode = passed ? 0 : 1;
}

await runBatch();
