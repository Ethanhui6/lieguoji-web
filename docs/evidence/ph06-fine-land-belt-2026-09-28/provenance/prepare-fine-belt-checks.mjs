import fs from 'node:fs';
const out = '.autopilot/ph06/fine-belt-checks', old = '.autopilot/ph06/branching-relief-checks';
function replaceOnce(source, before, after) { if (!source.includes(before)) throw new Error('Missing preparation source'); return source.replace(before, after); }
const visual = 'src/world/generation/detail-natural-visual-repair.test.ts';
let text = fs.readFileSync(visual, 'utf8');
text = replaceOnce(text, 'Authoritative 256-sample terrain / 16-world coarse spacing', 'Authoritative terrain / 2-world persisted land heights');
text = replaceOnce(text, 'White: input outline. Height samples at 4 world; persisted fine coast + Hbase.', 'White: input outline. Height sampled at 4 world from the persisted fine field.');
text = replaceOnce(text, 'Actual persisted fine-height/coverage + Hbase; a numeric slice, not product-renderer or visual acceptance. Inland resolution remains 16-world coarse samples.', 'Actual persisted 2-world land-height/coverage with unchanged Hbase for implicit sea/old fields; sampled at 4 world. Numeric evidence, not product-renderer or visual acceptance.');
fs.writeFileSync(visual, text);
let run = fs.readFileSync(`${old}/run.mjs`, 'utf8').replaceAll(old, out);
run = replaceOnce(run, '"src/world/generation/detail-orography.test.ts",', '"src/world/generation/detail-orography.test.ts",\n  "src/world/generation/detail-natural-writer.test.ts",');
run = replaceOnce(run, '"src/world/detail-preview16-history.test.ts",', '"src/world/detail-preview16-history.test.ts",\n  "src/world/detail-preview17-history.test.ts",');
run = replaceOnce(run, '"src/world/detail-preview16-history.test.ts": 5', '"src/world/detail-preview16-history.test.ts": 5,\n  "src/world/detail-preview17-history.test.ts": 5,\n  "src/world/generation/detail-natural-writer.test.ts": 6,\n  "src/world/generation/detail-orography.test.ts": 16');
run = run.replaceAll('ph06-preview16-generator-history', 'ph06-preview17-generator-history').replaceAll('967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499', 'c96ba4db34112dd6d3c23a8d5b103847d2c7d0b84701481b636fc9515f1f3b0e');
run = run.replaceAll('0.5.0-preview.17', '0.5.0-preview.18').replaceAll('0.5.0-preview.16', '0.5.0-preview.17');
const first = run.indexOf("  const candidate = read('.autopilot/ph06/v4-branching-relief-staging/ready-manifest.json');"), last = run.indexOf('  for (const file of unitFiles)', first);
if (first < 0 || last <= first) throw new Error('Candidate precondition block not found');
run = run.slice(0, first) + "  const candidate = read('.autopilot/ph06/fine-belt-promotion.json');\n  if (candidate.version !== '0.5.0-preview.18' || candidate.cloudWrites !== false) throw new Error('Reviewed local promotion required');\n" + run.slice(last);
run = run.replaceAll('branching-${label}', 'fine-belt-${label}')
  .replaceAll('Branching relief:', 'Fine land-height writer and connected mountain belt:')
  .replaceAll('Sixteen affected files;', 'Eighteen affected files; exact new land physical heights replace the old Hbase-join assumption, while sea and old readers remain protected;')
  .replaceAll('Prior preview16 three-device additive technical results remain bound historical evidence only.', 'Prior preview16 three-device additive technical results remain bound historical evidence only; preview17 had no browser run.')
  .replaceAll('Expected promoted preview17', 'Expected promoted preview18').replaceAll('Actual frozen preview16', 'Actual frozen preview17');
fs.writeFileSync(`${out}/run.mjs`, run, { flag: 'wx' });
for (const file of ['browser.mjs', 'playwright.config.ts']) {
  const content = fs.readFileSync(`${old}/${file}`, 'utf8').replaceAll(old, out).replaceAll('0.5.0-preview.17', '0.5.0-preview.18').replaceAll('preview17', 'preview18');
  fs.writeFileSync(`${out}/${file}`, content, { flag: 'wx' });
}
console.log('Prepared 18-file affected root checks, browser runner and corrected numeric metadata; no test assertions relaxed.');
