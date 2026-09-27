import ts from 'typescript';
import { resolve } from 'node:path';
const root = process.cwd(), stage = resolve(root, '.autopilot/ph06/v4-continuous-light-staging');
const parsed = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(parsed.config, ts.sys, root);
const host = ts.createCompilerHost(options), original = host.resolveModuleNames;
host.resolveModuleNames = (names, containing) => names.map(name => {
  const found = ts.resolveModuleName(name, containing, options, host).resolvedModule;
  if (found) return found;
  if (containing.replaceAll('\\', '/').startsWith(stage.replaceAll('\\', '/') + '/src/')) return ts.resolveModuleName(name, resolve(root, containing.slice(stage.length + 1)), options, host).resolvedModule;
  return original?.([name], containing)?.[0];
});
const program = ts.createProgram([resolve(stage, 'src/world/detail-terrain-shader.ts'), resolve(stage, 'src/world/detail-terrain-light.test.ts'), resolve(stage, 'gpu-harness.ts'), resolve(root, 'src/vite-env.d.ts')], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const item of diagnostics) console.error(ts.flattenDiagnosticMessageText(item.messageText, '\n') + (item.file && item.start !== undefined ? ` (${item.file.fileName}:${item.file.getLineAndCharacterOfPosition(item.start).line + 1})` : ''));
console.log(JSON.stringify({ diagnostics: diagnostics.length, rootFiles: program.getRootFileNames() })); process.exitCode = diagnostics.length ? 1 : 0;
