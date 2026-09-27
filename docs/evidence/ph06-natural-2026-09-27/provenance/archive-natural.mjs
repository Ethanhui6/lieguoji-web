// Run explicitly after the desired evidence exists. This script never starts checks.
// A partial archive is allowed; exit 0 means the archive was written, not game PASS.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-natural-2026-09-27';
const checks = '.autopilot/ph06/natural-checks';
const stages = ['v4-natural-staging', 'v4-natural-ocean-staging', 'v4-natural-integration-staging', 'v4-worker-scheduling-staging'];
const requiredChecks = ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'];
const requiredBrowsers = {
  desktop: ['desktop-chromium', 'atlas-add-detail-coast.spec.ts'],
  mobile: ['mobile-chromium', 'atlas-add-detail-coast.spec.ts'],
  tablet: ['tablet-chromium', 'atlas-add-detail-coast.spec.ts'],
  legacy: ['desktop-chromium', 'atlas-detail-coast.spec.ts'],
  entry: ['desktop-chromium', 'atlas-natural-entry.spec.ts'],
};
const slash = p => p.replaceAll('\\', '/');
function absolute(p) {
  const result = path.resolve(root, p), relative = path.relative(root, result);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Unsafe project path: ${p}`);
  return result;
}
const exists = p => fs.existsSync(absolute(p));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = p => digest(fs.readFileSync(absolute(p)));
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8'));
const optional = p => exists(p) ? read(p) : null;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
assert(!exists(target), `Refusing to overwrite existing archive: ${target}`);
assert(process.argv.length === 2, 'No arguments supported; evidence is discovered only under the named natural/staging directories.');

const files = new Map(), pending = [], missing = [], exclusions = [];
function add(source, dest) {
  if (!exists(source)) { missing.push(source); return; }
  const stat = fs.lstatSync(absolute(source));
  assert(stat.isFile() && !stat.isSymbolicLink(), `Not a regular evidence file: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate archive destination: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
const excludedDirs = new Set(['src', 'tests', 'scripts', 'dist', 'node_modules', 'cache', 'vite-cache', 'resources', 'playwright-report', 'frozen-source', 'evidence']);
const rawExtensions = new Set(['.json', '.log', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.webm', '.zip', '.mjs']);
function rawFiles(dir, dest) {
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    const source = `${dir}/${entry.name}`, output = `${dest}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Symlink in evidence: ${source}`);
    if (entry.name.startsWith('.') || excludedDirs.has(entry.name)) { exclusions.push(source); continue; }
    if (entry.isDirectory()) rawFiles(source, output);
    else if (entry.isFile() && rawExtensions.has(path.extname(entry.name).toLowerCase())) add(source, output);
    else exclusions.push(source);
  }
}
function snapshot(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const result = new Map();
  for (const row of value) {
    if (typeof row.path !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256 ?? '')) return null;
    let name = path.isAbsolute(row.path) ? slash(path.relative(root, row.path)) : slash(row.path);
    name = name.replace(/^\.\//, '');
    absolute(name);
    if (result.has(name)) return null;
    result.set(name, row.sha256);
  }
  return result;
}
function sameSnapshot(before, after) {
  const a = snapshot(before), b = snapshot(after);
  return !!a && !!b && a.size === b.size && [...a].every(([name, sha]) => b.get(name) === sha);
}
function unitSummary(data) {
  if (!data) return { available: false, passed: false };
  const rows = (data.testResults ?? []).flatMap(file => (file.assertionResults ?? []).map(test => ({ file: file.name, name: test.fullName ?? test.title, status: test.status })));
  const counts = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests, failedSuites: data.numFailedTestSuites };
  return { available: true, reported: counts, observed: rows.length, passed: data.success === true && counts.total > 0 && counts.passed === counts.total && counts.failed === 0 && counts.pending === 0 && counts.failedSuites === 0 && rows.length === counts.total && rows.every(r => r.status === 'passed') };
}
function browserSummary(data) {
  const rows = [];
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) rows.push({ file: spec.file ?? suite.file, title: spec.title, project: test.projectName, status: test.status, attempts: (test.results ?? []).map(r => ({ status: r.status, retry: r.retry, duration: r.duration })) });
      visit(suite.suites);
    }
  }
  visit(data?.suites);
  return { stats: data?.stats ?? null, tests: rows, passed: !!data && rows.length > 0 && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && rows.every(r => r.status === 'expected' && r.attempts.length === 1 && r.attempts[0].status === 'passed' && r.attempts[0].retry === 0) };
}
const terminalExit = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
function terminal(v, kind) {
  if (kind === 'browser') return typeof v.name === 'string' && typeof v.project === 'string' && Number.isFinite(v.elapsedMs) && terminalExit(v.code, v.signal);
  if (kind === 'root') return Array.isArray(v.results) && v.results.length > 0 && v.results.every(r => r.finishedAt && terminalExit(r.exitCode, r.signal));
  return (Array.isArray(v.results) && !!v.completedAt && v.results.every(r => terminalExit(r.code ?? r.exitCode, r.signal))) || (!!v.unit?.finishedAt && terminalExit(v.unit.exitCode, v.unit.signal)) || (Array.isArray(v.cases) && terminalExit(v.exitCode, v.signal));
}
function discover(dir, kind) {
  if (!exists(dir)) return [];
  const runs = [];
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    assert(!entry.isSymbolicLink(), `Symlink run: ${dir}/${entry.name}`);
    const source = `${dir}/${entry.name}`, vp = `${source}/verification.json`;
    if (!exists(vp)) { pending.push({ directory: source, reason: 'No terminal verification.json; raw files not copied.' }); continue; }
    const v = read(vp), resolvedKind = kind === 'root' && v.project ? 'browser' : kind;
    if (!terminal(v, resolvedKind)) { pending.push({ directory: source, reason: 'Verification lacks a supported terminal exit record; not counted or copied.' }); continue; }
    runs.push({ name: entry.name, source, kind: resolvedKind, verification: v, order: fs.statSync(absolute(vp)).mtimeMs });
  }
  return runs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

