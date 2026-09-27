// Recording only. Never starts checks, opens saves or copies dist payloads.
// Exit 0 means byte-verified archive completion, not complete game acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-local-relief-2026-09-27', checks = '.autopilot/ph06/local-relief-checks';
const history = 'docs/evidence/ph06-preview11-generator-history-2026-09-27';
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = p => p.replaceAll('\\', '/');
function absolute(p) { const full = path.resolve(root, p), rel = path.relative(root, full); assert(rel && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`), `Unsafe workspace path: ${p}`); return full; }
const exists = p => fs.existsSync(absolute(p));
const hash = p => sha(fs.readFileSync(absolute(p)));
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8').replace(/^\uFEFF/, ''));
const optional = p => exists(p) ? read(p) : null;
assert(process.argv.length === 2, 'No CLI paths accepted; only the named evidence roots are read');
assert(!exists(target), `Refusing to overwrite existing archive: ${target}`);
const pending = [], excluded = [], files = new Map();
function add(source, dest, required = true) {
  if (!exists(source)) { if (required) pending.push({ path: source, reason: 'Required final evidence missing' }); return; }
  const stat = fs.lstatSync(absolute(source)); assert(stat.isFile() && !stat.isSymbolicLink(), `Not regular evidence: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate archive target: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
const forbidden = new Set(['src', 'tests', 'scripts', 'dist', 'node_modules', 'cache', 'vite-cache', 'resources', 'playwright-report', 'frozen-source', 'frozen-tool', 'evidence']);
const extensions = new Set(['.json', '.log', '.md', '.txt', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.webm', '.zip']);
function raw(dir, dest) {
  for (const e of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`; assert(!e.isSymbolicLink(), `Symlink evidence: ${p}`);
    if (e.name.startsWith('.') || forbidden.has(e.name)) { excluded.push(p); continue; }
    if (e.isDirectory()) raw(p, `${dest}/${e.name}`);
    else if (e.isFile() && extensions.has(path.extname(e.name).toLowerCase())) add(p, `${dest}/${e.name}`);
    else excluded.push(p);
  }
}
function snap(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const result = new Map();
  for (const r of rows) {
    if (typeof r.path !== 'string' || !/^[a-f0-9]{64}$/i.test(r.sha256 ?? '')) return null;
    const file = slash(path.isAbsolute(r.path) ? path.relative(root, r.path) : r.path).replace(/^\.\//, ''); absolute(file);
    if (!/^(?:src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(file) || file.split('/').some(p => p.startsWith('.')) || result.has(file)) return null;
    result.set(file, r.sha256.toLowerCase());
  }
  return result;
}
const same = (a, b) => { const x = snap(a), y = snap(b); return !!x && !!y && x.size === y.size && [...x].every(([p, h]) => y.get(p) === h); };
function differences(rows, include = () => true) {
  const values = snap(rows);
  return values ? [...values].filter(([p]) => include(p)).flatMap(([p, expected]) => exists(p) && hash(p) === expected ? [] : [{ path: p, expected, actual: exists(p) ? hash(p) : null }]) : [{ reason: 'Missing/malformed snapshot' }];
}
function units(data) {
  if (!data) return { available: false, passed: false };
  const rows = (data.testResults ?? []).flatMap(f => f.assertionResults ?? []);
  const counts = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests, failedSuites: data.numFailedTestSuites };
  return { available: true, counts, observed: rows.length, passed: data.success === true && counts.total > 0 && rows.length === counts.total && counts.passed === counts.total && counts.failed === 0 && counts.pending === 0 && counts.failedSuites === 0 && rows.every(r => r.status === 'passed') };
}
function browserResult(data) {
  const tests = [];
  function walk(suites) { for (const s of suites ?? []) { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) tests.push({ file: spec.file ?? s.file, project: t.projectName, title: spec.title, status: t.status, results: (t.results ?? []).map(r => ({ status: r.status, retry: r.retry, duration: r.duration })) }); walk(s.suites); } }
  walk(data?.suites);
  return { stats: data?.stats ?? null, tests, passed: !!data && tests.length > 0 && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && tests.every(t => t.status === 'expected' && t.results.length === 1 && t.results[0].status === 'passed' && t.results[0].retry === 0) };
}
const exitPresent = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
const runs = [];
if (!exists(checks)) pending.push({ path: checks, reason: 'Checks directory missing' });
else for (const e of fs.readdirSync(absolute(checks), { withFileTypes: true })) {
  if (!e.isDirectory() || e.name.startsWith('.')) continue;
  assert(!e.isSymbolicLink(), `Symlink run directory: ${e.name}`);
  const source = `${checks}/${e.name}`, vp = `${source}/verification.json`;
  if (!exists(vp)) { pending.push({ path: source, reason: 'No terminal verification; live artifacts not copied' }); continue; }
  let v; try { v = read(vp); } catch { pending.push({ path: vp, reason: 'Incomplete or unreadable verification' }); continue; }
  const kind = v.project ? 'browser' : 'root';
  const terminal = kind === 'browser' ? Number.isFinite(v.elapsedMs) && exitPresent(v.code, v.signal) : Array.isArray(v.results) && v.results.length > 0 && v.results.every(r => r.finishedAt && exitPresent(r.exitCode, r.signal));
  if (!terminal) { pending.push({ path: vp, reason: 'Unknown or nonterminal verification format' }); continue; }
  runs.push({ name: e.name, source, kind, v, order: fs.statSync(absolute(vp)).mtimeMs });
}
runs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
const oldKeys = ['macroGenerator', 'landformGenerator', 'islandGenerator', 'coastGenerator', 'shapeGenerator', 'oceanGenerator', 'detailShapeGenerator', 'addDetailGenerator', 'naturalDetailGenerator', 'addNaturalDetailGenerator'];
const generatorKeys = [...oldKeys, 'localDetailReliefGenerator'];
function validBuild(b, keys) {
  return !!b && /^[a-f0-9]{64}$/.test(b.engineFingerprint ?? '') && JSON.stringify(Object.keys(b).filter(k => k.endsWith('Generator')).sort()) === JSON.stringify([...keys].sort())
    && keys.every(k => /^[a-f0-9]{64}$/.test(b[k]?.sha256 ?? '') && Array.isArray(b[k]?.files) && b[k].files.length > 0 && b[k].files.every(f => typeof f === 'string' && f.startsWith('src/world/') && !f.includes('..') && !f.includes('\\')));
}
const historicalBuild = optional(`${history}/build.json`), historicalProvenance = optional(`${history}/provenance.json`), historicalInventory = optional(`${history}/inventory.json`);
const historyIssues = [];
if (!validBuild(historicalBuild, oldKeys) || historicalBuild?.version !== '0.5.0-preview.11') historyIssues.push('Missing actual preview11 ten-generator build');
if (!historicalProvenance || !exists(`${history}/build.json`) || historicalProvenance.buildSha256 !== hash(`${history}/build.json`) || historicalProvenance.closureCount !== 10 || historicalProvenance.sourceCount !== 37 || historicalProvenance.archivedClosuresRecomputed !== true) historyIssues.push('Preview11 capture metadata incomplete');
if (historicalProvenance) {
  if (!Array.isArray(historicalProvenance.archivedSources) || sha(Buffer.from(JSON.stringify(historicalProvenance.archivedSources))) !== historicalProvenance.sourceSnapshotSha256) historyIssues.push('Preview11 source-list digest mismatch');
  for (const key of oldKeys) {
    const closure = historicalProvenance.closures?.find(c => c.key === key);
    if (!closure || closure.matchedBuild !== true || closure.sha256 !== historicalBuild?.[key]?.sha256 || JSON.stringify(closure.files) !== JSON.stringify(historicalBuild?.[key]?.files)) historyIssues.push(`Preview11 closure identity mismatch: ${key}`);
  }
}
if (!historicalInventory?.files?.length) historyIssues.push('Preview11 immutable inventory missing');
else for (const item of historicalInventory.files) {
  if (typeof item.path !== 'string' || !/^(?:build\.json|provenance\.json|frozen-tool\/scripts\/generator-fingerprint\.ts|frozen-source\/src\/world\/.+\.ts)$/.test(item.path) || item.path.includes('..')) { historyIssues.push('Unsupported prior inventory entry'); continue; }
  const p = `${history}/${item.path}`;
  if (!exists(p) || fs.statSync(absolute(p)).size !== item.bytes || hash(p) !== item.sha256) historyIssues.push(`Prior archived bytes differ: ${item.path}`);
}
const rootRuns = [], browsers = [];
const expectedUnits = ['src/world/generation/detail-local-relief.test.ts', 'src/world/detail-local-relief-session.test.ts', 'src/editor/local-relief-controls.test.ts', 'src/world/detail-preview11-history.test.ts', 'src/world/generation-contract.test.ts', 'src/world/generation-format.test.ts', 'src/world/detail-generation-session.test.ts', 'src/world/generation/fingerprint.test.ts'];
for (const run of runs) {
  const { source, v } = run, rawPath = `raw/${run.kind}/${run.name}`; raw(source, rawPath);
  const before = optional(`${source}/${run.kind === 'browser' ? 'before' : 'source-before'}.json`), after = optional(`${source}/${run.kind === 'browser' ? 'after' : 'source-after'}.json`), build = optional(`${source}/build.json`);
  if (run.kind === 'browser') {
    const report = browserResult(optional(`${source}/results.json`)), stable = v.sourceAndDistStable === true && same(before, after);
    const correctSpec = report.tests.length > 0 && report.tests.every(t => path.basename(t.file ?? '') === 'atlas-local-relief.spec.ts' && t.project === v.project);
    browsers.push({ ...run, raw: rawPath, after, build, report, stable, correctSpec, passed: v.code === 0 && !v.signal && stable && correctSpec && report.passed });
  } else {
    const unit = units(optional(`${source}/unit.json`)), scope = optional(`${source}/scope.json`), stable = v.sourceStable === true && same(before, after);
    const correctUnitScope = !!scope && Array.isArray(scope.unitFiles) && JSON.stringify([...scope.unitFiles].sort()) === JSON.stringify([...expectedUnits].sort());
    const engineUnchanged = validBuild(build, generatorKeys) && build.engineFingerprint === historicalBuild?.engineFingerprint;
    const localGeneratorPresent = !!build?.localDetailReliefGenerator?.files?.includes('src/world/generation/detail-local-relief.ts') && build.localDetailReliefGenerator.files.includes('src/world/generation/local-detail-relief-adapter.ts');
    const passed = ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'].every(name => v.results.some(r => r.name === name && r.exitCode === 0 && !r.signal)) && unit.passed && stable && correctUnitScope && engineUnchanged && localGeneratorPresent && v.engineUnchanged === true && v.newGeneratorRecorded === true;
    rootRuns.push({ ...run, raw: rawPath, after, build, unit, scope, stable, correctUnitScope, engineUnchanged, localGeneratorPresent, generatorAndEngineUnchanged: v.generatorAndEngineUnchanged, passed });
  }
}
const stages = ['v4-local-relief-staging', 'v4-local-relief-integration-staging', 'v4-local-relief-ui-staging', 'v4-local-relief-browser-staging', 'v4-preview11-history-staging'];
for (const stage of stages) {
  const dir = `.autopilot/ph06/${stage}`;
  if (!exists(dir)) { pending.push({ path: dir, reason: 'Preparation directory missing' }); continue; }
  // Top-level metadata/tools only; candidate source mirrors and frozen history
  // already have their own preservation/production identities and are excluded.
  for (const e of fs.readdirSync(absolute(dir), { withFileTypes: true })) if (e.isFile() && !e.name.startsWith('.') && /\.(json|md|mjs)$/.test(e.name)) add(`${dir}/${e.name}`, `preparation/${stage}/${e.name}`);
}
for (const name of ['local-relief-root-ready.json', 'local-relief-promotion.json', 'local-relief-integration-review.md', 'local-relief-kernel-review.md', 'preview11-history-promotion.json', 'promote-local-relief.mjs', 'promote-preview11-history.mjs', 'prepare-local-relief-integration.mjs', 'prepare-local-relief-session.mjs', 'freeze-local-relief-integration.mjs', 'prepare-local-relief-checks.mjs', 'archive-local-relief.mjs']) add(`.autopilot/ph06/${name}`, `provenance/${name}`);
for (const name of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'check-http.mjs', 'http-before.json']) add(`${checks}/${name}`, `runners/${name}`);
const referenceNames = [`${history}/build.json`, `${history}/provenance.json`, `${history}/inventory.json`, 'docs/evidence/ph06-continuous-light-2026-09-27/verification.json', 'docs/evidence/ph06-continuous-light-2026-09-27/inventory.json', 'docs/evidence/2026-09-27-ph06-continuous-light.md'];
const references = referenceNames.map(p => exists(p) ? { path: p, bytes: fs.statSync(absolute(p)).size, sha256: hash(p), copied: false } : { path: p, missing: true, copied: false });
const latestRoot = rootRuns.at(-1) ?? null, firstRoot = rootRuns.find(r => r.name === 'first');
const firstPriorPath = firstRoot ? `${firstRoot.source}/prior-build.json` : null;
const priorCaptureBound = !!firstPriorPath && exists(firstPriorPath) && exists(`${history}/build.json`) && hash(firstPriorPath) === hash(`${history}/build.json`) && historyIssues.length === 0;
const currentBuildSha256 = exists('dist/build.json') ? hash('dist/build.json') : null;
const buildMatches = !!latestRoot?.build && !!currentBuildSha256 && hash(`${latestRoot.source}/build.json`) === currentBuildSha256;
const currentSourceDifferences = differences(latestRoot?.after), currentDistDifferences = differences(latestRoot?.v.dist);
function distNames(dir) { return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(e => { assert(!e.isSymbolicLink(), `Symlink dist entry: ${e.name}`); return e.isDirectory() ? distNames(`${dir}/${e.name}`) : [`${dir}/${e.name}`]; }); }
const recordedDist = snap(latestRoot?.v.dist), extraDistFiles = exists('dist') ? distNames('dist').filter(p => !recordedDist?.has(p)) : [];
const finalBrowsers = ['desktop-chromium', 'mobile-chromium', 'tablet-chromium'].map(project => {
  const run = browsers.filter(r => r.v.project === project && r.correctSpec).at(-1) ?? null;
  const currentProductDifferences = differences(run?.after, p => p.startsWith('src/') || p.startsWith('tests/') || p.startsWith('dist/'));
  const bound = !!run?.build && !!currentBuildSha256 && hash(`${run.source}/build.json`) === currentBuildSha256 && currentProductDifferences.length === 0;
  if (!run) pending.push({ project, reason: 'No terminal actual atlas-local-relief.spec.ts run' });
  return { project, name: run?.name ?? null, status: !run ? 'pending' : run.passed && bound ? 'passed' : 'failed_or_unbound', bound, currentProductDifferences, passed: !!run?.passed && bound };
});
for (const name of ['manual-observation.json', 'visual.json']) add(`${checks}/${name}`, `observations/${name}`);
// Include only explicit manual test PNGs/JSON from the check root, never IDB,
// a user save, or the browser's persistent profile.
if (exists(checks)) for (const e of fs.readdirSync(absolute(checks), { withFileTypes: true })) if (e.isFile() && /^manual-[a-z0-9-]+\.(png|json)$/.test(e.name)) add(`${checks}/${e.name}`, `observations/${e.name}`);
const manual = optional(`${checks}/manual-observation.json`), visual = optional(`${checks}/visual.json`), manualIssues = [];
if (!manual || manual.buildJsonSha256 !== currentBuildSha256) manualIssues.push('Manual observation is missing or not bound to current build');
if (!visual || visual.buildJsonSha256 !== currentBuildSha256) manualIssues.push('Root workflow/visual decision is missing or not bound to current build');
if (!Array.isArray(manual?.screenshots) || !manual.screenshots.length) manualIssues.push('No explicit manual screenshot identities');
else for (const screenshot of manual.screenshots) {
  if (typeof screenshot.file !== 'string' || !/^manual-[a-z0-9-]+\.png$/.test(screenshot.file) || !exists(`${checks}/${screenshot.file}`) || screenshot.sha256 !== hash(`${checks}/${screenshot.file}`)) manualIssues.push('Manual screenshot name/hash mismatch');
}
const technicalPassed = !!latestRoot?.passed && buildMatches && currentSourceDifferences.length === 0 && currentDistDifferences.length === 0 && extraDistFiles.length === 0 && latestRoot.v.dist?.length === 25 && priorCaptureBound && finalBrowsers.every(r => r.passed);
const allRequiredPassed = technicalPassed && pending.length === 0 && manualIssues.length === 0 && references.every(r => !r.missing);
const localReliefWorkflowAccepted = allRequiredPassed && visual?.localReliefWorkflowAccepted === true;
const compact = ({ after, order, ...r }) => r;
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  archiveComplete: true, technicalPassed, allRequiredPassed, localReliefWorkflowAccepted,
  naturalVisualAccepted: false, visualAccepted: false, allAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false,
  acceptanceScope: 'Actual bounded local-relief editing workflow only. No overall natural geography, PH, user, physical-device, performance or cloud acceptance.',
  rootRuns: rootRuns.map(compact), latestRoot: latestRoot?.name ?? null, browsers: { runs: browsers.map(compact), final: finalBrowsers },
  binding: { buildJsonSha256: currentBuildSha256, build: latestRoot?.build ?? null, buildMatches, currentSourceDifferences, currentDistDifferences, extraDistFiles, generatorCount: latestRoot?.build ? Object.keys(latestRoot.build).filter(k => k.endsWith('Generator')).length : null, engineUnchanged: latestRoot?.engineUnchanged ?? false, newLocalGeneratorRecorded: latestRoot?.localGeneratorPresent ?? false, priorPreview11CaptureBound: priorCaptureBound, priorHistoryIssues: historyIssues, distCount: latestRoot?.v.dist?.length ?? null },
  manual: { observation: manual, issues: manualIssues }, visual: { observation: visual, bound: !!visual && visual.buildJsonSha256 === currentBuildSha256 },
  pending, excluded, references,
  notes: [
    'All terminal failures are retained; later passes never overwrite an earlier run. A live directory is pending and is not copied.',
    'First root currently selects eight files; counts come from actual Vitest assertions. Staging written/unchecked counts are not passed executions or additional unique tests.',
    'The new local generator makes eleven build identities. Old ten hashes may change because actual contract/history dependencies changed; engine equality and exact verified preview11 provenance remain required.',
    'Three required browser runs must actually name atlas-local-relief.spec.ts. Ancillary legacy/entry/additive runs remain raw evidence without replacing the required local workflow.',
    'No old evidence bundle, source mirror, dist payload, browser save, authentication data, cache or hidden live trace fragments are copied.',
    'An empty preserved lock set does not prove populated-lock conflicts; actual browser observation records its lock count.',
    'Source/GPU/correctness tests and runner durations do not imply visual, physical-device, performance or whole-PH acceptance.',
  ],
};
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed before archive: ${item.source}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`; fs.writeFileSync(absolute(marker), 'Incomplete until all raw copies are verified and this marker is removed. Never overwrite a partial archive.\n', { flag: 'wx' });
const inventory = [];
const write = (name, data) => { const p = absolute(`${target}/${name}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ dest: name, generated: true, bytes: fs.statSync(p).size, sha256: hash(`${target}/${name}`) }); };
for (const item of files.values()) {
  const p = absolute(`${target}/${item.dest}`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(absolute(item.source), p, fs.constants.COPYFILE_EXCL);
  assert(fs.statSync(p).size === item.bytes && hash(`${target}/${item.dest}`) === item.sha256, `Copy mismatch: ${item.dest}`); inventory.push(item);
}
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed during archive: ${item.source}`);
write('verification.json', verification); write('references.json', references);
write('README.md', `# 局部山地生成本地证据\n\narchiveComplete=true 仅表示已选择的终态原件复制与SHA核对完成。技术范围 technicalPassed=${technicalPassed}，完整必需证据 allRequiredPassed=${allRequiredPassed}，root限定的局部山地工作流接受 localReliefWorkflowAccepted=${localReliefWorkflowAccepted}。全自然视觉、全PH、用户、真机、性能与云端验收均未通过。缺失或运行中的目录保留pending；脚本exit0不等于游戏完成。\n\nroot相关八文件的实际单元数、静态和构建结果分别记录，不与候选仅写出的用例或旧preview11光照结果相加。三端必须实际执行atlas-local-relief.spec.ts，当前源码与dist绑定；旧配方/入口等额外检查不代替它。\n\n新构建须含11个实际生成器身份，包含localDetailReliefGenerator；允许合同/history变更改变旧10个闭包，不能错误套用光照版的identityUnchanged门。原preview11十闭包、37来源和完整字节按既有正式归档核验，仅哈希引用，不复制整包。\n\nmanual仅记录本批测试地图UI和截图，无真实存档导出。空锁集未改变不代表已有锁冲突已通过；自然视觉与性能仍需独立验收。所有初次失败与后续复查原字节并存，原始日志/results/trace及源码快照见raw，准备和提升审阅见preparation/provenance。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
console.log(JSON.stringify({ target, archiveComplete: true, files: inventory.length, inventoryExcludesSelf: true, pending: pending.length, technicalPassed, allRequiredPassed, localReliefWorkflowAccepted, naturalVisualAccepted: false, allAccepted: false }, null, 2));
