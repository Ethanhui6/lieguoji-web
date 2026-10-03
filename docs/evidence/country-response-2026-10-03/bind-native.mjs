import fs from 'node:fs';
import { createHash } from 'node:crypto';
const base = '.autopilot/country-response', check = `${base}/checks/land-fast-path-1`;
const read = p => JSON.parse(fs.readFileSync(p)), sha = b => createHash('sha256').update(b).digest('hex');
const source = read(`${check}/source-after.json`), dist = read(`${check}/dist-files.json`);
const matches = row => fs.statSync(row.path).size === row.bytes && sha(fs.readFileSync(row.path)) === row.sha256;
if (!read(`${check}/verification.json`).passed || !source.every(matches) || !dist.every(matches)) throw new Error('Native observation does not match checked files');
const assets = read(`${base}/native/loaded-assets.json`), native = read(`${base}/native/verification.json`), loaded = [];
for (const url of new Set([...assets.scripts, ...assets.styles, ...assets.resources])) {
  const u = new URL(url);
  if (u.origin !== 'http://127.0.0.1:4173' || !/^\/assets\/[A-Za-z0-9._-]+$/.test(u.pathname)) throw new Error('Unexpected observed asset');
  const record = dist.find(r => r.path === `dist${u.pathname}`);
  if (!record) throw new Error('Observed browser asset is not in final dist');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok || sha(Buffer.from(await response.arrayBuffer())) !== record.sha256) throw new Error('Local server asset differs from checked dist');
  loaded.push({ url, sha256: record.sha256 });
}
const result = { at: new Date().toISOString(), check: 'land-fast-path-1',
  buildSha256: sha(fs.readFileSync(`${check}/build.json`)),
  sourceSnapshotSha256: sha(fs.readFileSync(`${check}/source-after.json`)),
  distSnapshotSha256: sha(fs.readFileSync(`${check}/dist-files.json`)),
  nativeRecordSha256: sha(fs.readFileSync(`${base}/native/verification.json`)),
  loadedAssets: loaded, sourceStable: true, distStable: true,
  passed: native.originalWorldsUnchanged && native.currentWorldUnchanged && native.geometryUnchanged && native.allChunkHashesValid && !native.consoleErrorsWarnings.length,
  physicalDevice: false, naturalVisualAccepted: false, userVisualAccepted: false, cloudWrites: false };
const output = `${base}/native/build-binding.json`;
if (fs.existsSync(output)) throw new Error('Never overwrite evidence');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;