const runs = discover(checks, 'root'), rootRuns = [], browserRuns = [], stagingRuns = [];
for (const run of runs) {
  const { source, verification: v } = run;
  rawFiles(source, `raw/${run.kind}/${run.name}`);
  if (run.kind === 'root') {
    const before = optional(`${source}/source-before.json`), after = optional(`${source}/source-after.json`);
    const unit = unitSummary(optional(`${source}/unit.json`));
    const sourceStable = v.sourceStable === true && sameSnapshot(before, after);
    const complete = requiredChecks.every(name => v.results.some(r => r.name === name && r.exitCode === 0 && !r.signal));
    rootRuns.push({ ...run, unit, sourceStable, after, passed: complete && sourceStable && unit.passed, build: optional(`${source}/build.json`), dist: v.dist });
  } else {
    const before = optional(`${source}/before.json`), after = optional(`${source}/after.json`);
    const result = browserSummary(optional(`${source}/results.json`));
    const role = Object.keys(requiredBrowsers).find(name => run.name.startsWith(`${name}-`)) ?? null;
    const expected = role ? requiredBrowsers[role] : null;
    const selectionMatches = !!expected && v.project === expected[0] && result.tests.length > 0 && result.tests.every(t => t.project === expected[0] && path.basename(t.file ?? '') === expected[1]);
    const sourceAndDistStable = v.sourceAndDistStable === true && sameSnapshot(before, after);
    browserRuns.push({ ...run, role, result, before, after, sourceAndDistStable, selectionMatches, passed: v.code === 0 && !v.signal && sourceAndDistStable && selectionMatches && result.passed, build: optional(`${source}/build.json`) });
  }
}
for (const name of stages) {
  const dir = `.autopilot/ph06/${name}`;
  if (!exists(dir)) { missing.push(dir); continue; }
  // Preparation only: no src/tests mirrors, private save, history payload or compiled output.
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) if (entry.isFile() && /(?:manifest|baseline|ready|patch|summary).*\.json$|^README\.md$|^(?:vitest.*\.ts|typecheck\.mjs|check\.mjs|probe\.mjs)$/.test(entry.name)) add(`${dir}/${entry.name}`, `preparation/${name}/${entry.name}`);
  for (const run of discover(`${dir}/checks`, 'staging')) {
    rawFiles(run.source, `raw/staging/${name}/${run.name}`);
    const v = run.verification;
    const unitFile = ['unit-results.json', 'results.json'].find(file => exists(`${run.source}/${file}`));
    stagingRuns.push({ name: run.name, stage: name, raw: `raw/staging/${name}/${run.name}`, recordedVerification: v, unit: unitSummary(unitFile ? read(`${run.source}/${unitFile}`) : null), note: 'Independent candidate/mechanism scope. Never add these test counts to root counts or infer game performance.' });
  }
  if (exists(`${dir}/checks/run-first.mjs`)) add(`${dir}/checks/run-first.mjs`, `preparation/${name}/run-first.mjs`);
}
for (const name of ['run.mjs', 'browser.mjs', 'playwright.config.ts']) add(`${checks}/${name}`, `runners/${name}`);
for (const name of ['http-before.json', 'visual-first.json', 'legacy-iab-observation.json']) add(`${checks}/${name}`, `observations/${name}`);
for (const name of ['archive-natural.mjs', 'natural-promotion.json', 'promote-natural.mjs', 'worker-scheduling-promotion.json', 'natural-v2-review.md', 'natural-v2-integration-review.md', 'worker-scheduling-review.md', 'natural-landscape-next.md', 'organic-algorithm-review.md', 'preview8-index-audit.json', 'audit-preview8-index.mjs']) add(`.autopilot/ph06/${name}`, `provenance/${name}`);

