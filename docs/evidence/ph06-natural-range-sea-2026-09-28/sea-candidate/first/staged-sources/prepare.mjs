import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/ocean-material-staging');
const candidates = ['src/world/terrain-material.ts', 'src/world/terrain-mesh.ts', 'src/world/renderer.ts'];
const stagedTests = ['terrain-material.test.ts', 'terrain-mesh.test.ts', 'ocean-material.test.ts', 'ocean-material-cache.test.ts'].map(file => `src/world/${file}`);
const preservedTests = ['detail-terrain-shader', 'detail-terrain-light', 'detail-terrain-pages', 'detail-terrain-backend', 'renderer', 'renderer-detail-reuse'].map(file => `src/world/${file}.test.ts`);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resolve = (importer, specifier) => {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  throw new Error(`Missing static dependency: ${importer} -> ${specifier}`);
};
function imports(file) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return ast.statements.flatMap(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? [node.moduleSpecifier.text] : []);
}
const shims = new Set();
for (const file of [...candidates, ...stagedTests]) for (const specifier of imports(path.join(staging, file))) {
  if (!specifier.startsWith('.')) continue;
  const stagedTarget = path.resolve(path.dirname(path.join(staging, file)), specifier);
  if (fs.existsSync(`${stagedTarget}.ts`) || fs.existsSync(stagedTarget)) continue;
  const productionTarget = resolve(path.join(root, file), specifier);
  const shim = path.join(staging, path.relative(root, productionTarget));
  fs.mkdirSync(path.dirname(shim), { recursive: true });
  const target = path.relative(path.dirname(shim), productionTarget).replaceAll('\\', '/').replace(/\.ts$/, '');
  fs.writeFileSync(shim, `// Staging type/runtime bridge; production source is unchanged.\nexport * from '${target}';\n`, { flag: 'wx' });
  shims.add(path.relative(staging, shim).replaceAll('\\', '/'));
}
const runtime = new Map(), externals = new Set();
function visit(file) {
  if (runtime.has(file)) return;
  const candidate = candidates.includes(file), actual = path.join(candidate ? staging : root, file);
  runtime.set(file, { file, staged: candidate, sha256: hash(actual) });
  for (const specifier of imports(actual)) {
    if (!specifier.startsWith('.')) { externals.add(specifier); continue; }
    visit(path.relative(root, resolve(path.join(root, file), specifier)).replaceAll('\\', '/'));
  }
}
for (const file of candidates) visit(file);
const manifest = {
  status: 'static-candidate-awaiting-cpu-window', baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  candidates, stagedTests, preservedTests, shims: [...shims].sort(),
  baselineFiles: candidates.map(file => ({ file, sha256: hash(path.join(root, file)) })),
  runtimeSourceOverlay: [...runtime.values()].sort((a, b) => a.file.localeCompare(b.file)), externalImports: [...externals].sort(),
  packageSources: ['package.json', 'package-lock.json'].map(file => ({ file, sha256: hash(path.join(root, file)) })),
  historicalOracle: { file: 'baseline/preview21-terrain-material.ts', sha256: hash(path.join(staging, 'baseline/preview21-terrain-material.ts')), source: 'src/world/terrain-material.ts' },
  cpuChecksRun: false, productionPromoted: false, gpuRun: false, visualAccepted: false, cloudWrites: false,
};
fs.writeFileSync(path.join(staging, 'ready-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: manifest.status, baselineCommit: manifest.baselineCommit, runtimeSources: runtime.size, candidates, tests: [...stagedTests, ...preservedTests] }));
