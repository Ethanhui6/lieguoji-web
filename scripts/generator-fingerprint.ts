import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Follow every runtime dependency instead of maintaining an incomplete list.
 * Type-only imports do not execute; parameter validators are runtime imports
 * and therefore covered. Dynamic/external code is rejected rather than hidden. */
function fingerprintGenerator(entry: string, identity: string, read: (file: string) => string) {
  const sources = new Map<string, string>();
  const visitFile = (file: string) => {
    if (sources.has(file)) return;
    if (!file.startsWith('src/world/') || file.includes('..') || file.includes('\\')) throw new Error(`Unsafe macro generator source: ${file}`);
    const source = read(file).replace(/\r\n/g, '\n'); sources.set(file, source);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const dependency = (specifier: string) => {
      if (!specifier.startsWith('.')) throw new Error(`External macro dependency is not frozen: ${file}: ${specifier}`);
      visitFile(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`)));
    };
    const visitNode = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const onlyTypes = clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
        if (!onlyTypes) dependency(node.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependency(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && ['require', 'eval'].includes(node.expression.text))) throw new Error(`Dynamic macro dependency forbidden: ${file}`);
      ts.forEachChild(node, visitNode);
    };
    visitNode(ast);
  };
  visitFile(entry);
  const files = [...sources.keys()].sort(), hash = createHash('sha256');
  hash.update(`lieguoji-${identity}-runtime-closure-v1\n`);
  for (const file of files) hash.update(`${file}\n${sources.get(file)}\n`);
  return { sha256: hash.digest('hex'), files };
}
export function fingerprintMacroGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/macro.ts', 'macro-landmass', read);
}
export function fingerprintLandformGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/landforms.ts', 'landforms', read);
}
export function fingerprintIslandGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/islands.ts', 'island-chains', read);
}
export function fingerprintCoastGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/coast.ts', 'coast-smoothing', read);
}
export function fingerprintShapeGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/shape.ts', 'shape-landmass', read);
}
export function fingerprintOceanGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/ocean.ts', 'ocean-floor', read);
}
export function fingerprintDetailShapeGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/detail-shape-adapter.ts', 'shape-detail-landmass', read);
}
export function fingerprintAddDetailGenerator(read = (file: string) => readFileSync(file, 'utf8')) {
  return fingerprintGenerator('src/world/generation/detail-shape-add-adapter.ts', 'add-detail-landmass', read);
}