const referencePaths = ['docs/adr/0016-sparse-detail-coast.md', 'docs/adr/0018-natural-landscape-v2.md', 'docs/evidence/ph06-preview8-generator-history-2026-09-27/build.json', 'docs/evidence/ph06-preview8-generator-history-2026-09-27/provenance.json', 'docs/evidence/ph06-additive-2026-09-27/verification.json'];
const references = referencePaths.map(p => exists(p) ? { path: p, bytes: fs.statSync(absolute(p)).size, sha256: hash(p), copied: false } : { path: p, missing: true, copied: false });
const latestRoot = rootRuns.at(-1) ?? null;
const latestBrowsers = Object.fromEntries(Object.keys(requiredBrowsers).map(role => [role, browserRuns.filter(r => r.role === role).at(-1) ?? null]));
const missingBrowserRoles = Object.entries(latestBrowsers).filter(([, run]) => !run).map(([role]) => role);
function differences(rows, filter = () => true) {
  const values = snapshot(rows);
  if (!values) return [{ path: null, reason: 'Missing or malformed hash snapshot' }];
  return [...values].filter(([p]) => filter(p)).flatMap(([p, expected]) => exists(p) && hash(p) === expected ? [] : [{ path: p, expected, actual: exists(p) ? hash(p) : null }]);
}
const currentSourceDifferences = differences(latestRoot?.after);
const currentDistDifferences = differences(latestRoot?.dist);
const currentBuildSha256 = exists('dist/build.json') ? hash('dist/build.json') : null;
const buildBinding = !!latestRoot?.build && !!currentBuildSha256 && hash(`${latestRoot.source}/build.json`) === currentBuildSha256;
const browserBindings = Object.entries(latestBrowsers).map(([role, run]) => {
  const sourceDifferences = differences(run?.after, p => p.startsWith('src/') || p.startsWith('dist/'));
  return { role, name: run?.name ?? null, currentProductDifferences: sourceDifferences, buildMatches: !!run?.build && !!currentBuildSha256 && hash(`${run.source}/build.json`) === currentBuildSha256, passed: !!run?.passed };
});
const allRequiredPassed = !!latestRoot?.passed && buildBinding && currentSourceDifferences.length === 0 && currentDistDifferences.length === 0 && browserBindings.every(r => r.passed && r.buildMatches && r.currentProductDifferences.length === 0) && pending.length === 0 && missing.length === 0 && references.every(r => !r.missing);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const compactRun = ({ source, after, before, verification, order, ...run }) => ({ ...run, raw: `raw/${run.kind}/${run.name}`, verificationPath: `${source}/verification.json`, recordedVerification: verification });
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: head,
  archiveComplete: true, allRequiredPassed, cloudWrites: false,
  scope: 'Natural-v2/ocean/integration/Worker scheduling and explicitly observed browser scenarios only; no whole-game, natural-visual, performance, physical-device or cloud acceptance.',
  rootRuns: rootRuns.map(compactRun), latestRoot: latestRoot?.name ?? null,
  browsers: { runs: browserRuns.map(compactRun), required: requiredBrowsers, finalNames: Object.fromEntries(Object.entries(latestBrowsers).map(([role, run]) => [role, run?.name ?? null])), missingBrowserRoles },
  stagingRuns, pending, missing, exclusions,
  binding: { currentSourceDifferences, currentDistDifferences, browserBindings, buildBinding, buildJsonSha256: currentBuildSha256, build: latestRoot?.build ?? null, distCount: latestRoot?.dist?.length ?? null },
  references,
  notes: [
    'All completed failures remain verbatim. A later PASS does not rewrite a failed attempt.',
    'No test counts are summed across staging and root. The latest full root run must independently meet every required check; partial repair evidence is preserved without an invented combined PASS.',
    'Worker candidate first run was terminated after config merging accidentally selected the old suite; no complete first-run PASS is counted. Its lint error and the first zero-case browser Worker startup failure remain raw.',
    'Integration authoring SyntaxError is documented in its original ready manifest; no missing raw log is invented.',
    'Ocean/integration preparation manifests are not test PASS. Mechanism timing is not game speedup or performance acceptance.',
    'Only terminal verification directories are copied. Live temporary Playwright fragments and caches are excluded; completed trace.zip remains exact.',
    'Previous 602-test archive and historical source bundles remain external hashed references, never duplicated. No staged source mirrors, dist payloads or real saves are copied.',
    'PH06 T3/T4 and all formal acceptance status remain unchanged by this recording script.',
  ],
};

