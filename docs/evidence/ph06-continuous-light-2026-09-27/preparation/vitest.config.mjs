import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = process.cwd(), staging = resolve(root, '.autopilot/ph06/v4-continuous-light-staging');
export function stagedImports() {
  return { name: 'owned-staging-imports', enforce: 'pre', resolveId(source, importer) {
    if (!importer?.startsWith(`${staging}/`.replaceAll('/', '\\')) && !importer?.startsWith(staging.replaceAll('\\', '/') + '/')) return null;
    if (!source.startsWith('.')) return null;
    const candidate = resolve(dirname(importer), source);
    if (existsSync(candidate) || existsSync(`${candidate}.ts`)) return null;
    if (candidate.startsWith(resolve(staging, 'src'))) return `${resolve(root, candidate.slice(staging.length + 1))}.ts`;
    return null;
  } };
}
export default defineConfig({ root, configFile: false, cacheDir: resolve(staging, 'vite-cache'), plugins: [stagedImports()],
  test: { include: ['.autopilot/ph06/v4-continuous-light-staging/src/world/detail-terrain-light.test.ts'], maxWorkers: 1, retry: 0 } });
