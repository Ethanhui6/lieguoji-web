import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
export const engineFiles = ['src/sim/core.ts', 'src/sim/statecraft.ts', 'src/sim/types.ts', 'src/history/core.ts', 'src/history/types.ts'];
export const normalized = (source) => source.replace(/\r\n/g, '\n');
export const sha256 = (source) => createHash('sha256').update(source).digest('hex');
/** Fail closed if a new rule dependency is omitted from the deterministic fingerprint. */
export function fingerprintSources(files, read = (file) => readFileSync(file, 'utf8')) {
    const listed = new Set(files);
    if (listed.size !== files.length)
        throw new Error('Duplicate engine source path');
    const hash = createHash('sha256');
    for (const file of files) {
        if (!file.startsWith('src/') || file.includes('..') || file.includes('\\'))
            throw new Error(`Unsafe engine source path: ${file}`);
        const source = normalized(read(file));
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const dependency = (specifier) => {
            if (!specifier.startsWith('.'))
                throw new Error(`External engine dependency requires an explicit frozen source: ${file}: ${specifier}`);
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`));
            if (!listed.has(resolved))
                throw new Error(`Unfingerprinted engine dependency: ${file} -> ${resolved}`);
        };
        const visit = (node) => {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
                dependency(node.moduleSpecifier.text);
            if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
                dependency(node.argument.literal.text);
            if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && ['require', 'eval'].includes(node.expression.text)))
                throw new Error(`Dynamic rule loading is forbidden: ${file}`);
            ts.forEachChild(node, visit);
        };
        visit(ast);
        hash.update(`${file}\n${source}\n`);
    }
    return hash.digest('hex');
}
export function verifyFrozenSources() {
    const base = 'src/compat/v0_4/';
    const manifest = JSON.parse(readFileSync(`${base}manifest.json`, 'utf8'));
    const originals = new Map();
    for (const file of manifest.files) {
        if (!/^(sim|history)\/[a-z]+\.ts$/.test(file.frozenPath))
            throw new Error('Invalid frozen source path');
        const source = normalized(readFileSync(`${base}${file.frozenPath}`, 'utf8'));
        if (sha256(source) !== file.normalizedSha256 || Buffer.byteLength(source) !== file.bytes)
            throw new Error(`Frozen engine changed: ${file.frozenPath}`);
        originals.set(file.path, source);
    }
    const actual = fingerprintSources(manifest.files.map(file => file.path), file => originals.get(file));
    if (actual !== manifest.engineFingerprint || actual !== '65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5')
        throw new Error('Frozen engine fingerprint changed');
    return actual;
}
