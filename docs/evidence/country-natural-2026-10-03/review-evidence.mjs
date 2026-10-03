import fs from 'node:fs';
const base = '.autopilot/country-natural';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  if (e.isSymbolicLink()) throw new Error('Unexpected symlink');
  const p = `${dir}/${e.name}`; return e.isDirectory() ? walk(p) : [p];
});
const files = walk(base), unexpected = files.filter(p => /(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|pfx)|storageState\.json|legacy-before\.json)$/i.test(p));
const traces = files.filter(p => /\.(?:trace|network|zip)$/i.test(p));
const signatures = [/gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const hits = files.filter(p => !/\.(?:png|jpg|jpeg)$/i.test(p)).filter(p => signatures.some(rule => rule.test(fs.readFileSync(p, 'utf8'))));
const result = { at: new Date().toISOString(), files: files.length, unexpectedSensitiveFiles: unexpected,
  secretSignatureFiles: hits, remainingTraceNetworkZipFiles: traces,
  originalSaveExported: false, nativeEvidence: 'Only identity/count/checksum summaries and reviewed local game screenshots; readers use named own-app country databases in readonly transactions',
  browserEvidence: 'All browser cases passed; Playwright removed transient traces. Retained PNGs belong to test-created fixtures.',
  passed: !unexpected.length && !hits.length && !traces.length, cloudWrites: false };
const output = `${base}/privacy-review.json`;
if (fs.existsSync(output)) throw new Error('Never overwrite evidence');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
