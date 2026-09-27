import ts from 'typescript';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
const repo = process.cwd(), stage = resolve('.autopilot/ph06/v4-natural-visual-repair-staging');
const { options } = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, repo);
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containing) => names.map(name => {
  if (name.startsWith('.')) {
    const target = resolve(dirname(containing), name), baseRoot = [stage, repo].find(root => { const r = relative(root, target); return !isAbsolute(r) && !r.startsWith('..'); });
    if (baseRoot) for (const root of [stage, repo]) for (const suffix of ['', '.ts', '.tsx']) {
      const path = resolve(root, relative(baseRoot, target) + suffix);
      if (existsSync(path) && /\.tsx?$/.test(path)) return { resolvedFileName: path, extension: path.endsWith('.tsx') ? ts.Extension.Tsx : ts.Extension.Ts };
    }
  }
  return ts.resolveModuleName(name, containing, options, host).resolvedModule;
});
const files = ['detail-shape-natural.ts', 'detail-natural-outline.ts', 'detail-natural-relief.ts', 'detail-natural-visual-repair.test.ts'].map(file => resolve(stage, `src/world/generation/${file}`));
const program = ts.createProgram([...files, resolve('src/vite-env.d.ts'), resolve(stage, 'vitest.config.ts')], options, host), diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
console.log(JSON.stringify({ diagnostics: diagnostics.length, scope: 'Only visual-repair staging and transitive production interfaces; not global types' }));
process.exitCode = diagnostics.length ? 1 : 0;
