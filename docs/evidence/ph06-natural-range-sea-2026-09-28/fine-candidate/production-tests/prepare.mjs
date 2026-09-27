import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Generate review copies only. Never writes into production or frozen ready/.
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../../..'), ready = path.resolve(dir, '../ready');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const replace = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error(`Expected one exact replacement: ${before.slice(0, 80)}`);
  return source.replace(before, after);
};
const frozen = JSON.parse(read(`${ready}/manifest.json`));
function frozenSource(file) {
  const bytes = fs.readFileSync(`${ready}/source/${file}`);
  if (sha(bytes) !== frozen.verifiedSource[file]) throw new Error(`Frozen source mismatch: ${file}`);
  return bytes.toString('utf8').replace(/\r\n/g, '\n');
}
const records = [];
function save(target, source, baseSha256, originalBytes) {
  const destination = path.join(dir, 'files', target);
  if (fs.existsSync(destination)) throw new Error(`Review source already exists: ${target}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, source);
  if (originalBytes) {
    const before = path.join(dir, 'before', target);
    fs.mkdirSync(path.dirname(before), { recursive: true }); fs.writeFileSync(before, originalBytes);
  }
  records.push({ target, baseSha256, preparedSha256: sha(Buffer.from(source)), cases: (source.match(/\bit\('/g) ?? []).length });
}

let ranges = frozenSource('natural-ranges.test.ts');
ranges = replace(ranges, "import { afterAll, describe, expect, it } from 'vitest';", "import { describe, expect, it } from 'vitest';");
ranges = replace(ranges, "import { writeFileSync } from 'node:fs';\n", '');
ranges = ranges.replaceAll("'./src/world/generation/", "'./").replaceAll("'../../../src/world/generation/", "'./");
ranges = replace(ranges, "const evidence: Record<string, unknown> = {};\nafterAll(() => writeFileSync('.autopilot/ph06/natural-ranges-staging/measurements.json', JSON.stringify(evidence, null, 2)));\n", '');
ranges = ranges.split('\n').filter(line => !line.trimStart().startsWith('evidence.')
  && !line.trimStart().startsWith('const connections:') && !line.trimStart().startsWith('connections.push(')).join('\n');
ranges = replace(ranges, "describe('actual fine range tree candidate'", "describe('actual fine range tree'");
save('src/world/generation/detail-natural-ranges.test.ts', ranges, null);

let writer = frozenSource('natural-writer.test.ts');
writer = replace(writer, "import { writeFileSync } from 'node:fs';\n", '');
writer = writer.replaceAll("'./src/world/generation/", "'./").replaceAll("'../../../src/world/generation/", "'./").replaceAll("'../../../src/world/", "'../");
writer = writer.split('\n').filter(line => !line.trimStart().startsWith('writeFileSync(')).join('\n');
writer = replace(writer, 'let landNodes = 0, seaNodes = 0, zeroNodes = 0, positiveDifferences = 0;', 'let landNodes = 0, seaNodes = 0, positiveDifferences = 0;');
writer = replace(writer, 'expect(tile.elevationMeters[slot]).toBe(0); zeroNodes++;', 'expect(tile.elevationMeters[slot]).toBe(0);');
save('src/world/generation/detail-natural-ranges-writer.test.ts', writer, null);

const finePath = 'src/world/generation/detail-fine-world-relief.test.ts';
const originalBytes = fs.readFileSync(path.join(root, finePath));
let fine = originalBytes.toString('utf8').replace(/\r\n/g, '\n');
fine = replace(fine,
  "import { createOrographyField, OROGRAPHY_LIMITS, type OrographyChain } from './detail-orography';",
  "import { createOrographyField, OROGRAPHY_LIMITS, FINE_TREE_OROGRAPHY_LIMITS, type OrographyChain } from './detail-orography';");
fine = replace(fine,
`    const factor = 1 + .15 * n.leeQ * (2 * ease(.5 + 2 * transverse / n.widthQ) - 1);
    const shoulder = transverse / (n.widthQ * factor), crest = transverse / (n.crestQ * factor);
    const along = (dx * n.tx + dy * n.ty) / n.alongQ;
    const cut = n.valleyDepth * compact((shoulder - n.valleySide * n.valleyOffset) / .14);
    const shape = (1 - n.foothillShare) * compact(crest) + n.foothillShare * compact(shoulder) * (1 - cut);`,
`    let shape: number;
    if (n.section) {
      // Independent direct evaluation of actual tree side data; no production
      // contribution/union helper or spatial index is called by this oracle.
      const reach = transverse < 0 ? n.section.leftReachQ : n.section.rightReachQ;
      const shoulderShare = (transverse < 0 ? n.section.leftShoulderQ : n.section.rightShoulderQ) / 4096;
      shape = (1 - shoulderShare) * compact(transverse / n.crestQ) + shoulderShare * compact(transverse / reach);
    } else {
      const factor = 1 + .15 * n.leeQ * (2 * ease(.5 + 2 * transverse / n.widthQ) - 1);
      const shoulder = transverse / (n.widthQ * factor), crest = transverse / (n.crestQ * factor);
      const cut = n.valleyDepth * compact((shoulder - n.valleySide * n.valleyOffset) / .14);
      shape = (1 - n.foothillShare) * compact(crest) + n.foothillShare * compact(shoulder) * (1 - cut);
    }
    const along = (dx * n.tx + dy * n.ty) / n.alongQ;`);
fine = replace(fine,
  "it('keeps measured crest scale stable across 128, 256 and 512 coarse grids while allowing different anchors', async () => {\n    const measures: ReturnType<typeof highSection>[] = [];",
  "it('keeps the same real ridge tree and measured crest scale across 128, 256 and 512 coarse grids', async () => {\n    const measures: ReturnType<typeof highSection>[] = [];\n    const graphs: NonNullable<Relief['rangeTree']>['graph'][] = [];");
fine = replace(fine,
`      expect(relief.summary.scaleMode).toBe('world');
      expect(relief.summary.ridgeGroups).toBe(3);`,
`      expect(relief.summary.scaleMode).toBe('world');
      expect(relief.rangeTree).toBeDefined();
      const graph = relief.rangeTree!.graph;
      // At least the previous three real groups, with every planned tree arm
      // accepted; the exact layout must also survive coarse-grid changes.
      expect(relief.summary.ridgeGroups).toBeGreaterThanOrEqual(3);
      expect(relief.summary.ridgeGroups).toBeLessThanOrEqual(FINE_TREE_OROGRAPHY_LIMITS.chains);
      expect(relief.summary.ridgeGroups).toBe(graph.length);
      expect(relief.curveStats.rejectedBranches).toBe(0);
      graphs.push(graph);`);
fine = replace(fine,
  '    const widths = measures.map(m => m.halfWidth), peaks = measures.map(m => m.maximum);',
  '    expect(graphs[1]).toEqual(graphs[0]); expect(graphs[2]).toEqual(graphs[0]);\n    const widths = measures.map(m => m.halfWidth), peaks = measures.map(m => m.maximum);');
fine = replace(fine,
`      const root = branch.points[0];
      expect(trunk.points.some(p => p.xQ === root.xQ && p.yQ === root.yQ)).toBe(true);`,
`      const root = branch.points[0], planned = relief.rangeTree!.graph.find(c => c.group === branch.group);
      expect(planned?.parentGroup).toBeDefined();
      expect(planned!.parentGroup).toBeLessThan(branch.group);
      const parent = relief.curves.find(c => c.group === planned!.parentGroup);
      expect(parent).toBeDefined();
      expect(parent!.points.some(p => p.xQ === root.xQ && p.yQ === root.yQ)).toBe(true);`);
save(finePath, fine, sha(originalBytes), originalBytes);

const protectedPaths = ['src/world/generation/detail-natural-writer.test.ts', 'src/world/generation/detail-orography.test.ts',
  ...fs.readdirSync(path.join(root, 'src/world/generation/test-fixtures/preview18-relief')).map(name => `src/world/generation/test-fixtures/preview18-relief/${name}`)];
const protectedFiles = protectedPaths.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const manifest = { status: 'prepared-not-run-not-promoted', preparedAt: new Date().toISOString(),
  readyManifestSha256: sha(fs.readFileSync(`${ready}/manifest.json`)),
  runtimePrerequisites: Object.fromEntries(frozen.promotionRuntimeFiles.map(file => [file, frozen.verifiedSource[file]])),
  files: records, protectedFiles, candidateFrozenUnitResult: 'repair-2 27/27 (does not certify these prepared production test copies)',
  expectedPreparedCases: 18, expectedCombinedCasesWithUnmodifiedOrographyAndWriter: 40,
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ status: manifest.status, files: records, protectedFiles: protectedFiles.length }));
