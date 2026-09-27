import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd(), base = path.join(root, '.autopilot/ph06/regional-coast-staging');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = JSON.parse(readFileSync(path.join(base, 'baseline.json'), 'utf8'));
const originalOutline = readFileSync(path.join(root, 'src/world/generation/detail-natural-outline.ts'));
if (sha(originalOutline) !== baseline.baseline.find(item => item.file === 'src/world/generation/detail-natural-outline.ts').sha256) throw new Error('Original coast source moved; refuse to relabel baseline');
mkdirSync(path.join(base, 'baseline'), { recursive: true });
const old = path.join(base, 'baseline/detail-natural-outline.ts');
if (!existsSync(old)) writeFileSync(old, originalOutline, { flag: 'wx' });
for (const module of ['seed', 'detail-shape']) {
  const target = path.join(base, `baseline/${module}.ts`);
  if (!existsSync(target)) writeFileSync(target, `export * from '../../../../src/world/generation/${module}';\n`, { flag: 'wx' });
}
const candidates = ['src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-shape-natural.ts'];
const effective = new Map();
const visit = file => {
  if (effective.has(file)) return;
  if (!file.startsWith('src/world/') || file.includes('..')) throw new Error(`Unexpected dependency path: ${file}`);
  const staged = candidates.includes(file), content = readFileSync(path.join(staged ? base : root, file));
  effective.set(file, { file, sha256: sha(content), staged });
  const ast = ts.createSourceFile(file, content.toString('utf8'), ts.ScriptTarget.Latest, true);
  const dependency = specifier => { if (!specifier.startsWith('.')) throw new Error(`External runtime dependency: ${specifier}`); visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`))); };
  const walk = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause, typesOnly = clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
      if (!typesOnly) dependency(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependency(node.moduleSpecifier.text);
    ts.forEachChild(node, walk);
  };
  walk(ast);
};
visit('src/world/generation/detail-shape-natural-adapter.ts'); visit('src/world/generation/detail-shape-natural-add-adapter.ts');
const list = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = list(base).filter(file => !file.endsWith('ready-manifest.json')).map(file => ({ path: path.relative(base, file).replaceAll('\\', '/'), sha256: sha(readFileSync(file)) }));
writeFileSync(path.join(base, 'ready-manifest.json'), JSON.stringify({ recordedAt: new Date().toISOString(), status: 'candidate-not-run',
  productionPromoted: false, cpuChecksRun: false, gpuRun: false, cloudWrites: false,
  candidates, heightPlanningFineWorldPreserved: readFileSync(path.join(base, candidates[1]), 'utf8').includes("heightPlanning: 'fine-world'"),
  preservedRegressionFiles: baseline.baseline.filter(item => item.file.endsWith('.test.ts')).map(item => ({ ...item,
    unchanged: sha(readFileSync(path.join(base, item.file))) === item.sha256 })),
  productionBaseline: baseline.baseline.filter(item => candidates.includes(item.file)), runtimeSourceOverlay: [...effective.values()].sort((a, b) => a.file.localeCompare(b.file)), files,
  limits: { features: 48, bins: 128, references: 1024, candidatesPerBin: 8, fineStepWorld: 2, newRegionMinimumPerimeterWorld: 2048, maximumFineNoiseDisplacementWorld: 2 },
  note: 'Source/test candidate only. No check or visual acceptance is claimed. Must reverify dependency hashes before any CPU run.' }, null, 2) + '\n');
console.log(JSON.stringify({ candidates, stagedFiles: files.length, sha256: sha(readFileSync(path.join(base, 'ready-manifest.json'))), status: 'candidate-not-run' }));
