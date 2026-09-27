import ts from 'typescript';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/natural-ranges-staging');
const options = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, verbatimModuleSyntax: true, allowImportingTsExtensions: true,
  types: ['vite/client', 'node'] };
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  let result = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (!result && name.startsWith('.') && containingFile.includes('natural-ranges-staging')) result = ts.resolveModuleName(name, path.join(root, 'src/world/generation', path.basename(containingFile)), options, host).resolvedModule;
  return result;
});
const files = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'src/world/generation/fine-range-tree.ts', 'natural-ranges.test.ts', 'natural-writer.test.ts', 'vitest.config.ts'].map(name => path.join(stage, name));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
console.log(diagnostics.length ? ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n' }) : 'PASS: six isolated roots and resolved dependencies, no emit.');
process.exitCode = diagnostics.length ? 1 : 0;
