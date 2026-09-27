// Explicit local recording only. Does not run checks/browser, modify sources,
// publish, extract trace ZIPs, or convert a failed run into acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph07-flow-view-2026-09-28', base = '.autopilot/ph07';
const assert = (ok, why) => { if (!ok) throw Error(why); };
assert(process.argv.length === 2, 'No arguments: archive only the named PH07 evidence roots.');
function absolute(relative) { const p = path.resolve(root, relative), r = path.relative(root, p); assert(r && !path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`), `Unsafe workspace path: ${relative}`); return p; }
const exists = p => fs.existsSync(absolute(p));
const hash = p => createHash('sha256').update(fs.readFileSync(absolute(p))).digest('hex');
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8').replace(/^\uFEFF/, ''));
const regular = p => { const s = fs.lstatSync(absolute(p)); assert(s.isFile() && !s.isSymbolicLink(), `Not regular evidence: ${p}`); return s; };
const terminalExit = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
const runs = [], files = new Map(), references = [], excluded = [];
function discover(dir, kind) {
  assert(exists(dir), `Missing evidence directory: ${dir}`);
  const names = fs.readdirSync(absolute(dir), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  assert(names.length > 0, `No actual ${kind} runs: ${dir}`);
  for (const name of names) {
    assert(/^[a-z0-9-]+$/.test(name), `Unknown evidence directory, review before recording: ${dir}/${name}`);
    const source = `${dir}/${name}`; assert(!fs.lstatSync(absolute(source)).isSymbolicLink(), `Symlink run: ${source}`);
    const final = `${source}/${kind === 'extractor' ? 'result.json' : 'verification.json'}`;
    assert(exists(final), `Refusing live/incomplete run without terminal verification: ${source}`);
    const v = read(final); let terminal = false;
    if (kind === 'browser') terminal = Number.isFinite(v.elapsedMs) && !!v.completedAt && (terminalExit(v.code, v.signal) || typeof v.spawnError === 'string');
    else if (kind === 'extractor') terminal = Array.isArray(v.steps) && v.steps.length > 0 && v.steps.every(s => terminalExit(s.code, s.signal) && Number.isFinite(s.durationMs));
    else terminal = Array.isArray(v.results) && v.results.length > 0 && v.results.every(s => terminalExit(s.exitCode, s.signal) && !!s.completedAt);
    assert(terminal && typeof v.passed === 'boolean', `Incomplete/unrecognised final verification: ${final}`);
    runs.push({ kind, name, source, verification: final, recordedPassed: v.passed, sourceStable: v.sourceAndDistStable ?? v.sourceStable ?? v.sourceUnchanged ?? null,
      project: v.project ?? null, unit: v.unit ?? null, observed: kind === 'browser' ? v.observed ?? null : null, verificationSha256: hash(final) });
  }
}
// Preflight every discovered round before making any archive directory. Failed
// terminal rounds are kept; a single still-running round blocks this archive.
discover(`${base}/flow-checks`, 'unified');
discover(`${base}/flow-browser`, 'browser');
discover(`${base}/hydrology-snapshot-staging/checks`, 'extractor');
assert(runs.some(r => r.kind === 'unified' && r.name === 'first'), 'Actual unified first round is required.');
assert(runs.some(r => r.kind === 'extractor' && r.name === 'first-owned-snapshot'), 'Keep the original extractor failed round.');

const oldKernel = 'docs/evidence/ph07-hydrology-kernel-2026-09-28';
for (const p of ['docs/evidence/2026-09-28-ph07-hydrology-kernel.md', `${oldKernel}/verification.json`, `${oldKernel}/files.sha256.json`, `${oldKernel}/source/src/hydrology-kernel.ts`,
  `${oldKernel}/checks/fine-drainage-first/verification.json`, `${oldKernel}/checks/intrinsic-private-copy-fix/verification.json`, `${oldKernel}/review/original/private-copy-probe.json`]) {
  const s = regular(p); references.push({ path: p, bytes: s.size, sha256: hash(p), reason: 'Existing immutable kernel archive: first candidate, actual private-copy failure and corrected checks. Referenced, not recopied.' });
}
const kernelPath = `${oldKernel}/source/src/hydrology-kernel.ts`, kernelSha = hash(kernelPath);
function add(source, destination) {
  const s = regular(source), sha256 = hash(source);
  if (path.basename(source) === 'hydrology-kernel.ts' && sha256 === kernelSha) { excluded.push({ path: source, sha256, reason: 'Byte-identical previously archived kernel dependency', reference: kernelPath }); return; }
  assert(!files.has(destination), `Duplicate archive destination: ${destination}`);
  files.set(destination, { source, path: destination, bytes: s.size, sha256 });
}
const extensions = new Set(['.json', '.log', '.md', '.txt', '.ts', '.tsx', '.css', '.html', '.mjs', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.webm', '.zip']);
const skipDirectories = new Set(['resources', 'trace', 'trace-unpacked', 'trace-extracted', 'unpacked-trace', 'extracted-trace', 'playwright-report', 'node_modules', 'dist', '.cache']);
function raw(dir, destination) {
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const source = `${dir}/${entry.name}`, dest = `${destination}/${entry.name}`; assert(!entry.isSymbolicLink(), `Symlink evidence: ${source}`);
    if (entry.isDirectory()) {
      const traceExpanded = fs.readdirSync(absolute(source)).some(name => name.endsWith('.trace') || name.endsWith('.network'));
      if (skipDirectories.has(entry.name) || traceExpanded) excluded.push({ path: source, reason: 'Expanded trace/cache/output dependency omitted; original trace ZIP retained when present' });
      else raw(source, dest);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) add(source, dest);
    else excluded.push({ path: source, reason: 'Not a selected raw evidence format' });
  }
}
raw(`${base}/flow-checks`, 'unified');
raw(`${base}/flow-browser`, 'browser');
raw(`${base}/hydrology-snapshot-staging`, 'extractor');
const workerLogs = fs.readdirSync(absolute(base)).filter(name => /^hydrology-integration-.*\.(log|json)$/.test(name) || name === 'hydrology-trace-exactness.log').sort();
for (const required of ['hydrology-integration-first.log', 'hydrology-integration-repair.log', 'hydrology-integration-source.json']) assert(workerLogs.includes(required), `Keep the actual Worker first failure/fix/source evidence: ${required}`);
for (const name of workerLogs) add(`${base}/${name}`, `worker/${name}`);
// Input observations are diagnostics, not full browser acceptance. They sit
// outside flow-browser so their completed observations cannot look like a live
// production flow round or silently count as a successful save.
const diagnostics = [];
const rootDiagnosticNames = new Set(['touch-runtime-diagnostic', 'touch-chrome-input-trace', 'touch-consumed-confirm']);
for (const name of rootDiagnosticNames) assert(exists(`${base}/${name}`), `Missing actual root input diagnosis: ${name}`);
const diagnosticNames = fs.readdirSync(absolute(base), { withFileTypes: true }).filter(e => e.isDirectory() && (rootDiagnosticNames.has(e.name) || /^touch-(confirm|scroll-settled|held-confirm|footer-confirm|capability|capture-scroll|dom-clone|dom-clone-second)-diagnostic$/.test(e.name))).map(e => e.name).sort();
for (const name of diagnosticNames) {
  const source = `${base}/${name}`, eventsPath = `${source}/events.json`;
  assert(exists(eventsPath), `Input diagnostic is still running or incomplete: ${source}`);
  const observation = read(eventsPath), product = exists(`${source}/diagnostic-source.spec.ts`);
  if (product) {
    const resultPath = `${source}/results.json`;
    assert(exists(resultPath), `Input diagnostic lacks its terminal runner result: ${source}`);
    const result = read(resultPath);
    assert(Number.isFinite(result.stats?.duration) && !!result.stats?.startTime, `Incomplete diagnostic result: ${source}`);
    assert(exists(`${source}/diagnostic-config.ts`), `Missing historical diagnostic config: ${source}`);
    if (name === 'touch-runtime-diagnostic' || name === 'touch-chrome-input-trace') {
      assert(exists(`${source}/all-input.json`) && exists(`${source}/end.json`), `Missing complete runtime input/end evidence: ${source}`);
    }
    if (name === 'touch-chrome-input-trace') assert(exists(`${source}/chrome-input.json`), 'Missing actual Chromium gesture trace');
    if (name === 'touch-consumed-confirm') assert(Object.hasOwn(observation, 'durableFailure') && exists(`${source}/source-before.json`), 'Missing actual consumed-touch durability/source observation');
    diagnostics.push({ name, scope: 'Actual product input diagnostic; not full hydrology acceptance',
      finalRevision: observation.observation?.final?.revision ?? null,
      clickEvents: observation.observation?.log?.filter(e => e.event === 'click' && e.phase === 'capture').length ?? null,
      durableWaitObserved: Object.hasOwn(observation, 'durableFailure'), durableFailure: observation.durableFailure ?? null,
      terminalObservation: exists(`${source}/end.json`) ? read(`${source}/end.json`) : null,
      runtimeInputLog: exists(`${source}/all-input.json`) ? { path: `input-diagnostics/${name}/all-input.json`, sha256: hash(`${source}/all-input.json`) } : null,
      browserInputTrace: exists(`${source}/chrome-input.json`) ? { path: `input-diagnostics/${name}/chrome-input.json`, sha256: hash(`${source}/chrome-input.json`) } : null,
      runnerStats: result.stats });
  } else {
    assert(exists(`${source}/source.mjs`) && Array.isArray(observation.reports) && observation.reports.length > 0, `Incomplete isolated HTML diagnostic: ${source}`);
    diagnostics.push({ name, scope: observation.scope, fixtureResults: observation.reports.map(r => ({ mode: r.mode ?? null, detach: r.detach ?? null, beforeCount: r.before?.count, afterCount: r.after?.count })) });
  }
  raw(source, `input-diagnostics/${name}`);
}
if (exists(`${base}/touch-diagnostic-summary.md`)) add(`${base}/touch-diagnostic-summary.md`, 'input-diagnostics/README.md');
add(`${base}/archive-flow.mjs`, 'provenance/archive-flow.mjs');
// Current source is deliberately not substituted for historical failed source.
// Exact source snapshots already present in the raw checks stay in those checks.
assert(!exists(target), `Refusing to overwrite an existing archive: ${target}`);
const planned = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
for (const row of planned) assert(hash(row.source) === row.sha256, `Evidence changed during preflight: ${row.source}`);
fs.mkdirSync(absolute(target), { recursive: true });
for (const row of planned) {
  const destination = `${target}/${row.path}`; fs.mkdirSync(path.dirname(absolute(destination)), { recursive: true }); fs.copyFileSync(absolute(row.source), absolute(destination), fs.constants.COPYFILE_EXCL);
  assert(hash(destination) === row.sha256 && hash(row.source) === row.sha256, `Archive/source byte mismatch: ${row.source}`);
}
for (const row of references) assert(hash(row.path) === row.sha256, `Referenced kernel evidence changed: ${row.path}`);
for (const row of planned) assert(hash(row.source) === row.sha256, `Evidence changed while recording: ${row.source}`);
const write = (name, value) => fs.writeFileSync(absolute(`${target}/${name}`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
write('references.json', { kernelArchive: oldKernel, files: references, excluded });
const extra = { source: null, path: 'references.json', bytes: regular(`${target}/references.json`).size, sha256: hash(`${target}/references.json`) };
write('files.sha256.json', { version: 1, root: target, files: [...planned, extra] });
write('verification.json', { recordedAt: new Date().toISOString(), archiveComplete: true, copiedFiles: planned.length, copiedBytes: planned.reduce((sum, r) => sum + r.bytes, 0), rawByteCopiesVerified: true,
  manifestSha256: hash(`${target}/files.sha256.json`), referencesSha256: extra.sha256, runs, diagnostics,
  workerLogs: workerLogs.map(name => ({ path: `worker/${name}`, sha256: hash(`${base}/${name}`) })),
  workerLogInterpretation: 'Original logs only; first failure and targeted repair are not cumulative full-suite acceptance. Use actual unified verification for final affected checks.',
  archiveExitMeaning: 'Recording completed, including any failed rounds; does not assert all rounds passed.', phaseAccepted: false, naturalVisualAccepted: false, physicalDevice: false, cloudWrites: false });
console.log(JSON.stringify({ target, archiveComplete: true, copiedFiles: planned.length, copiedBytes: planned.reduce((sum, r) => sum + r.bytes, 0), runs: runs.map(r => ({ kind: r.kind, name: r.name, recordedPassed: r.recordedPassed })), verificationSha256: hash(`${target}/verification.json`) }));
