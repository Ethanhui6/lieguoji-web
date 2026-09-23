import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { engineFiles, fingerprintSources, verifyFrozenSources } from './scripts/engine-fingerprint.ts';

// This separate local build never changes the game's dist or Pages entry.
const paths: string[] = [];
function collect(directory: string) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Benchmark sources cannot be symbolic links.');
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(path);
    else if (/\.(ts|tsx|css|html|mjs)$/.test(path)) paths.push(path);
  }
}
collect('src/bench'); collect('bench');
for (const path of ['bench.vite.config.ts', 'scripts/bench-scale.mjs', 'package.json', 'package-lock.json', 'src/styles/tokens.css', 'src/engine/registry.ts', 'src/engine/adapter.ts', 'src/sim/demo.ts', 'src/compat/fixtures/golden-0.4-modern.json']) if (existsSync(path)) paths.push(path);
const hash = createHash('sha256');
for (const path of paths.sort()) hash.update(path).update('\0').update(readFileSync(path)).update('\0');
const sourceFingerprint = hash.digest('hex');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
verifyFrozenSources();
const metadata = { format: 'lieguoji-scale-benchmark-build', version: 1, commit, sourceFingerprint, localOnly: true, engineFingerprint: fingerprintSources(engineFiles) };

export default defineConfig({
  plugins: [react(), { name: 'local-scale-build', generateBundle() { this.emitFile({ type: 'asset', fileName: 'benchmark-build.json', source: JSON.stringify(metadata) }); } }],
  publicDir: false,
  define: { __BENCH_BUILD__: JSON.stringify(metadata), __BUILD_SHA__: JSON.stringify(commit), __SIM_ENGINE__: JSON.stringify(metadata.engineFingerprint) },
  build: { outDir: '.autopilot/ph03/web', emptyOutDir: false, sourcemap: false, rollupOptions: { input: resolve('bench/scale.html') } },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
