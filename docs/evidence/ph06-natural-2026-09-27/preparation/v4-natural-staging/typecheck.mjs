import ts from 'typescript';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
const repo = process.cwd(), stage = resolve('.autopilot/ph06/v4-natural-staging');
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
const names = ['src/world/generation/detail-shape-natural.ts', 'src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-natural-relief.ts', 'src/world/generation/detail-shape-natural.test.ts', 'vitest.config.ts'];
const program = ts.createProgram(names.map(file => resolve(stage, file)), options, host), diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
console.log(JSON.stringify({ diagnostics: diagnostics.length, rootFiles: names.length, scope: 'New natural kernel staging and transitive imports only; not global product checks' }));
process.exitCode = diagnostics.length ? 1 : 0;
