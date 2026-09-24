import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const validation = '.autopilot/ph05-archive-validation';
const archive = 'docs/evidence/ph05';
const restored = '.autopilot/ph05-restored-review';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeNew = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
function preserveResult(source, name) {
  const bytes = fs.readFileSync(source), target = `${validation}/${name}`;
  fs.writeFileSync(target, bytes, { flag: 'wx' });
  if (sha(fs.readFileSync(target)) !== sha(bytes)) throw new Error(`Saved verification result differs: ${target}`);
  return { path: target, bytes: bytes.length, sha256: sha(bytes) };
}
function safeRelative(value) {
  if (typeof value !== 'string' || !value || /[\\:\x00-\x1f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe restored evidence path');
  return value;
}
const manifestBytes = fs.readFileSync(`${archive}/archive-manifest.json`);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const receipt = json(`${restored}/restore-receipt.json`);
if (manifest.status !== 'complete' || receipt.status !== 'byte-verified' || receipt.manifestSha256 !== sha(manifestBytes)
  || receipt.files !== manifest.totals.files || receipt.bytes !== manifest.totals.sourceBytes) throw new Error('Archive/restore identity mismatch');
const restoredCwd = path.resolve(restored);
function originalFile(relative) {
  safeRelative(relative);
  if (!relative.startsWith('.autopilot/ph05/') || !manifest.files.some(file => file.path === relative.slice('.autopilot/ph05/'.length))) throw new Error('Report not listed in original inventory');
  return relative;
}
function exactTool(source) {
  const tool = manifest.tools.find(row => row.source === source);
  if (!tool) throw new Error(`Missing exact tool: ${source}`);
  const relative = safeRelative(`.archive-tools/${tool.path}`), bytes = fs.readFileSync(`${restored}/${relative}`);
  if (bytes.length !== tool.bytes || sha(bytes) !== tool.sha256) throw new Error(`Exact evaluator bytes differ: ${source}`);
  return { relative, sha256: tool.sha256, bytes: tool.bytes };
}
function evaluate(label, tool, args, output) {
  if (fs.existsSync(`${restored}/${output}`)) throw new Error(`Refusing existing evaluator output: ${output}`);
  const log = `${validation}/${label}-replay.log`, fd = fs.openSync(log, 'wx');
  const startedAt = new Date().toISOString();
  let result;
  try { result = spawnSync(process.execPath, [tool.relative, ...args, `--out=${output}`], { cwd: restoredCwd, windowsHide: true, stdio: ['ignore', fd, fd] }); }
  finally { fs.closeSync(fd); }
  const execution = { label, startedAt, completedAt: new Date().toISOString(), cwd: restored, executable: 'node',
    entrypoint: tool.relative, evaluatorSha256: tool.sha256, args: [...args, `--out=${output}`], exitCode: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null, log, output: `${restored}/${output}` };
  writeNew(`${validation}/${label}-replay.json`, execution);
  if (result.error || result.status !== 0) throw new Error(`${label} evaluator failed; see ${log}`);
  return { execution, value: json(`${restored}/${output}`) };
}
function normalizedRendering(value) {
  const copy = structuredClone(value); delete copy.evaluatedAt;
  for (const entry of Object.values(copy.configurations)) { delete entry.path; for (const sample of entry.samples) delete sample.rawPath; }
  return copy;
}
try {
  const seriesPath = originalFile('.autopilot/ph05/series/calibrated-formal-v2/result.json');
  const series = json(`${restored}/${seriesPath}`);
  if (series.status !== 'completed') throw new Error('Restored formal series was not completed');
  const configurations = ['headless-dpr1', 'headless-dpr2', 'headed-dpr1', 'headed-dpr2'];
  const rendering = evaluate('rendering', exactTool('scripts/summarize-atlas-rendering.mjs'),
    configurations.map(key => `--${key}=${originalFile(series.results[key].report)}`), 'new-evaluation.json');
  const renderingResults = Object.fromEntries(configurations.map(key => {
    const entry = rendering.value.configurations[key];
    return [key, { samples: entry.samples.length, valid: entry.samples.filter(sample => sample.valid).length,
      everyTimingTarget: entry.everySampleWithinOriginalTimingTargets, sourceSha256: entry.source, distSha256: entry.dist }];
  }));
  if (rendering.value.status !== 'render-measurement-gates-passed' || !Object.values(rendering.value.checks).every(value => value === true)
    || !Object.values(renderingResults).every(row => row.samples === 18 && row.valid === 18 && row.everyTimingTarget === true)) throw new Error('Restored rendering gates/coverage differ');
  const priorRendering = json(`${restored}/${originalFile('.autopilot/ph05/series/calibrated-formal-v2/evaluation.json')}`);
  const renderingMatchesPrior = JSON.stringify(normalizedRendering(rendering.value)) === JSON.stringify(normalizedRendering(priorRendering));
  if (!renderingMatchesPrior) throw new Error('Restored rendering differs beyond evaluatedAt and restored report/raw locations');
  const modes = ['edits', 'loads', 'transport', 'cancel'];
  const ph04Reports = Object.fromEntries(modes.map(mode => {
    const matches = manifest.files.filter(row => row.path.startsWith('final-evidence/ph04-regression/') && row.path.endsWith(`-${mode}/report.json`));
    if (matches.length !== 1) throw new Error(`Expected one saved PH04 ${mode} report`);
    return [mode, originalFile(`.autopilot/ph05/${matches[0].path}`)];
  }));
  const ph04 = evaluate('ph04', exactTool('scripts/summarize-atlas.mjs'), modes.map(mode => `--${mode}=${ph04Reports[mode]}`), 'new-ph04-evaluation.json');
  if (ph04.value.status !== 'measurement-gates-passed' || Object.keys(ph04.value.checks).length !== 13
    || !Object.values(ph04.value.checks).every(value => value === true)) throw new Error('Restored PH04 gates did not pass 13/13');
  const archiveFilePaths = ['archive-manifest.json', ...manifest.artifacts.map(row => row.path), ...manifest.objects.map(row => row.gzipPath)];
  const archiveFileBytes = archiveFilePaths.reduce((sum, relative) => sum + fs.statSync(`${archive}/${safeRelative(relative)}`).size, 0);
  const preservedReceipt = preserveResult(`${restored}/restore-receipt.json`, 'restore-receipt.json');
  const preservedRendering = preserveResult(rendering.execution.output, 'rendering-evaluation.json');
  const preservedPh04 = preserveResult(ph04.execution.output, 'ph04-evaluation.json');
  const verification = {
    format: 'lieguoji-ph05-evidence-archive-verification', version: 1, status: 'archive-restore-evaluators-passed', verifiedAt: new Date().toISOString(),
    archive: { path: archive, manifest: `${archive}/archive-manifest.json`, manifestSha256: sha(manifestBytes), manifestBytes: manifestBytes.length,
      ...manifest.totals, physicalFiles: archiveFilePaths.length, physicalBytes: archiveFileBytes,
      gzipPercentOfSource: manifest.totals.gzipBytes / manifest.totals.sourceBytes * 100,
      operation: json(`${validation}/archive-run-v3.json`) },
    restore: { path: restored, receipt: `${restored}/restore-receipt.json`, receiptSha256: sha(fs.readFileSync(`${restored}/restore-receipt.json`)),
      preservedReceipt, status: receipt.status, files: receipt.files, bytes: receipt.bytes, operation: json(`${validation}/restore-run.json`) },
    rendering: { ...rendering.execution, status: rendering.value.status, checks: rendering.value.checks, configurations: renderingResults,
      matchesOriginalEvaluationExceptTimestampAndRestoredPaths: renderingMatchesPrior, outputSha256: sha(fs.readFileSync(rendering.execution.output)), preservedOutput: preservedRendering },
    ph04: { ...ph04.execution, status: ph04.value.status, passedChecks: 13, totalChecks: 13, checks: ph04.value.checks,
      outputSha256: sha(fs.readFileSync(ph04.execution.output)), preservedOutput: preservedPh04 },
    helperRepairs: ['Preserve an array when splitting one PowerShell path.', 'Avoid nesting the PowerShell 5 ConvertFrom-Json path array inside an extra array.'],
    preservedFailures: ['archive-run.log', 'archive-run.json', 'archive-run-v2.log', 'archive-run-v2.json'].map(file => `${validation}/${file}`),
    safety: { originalsNotDeletedOrMoved: true, archivedSourceUnchangedDuringSuccessfulArchive: true, sourceMeasurementToolsUnchanged: true,
      sourceReadTwiceAndFullRestoredBytesVerified: true, browsersRun: false, gameBuildsRun: false, networkOrRemoteWrites: false,
      packagingOrReleaseAuthorization: false },
  };
  writeNew(`${validation}/verification.json`, verification);
  console.log(JSON.stringify({ status: verification.status, archive: verification.archive, restore: { status: receipt.status, files: receipt.files, bytes: receipt.bytes },
    rendering: { status: rendering.value.status, configurations: renderingResults, matchesPrior: renderingMatchesPrior }, ph04: { status: ph04.value.status, checks: 13 } }, null, 2));
} catch (error) {
  writeNew(`${validation}/evaluator-replay-failed.json`, { status: 'failed', at: new Date().toISOString(), error: String(error) });
  console.error(String(error)); process.exitCode = 1;
}
