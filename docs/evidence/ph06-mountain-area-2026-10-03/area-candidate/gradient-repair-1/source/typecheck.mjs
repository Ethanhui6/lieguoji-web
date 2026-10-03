import ts from 'typescript';
import path from 'node:path';
const root = process.cwd(), stage = path.join(root, '.autopilot/ph06/ridge-landform-staging/area-v2');
const options = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, verbatimModuleSyntax: true,
  allowImportingTsExtensions: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX, types: ['vite/client', 'node'] };
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  let result = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (!result && name.startsWith('.') && containingFile.replaceAll('\\', '/').includes('/ridge-landform-staging/')
    && /\/(baseline\/)?runtime\//.test(containingFile.replaceAll('\\', '/'))) {
    result = ts.resolveModuleName(name, path.join(root, 'src/world/generation', path.basename(containingFile)), options, host).resolvedModule;
  }
  return result;
});
const files = ['runtime/fine-range-tree.ts', 'runtime/detail-orography.ts', 'runtime/terrain-massif.ts', 'area.test.ts', 'preview.test.ts',
  'physical-image.ts', 'capture-input.ts', 'source-binding.ts', 'vitest.config.ts', 'gradient-noise.test.ts'].map(name => path.join(stage, name));
files.push(path.join(root, 'src/vite-env.d.ts'));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
console.log(diagnostics.length ? ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n' })
  : 'PASS: isolated area runtime, two cases, exact-capture physical preview and dependencies.');
process.exitCode = diagnostics.length ? 1 : 0;
