import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const checks = '.autopilot/ph06/asymmetric-coast-checks';
const dest = 'docs/evidence/ph06-asymmetric-coast-2026-09-28';
if (fs.existsSync(dest)) throw Error('Do not overwrite evidence');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const root = read(checks + '/shore-projection-fix/verification.json');
const first = read(checks + '/first/verification.json');
const identity = read(checks + '/shore-projection-fix/identity-verification.json');
if (!root.passed || !root.sourceStable || root.unit.total !== 52 || root.unit.passedAssertions !== 52 || root.results.length !== 6 || root.results.some(r => r.exitCode !== 0) || !identity.passed || first.passed || first.unit.passedAssertions !== 51) throw Error('Unexpected check outcomes');
const snapshot = read(checks + '/shore-projection-fix/source-after.json');
for (const r of [...snapshot, ...root.dist]) if (hash(r.path) !== r.sha256) throw Error('Checked source/dist drift: ' + r.path);
const buildSha = hash('dist/build.json');
if (identity.buildSha256 !== buildSha || root.buildJsonSha256 !== buildSha || root.identityVerificationSha256 !== hash(checks + '/shore-projection-fix/identity-verification.json')) throw Error('Identity unbound');
const files = [];
function add(source, target) {
  if (!fs.existsSync(source)) throw Error('Missing ' + source);
  if (fs.statSync(source).isDirectory()) {
    for (const name of fs.readdirSync(source)) add(source + '/' + name, target + '/' + name);
    return;
  }
  if (/(?:\.env|\.pem|\.pfx|\.sqlite|node_modules|dist\/)/.test(target)) throw Error('Forbidden artifact ' + target);
  const to = dest + '/' + target; fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(source, to, fs.constants.COPYFILE_EXCL);
  if (hash(source) !== hash(to)) throw Error('Copy mismatch');
  files.push({ path: target, source, bytes: fs.statSync(to).size, sha256: hash(to) });
}
for (const round of ['first', 'shore-projection-fix']) add(checks + '/' + round, 'raw/root/' + round);
for (const file of ['run.mjs', 'preparation.json', 'baseline-build.json', 'shape-comparison-first.json', 'shape-comparison-shore-projection-fix.json']) add(checks + '/' + file, 'checks/' + file);
add('.autopilot/ph06/asymmetric-topology-probe', 'diagnostic');
for (const round of ['first', 'shore-projection-fix']) {
  for (const file of ['actual-256-height-field.json', 'actual-256-height-field.png', 'actual-256-height-field.svg'])
    add('.autopilot/ph06/v4-natural-visual-repair-staging/checks/asymmetric-' + round + '/' + file, 'numeric/' + round + '/' + file);
}
for (const file of ['asymmetric-coast-promotion.json', 'asymmetric-coast-review.md', 'natural-coast-next-review.md', 'continuous-relief-visual-followup.md', 'compare-asymmetric-shore.mjs', 'archive-asymmetric-iteration.mjs']) add('.autopilot/ph06/' + file, 'provenance/' + file);
for (const stage of ['v4-asymmetric-coast-staging', 'v4-preview14-history-staging']) for (const file of ['README.md', 'ready-manifest.json']) add('.autopilot/ph06/' + stage + '/' + file, 'preparation/' + stage + '/' + file);
const verification = { recordedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), version: '0.5.0-preview.15', buildJsonSha256: buildSha,
  archiveComplete: true, rootTechnicalPassed: true, allRequiredPassed: false, browserExecuted: false,
  naturalVisualAccepted: false, userAccepted: false, phaseAccepted: false, physicalDeviceAccepted: false, performanceAccepted: false, cloudWrites: false,
  scope: 'Intermediate local coastline iteration. Root 52/52 and actual build verified; previous 51/52 failure retained. Product browsers deliberately not started because same-input numerical outline remains too convex. No overall acceptance.',
  root: { passed: root.passed, units: 52, files: root.unit.files.length, distFiles: root.dist.length, sourceStable: true, identityClassifications: root.classificationCounts },
  unresolved: ['Original eight-point continent remains too rounded: unequal events alone did not produce satisfactory bay/cape morphology.', 'Actual saved product three-device workflow not rerun for this visually rejected intermediate.', 'Natural/user/device/performance and PH acceptance remain open.'],
  fixedCause: 'Independent 2D coastal noise produced a 4.368782 world-squared interior sea hole. Sampling the existing noise at the nearest original rounded shoreline projection removes off-shore oscillation; original one-component and all other checks pass without filtering target loops.',
  diagnostic: 'Initial diagnostic configuration accidentally merged broad test include; that process was stopped, recorded as interrupted, and never counted as passed. Corrected explicit one-file diagnostic completed; production source and bound numerical originals were unchanged.',
};
fs.writeFileSync(dest + '/verification.json', JSON.stringify(verification, null, 2) + '\n');
files.push({ path: 'verification.json', source: 'derived-root-record', bytes: fs.statSync(dest + '/verification.json').size, sha256: hash(dest + '/verification.json') });
fs.writeFileSync(dest + '/inventory.json', JSON.stringify({ files }, null, 2) + '\n');
console.log(JSON.stringify({ dest, files: files.length + 1, rootTechnicalPassed: true, allRequiredPassed: false, browserExecuted: false }));
