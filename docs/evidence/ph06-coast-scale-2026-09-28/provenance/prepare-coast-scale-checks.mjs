// Prepare only. Reuse the successfully executed narrow runner; never start checks here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const source = '.autopilot/ph06/asymmetric-coast-checks/run.mjs';
const target = '.autopilot/ph06/coast-scale-checks/run.mjs';
if (process.argv.length !== 2 || fs.existsSync(target)) throw new Error('No arguments or overwriting allowed');
if (!fs.existsSync('.autopilot/ph06/coast-scale-checks/baseline-build.json')) throw new Error('Promote the bound preview15 baseline first');
let code = fs.readFileSync(source, 'utf8');
const replace = (from, to, count = 1) => {
  if (code.split(from).length - 1 !== count) throw new Error(`Runner template drift: ${from}`);
  code = code.split(from).join(to);
};
replace('.autopilot/ph06/asymmetric-coast-checks', '.autopilot/ph06/coast-scale-checks');
replace('0.5.0-preview.15', '0.5.0-preview.16', 2);
replace('Expected promoted preview15', 'Expected promoted preview16');
replace('0.5.0-preview.14', '0.5.0-preview.15');
replace('Actual frozen preview14 baseline not bound', 'Actual frozen preview15 baseline not bound');
replace('docs/evidence/ph06-preview14-generator-history-2026-09-28', 'docs/evidence/ph06-preview15-generator-history-2026-09-28');
replace('src/world/detail-preview14-history.test.ts', 'src/world/detail-preview15-history.test.ts', 2);
replace('702726d6fa956e2f647ff2fe91d9f136479aeef3888acc151c30bd0e95712075', 'ca7fe62d32063f080795512b60f9f91a01baf49852c4fb1239d368488f91052e');
replace('"src/world/generation/detail-shape-natural.test.ts": 12', '"src/world/generation/detail-shape-natural.test.ts": 13');
replace('asymmetric-${label}', 'coast-scale-${label}', 2);
replace('Asymmetric real coast shape, first/additive natural generation, affected stored identity and actual additive safety. Historical unit scope is not repeated wholesale.', 'Physical coast scale and whole-normal coverage, first/additive natural generation, stored identity and additive safety. Ten affected files; prior failures remain preserved.');
replace('Affected asymmetric coast data, addition and stored compatibility checks only; not natural visual, performance, physical device, PH or cloud acceptance.', 'Affected coast-scale data, addition and stored compatibility checks only; not natural visual, performance, physical device, PH or cloud acceptance.');
replace('Preview14 curved relief/local background and renderer reuse checks outside this affected selection remain prior evidence only.', 'Preview14 unchanged lock/relief browser evidence is historical only. Preview15 additive product browsers were not run. This runner grants no browser or visual acceptance.');
fs.writeFileSync(target, code, { flag: 'wx' });
console.log(JSON.stringify({ prepared: target, unitFiles: 10, expectedAssertions: 53, actualClosureFunctions: 11, numericLabel: 'coast-scale-<round>', checksRun: [] }));
