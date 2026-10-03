import ts from 'typescript';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/coast-curves-staging');
const options = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, verbatimModuleSyntax: true,
  allowImportingTsExtensions: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX, types: ['vite/client', 'node'] };
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  let result = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  const inside = containingFile.replaceAll('\\', '/');
  if (!result && name.startsWith('.') && inside.startsWith(stage.replaceAll('\\', '/')) && /\/(runtime|baseline)\//.test(inside)) {
    result = ts.resolveModuleName(name, path.join(root, 'src/world/generation', path.basename(containingFile)), options, host).resolvedModule;
  }
  return result;
});
const files = ['runtime/detail-natural-outline.ts', 'baseline/detail-natural-outline.ts', 'corners.test.ts', 'input.ts', 'outline-image.ts', 'preview.test.ts', 'vitest.config.ts'].map(file => path.join(stage, file));
files.push(path.join(root, 'src/vite-env.d.ts'));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
console.log(diagnostics.length ? ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n' }) : 'PASS: isolated candidate, legacy outline oracle, five cases and captured-input diagnostic.');
process.exitCode = diagnostics.length ? 1 : 0;
