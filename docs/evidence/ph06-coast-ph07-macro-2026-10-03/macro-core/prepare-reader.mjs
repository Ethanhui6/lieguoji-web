import fs from 'node:fs';
const base = '.autopilot/ph07/macro-flow-staging/src/world';
let source = fs.readFileSync('src/world/hydrology-reader-owned.ts', 'utf8');
const start = source.indexOf('  const readPage = async '), end = source.indexOf('  return Object.freeze({ readPage, close:', start);
if (start < 0 || end < 0) throw Error('Reader structure changed');
let macro = source.slice(start, end).replace('const readPage = async (raw: HydrologyNodeRectangle): Promise<HydrologyReaderPage>', 'const readMacroGrid = async (): Promise<HydrologyMacroGrid>');
const validationStart = macro.indexOf("    if (!generationExact(raw,"), validationEnd = macro.indexOf('    if (pages + 1 >', validationStart);
if (validationStart < 0 || validationEnd < 0) throw Error('Reader validation structure changed');
macro = macro.slice(0, validationStart) + '    const count = MACRO_FLOW.nodes;\n' + macro.slice(validationEnd);
macro = macro.replaceAll('originColumn + index % columns', '(index % MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride')
  .replaceAll('originRow + Math.floor(index / columns)', 'Math.floor(index / MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride')
  .replaceAll('水文读取器：', '宏观水文读取器：');
const resultStart = macro.indexOf('        source: { ...source }, kernelInput:'), resultEnd = macro.indexOf('        locks: { ...locks', resultStart);
if (resultStart < 0 || resultEnd < 0) throw Error('Reader output structure changed');
macro = macro.slice(0, resultStart) + `        format: 'lieguoji-hydrology-macro-grid', version: 1, grid: { ...MACRO_GRID },\n        source: { ...source }, coverageQ, groundMeters,\n` + macro.slice(resultEnd);
source = source.slice(0, end) + macro + source.slice(end);
source = source.replace('  readPage: (rectangle: HydrologyNodeRectangle) => Promise<HydrologyReaderPage>;', '  readPage: (rectangle: HydrologyNodeRectangle) => Promise<HydrologyReaderPage>;\n  readMacroGrid: () => Promise<HydrologyMacroGrid>;')
  .replace('return Object.freeze({ readPage, close:', 'return Object.freeze({ readPage, readMacroGrid, close:')
  .replace(/from '(\.\/[^']+)'/g, (_match, specifier) => `from '../../../../../src/world/${specifier.slice(2)}'`);
source = `import { MACRO_FLOW, MACRO_GRID, type HydrologyMacroGrid } from './hydrology-macro-contract';\n` + source;
fs.writeFileSync(`${base}/hydrology-reader-owned.ts`, source, { flag: 'wx' });
let test = fs.readFileSync('src/world/hydrology-reader-owned.test.ts', 'utf8')
  .replace(/from '(\.\/[^']+)'/g, (_match, specifier) => specifier === './hydrology-reader-owned' ? `from '${specifier}'` : `from '../../../../../src/world/${specifier.slice(2)}'`)
  .replace("toEqual(['close', 'readPage'])", "toEqual(['close', 'readMacroGrid', 'readPage'])");
test += fs.readFileSync('.autopilot/ph07/macro-flow-staging/macro-reader-tests.part', 'utf8');
fs.writeFileSync(`${base}/hydrology-reader-owned.test.ts`, test, { flag: 'wx' });
console.log('Prepared reader candidate and old+macro behavior tests; no checks run.');
