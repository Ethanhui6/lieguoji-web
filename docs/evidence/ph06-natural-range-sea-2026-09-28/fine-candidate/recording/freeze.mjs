import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Static archival only. This does not rerun tests, import product runtime or build.
const stage = '.autopilot/ph06/natural-ranges-staging', round = `${stage}/checks/repair-2`;
const target = `${stage}/ready`, sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (fs.existsSync(target)) throw new Error('Refusing to replace a frozen candidate.');
const verification = JSON.parse(fs.readFileSync(`${round}/verification.json`, 'utf8'));
if (!verification.passed || !verification.sourceStable) throw new Error('Repair-2 was not stable and passing.');
fs.mkdirSync(target, { recursive: true });
for (const [file, expected] of Object.entries(verification.sourceAfter)) {
  const bytes = fs.readFileSync(`${round}/source/${file}`);
  if (sha(bytes) !== expected || sha(fs.readFileSync(`${stage}/${file}`)) !== expected) throw new Error(`Frozen tested source mismatch: ${file}`);
  const to = `${target}/source/${file}`; fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, bytes);
}
for (const name of ['verification.json', 'unit.json', 'unit.log', 'types.log', 'lint.log', 'measurements.json', 'writer-measurements.json']) {
  fs.copyFileSync(`${round}/${name}`, `${target}/${name}`);
}
const modules = ['detail-natural-relief.ts', 'detail-orography.ts', 'fine-range-tree.ts'].map(n => `src/world/generation/${n}`);
const supplementary = ['src/world/generation/seed.ts', 'src/world/generation/detail-curved-ridge.ts'];
const supplementalDependencies = supplementary.map(file => {
  const bytes = fs.readFileSync(file), stat = fs.statSync(file), to = `${target}/postcheck-dependencies/${file}`;
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, bytes);
  return { file, sha256: sha(bytes), capturedAt: new Date().toISOString(), lastWriteAt: stat.mtime.toISOString(), provenance: 'Post-check supplemental snapshot; not captured by repair-2 runner.' };
});
const readForGraph = file => fs.readFileSync(modules.includes(file) ? `${target}/source/${file}` : file, 'utf8');
function closure(entry) {
  const files = new Set();
  const visit = file => {
    if (files.has(file)) return; files.add(file);
    const ast = ts.createSourceFile(file, readForGraph(file), ts.ScriptTarget.Latest, true);
    const dependency = specifier => {
      if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${file}: ${specifier}`);
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)));
    };
    const walk = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const onlyTypes = clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
        if (!onlyTypes) dependency(node.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependency(node.moduleSpecifier.text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
  };
  visit(entry); return [...files].sort();
}
const entries = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-shape-natural-adapter.ts',
  'src/world/generation/detail-shape-natural-add-adapter.ts', 'src/world/generation/local-detail-relief-adapter.ts'];
const repairOne = JSON.parse(fs.readFileSync(`${stage}/checks/repair-1/verification.json`, 'utf8'));
const manifest = {
  status: 'candidate-only-frozen', capturedAt: new Date().toISOString(), checkRound: 'repair-2',
  verifiedSource: verification.sourceAfter, promotionRuntimeFiles: modules,
  repairOneRuntimeBytesUnchanged: modules.every(file => verification.sourceAfter[file] === repairOne.sourceAfter[file]),
  units: verification.units, types: 'passed', lint: 'passed', productionIntegrated: false, gpuRun: false, buildRun: false, visualAccepted: false,
  evidenceBoundary: 'Repair-2 captured the seven listed candidate/harness sources and before/after hashes of the two baseline production relief modules. Other real writer dependencies were not contemporaneously snapshotted. Do not treat supplemental files or static dependency lists as a tested whole-product closure.',
  supplementalDependencies,
  staticClosureLists: entries.map(entry => ({ entry, files: closure(entry), identity: 'Static names only; no candidate generator fingerprint or current product identity is claimed.' })),
  preservedRounds: ['checks/first', 'checks/repair-1', 'checks/repair-2'],
};
fs.writeFileSync(`${target}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ status: manifest.status, modules, runtimeUnchangedFromRepairOne: manifest.repairOneRuntimeBytesUnchanged,
  closureCounts: manifest.staticClosureLists.map(c => ({ entry: c.entry, files: c.files.length })), manifestSHA256: sha(fs.readFileSync(`${target}/manifest.json`)) }));
