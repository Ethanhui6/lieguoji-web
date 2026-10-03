import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const record = '.autopilot/ph06/ridge-landform-staging/area-v2/production-integration';
const names = ['fine-range-tree.ts', 'detail-orography.ts', 'terrain-massif.ts', 'detail-natural-relief.ts', 'terrain-massif.test.ts', 'terrain-gradient-noise.test.ts',
  'detail-fine-world-relief.test.ts', 'detail-natural-ranges.test.ts', 'detail-orography-density.test.ts', 'detail-natural-ranges-writer.test.ts',
  ...['detail-orography.ts', 'seed.ts', 'detail-shape.ts', 'SOURCE_MANIFEST.json', 'README.md'].map(name => `test-fixtures/preview22-orography/${name}`)];
const files = names.map(name => {
  const file = `src/world/generation/${name}`, bytes = readFileSync(file), sha256 = createHash('sha256').update(bytes).digest('hex');
  const target = `${record}/source-final/${file}`; mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(file, target);
  return { file, bytes: bytes.length, sha256 };
});
writeFileSync(`${record}/source-final.json`, JSON.stringify({ status: 'frozen-for-root-unified-checks', files,
  executed: 'Candidate4/4 before production wrapper input-copy/profile changes. No production combined check run by this agent.',
  productionCases: { 'terrain-massif.test.ts': 4, 'terrain-gradient-noise.test.ts': 2, 'detail-fine-world-relief.test.ts': 7, 'detail-natural-ranges.test.ts': 10,
    'detail-orography-density.test.ts': 1, 'detail-natural-ranges-writer.test.ts': 1 } }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ files: files.length, frozen: true }));
