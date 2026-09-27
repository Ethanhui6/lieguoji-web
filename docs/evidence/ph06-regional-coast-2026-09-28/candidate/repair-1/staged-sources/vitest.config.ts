import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import production from '../../../vite.config';
import { fingerprintNaturalDetailGenerator, fingerprintAddNaturalDetailGenerator } from '../../../scripts/generator-fingerprint';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/regional-coast-staging');
if (process.env.NATURAL_VISUAL_EVIDENCE_LABEL !== undefined) throw new Error('Staged regression must not write the old production evidence directory.');
const changed = new Set(['src/world/generation/detail-natural-outline.ts', 'src/world/generation/detail-shape-natural.ts']);
const overlayRead = (file: string) => readFileSync(path.resolve(changed.has(file) ? staging : root, file), 'utf8');
// Hash the actual effective two-file source overlay under canonical production
// module paths. Staged sessions use these identities, not production hashes.
const natural = fingerprintNaturalDetailGenerator(overlayRead), additive = fingerprintAddNaturalDetailGenerator(overlayRead);
const config = mergeConfig(production, defineConfig({
  cacheDir: path.join(staging, '.vite-cache'),
  plugins: [{ name: 'regional-coast-source-overlay', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.') && !path.isAbsolute(source)) return null;
    let absolute = path.resolve(path.dirname(importer.split('?')[0]), source), relative = path.relative(staging, absolute).replaceAll('\\', '/');
    if (relative.startsWith('src/')) absolute = path.resolve(root, relative);
    const candidate = absolute.endsWith('.ts') ? absolute : `${absolute}.ts`;
    relative = path.relative(root, candidate).replaceAll('\\', '/');
    if (changed.has(relative)) return path.resolve(staging, relative);
    return existsSync(candidate) ? candidate : null;
  } }],
  define: { __NATURAL_DETAIL_GENERATOR_FINGERPRINT__: JSON.stringify(natural.sha256), __ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT__: JSON.stringify(additive.sha256) },
  test: { maxWorkers: 1 },
}));
// Vite array merging must not append the entire production suite here.
config.test = { ...config.test, include: ['.autopilot/ph06/regional-coast-staging/src/**/*.test.ts'], maxWorkers: 1 };
export default config;
