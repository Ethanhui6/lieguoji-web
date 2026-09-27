// Copy the visually rejected local preview17 iteration. Never execute checks,
// generation, browsers or deployment. Exit0 means archive integrity only.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checks = '.autopilot/ph06/branching-relief-checks';
const target = 'docs/evidence/ph06-branching-relief-2026-09-28';
const prior = 'docs/evidence/ph06-coast-scale-2026-09-28';
const history = 'docs/evidence/ph06-preview16-generator-history-2026-09-28';
const stage = '.autopilot/ph06/v4-branching-relief-staging';
const fixedRound = `${checks}/numeric-scale-type-fix`, firstRound = `${checks}/first`;
const numericRoot = '.autopilot/ph06/v4-natural-visual-repair-staging/checks/branching-numeric-scale-type-fix';
const buildSha = 'c96ba4db34112dd6d3c23a8d5b103847d2c7d0b84701481b636fc9515f1f3b0e';
const priorBuildSha = '967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499';
const firstSha = '6c55b1548305deb4760f4aef29e1ecbc84a48eaf2af7c26d88c8bb5d1e60551d';
const checkedSha = '8725b1e2d2d86bb8f76c6d86d48144b597b6982de1c11d3336c7abf745be7030';
const identitySha = 'afa5d8c42b9670c79e1127c8ac77e0a0e78be94f454e0d4fae7ab7cc77f8c105';
const helper = 'src/world/generation/detail-orography.ts';
const assert = (ok, why) => { if (!ok) throw new Error(why); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
function absolute(file) {
  assert(typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && file.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe workspace path: ${file}`);
  let full = root;
  for (const part of file.split('/')) { full = path.join(full, part); if (fs.existsSync(full)) assert(!fs.lstatSync(full).isSymbolicLink(), `Symlink evidence path: ${file}`); }
  return full;
}
const exists = file => fs.existsSync(absolute(file));
const bytes = file => { assert(fs.lstatSync(absolute(file)).isFile(), `Not a regular file: ${file}`); return fs.readFileSync(absolute(file)); };
const hash = file => createHash('sha256').update(bytes(file)).digest('hex');
const read = file => JSON.parse(bytes(file).toString().replace(/^\uFEFF/, ''));
const files = new Map(), references = [];
assert(process.argv.length === 2, 'No arguments: fixed intermediate preview17 scope only');
assert(!exists(target), 'Existing evidence must not be overwritten');
function add(source, destination) {
  absolute(`${target}/${destination}`); assert(!files.has(destination), `Duplicate target: ${destination}`);
  files.set(destination, { path: destination, source, bytes: bytes(source).length, sha256: hash(source) });
}
function reference(file) { references.push({ path: file, bytes: bytes(file).length, sha256: hash(file), copied: false }); }
function walk(dir) {
  return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `Symlink under ${dir}`);
    return entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`];
  }).sort();
}
function snapshot(rows) {
  assert(Array.isArray(rows) && rows.length > 0, 'Missing source snapshot'); const map = new Map();
  for (const row of rows) {
    absolute(row.path);
    assert(/^(src\/|tests\/|scripts\/|dist\/|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig\.json$)/.test(row.path) && validHash(row.sha256) && !map.has(row.path), `Malformed snapshot: ${row.path}`);
    map.set(row.path, row.sha256);
  }
  return map;
}
const ordered = rows => [...snapshot(rows)].sort(([a], [b]) => a.localeCompare(b));
function current(rows, names) {
  const map = snapshot(rows); assert(equal([...map.keys()].sort(), names.sort()), 'Incomplete source/dist file set');
  for (const [file, sha] of map) assert(hash(file) === sha, `Checked source/dist drift: ${file}`);
}
const sourceNames = () => [...walk('src'), ...walk('tests'), ...walk('scripts'), 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'];
assert(hash(`${firstRound}/verification.json`) === firstSha && hash(`${fixedRound}/verification.json`) === checkedSha && hash(`${fixedRound}/identity-verification.json`) === identitySha, 'Actual root/identity records changed');
const first = read(`${firstRound}/verification.json`), checked = read(`${fixedRound}/verification.json`), identity = read(`${fixedRound}/identity-verification.json`);
const firstBefore = read(`${firstRound}/source-before.json`), firstAfter = read(`${firstRound}/source-after.json`), fixedBefore = read(`${fixedRound}/source-before.json`), fixedAfter = read(`${fixedRound}/source-after.json`);
assert(first.passed === false && first.unit.available === false && first.unit.passed === false && first.results.length === 3 && equal(first.results.map(row => [row.name, row.exitCode]), [['plan', 0], ['lint', 0], ['types', 2]]) && !exists(`${firstRound}/unit.json`) && !exists(`${firstRound}/build.json`), 'Original TS failure must remain a pre-unit failure');
assert(bytes(`${firstRound}/types.log`).toString().includes('TS2322') && first.sourceStable === true && equal(ordered(firstBefore), ordered(firstAfter)), 'Original TS2322/stability evidence missing');
assert(checked.passed === true && checked.sourceStable === true && checked.allCommandsPassed === true && checked.generatorIdentityVerified === true && checked.results.length === 6 && equal(checked.results.map(row => row.name), ['plan', 'lint', 'types', 'unit', 'build', 'dist-audit']) && checked.results.every(row => row.exitCode === 0 && !row.signal && !row.error && Number.isFinite(Date.parse(row.startedAt)) && Date.parse(row.finishedAt) >= Date.parse(row.startedAt)), 'Corrected root commands not actually passed');
assert(equal(ordered(fixedBefore), ordered(fixedAfter)), 'Corrected root source changed during checks');
const oldMap = snapshot(firstAfter), newMap = snapshot(fixedBefore);
const delta = [...new Set([...oldMap.keys(), ...newMap.keys()])].filter(file => oldMap.get(file) !== newMap.get(file));
assert(equal(delta, [helper]), 'Root correction must change only the scalar type annotation');
const oldHelper = `${stage}/${helper}`, oldText = bytes(oldHelper).toString(), newText = bytes(helper).toString();
assert(oldMap.get(helper) === hash(oldHelper) && newMap.get(helper) === hash(helper) && oldText.includes('let scale = OROGRAPHY_UNION.epsilonQ;') && newText === oldText.replace('let scale = OROGRAPHY_UNION.epsilonQ;', 'let scale: number = OROGRAPHY_UNION.epsilonQ;'), 'Correction differs from the real one-line numeric scale annotation');
const fix = { path: helper, beforeSha256: hash(oldHelper), afterSha256: hash(helper), changedSnapshotPaths: delta, exactChange: 'let scale = OROGRAPHY_UNION.epsilonQ; -> let scale: number = OROGRAPHY_UNION.epsilonQ;', runtimeFormulaChanged: false, originalStagingBytesPreserved: true };
const unit = read(`${fixedRound}/unit.json`), scope = read(`${fixedRound}/scope.json`), assertions = unit.testResults.flatMap(row => row.assertionResults ?? []);
const unitNames = unit.testResults.map(row => (path.isAbsolute(row.name) ? path.relative(root, row.name) : row.name).replaceAll('\\', '/')).sort();
assert(unit.success === true && unit.numTotalTests === 113 && unit.numPassedTests === 113 && unit.numFailedTests === 0 && unit.numPendingTests === 0 && unit.numFailedTestSuites === 0 && unitNames.length === 16 && equal(unitNames, [...scope.unitFiles].sort()) && equal(unitNames, checked.unit.files.map(row => row.path).sort()) && assertions.length === 113 && assertions.every(row => row.status === 'passed'), 'Actual 16-file/113-assertion unit evidence differs');
for (const file of unit.testResults) { const name = (path.isAbsolute(file.name) ? path.relative(root, file.name) : file.name).replaceAll('\\', '/'); assert(file.assertionResults.length === checked.unit.files.find(row => row.path === name)?.assertions, `Unit file count differs: ${name}`); }
const build = read('dist/build.json'), baseline = read(`${checks}/baseline-build.json`);
assert(build.version === '0.5.0-preview.17' && hash('dist/build.json') === buildSha && hash(`${fixedRound}/build.json`) === buildSha && checked.buildJsonSha256 === buildSha && hash(`${checks}/baseline-build.json`) === priorBuildSha && hash(`${history}/build.json`) === priorBuildSha, 'Exact build17/frozen16 identity required');
assert(identity.passed === true && identity.errors.length === 0 && identity.engineUnchanged === true && identity.sourceStable === true && identity.buildSha256 === buildSha && identity.priorBuildSha256 === priorBuildSha && identity.sourceSnapshotSha256 === hash(`${fixedRound}/source-after.json`) && checked.identityVerificationSha256 === identitySha && identity.orographyIncluded === true && build.engineFingerprint === baseline.engineFingerprint, 'Identity receipt not bound to actual checked source');
const keys = Object.keys(build).filter(key => key.endsWith('Generator')).sort();
assert(keys.length === 11 && equal(keys, identity.checks.map(row => row.key).sort()), 'Missing/duplicate generator closure');
for (const row of identity.checks) assert(row.currentMatchesBuild === true && row.frozenMatchesPrior === true && equal(row.actual, build[row.key]) && equal(row.frozen, baseline[row.key]), `Generator closure mismatch: ${row.key}`);
const terrainKeys = ['naturalDetailGenerator', 'addNaturalDetailGenerator', 'localDetailReliefGenerator'];
assert(equal(identity.requiredOrographyClosures.map(row => row.key).sort(), [...terrainKeys].sort()) && identity.requiredOrographyClosures.every(row => row.helper === helper && row.includedInActualRuntimeClosure === true && row.includedInBuild === true && build[row.key].files.includes(helper)), 'Actual helper dependency omitted');

// Preserve every original file in the two known completed root output folders.
// A browser directory would contradict this no-browser intermediate scope.
for (const entry of fs.readdirSync(absolute(checks), { withFileTypes: true })) if (entry.isDirectory()) assert(['first', 'numeric-scale-type-fix'].includes(entry.name), `Unexpected round/browser evidence: ${entry.name}`);
for (const name of ['first', 'numeric-scale-type-fix']) for (const file of walk(`${checks}/${name}`)) {
  const relative = file.slice(`${checks}/${name}/`.length); assert(!relative.includes('/') && /\.(json|log)$/.test(relative), `Unexpected raw root artifact: ${file}`); add(file, `raw/root/${name}/${relative}`);
}
for (const file of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'baseline-build.json']) add(`${checks}/${file}`, `runners/${file}`);
for (const file of ['branching-relief-promotion.json', 'promote-branching-relief.mjs', 'branching-relief-review.md', 'record-preview17-visual.mjs', 'archive-branching-iteration.mjs']) add(`.autopilot/ph06/${file}`, `provenance/${file}`);
for (const file of ['ready-manifest.json', 'ready-manifest.before-review.json', 'README.md', 'REVIEW_CORRECTIONS.md']) add(`${stage}/${file}`, `preparation/v4-branching-relief-staging/${file}`);
for (const file of ['ready-manifest.json', 'README.md']) add(`.autopilot/ph06/v4-preview16-history-staging/${file}`, `preparation/v4-preview16-history-staging/${file}`);
assert(hash(`${stage}/ready-manifest.json`) === 'd455d305e543a31ab1eaa9aa8d24e2f8450708df7528a1c7995f0fc55d7a9523' && hash(`${stage}/ready-manifest.before-review.json`) === '93231e7afc402e293ef37fe9007aa1443f508eac72745c4c49697d3e5c70b985', 'Candidate or original invalidated ready changed');
const promotion = read('.autopilot/ph06/branching-relief-promotion.json');
assert(promotion.promoted === true && promotion.version === build.version && promotion.priorArchive === prior && promotion.priorBuildSha256 === priorBuildSha && promotion.files.length === 5 && promotion.history.target === history && promotion.history.buildSha256 === priorBuildSha && promotion.history.inventorySha256 === hash(`${history}/inventory.json`) && promotion.history.provenanceSha256 === hash(`${history}/provenance.json`), 'Promotion/history binding differs');
for (const row of promotion.stageIdentities) assert(hash(row.path) === row.sha256, 'Promoted ready manifest differs');
for (const row of promotion.files) {
  assert(row.source.startsWith('.autopilot/ph06/v4-') && row.target.startsWith('src/') && hash(row.source) === row.afterSha256 && oldMap.get(row.target) === row.afterSha256 && (row.target === helper || hash(row.target) === row.afterSha256), `Promoted source or first-round snapshot differs: ${row.target}`);
  add(row.source, `preparation/promoted/${row.target}`);
}
add(helper, `source/root-type-fix/${helper}`);
for (const file of [`${prior}/verification.json`, `${prior}/inventory.json`, `${history}/build.json`, `${history}/provenance.json`, `${history}/inventory.json`]) reference(file);
assert(read(`${prior}/verification.json`).archiveComplete === true && read(`${prior}/verification.json`).buildJsonSha256 === priorBuildSha, 'Prior archive identity differs');
for (const file of ['actual-256-height-field.json', 'actual-256-height-field.png', 'actual-256-height-field.svg']) reference(`.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-first/${file}`);
const numericNames = ['actual-256-height-field.json', 'actual-256-height-field.png', 'actual-256-height-field.svg'];
const numericShas = ['611601262ed224565300278b0835a221041019e1d7317367846c5b5653811618', '514501f698d1d7e0a55d370464e4a0247eba11874bd34e3ea7e628676a115b40', '97ef2fe3990aa9a427d2e8287c40467a730c6cc04ad0b80869f40d1f8cba0057'];
const unitCommand = checked.results.find(row => row.name === 'unit');
for (const [index, name] of numericNames.entries()) {
  const file = `${numericRoot}/${name}`, time = fs.statSync(absolute(file)).mtimeMs;
  assert(hash(file) === numericShas[index] && time >= Date.parse(unitCommand.startedAt) && time <= Date.parse(unitCommand.finishedAt), `Actual unit-produced numeric evidence differs: ${file}`);
  add(file, `numeric/numeric-scale-type-fix/${name}`);
}
const numericData = read(`${numericRoot}/actual-256-height-field.json`), previousNumeric = read('.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-first/actual-256-height-field.json');
assert(equal(numericData.recipe, previousNumeric.recipe) && numericData.seed === 'fine-native-additive' && numericData.size === 256, 'Same-input actual diagnostic recipe changed');
const comparison = read(`${checks}/numeric-comparison.json`), correction = read(`${checks}/root-correction.json`);
assert(comparison.sameRecipe === true && comparison.sameTargetCoast === true && comparison.sameLandArea === true && comparison.sameSeaArea === true && comparison.naturalVisualAccepted === false
  && comparison.before.path === '.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-first/actual-256-height-field.json' && comparison.before.sha256 === hash(comparison.before.path)
  && comparison.after.path === `${numericRoot}/actual-256-height-field.json` && comparison.after.sha256 === numericShas[0]
  && equal(numericData.targetCoast, previousNumeric.targetCoast) && numericData.summary.landAreaTwiceQ2 === previousNumeric.summary.landAreaTwiceQ2 && numericData.summary.seaAreaTwiceQ2 === previousNumeric.summary.seaAreaTwiceQ2, 'Recorded same-coast numerical comparison unbound');
