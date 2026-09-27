// Prepare-only until explicitly invoked. Exit 0 means recording completed;
// archiveComplete, allRequiredPassed, and allAccepted have separate meanings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = 'docs/evidence/ph06-natural-repair-2026-09-27';
const checks = '.autopilot/ph06/natural-repair-checks';
const visual = '.autopilot/ph06/v4-natural-visual-repair-staging';
const owned = '.autopilot/ph06/v4-owned-replacement-copy-staging';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const slash = p => p.replaceAll('\\', '/');
function absolute(p) {
  const full = path.resolve(root, p), rel = path.relative(root, full);
  assert(rel && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`), `Unsafe path: ${p}`);
  return full;
}
const exists = p => fs.existsSync(absolute(p));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = p => sha(fs.readFileSync(absolute(p)));
const read = p => JSON.parse(fs.readFileSync(absolute(p), 'utf8'));
const optional = p => exists(p) ? read(p) : null;
assert(process.argv.length === 2, 'No arguments: discover only the named evidence directories.');
assert(!exists(target), `Refusing to overwrite archive: ${target}`);
const files = new Map(), pending = [], missing = [], excluded = [];
function add(source, dest, required = true) {
  if (!exists(source)) { if (required) missing.push(source); return; }
  const stat = fs.lstatSync(absolute(source));
  assert(stat.isFile() && !stat.isSymbolicLink(), `Expected regular evidence: ${source}`);
  assert(!files.has(dest) || files.get(dest).source === source, `Duplicate output: ${dest}`);
  files.set(dest, { source, dest, bytes: stat.size, sha256: hash(source) });
}
const blocked = new Set(['src', 'tests', 'scripts', 'node_modules', 'dist', 'cache', 'vite-cache', 'resources', 'playwright-report', 'frozen-source', 'evidence']);
const extensions = new Set(['.json', '.log', '.md', '.txt', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.webm', '.zip', '.mjs']);
function copySelection(dir, dest) {
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    const source = `${dir}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Symlink evidence: ${source}`);
    if (entry.name.startsWith('.') || blocked.has(entry.name)) { excluded.push(source); continue; }
    if (entry.isDirectory()) copySelection(source, `${dest}/${entry.name}`);
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) add(source, `${dest}/${entry.name}`);
    else excluded.push(source);
  }
}
function snapshot(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const result = new Map();
  for (const row of rows) {
    if (typeof row.path !== 'string' || !/^[a-f0-9]{64}$/i.test(row.sha256 ?? '')) return null;
    const name = slash(path.isAbsolute(row.path) ? path.relative(root, row.path) : row.path).replace(/^\.\//, '');
    absolute(name); if (result.has(name)) return null; result.set(name, row.sha256.toLowerCase());
  }
  return result;
}
function sameSnapshot(before, after) {
  const a = snapshot(before), b = snapshot(after);
  return !!a && !!b && a.size === b.size && [...a].every(([p, value]) => b.get(p) === value);
}
function differences(rows, filter = () => true) {
  const values = snapshot(rows);
  return values ? [...values].filter(([p]) => filter(p)).flatMap(([p, expected]) => exists(p) && hash(p) === expected ? [] : [{ path: p, expected, actual: exists(p) ? hash(p) : null }]) : [{ reason: 'Missing or malformed snapshot' }];
}
function unitSummary(data) {
  if (!data) return { available: false, passed: false };
  const assertions = (data.testResults ?? []).flatMap(f => f.assertionResults ?? []);
  const counts = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests, failedSuites: data.numFailedTestSuites };
  return { available: true, counts, observed: assertions.length, passed: data.success === true && counts.total > 0 && counts.passed === counts.total && counts.failed === 0 && counts.pending === 0 && counts.failedSuites === 0 && assertions.length === counts.total && assertions.every(t => t.status === 'passed') };
}
function playwrightSummary(data) {
  const tests = [];
  function walk(suites) { for (const suite of suites ?? []) { for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) tests.push({ file: spec.file ?? suite.file, title: spec.title, project: test.projectName, status: test.status, attempts: (test.results ?? []).map(r => ({ status: r.status, retry: r.retry, duration: r.duration })) }); walk(suite.suites); } }
  walk(data?.suites);
  return { stats: data?.stats ?? null, tests, passed: !!data && tests.length > 0 && !(data.errors?.length) && data.stats?.unexpected === 0 && data.stats?.skipped === 0 && data.stats?.flaky === 0 && tests.every(t => t.status === 'expected' && t.attempts.length === 1 && t.attempts[0].status === 'passed' && t.attempts[0].retry === 0) };
}
const exitPresent = (code, signal) => Number.isInteger(code) || typeof signal === 'string';
function discover(dir, staging = false) {
  if (!exists(dir)) return [];
  const runs = [];
  for (const entry of fs.readdirSync(absolute(dir), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    assert(!entry.isSymbolicLink(), `Symlink run: ${entry.name}`);
    const source = `${dir}/${entry.name}`, preflightPath = `${source}/preflight-aborted.json`, vp = `${source}/verification.json`;
    if (exists(preflightPath)) {
      const data = read(preflightPath);
      assert(data.kind === 'runner-preflight-aborted' && data.testsStarted === false && data.buildStarted === false && Number.isInteger(data.exitCode), `Malformed preflight record: ${source}`);
      runs.push({ name: entry.name, source, kind: 'preflight-aborted', data, order: fs.statSync(absolute(preflightPath)).mtimeMs });
      continue;
    }
    if (!exists(vp)) { pending.push({ directory: source, reason: 'No terminal verification; not copied or counted.' }); continue; }
    let data;
    try { data = read(vp); } catch { pending.push({ directory: source, reason: 'Verification not completely readable; possibly still writing.' }); continue; }
    const kind = staging ? 'staging' : data.project ? 'browser' : entry.name.startsWith('foundation-') ? 'foundation' : 'root';
    const done = kind === 'browser' ? Number.isFinite(data.elapsedMs) && exitPresent(data.code, data.signal)
      : Array.isArray(data.results) && data.results.length > 0 && data.results.every(r => exitPresent(r.exitCode ?? r.code, r.signal) && (staging || r.finishedAt));
    if (!done) { pending.push({ directory: source, reason: 'No supported terminal exit record.' }); continue; }
    runs.push({ name: entry.name, source, kind, data, order: fs.statSync(absolute(vp)).mtimeMs });
  }
  return runs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
const roles = {
  desktop: ['desktop-chromium', 'atlas-add-detail-coast.spec.ts'], mobile: ['mobile-chromium', 'atlas-add-detail-coast.spec.ts'], tablet: ['tablet-chromium', 'atlas-add-detail-coast.spec.ts'],
  legacy: ['desktop-chromium', 'atlas-detail-coast.spec.ts'], entry: ['desktop-chromium', 'atlas-natural-entry.spec.ts'],
};
const records = discover(checks), browserRuns = [], rootRuns = [], foundations = [], preflights = [];
for (const run of records) {
  const { source, data } = run; const raw = `raw/${run.kind}/${run.name}`; copySelection(source, raw);
  if (run.kind === 'preflight-aborted') { preflights.push({ name: run.name, raw, recorded: data, acceptance: 'not-run; runner preflight failure, not test FAIL or PASS' }); continue; }
  const build = optional(`${source}/build.json`);
  if (run.kind === 'browser') {
    const before = optional(`${source}/before.json`), after = optional(`${source}/after.json`), result = playwrightSummary(optional(`${source}/results.json`));
    const role = Object.keys(roles).find(r => run.name.startsWith(`${r}-`)) ?? null, expected = role ? roles[role] : null;
    const selectionMatches = !!expected && data.project === expected[0] && result.tests.length > 0 && result.tests.every(t => t.project === expected[0] && path.basename(t.file ?? '') === expected[1]);
    const stable = data.sourceAndDistStable === true && sameSnapshot(before, after);
    browserRuns.push({ ...run, raw, after, build, result, selectionMatches, role, stable, passed: data.code === 0 && !data.signal && stable && selectionMatches && result.passed });
  } else {
    const before = optional(`${source}/source-before.json`), after = optional(`${source}/source-after.json`), unit = unitSummary(optional(`${source}/unit.json`));
    const required = run.kind === 'foundation' ? ['plan', 'lint', 'types', 'unit'] : ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit'];
    const stable = data.sourceStable === true && sameSnapshot(before, after);
    const passed = required.every(name => data.results.some(r => r.name === name && r.exitCode === 0 && !r.signal)) && stable && unit.passed;
    const record = { ...run, raw, after, build, unit, stable, passed, required, scope: optional(`${source}/scope.json`), buildRequired: run.kind !== 'foundation', buildNotRunIsFailure: run.kind !== 'foundation' };
    (run.kind === 'foundation' ? foundations : rootRuns).push(record);
  }
}
const stageRuns = discover(`${visual}/checks`, true).map(run => {
  const raw = `raw/visual-candidate/${run.name}`; copySelection(run.source, raw);
  const unit = unitSummary(optional(`${run.source}/unit.json`));
  const stable = run.data.sourceUnchanged === true && sameSnapshot(optional(`${run.source}/source-before.json`), optional(`${run.source}/source-after.json`));
  return { name: run.name, raw, recorded: run.data, unit, stable, passed: unit.passed && stable && ['typecheck', 'lint', 'unit'].every(name => run.data.results.some(r => r.name === name && r.code === 0 && !r.signal)) };
});
for (const [dir, label, names] of [
  [visual, 'visual-candidate', ['baseline-manifest.json', 'ready-manifest.json', 'README.md', 'run.mjs', 'typecheck.mjs', 'vitest.config.ts']],
  [owned, 'owned-replacement-copy', ['ready-manifest.json', 'README.md', 'vitest.config.ts', 'finalize-manifest.mjs']],
]) for (const name of names) add(`${dir}/${name}`, `preparation/${label}/${name}`);
for (const name of ['run.mjs', 'foundation.mjs', 'browser.mjs', 'playwright.config.ts']) add(`${checks}/${name}`, `runners/${name}`);
for (const name of ['archive-natural-repair.mjs', 'natural-visual-repair-review.md', 'natural-visual-continuity-review.md', 'natural-followup-foundation-promotion.json', 'natural-visual-repair-promotion.json', 'promote-natural-followup-foundation.mjs', 'promote-natural-visual-repair.mjs', 'nearshore-shading-next.md', 'next-playable-boundary.md', 'record-natural-repair-observations.mjs']) add(`.autopilot/ph06/${name}`, `provenance/${name}`);

const observations = [];
for (const entry of fs.readdirSync(absolute(checks), { withFileTypes: true })) if (entry.isFile() && /^visual-[a-z0-9-]+\.json$/.test(entry.name)) {
  const source = `${checks}/${entry.name}`, data = read(source); add(source, `observations/${entry.name}`);
  observations.push({ source, data, order: Date.parse(data.recordedAt) || fs.statSync(absolute(source)).mtimeMs });
}
observations.sort((a, b) => a.order - b.order);
for (const name of ['manual-observation.json', 'manual-continent-restored.png', 'http-before.json']) add(`${checks}/${name}`, `observations/${name}`, false);
const latestVisual = observations.at(-1) ?? null;
const manual = optional(`${checks}/manual-observation.json`);
if (manual?.screenshot?.path) {
  const p = manual.screenshot.path;
  assert(p === path.basename(p) && p === 'manual-continent-restored.png', 'Unexpected manual screenshot path; do not follow save references.');
  assert(exists(`${checks}/${p}`) && hash(`${checks}/${p}`) === manual.screenshot.sha256, 'Manual screenshot hash mismatch');
}

const referenceNames = ['docs/evidence/ph06-preview9-generator-history-2026-09-27/build.json', 'docs/evidence/ph06-preview9-generator-history-2026-09-27/provenance.json', 'docs/evidence/ph06-preview9-generator-history-2026-09-27/inventory.json', 'docs/evidence/ph06-natural-2026-09-27/verification.json', 'docs/evidence/ph06-natural-2026-09-27/inventory.json', 'docs/evidence/ph06-natural-2026-09-27/raw/root/first/unit.json', 'docs/adr/0018-natural-landscape-v2.md'];
const references = referenceNames.map(p => exists(p) ? { path: p, bytes: fs.statSync(absolute(p)).size, sha256: hash(p), copied: false } : { path: p, missing: true, copied: false });
const reused908 = unitSummary(optional('docs/evidence/ph06-natural-2026-09-27/raw/root/first/unit.json'));
const latestRoot = rootRuns.at(-1) ?? null, latestFoundation = foundations.at(-1) ?? null;
const buildSha256 = exists('dist/build.json') ? hash('dist/build.json') : null;
const currentSourceDifferences = differences(latestRoot?.after), currentDistDifferences = differences(latestRoot?.data.dist);
const buildMatches = !!buildSha256 && !!latestRoot?.build && hash(`${latestRoot.source}/build.json`) === buildSha256;
function listFiles(dir) { return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(e => { assert(!e.isSymbolicLink(), `Symlink artifact: ${dir}/${e.name}`); return e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]; }); }
const recordedDistNames = snapshot(latestRoot?.data.dist), extraCurrentDistFiles = exists('dist') ? listFiles('dist').filter(p => !recordedDistNames?.has(p)) : [];
const finalBrowsers = Object.entries(roles).map(([role]) => {
  const run = browserRuns.filter(r => r.role === role).at(-1) ?? null;
  const productDifferences = differences(run?.after, p => p.startsWith('src/') || p.startsWith('dist/'));
  const matchesBuild = !!run?.build && !!buildSha256 && hash(`${run.source}/build.json`) === buildSha256;
  return { role, required: ['desktop', 'mobile', 'tablet'].includes(role), name: run?.name ?? null, status: !run ? 'not_verified' : run.passed && matchesBuild && productDifferences.length === 0 ? 'passed' : 'failed_or_unbound', passed: !!run?.passed && matchesBuild && productDifferences.length === 0, matchesBuild, productDifferences };
});
const visualBuildMatches = !!latestVisual && !!buildSha256 && latestVisual.data.buildJsonSha256 === buildSha256;
const naturalVisualAccepted = visualBuildMatches && latestVisual.data.visualAccepted === true;
const expectedRounds = ['first', 'revision2', 'output-guard', 'continuity-first', 'continuity-repair'];
const missingVisualRounds = expectedRounds.filter(name => !stageRuns.some(r => r.name === name));
const finalCandidateRound = stageRuns.at(-1) ?? null;
const allRequiredPassed = !!latestRoot?.passed && !!latestFoundation?.passed && buildMatches && currentSourceDifferences.length === 0 && currentDistDifferences.length === 0 && extraCurrentDistFiles.length === 0
  && finalBrowsers.every(r => (r.required || r.name) ? r.passed : true) && !!finalCandidateRound?.passed && finalCandidateRound.unit.counts?.total === 15 && reused908.passed && reused908.counts?.total === 908
  && missingVisualRounds.length === 0 && pending.length === 0 && missing.length === 0 && references.every(r => !r.missing);
const allAccepted = allRequiredPassed && naturalVisualAccepted;
const compact = ({ after, order, source, ...run }) => ({ ...run, source });
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), headAtRecording: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  archiveComplete: true, allRequiredPassed, naturalVisualAccepted, allAccepted, cloudWrites: false,
  scope: 'This local natural visual repair evidence only; never whole-game, PH completion, user acceptance, physical-device or performance approval.',
  rootRuns: rootRuns.map(compact), foundations: foundations.map(compact), preflights, stageRuns, finalCandidateRound: finalCandidateRound?.name ?? null,
  browsers: { runs: browserRuns.map(compact), final: finalBrowsers },
  binding: { buildJsonSha256: buildSha256, build: latestRoot?.build ?? null, buildMatches, currentSourceDifferences, currentDistDifferences, extraCurrentDistFiles, recordedDistCount: latestRoot?.data.dist?.length ?? null },
  observations: { visual: observations.map(({ order, ...r }) => r), latest: latestVisual?.source ?? null, visualBuildMatches, manual, manualBuildMatches: !!manual && manual.buildJsonSha256 === buildSha256 },
  ownedReplacementCopy: { preparation: optional(`${owned}/ready-manifest.json`), actualPromotedChecks: foundations.map(r => ({ name: r.name, raw: r.raw, unit: r.unit, passed: r.passed })), note: 'The candidate manifest says not_run; promoted 34-test foundation is separate actual evidence, not 8 extra unique passes.' },
  reuse: { preview9Units: reused908, rawReference: 'docs/evidence/ph06-natural-2026-09-27/raw/root/first/unit.json', scope: 'Only unchanged preview9 scope is reused as declared by root scope.json. No sum of 908 + 34 + 32 + staging counts, no whole-suite revalidation claim.' },
  pending, missing, excluded, missingVisualRounds, references,
  notes: [
    'foundation-first is an independent selected unit/static scope with no build planned. Its absent build is not a failed build; later root evidence binds the actual build.',
    'first preflight aborted before starting tests due to a nonexistent selected filename. It is neither a test FAIL nor a PASS.',
    'All five terminal candidate rounds are retained, including continuity-first 534 Q12 versus unchanged 2 Q12 threshold. Final 15 cases do not erase the failure.',
    'Browser modes are verified from actual report spec/project identities; legacy/entry are optional but, if supplied, must bind to current product/dist and pass. Absent optional modes remain not_verified.',
    'Natural visual acceptance comes only from the latest root visual observation bound to the current build; numerical images and green tests cannot set it true.',
    'Manual UI record and screenshot describe a new synthetic test map. No IndexedDB save export, authentication or private data is read or copied.',
    'No production source mirrors, dist payloads, old evidence bundles, caches or live hidden Playwright fragments are copied. Complete trace.zip and new PNG/SVG/JSON bytes remain intact.',
  ],
};
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Evidence changed before copy: ${item.source}`);
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`;
fs.writeFileSync(absolute(marker), 'Copy incomplete until this marker is removed. Preserve partial evidence on error; do not overwrite.\n', { flag: 'wx' });
const inventory = [];
const write = (name, data) => { const full = absolute(`${target}/${name}`); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ dest: name, generated: true, bytes: fs.statSync(full).size, sha256: hash(`${target}/${name}`) }); };
for (const item of files.values()) { const full = absolute(`${target}/${item.dest}`); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.copyFileSync(absolute(item.source), full, fs.constants.COPYFILE_EXCL); assert(fs.statSync(full).size === item.bytes && hash(`${target}/${item.dest}`) === item.sha256, `Copied bytes differ: ${item.dest}`); inventory.push(item); }
for (const item of files.values()) assert(hash(item.source) === item.sha256, `Evidence changed during copy: ${item.source}`);
write('verification.json', verification); write('references.json', references);
write('README.md', `# 自然地貌修复本地证据\n\n归档原件复制完成：archiveComplete=true。必需技术检查组合：${allRequiredPassed ? '所列范围通过' : '存在缺项、失败、未完成或绑定差异'}。根的当前构建视觉观察：${naturalVisualAccepted ? '接受' : '未接受或尚未绑定'}。allAccepted=${allAccepted}，不代表整阶段、用户、真机或性能验收。\n\nfoundation 独立验证私有替换/事务/接收等范围，未安排 build，不能按缺构建判失败。first 的预检路径错误发生在测试启动之前，不计测试失败或通过；完整后续检查另列。候选五轮保留实际PNG/SVG/JSON及原始输出，continuity-first 534>2 的失败不抹除。preview9 908项仅引用原证据，不与34/32/15或重复执行相加。\n\n三端追加浏览器须绑定当前源码与dist；旧entry/legacy若未执行仍记未验。root visual观察是自然外观是否接受的唯一输入，技术绿灯不能代替。手工记录仅为本次新测试地图UI保存/刷新烟测，未导出任何存档。\n\n原始日志、结果、退出码与SHA见raw与inventory；未收录候选源码、生产构建、旧整包、认证、私密资料、缓存或运行中碎片。归档不会修改计划/正式交接或触发云端写入。\n`);
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
const completedSummary = { archive: target, archiveComplete: true, allRequiredPassed, naturalVisualAccepted, allAccepted, files: inventory.length, roots: rootRuns.length, foundations: foundations.length, preflights: preflights.length, candidateRounds: stageRuns.length, browsers: browserRuns.length, pending: pending.length, buildJsonSha256: buildSha256 };
console.log(JSON.stringify(completedSummary, null, 2));
