import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const base = '.autopilot/ph06', checks = `${base}/fine-belt-checks`, target = 'docs/evidence/ph06-fine-land-belt-2026-09-28';
const hash = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex'), read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const check = (yes, why) => { if (!yes) throw new Error(why); };
check(process.argv.length === 2 && !fs.existsSync(target), 'Fixed fresh archive only');
const root = read(`${checks}/first/verification.json`), build = read('dist/build.json');
check(root.passed && root.sourceStable && root.unit.total === 125 && root.unit.passedAssertions === 125 && root.generatorIdentityVerified, 'Actual 125-test root pass required');
check(build.version === '0.5.0-preview.18' && root.buildJsonSha256 === hash('dist/build.json') && hash(`${checks}/first/build.json`) === root.buildJsonSha256, 'Actual checked dist required');
for (const row of [...read(`${checks}/first/source-after.json`), ...root.dist]) check(hash(row.path) === row.sha256, `Checked source or dist changed: ${row.path}`);
const browsers = [];
for (const device of ['desktop', 'mobile', 'tablet']) {
  const dir = `${checks}/${device}-first`, v = read(`${dir}/verification.json`), r = read(`${dir}/results.json`);
  check(v.passed && v.sourceAndDistStable && v.buildSameAfter && v.buildJsonSha256 === root.buildJsonSha256 && v.retries === 0 && v.timeoutMs === 450000 && r.stats.expected === 1 && r.stats.unexpected === 0 && r.stats.flaky === 0 && r.errors.length === 0, `Actual ${device} browser pass required`);
  browsers.push({ project: v.project, elapsedMs: v.elapsedMs, verificationSha256: hash(`${dir}/verification.json`), physicalDevice: false });
}
const ui = read(`${checks}/ui-first-binding/verification.json`);
check(ui.passed && ui.sourceAndDistStable && ui.buildJsonSha256 === root.buildJsonSha256 && ui.code === 0, 'Actual responsive UI/running cancel pass required');
const files = new Map(), references = [];
function safe(f) { check(!path.isAbsolute(f) && !f.includes('\\') && f.split('/').every(p => p && p !== '.' && p !== '..'), `Unsafe project path: ${f}`); }
function add(source, dest) {
  safe(source); safe(dest); check(!files.has(dest) && fs.lstatSync(source).isFile() && !fs.lstatSync(source).isSymbolicLink(), `Invalid archive file: ${source}`);
  files.set(dest, { path: dest, source, bytes: fs.statSync(source).size, sha256: hash(source) });
}
function collect(dir, dest, filter = () => true) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    check(!e.isSymbolicLink(), 'No evidence symlink'); const file = `${dir}/${e.name}`, to = `${dest}/${e.name}`;
    if (e.isDirectory()) collect(file, to, filter); else if (filter(file)) add(file, to);
  }
}
const rawFilter = f => /\.(json|jsonl|log|png|svg|txt)$/.test(f) && !f.includes('/attachments/') && !f.includes('/traces/');
collect(`${checks}/first`, 'raw/root/first', rawFilter);
for (const device of ['desktop', 'mobile', 'tablet']) {
  const dir = `${checks}/${device}-first`; collect(dir, `raw/browser/${device}-first`, rawFilter);
  for (const trace of read(`${dir}/verification.json`).traces ?? []) references.push({ ...trace, bytes: fs.statSync(trace.path).size, copied: false, reason: 'Local diagnostic trace retained at original path; no user saves or release bundle included.' });
}
collect(`${checks}/ui-first-binding`, 'raw/ui/binding', rawFilter);
collect(`${base}/map-chrome-browser-staging/checks/ui-first`, 'raw/ui/ui-first', rawFilter);
for (const name of ['run.mjs', 'browser.mjs', 'playwright.config.ts', 'ui.mjs', 'baseline-build.json']) add(`${checks}/${name}`, `runners/${name}`);
for (const name of ['run.mjs', 'playwright.config.ts', 'README.md', 'tests/atlas-map-chrome.spec.ts']) add(`${base}/map-chrome-browser-staging/${name}`, `runners/ui/${name}`);
collect(`${base}/v4-fine-belt-staging`, 'prechecks/combined', f => /\.(ts|mjs|json|jsonl|log|png|svg|md)$/.test(f));
collect(`${base}/v4-orography-visual-fix-staging`, 'prechecks/orography', f => /\.(ts|mjs|json|jsonl|log|png|svg|md)$/.test(f));
collect(`${base}/height-plane-diagnostic`, 'prechecks/height-and-writer', f => /\.(ts|mjs|json|jsonl|log|png|svg|md|patch)$/.test(f));
for (const file of ['baseline.json', 'README.md', 'candidate/src/editor/AtlasStudio.tsx', 'candidate/src/editor/atlas-studio.css']) add(`${base}/v4-map-chrome-staging/${file}`, `prechecks/ui/${file}`);
for (const file of ['fine-belt-promotion.json', 'promote-fine-belt.mjs', 'prepare-fine-belt-precheck.mjs', 'prepare-fine-belt-checks.mjs', 'preview17-history-promotion.json', 'promote-preview17-history.mjs', 'fine-belt-visual-review.json', 'archive-fine-belt.mjs']) add(`${base}/${file}`, `provenance/${file}`);
const changed = [...read(`${base}/fine-belt-promotion.json`).files.map(r => r.target), 'src/world/generation/detail-natural-visual-repair.test.ts', 'src/world/generation/detail-shape-natural.test.ts'];
for (const source of changed) add(source, `accepted-source/${source}`);
collect(`${base}/v4-natural-visual-repair-staging/checks/fine-belt-first`, 'numeric/root-first', rawFilter);
for (const file of ['build.json', 'inventory.json', 'provenance.json']) { const source = `docs/evidence/ph06-preview17-generator-history-2026-09-28/${file}`; references.push({ path: source, sha256: hash(source), bytes: fs.statSync(source).size, copied: false }); }
const visual = read(`${base}/fine-belt-visual-review.json`);
check(visual.naturalVisualAccepted === false && visual.actualViewed.length >= 4, 'Actual visual limitations and viewed product images must be recorded');
fs.mkdirSync(target);
for (const row of files.values()) { const dest = `${target}/${row.path}`; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(row.source, dest, fs.constants.COPYFILE_EXCL); check(hash(dest) === row.sha256, 'Archive byte mismatch'); }
fs.writeFileSync(`${target}/inventory.json`, JSON.stringify({ recordedAt: new Date().toISOString(), files: [...files.values()], references }, null, 2) + '\n');
const verification = { recordedAt: new Date().toISOString(), archiveComplete: true, technicalPassed: true, allRequiredLocalChecksPassed: true, buildJsonSha256: root.buildJsonSha256, version: build.version, root: { assertions: 125, files: 18, sourceStable: true, actualGeneratorClosures: 11 }, browsers, ui: { passed: true, elapsedMs: ui.durationMs, actualRunningHeightCancellation: true, responsiveStates: 5, physicalDevice: false },
  preservedFirstFailure: 'Writer precheck first failed before discovering tests because fingerprint defines were missing; original record retained alongside fix.',
  actualCopyFiles: files.size, inventorySha256: hash(`${target}/inventory.json`), naturalVisualAccepted: false, userVisualAccepted: false, physicalDeviceAccepted: false, phaseAccepted: false, performanceAccepted: false, cloudWrites: false,
  remaining: ['Rounded high peaks and strong blue coast halo remain visual issues.', 'New Atlas nations, administration, cities, troops and wars remain unimplemented.', 'PH07 pure drainage kernel is a separately tracked candidate, not a player-visible river system.'] };
fs.writeFileSync(`${target}/verification.json`, JSON.stringify(verification, null, 2) + '\n');
const attr = fs.readFileSync('.gitattributes', 'utf8'), rule = `${target}/** -text`;
if (!attr.split(/\r?\n/).includes(rule)) fs.writeFileSync('.gitattributes', attr + (attr.endsWith('\n') ? '' : '\n') + rule + '\n');
console.log(JSON.stringify({ target, files: files.size, version: build.version, technicalPassed: true, naturalVisualAccepted: false }));
