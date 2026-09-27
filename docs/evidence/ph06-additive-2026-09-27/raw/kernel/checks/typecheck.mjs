import ts from 'typescript';
import { dirname, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
const stage = resolve('.autopilot/ph06/v4-additive-staging/src');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  const normal = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (normal || !containingFile.replaceAll('\\', '/').startsWith(stage.replaceAll('\\', '/')) || !name.startsWith('.')) return normal;
  const target = resolve(dirname(containingFile), name), path = relative(stage, target);
  if (path.startsWith('..')) return undefined;
  const production = resolve('src', `${path}.ts`);
  return existsSync(production) ? { resolvedFileName: production, extension: ts.Extension.Ts } : undefined;
});
const program = ts.createProgram([
  resolve(stage, 'world/generation/detail-shape-add.ts'),
  resolve(stage, 'world/generation/detail-shape-add.test.ts'),
], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
}));
console.log(JSON.stringify({ rootFiles: program.getRootFileNames(), diagnostics: diagnostics.length, scope: 'Two additive staging files and their imported dependencies; not the complete project' }));
process.exitCode = diagnostics.length ? 1 : 0;