// Preflight captured files before any archive writes; preserve a marker on failure.
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed before archive: ${item.source}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`;
fs.writeFileSync(absolute(marker), 'Copy in progress. If this marker remains, preserve this partial archive and inspect the error. Do not overwrite.\n', { flag: 'wx' });
const inventory = [];
function write(name, value) {
  const dest = absolute(`${target}/${name}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  inventory.push({ dest: name, generated: true, bytes: fs.statSync(dest).size, sha256: hash(`${target}/${name}`) });
}
for (const item of files.values()) {
  const dest = absolute(`${target}/${item.dest}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(absolute(item.source), dest, fs.constants.COPYFILE_EXCL);
  assert(fs.statSync(dest).size === item.bytes && hash(`${target}/${item.dest}`) === item.sha256, `Copy mismatch: ${item.source}`);
  inventory.push(item);
}
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Input changed during archive: ${item.source}`);
write('verification.json', verification);
write('references.json', references);
write('README.md', `# 自然大陆与区域海床本地证据\n\n归档复制完成；所列必需检查${allRequiredPassed ? '全部通过（仅 verification.json 所列范围）' : '存在失败、缺项、未完成或绑定差异，不能声明组合通过'}。archiveComplete 只表示原件复制和 SHA 核对完成，与 allRequiredPassed 独立。缺失浏览器类别：${missingBrowserRoles.join('、') || '无'}；未结束目录 ${pending.length} 个。\n\n所有已结束的统一检查、候选检查、机制探针及浏览器失败/修复轮原件见 raw；命令、源码/产物哈希快照、退出码与实际单测计数可追溯。五类浏览器分别要求桌面/手机/平板追加闭环、旧入口和新入口，不把同一桌面项目中的另一测试冒认为已验。移动仿真不是实机。未执行检查不填 PASS，不累加重复单测。\n\n旧 602 集和 preview8 源历史使用 references.json 哈希引用；没有复制候选 src 镜像、dist 产物、真实存档或缓存。最终 trace.zip 按原字节保留。候选海床/接线清单和首轮失败均原样保留；调度机制探针的毫秒数据不能换算成本游戏提速比例。\n\n本文件不更新计划与交接，不代表自然视觉、国家/行政区/城市/军队、真机、性能、整个游戏或云端发布通过。\n`);
const inventoryRecord = { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, note: 'inventory.json excludes itself. Every copied file preserves original bytes and length; generated summaries are separately marked.' };
write('inventory.json', inventoryRecord);
fs.unlinkSync(absolute(marker));
const completedSummary = { archive: target, archiveComplete: true, allRequiredPassed, files: inventory.length, rootRuns: rootRuns.length, browserRuns: browserRuns.length, stagingRuns: stagingRuns.length, pending: pending.length, missingBrowserRoles, buildJsonSha256: currentBuildSha256, cloudWrites: false };
console.log(JSON.stringify(completedSummary, null, 2));
