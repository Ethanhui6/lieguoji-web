import ts from 'typescript';
import { resolve } from 'node:path';
const { options } = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, process.cwd());
const roots = ['hydrology-kernel.ts', 'hydrology-kernel.test.ts', 'hydrology-snapshot.ts', 'hydrology-snapshot.test.ts'].map(f => resolve('src/world', f));
const program = ts.createProgram([...roots, resolve('src/vite-env.d.ts')], options), diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
console.log(JSON.stringify({ diagnostics: diagnostics.length, scope: 'four production hydrology modules plus imported interfaces, no virtual aliases; not global types' }));
process.exitCode = diagnostics.length ? 1 : 0;
