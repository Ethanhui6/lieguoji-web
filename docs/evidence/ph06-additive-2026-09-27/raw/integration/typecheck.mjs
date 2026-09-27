import ts from 'typescript';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
const repo = process.cwd(), stage = resolve('.autopilot/ph06/v4-additive-integration-staging');
const { options } = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, repo);
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  if (name.startsWith('.')) {
    const target = resolve(dirname(containingFile), name), inStage = relative(stage, target), inRepo = relative(repo, target);
    const logical = !isAbsolute(inStage) && !inStage.startsWith('..') ? inStage : inRepo;
    if (!isAbsolute(logical) && !logical.startsWith('..')) for (const base of [stage, repo]) for (const suffix of ['', '.ts', '.tsx']) {
      const file = resolve(base, logical + suffix);
      if (existsSync(file) && /\.tsx?$/.test(file)) return { resolvedFileName: file, extension: file.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts };
    }
  }
  return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
});
const baseline = JSON.parse(readFileSync(resolve(stage, 'baseline-manifest.json'), 'utf8'));
const paths = [...baseline.sources.map(file => file.path), 'src/world/generation/detail-shape-add-adapter.ts', 'src/world/detail-add-integration.test.ts', 'src/world/detail-add-history.test.ts', 'vitest.integration.config.ts'];
const roots = paths.filter(file => /\.tsx?$/.test(file)).map(file => resolve(stage, file));
const program = ts.createProgram(roots, options, host), diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
console.log(JSON.stringify({ diagnostics: diagnostics.length, rootFiles: roots.length, scope: 'Only integration staging mirrors and their transitive imports; not a full project build' }));
process.exitCode = diagnostics.length ? 1 : 0;
