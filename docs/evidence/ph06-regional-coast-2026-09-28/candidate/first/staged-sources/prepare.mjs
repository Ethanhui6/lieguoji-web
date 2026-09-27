import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd(), staging = path.join(root, '.autopilot/ph06/regional-coast-staging');
const files = ['src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-shape-natural.ts',
  'src/world/generation/detail-natural-coast-plan.test.ts', 'src/world/generation/detail-natural-visual-repair.test.ts',
  'src/world/generation/detail-natural-writer.test.ts', 'src/world/detail-natural-integration.test.ts'];
const baseline = [];
for (const file of files) {
  const content = readFileSync(path.join(root, file)), target = path.join(staging, file);
  mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content, { flag: 'wx' });
  baseline.push({ file, sha256: createHash('sha256').update(content).digest('hex') });
}
// Proxies serve unmodified dependencies only. The config maps the two staged
// production modules globally, so adapter/additive/session paths see them too.
const imports = new Set();
for (const file of files) {
  const source = readFileSync(path.join(staging, file), 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${match[1]}.ts`));
    if (!files.includes(relative)) imports.add(relative);
  }
}
for (const file of imports) {
  const target = path.join(staging, file), original = path.join(root, file);
  readFileSync(original); mkdirSync(path.dirname(target), { recursive: true });
  let specifier = path.relative(path.dirname(target), original).replaceAll('\\', '/').replace(/\.ts$/, '');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  writeFileSync(target, `/** Staging-only proxy; production dependency remains unchanged. */\nexport * from '${specifier}';\n`, { flag: 'wx' });
}
writeFileSync(path.join(staging, 'baseline.json'), JSON.stringify({ recordedAt: new Date().toISOString(), baseline,
  untouchedDependencies: [...imports], note: 'Copied before staged edits; only two production candidates are intended for promotion. No test has run.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ copied: files.length, dependencyProxies: imports.size, baseline: '.autopilot/ph06/regional-coast-staging/baseline.json' }));
