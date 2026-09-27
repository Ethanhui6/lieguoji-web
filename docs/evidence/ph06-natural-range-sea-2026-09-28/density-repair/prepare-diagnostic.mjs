import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = '.autopilot/ph06/natural-range-sea-density-repair';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['src/world/generation/fine-range-tree.ts', 'src/world/generation/detail-orography.ts',
  'src/world/generation/detail-natural-relief.ts', 'src/world/generation/regional-coast-field.test.ts'];
const manifest = {};
for (const file of sourceFiles) {
  const bytes = fs.readFileSync(file), target = `${dir}/before/${file}`;
  if (fs.existsSync(target)) throw new Error('Refusing to overwrite before source.');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); manifest[file] = sha(bytes);
}
for (const file of ['unit.json', 'unit.log', 'verification.json']) fs.copyFileSync(`.autopilot/ph06/natural-range-sea-checks/first/${file}`, `${dir}/first-${file}`);
fs.writeFileSync(`${dir}/before-manifest.json`, JSON.stringify(manifest, null, 2));
let runtime = fs.readFileSync(`${dir}/before/src/world/generation/detail-orography.ts`, 'utf8');
const before = "if (++references > OROGRAPHY_LIMITS.indexReferences || bucket.length > OROGRAPHY_LIMITS.bucketCandidates) throw new Error('山系局部密度超出有界查询预算。');";
if (runtime.split(before).length !== 2) throw new Error('Diagnostic location changed.');
runtime = "import { writeFileSync } from 'node:fs';\n" + runtime.replace(before,
  `if (++references > OROGRAPHY_LIMITS.indexReferences || bucket.length > OROGRAPHY_LIMITS.bucketCandidates) {
        writeFileSync('${dir}/cluster-before.json', JSON.stringify({ id, x, y, bucketQ, references, bucket, nodes, chains, ends, runs: runs.map(r => ({ group: r.group, points: r.points, parentRun: r.parentRun })) }));
        throw new Error('山系局部密度超出有界查询预算。');
      }`);
fs.mkdirSync(`${dir}/diagnostic`, { recursive: true }); fs.writeFileSync(`${dir}/diagnostic/detail-orography.ts`, runtime);
const test = fs.readFileSync(sourceFiles[3], 'utf8');
const fixture = test.slice(test.indexOf('const q ='), test.indexOf('let input:'));
fs.writeFileSync(`${dir}/diagnose.test.ts`, `import { expect, it } from 'vitest';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeRecipe } from '../../../src/world/generation/detail-shape-natural';
${fixture}
it('captures the unchanged real protected-channel relief density refusal', async () => {
  await expect(generateDetailShapeNatural({ base: base(), recipe: recipe() }, { batchWork: 512, yieldControl: async () => {} })).rejects.toThrow('山系局部密度超出有界查询预算。');
}, 60000);
`);