assert(correction.source === helper && correction.beforeSha256 === fix.beforeSha256 && correction.afterSha256 === fix.afterSha256 && correction.failure === `${firstRound}/types.log` && correction.testedIn === `${fixedRound}/verification.json` && text(correction.reason), 'Original root-correction record unbound');
add(`${checks}/numeric-comparison.json`, 'numeric/numeric-comparison.json'); add(`${checks}/root-correction.json`, 'provenance/root-correction.json');
const visualPath = `${checks}/visual-review.json`, visual = read(visualPath);
assert(visual && !Array.isArray(visual) && typeof visual.recordedAt === 'string' && Number.isFinite(Date.parse(visual.recordedAt)) && visual.buildJsonSha256 === buildSha && text(visual.scope) && /数值|numeric/i.test(visual.scope) && /不是产品|非产品|not (?:a )?(?:product|browser)/i.test(visual.scope) && Array.isArray(visual.observations) && visual.observations.length > 0 && visual.observations.every(text), 'A dated, negative numerical observation explicitly distinguished from product screenshots is required');
assert(visual.naturalVisualAccepted === false && Array.isArray(visual.screenshots) && visual.screenshots.length === 1 && visual.screenshots[0].path === `${numericRoot}/actual-256-height-field.png` && visual.screenshots[0].sha256 === numericShas[1], 'Visual observation must bind the actual numeric PNG; no product browser was run');
for (const key of ['accepted', 'visualAccepted', 'userAccepted', 'phaseAccepted', 'physicalDeviceAccepted', 'performanceAccepted', 'browserExecuted']) assert(visual[key] !== true, `Intermediate observation cannot grant ${key}`);
add(visualPath, 'observations/visual-review.json');

