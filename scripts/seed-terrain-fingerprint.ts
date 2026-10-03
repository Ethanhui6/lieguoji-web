import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Separate provenance for new independent worlds; never rewrites old generator identities. */
export function fingerprintSeedTerrain() {
  const sources = new Map<string, string>();
  const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const visit = (file: string) => {
    if (sources.has(file)) return;
    if (!file.startsWith('src/world/') || file.includes('..') || file.includes('\\')) throw new Error(`Unsafe seed terrain source: ${file}`);
    const source = read(file); sources.set(file, source);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    const dependency = (specifier: string) => {
      if (specifier === 'd3-delaunay') return;
      if (!specifier.startsWith('.')) throw new Error(`Unfrozen terrain dependency: ${specifier}`);
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const resolved = /\.(ts|js)$/.test(base) ? base : `${base}.ts`;
      if (!existsSync(resolved)) throw new Error(`Missing terrain dependency: ${resolved}`);
      visit(resolved);
    };
    const node = (item: ts.Node) => {
      if (ts.isImportDeclaration(item) && ts.isStringLiteral(item.moduleSpecifier)) {
        const clause = item.importClause;
        const onlyTypes = clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
        if (!onlyTypes) dependency(item.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(item) && !item.isTypeOnly && item.moduleSpecifier && ts.isStringLiteral(item.moduleSpecifier)) dependency(item.moduleSpecifier.text);
      if ((ts.isCallExpression(item) && (item.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(item.expression) && ['eval', 'require', 'Function'].includes(item.expression.text)))
        || ts.isNewExpression(item) && ts.isIdentifier(item.expression) && item.expression.text === 'Function') throw new Error('Dynamic terrain code is forbidden');
      ts.forEachChild(item, node);
    };
    node(ast);
  };
  visit('src/world/seed-terrain.ts');
  const externalFiles: string[] = [];
  for (const packageName of ['d3-delaunay', 'delaunator', 'robust-predicates']) {
    const root = `node_modules/${packageName}`;
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error('Linked terrain dependencies are not fingerprintable');
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) { if (['src', 'esm'].includes(entry.name) || directory !== root) walk(file); }
        else if (entry.isFile() && (entry.name === 'package.json' || entry.name.endsWith('.js'))) externalFiles.push(file);
      }
    };
    walk(root);
  }
  const d3 = JSON.parse(read('node_modules/d3-delaunay/package.json')) as { version: string };
  if (d3.version !== '6.0.4') throw new Error('Terrain Delaunay version changed');
  externalFiles.push('package-lock.json');
  const files = [...sources.keys()].sort(), hash = createHash('sha256');
  hash.update('lieguoji-recovered-height-square-v1\n');
  for (const file of files) hash.update(`${file}\n${sources.get(file)}\n`);
  for (const file of externalFiles.sort()) hash.update(`${file}\n${read(file)}\n`);
  return { id: 'recovered-height-square-v1', sha256: hash.digest('hex'), files, externalFiles };
}
