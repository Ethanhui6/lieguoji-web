import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/fine-world-relief-staging');
const options = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, verbatimModuleSyntax: true, allowImportingTsExtensions: true,
  types: ['vite/client', 'node'] };
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  let answer = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (!answer && name.startsWith('.') && containingFile.includes('fine-world-relief-staging')) {
    answer = ts.resolveModuleName(name, path.join(root, 'src/world/generation', path.basename(containingFile)), options, host).resolvedModule;
  }
  return answer;
});
const files = ['src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-orography.ts', 'fine-world-relief.test.ts', 'vitest.config.ts'].map(name => path.join(stage, name));
const program = ts.createProgram(files, options, host), diagnostics = ts.getPreEmitDiagnostics(program);
const output = ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n' });
fs.writeFileSync(path.join(stage, 'typecheck.log'), output || `PASS: ${files.length} staged roots and resolved dependencies, no emit.\n`);
console.log(output || `PASS: ${files.length} staged roots and resolved dependencies, no emit.`);
process.exitCode = diagnostics.length ? 1 : 0;