function stable() {
  assert(hash('dist/build.json') === buildSha, 'Build changed during archive'); current(fixedAfter, sourceNames()); current(checked.dist, walk('dist'));
  assert(checked.dist.length === 25 && walk('dist').length === 25, 'Unexpected dist file count');
  for (const row of files.values()) assert(hash(row.source) === row.sha256 && bytes(row.source).length === row.bytes, `Selected original changed: ${row.source}`);
  for (const row of references) assert(hash(row.path) === row.sha256 && bytes(row.path).length === row.bytes, `Referenced original changed: ${row.path}`);
}
stable();
const verification = {
  schema: 1, recordedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), version: build.version, buildJsonSha256: buildSha,
  archiveComplete: true, rootTechnicalPassed: true, technicalPassed: true, allRequiredPassed: false, browserExecuted: false, naturalVisualAccepted: false, visualAccepted: false, userAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, allAccepted: false, cloudWrites: false,
  scope: 'Visually rejected intermediate preview17. Corrected root113 and actual build passed. Product browser workflows deliberately not executed after numerical image rejection; technicalPassed covers root checks only.',
  root: { round: 'numeric-scale-type-fix', passed: true, assertions: 113, files: 16, distFiles: 25, sourceStable: true, verificationSha256: checkedSha, identitySha256: identitySha, identityClassifications: identity.classificationCounts },
  originalFailure: { round: 'first', passed: false, verificationSha256: firstSha, failure: 'TS2322: scale inferred as literal0.000001', unitExecuted: false, buildExecuted: false },
  rootTypeCorrection: { ...fix, originalRecord: correction }, identity: { passed: true, buildJsonSha256: buildSha, priorBuildSha256: priorBuildSha, sourceSnapshotSha256: identity.sourceSnapshotSha256, engineUnchanged: true, orographyIncluded: true },
  numeric: { sameRecipe: true, comparison, producer: 'src/world/generation/detail-natural-visual-repair.test.ts', sourceSha256: snapshot(fixedAfter).get('src/world/generation/detail-natural-visual-repair.test.ts'), producedDuringActualUnitCommand: true, files: numericNames.map((name, i) => ({ path: `${numericRoot}/${name}`, sha256: numericShas[i] })), productScreenshot: false },
  visual: { required: true, complete: true, bound: true, accepted: false, decision: 'rejected-for-natural-visual', productScreenshots: false, observation: visual },
  priorEvidence: { preview16: prior, frozenHistory: history, referencedOnly: true, priorBrowserResultsAreNotPreview17Results: true },
  unresolved: ['Actual numerical terrain image remains visually unacceptable; see original negative observations.', 'No changed-version product browser workflow executed; final terrain and UI iteration requires its own actual three-device checks.', 'User, whole-natural, physical-device, performance and PH acceptance remain open.'],
  notes: ['Original failed first round and unavailable identity/unit/build outcome preserved verbatim.', 'Corrected source differs from reviewed staging only by the explicit number annotation; both original staging and actual checked helper are retained.', 'Candidate static review and authored tests are not retrospectively described as executed. Actual corrected root unit.json supplies113 assertions.', 'No inferred browser pass, inherited browser acceptance, uploaded dist, private save or credential is included. Archive exit0 denotes copying/hash integrity only.'],
};
fs.mkdirSync(absolute(target), { recursive: false });
const marker = `${target}/ARCHIVE_INCOMPLETE.txt`; fs.writeFileSync(absolute(marker), 'Incomplete until final source/dist and original-byte integrity checks finish.\n', { flag: 'wx' });
const inventory = [];
for (const row of files.values()) { const file = `${target}/${row.path}`; fs.mkdirSync(path.dirname(absolute(file)), { recursive: true }); fs.copyFileSync(absolute(row.source), absolute(file), fs.constants.COPYFILE_EXCL); assert(hash(file) === row.sha256 && bytes(file).length === row.bytes, `Copy mismatch: ${row.path}`); inventory.push(row); }
stable();
function write(name, data) { const file = `${target}/${name}`; fs.writeFileSync(absolute(file), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' }); inventory.push({ path: name, generated: true, bytes: bytes(file).length, sha256: hash(file) }); }
write('verification.json', verification); write('root-type-correction.json', fix); write('references.json', { references });
write('README.md', '# 主支山系 preview17 中间版本证据\n\n修复后的16文件113断言、真实构建与11生成器身份检查通过；原first在TS2322处停止，未执行unit/build，原件完整保留。root只为scale添加number类型，真实修后源码和原staging分别保留。\n\nrootTechnicalPassed/technicalPassed仅为本批工程检查，allRequiredPassed=false。实际数值图经过观察仍未达到自然视觉要求，故未启动本版本三端产品浏览器；browserExecuted=false，自然、用户、PH、真机与性能验收仍false。这里的PNG是数值高程诊断图，不是产品截图，不能用preview16的浏览器结果替代。\n\n本脚本不执行生成、测试、构建或浏览器。exit0只表示原件复制与指纹绑定完成。\n');
write('inventory.json', { schema: 1, recordedAt: verification.recordedAt, files: [...inventory], references, excludesSelf: true });
fs.unlinkSync(absolute(marker));
console.log(JSON.stringify({ target, archiveComplete: true, rootTechnicalPassed: true, technicalPassed: true, allRequiredPassed: false, browserExecuted: false, naturalVisualAccepted: false, files: inventory.length }, null, 2));
