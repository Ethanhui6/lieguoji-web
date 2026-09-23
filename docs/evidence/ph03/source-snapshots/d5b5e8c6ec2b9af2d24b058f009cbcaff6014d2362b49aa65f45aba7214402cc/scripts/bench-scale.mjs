import { chromium, devices } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

// Real local-browser measurements. Each invocation keeps its own raw evidence,
// including failed attempts; no production database or remote URL is accessed.
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const mode = args.mode ?? 'smoke';
if (!['smoke', 'matrix', 'controls', 'history', 'mobile', 'entities'].includes(mode)) throw new Error('Unknown benchmark mode.');
const profiles = ['basic', 'standard', 'extended'];
const scenarios = ['continent', 'archipelago', 'mountains'];
const profile = args.profile ?? 'standard';
if (!profiles.includes(profile)) throw new Error('Unknown profile.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve('.autopilot/ph03/runs', `${stamp}-${mode}-${profile}`);
await mkdir(output, { recursive: true });
const sourcePaths = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Benchmark source symlinks are forbidden.');
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(path);
    else if (/\.(ts|tsx|css|html|mjs)$/.test(path)) sourcePaths.push(path);
  }
}
collect('src/bench'); collect('bench');
for (const path of ['bench.vite.config.ts', 'scripts/bench-scale.mjs', 'package.json', 'package-lock.json', 'src/styles/tokens.css', 'src/engine/registry.ts', 'src/engine/adapter.ts', 'src/sim/demo.ts', 'src/compat/fixtures/golden-0.4-modern.json']) if (existsSync(path)) sourcePaths.push(path);
const fingerprint = createHash('sha256');
for (const path of sourcePaths.sort()) fingerprint.update(path).update('\0').update(readFileSync(path)).update('\0');
const sourceFingerprint = fingerprint.digest('hex');
const host = JSON.parse((await readFile('.autopilot/ph03/host.json', 'utf8')).replace(/^\uFEFF/, ''));
const report = { format: 'lieguoji-ph03-browser-measurement', version: 1, mode, profile, startedAt: new Date().toISOString(), sourceFingerprint, host, results: [], errors: [], pageErrors: [], consoleErrors: [], heapSamples: [], limitations: ['Local Chromium measurements only; mobile mode is viewport/input emulation, never actual phone acceptance.', 'CDP heap samples cover the main page only, not Worker/GPU/whole-browser memory peaks.', 'Structural entity kernels are not measurements of future full social rules.'] };
const persist = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
// Full Chromium uses the actual available GPU on this host. The headless shell
// was separately observed using SwiftShader and is retained as smoke evidence.
report.launch = { channel: 'chromium', headless: true };
const browser = await chromium.launch(report.launch);
report.browserVersion = browser.version();
const context = await browser.newContext(mode === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ text: message.text(), location: message.location() }); });
const cdp = await context.newCDPSession(page);
let heapBusy = false;
const heapTimer = setInterval(async () => {
  if (heapBusy) return;
  heapBusy = true;
  try { report.heapSamples.push({ at: new Date().toISOString(), ...await cdp.send('Runtime.getHeapUsage') }); }
  catch { /* A closing page cannot provide an additional heap sample. */ }
  finally { heapBusy = false; }
}, 5000);
async function step(label, action, timeout = 180_000) {
  console.log(`${new Date().toISOString()} ${label}`);
  const start = performance.now(); let timer;
  try {
    const value = await Promise.race([action(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Explicit measurement deadline ${timeout} ms exceeded: ${label}`)), timeout); })]);
    const row = { label, elapsedMs: performance.now() - start, value }; report.results.push(row); await persist(); return value;
  } catch (error) { report.errors.push({ label, elapsedMs: performance.now() - start, message: String(error) }); await persist(); throw error; }
  finally { clearTimeout(timer); }
}
async function api(method, ...parameters) { return page.evaluate(({ method, parameters }) => window.scaleBench[method](...parameters), { method, parameters }); }
async function one(options, durationMs, measure = true) {
  const key = `${options.geoProfile}-${options.entityProfile}-${options.scenario}`;
  await api('setQuality', 'high');
  const first = await step(`${key}: generate`, () => api('generate', options));
  const repeated = await step(`${key}: repeat generation`, () => api('generate', options));
  if (first.hash !== repeated.hash) throw new Error(`${key}: fixed seed generation changed the full state hash.`);
  await step(`${key}: frame path`, () => api('sampleCameraPath', { durationMs, quality: 'high' }), durationMs + 60_000);
  const fixtureInfo = await page.evaluate(async () => {
    const f = await window.scaleBench.getSnapshot();
    const city = f.entities.cities[Math.floor(f.entities.cities.length / 2)], cellId = city.cellId;
    return { cellId, regionId: city.regionId, elevation: f.atlas.elevation[cellId], adminId: f.state.regionAdmin[city.regionId], alternatives: f.entities.administration.filter(item => item.leaf).map(item => item.id).slice(0, 2), batch: f.state.batch };
  });
  const picked = await step(`${key}: picking algorithm and quality invariant`, () => page.evaluate(async cellId => {
    const api = window.scaleBench, pick = api.pickCell(cellId), camera = api.camera();
    const x = pick.world.x * camera.scale + camera.x, y = pick.world.y * camera.scale + camera.y;
    const viewport = api.inspect().renderer.viewport;
    if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) throw new Error('Selected screen coordinates fall outside the real viewport.');
    const high = api.pick(x, y), before = (await api.verifyState()).workerHash;
    await api.setQuality('low'); const low = api.pick(x, y), after = (await api.verifyState()).workerHash;
    await api.setQuality('high');
    if (!high || !low || high.stableId !== low.stableId || high.cellId !== cellId || before !== after) throw new Error('Quality changed a stable pick or authoritative state.');
    return { high, low, screen: { x, y }, hashBefore: before, hashAfter: after };
  }, fixtureInfo.cellId));
  if (!picked) throw new Error('Missing pick result.');
  await step(`${key}: actual pointer selection`, async () => {
    await api('pick', -1_000_000, -1_000_000);
    if ((await api('inspect')).selected !== null) throw new Error('Selection did not clear before physical input.');
    const box = await page.getByTestId('scale-canvas').boundingBox();
    if (!box) throw new Error('Rendered map has no visible bounds.');
    const x = box.x + picked.screen.x, y = box.y + picked.screen.y;
    if (mode === 'mobile') await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForFunction(cellId => window.scaleBench.inspect().selected?.cellId === cellId, fixtureInfo.cellId);
    return { input: mode === 'mobile' ? 'emulated touch' : 'mouse', x, y, selected: (await api('inspect')).selected };
  });
  if (options.geoProfile === 'standard' && options.entityProfile === 'standard' && options.scenario === 'continent' && durationMs === 60_000) await step(`${key}: low-quality frame path`, () => api('sampleCameraPath', { durationMs, quality: 'low' }), durationMs + 60_000);
  const delta = fixtureInfo.elevation > .9 ? -.01 : .01;
  const edit = await step(`${key}: local edit`, () => api('edit', { type: 'elevation', cellIds: [fixtureInfo.cellId], delta }));
  if (edit.hash === repeated.hash || edit.selected?.elevation !== fixtureInfo.elevation + delta || edit.renderer.lastRepaintChunks < 1 || edit.renderer.lastRepaintChunks > 4) throw new Error('Local edit was ignored or repainted unrelated world chunks.');
  await step(`${key}: undo`, () => api('undo'));
  await step(`${key}: undo value verification`, () => page.evaluate(async expected => {
    const f = await window.scaleBench.getSnapshot();
    const found = f.state.elevationOverrides.find(item => item.cellId === expected.cellId)?.elevation ?? f.atlas.elevation[expected.cellId];
    if (found !== expected.elevation) throw new Error('Undo failed to restore the original elevation.');
    return { cellId: expected.cellId, restoredElevation: found, revision: f.state.revision };
  }, fixtureInfo));
  const adminId = fixtureInfo.alternatives.find(id => id !== fixtureInfo.adminId);
  await api('setLayer', 'administration');
  const admin = await step(`${key}: administration edit`, () => api('edit', { type: 'administration', regionId: fixtureInfo.regionId, adminId }));
  if (admin.selected?.adminId !== adminId || admin.renderer.lastRepaintChunks < 1) throw new Error('Administrative edit did not update selected territorial ownership or rendered chunks.');
  await page.screenshot({ path: resolve(output, `${key}-administration.png`), fullPage: true });
  await api('setLayer', 'terrain');
  await step(`${key}: structure transaction`, () => api('edit', { type: 'structure-batch', count: 1 }));
  for (let sample = 0; sample < 3; sample++) for (const transport of ['clone', 'transfer']) await step(`${key}: transport ${transport} ${sample + 1}`, () => api('snapshotTransport', transport));
  const firstSave = await step(`${key}: save first`, () => api('save'));
  await step(`${key}: second transaction`, () => api('edit', { type: 'structure-batch', count: 1 }));
  const saved = await step(`${key}: save second with backup`, () => api('save'));
  await step(`${key}: browser refresh`, async () => { await page.reload(); await page.waitForFunction(() => !!window.scaleBench); return { url: page.url() }; });
  const restored = await step(`${key}: restore main and verify history`, () => api('restore', saved.runId));
  if (restored.hash !== saved.hash || restored.sequence !== 5) throw new Error('Refresh/restore changed the saved state or sequence.');
  const backup = await step(`${key}: explicit backup recovery`, () => api('restore', saved.runId, 'backup'));
  if (backup.hash !== firstSave.hash || backup.sequence !== 4 || !backup.storageLocked) throw new Error('Previous backup changed or recovery unlocked the protected source.');
  await step(`${key}: backup cannot overwrite source`, async () => {
    let refused = false; try { await api('save'); } catch (error) { if (!String(error).includes('备份恢复')) throw error; refused = true; }
    if (!refused) throw new Error('Backup recovery overwrote source.'); return { refused };
  });
  await step(`${key}: return to main after backup`, async () => {
    const main = await api('restore', saved.runId); if (main.hash !== saved.hash) throw new Error('Explicit backup recovery changed the main save.'); return main;
  });
  const historical = await step(`${key}: read-only seek`, () => api('seek', 0));
  if (!historical.readOnly || historical.hash !== repeated.hash) throw new Error('Initial historical state changed.');
  await step(`${key}: read-only rejects edits`, async () => {
    let refused = false; try { await api('edit', { type: 'structure-batch', count: 1 }); } catch (error) { if (!String(error).includes('只读')) throw error; refused = true; }
    const after = await api('inspect');
    if (!refused || after.hash !== historical.hash || after.sequence !== historical.sequence || after.runId !== historical.runId) throw new Error('Read-only historical edit was accepted or changed source state.'); return { refused };
  });
  const branchPoint = await step(`${key}: locate branch point`, () => api('seek', 2));
  const branched = await step(`${key}: branch`, () => api('branch', 2));
  if (branched.hash !== branchPoint.hash || branched.readOnly || branched.sequence !== 0 || branched.runId === saved.runId) throw new Error('Branch did not preserve its selected historical initial state.');
  const branchEdit = await step(`${key}: branch mutation`, () => api('edit', { type: 'structure-batch', count: 1 }));
  if (branchEdit.hash === branched.hash || branchEdit.sequence !== 1) throw new Error('Branch did not actually change.');
  const branch = await step(`${key}: save branch`, () => api('save'));
  if (branch.runId === saved.runId) throw new Error('Branch reused source run.');
  const source = await step(`${key}: verify untouched source`, () => api('restore', saved.runId));
  if (source.hash !== saved.hash) throw new Error('Branch changed source save.');
  if (measure) await step(`${key}: Worker queries and 64-record history`, () => api('benchmarkWorker', { historyLengths: [64], querySamples: 256, transactionSamples: 24 }), 600_000);
  await page.screenshot({ path: resolve(output, `${key}.png`), fullPage: true });
}
try {
  await step('Load local benchmark', async () => { await page.goto('http://127.0.0.1:4174/bench/scale.html'); await page.waitForFunction(() => !!window.scaleBench); return page.evaluate(() => ({ build: window.scaleBench.inspect().build, renderer: window.scaleBench.inspect().renderer, userAgent: window.navigator.userAgent, dpr: window.devicePixelRatio, viewport: { width: window.innerWidth, height: window.innerHeight } })); });
  const build = await page.evaluate(() => window.scaleBench.inspect().build); report.build = build;
  if (build.sourceFingerprint !== sourceFingerprint) throw new Error('Benchmark build does not match current measured source. Rebuild before measuring.');
  const options = (geoProfile, entityProfile, scenario = 'continent') => ({ geoProfile, entityProfile, scenario, seed: 'ph03-repeatable-001' });
  if (mode === 'smoke') await one(options('basic', 'basic'), 1200);
  else if (mode === 'matrix') for (const p of profiles) for (const scenario of scenarios) await one(options(p, p, scenario), 60_000);
  else if (mode === 'controls') for (const p of ['standard', 'extended']) for (const pair of [[p, 'basic'], ['basic', p]]) await one(options(...pair), 60_000);
  else if (mode === 'mobile') await one(options('standard', 'standard'), 60_000);
  else if (mode === 'entities') {
    await step('Individual entity budgets and verified component transport', () => api('benchmarkEntities'), 600_000);
  }
  else {
    let initialHash;
    // Complete and persist each length, including fresh-document recovery,
    // before starting the next expensive sample. An interruption retains the
    // earlier evidence; each length starts with the identical pristine world.
    for (const length of [64, 512, 2048]) {
      const generated = await step(`History ${length}: identical fixture generation`, () => api('generate', options(profile, profile)));
      initialHash ??= generated.hash;
      if (generated.hash !== initialHash) throw new Error('History comparison did not start from identical fixed-seed worlds.');
      const measured = await step(`History ${length}: complete verification, storage and independent branch`, () => api('benchmarkWorker', { historyLengths: [length], querySamples: 256, transactionSamples: 24, persistHistory: true }), 3_600_000);
      const item = measured.measurements.history[0];
      if (measured.measurements.history.length !== 1 || item.length !== length) throw new Error('History measurement returned an unexpected length.');
      const expected = item.storage?.refresh;
      if (!expected || !expected.required || expected.verified) throw new Error('Long history is missing genuine pending-refresh storage evidence.');
      await step(`History ${item.length}: fresh browser document`, async () => { await page.reload(); await page.waitForFunction(() => !!window.scaleBench); return { freshDocument: true }; });
      await step(`History ${item.length}: restore after refresh and full verification`, async () => {
        const actual = await api('restore', expected.runId);
        if (actual.hash !== expected.expectedHash || actual.sequence !== expected.expectedSequence || actual.storage?.revision !== expected.expectedRevision) throw new Error('Long history failed fresh-document restore.');
        return { expected, actual, refreshVerified: true };
      }, 900_000);
      if (length === 64) await step('History 64: actual controller branch save preserves entire source package', async () => {
        const before = await api('inspectStoredPackage', expected.runId);
        const branched = await api('branch', 32);
        if (branched.runId === expected.runId) throw new Error('Controller branch reused source storage identity.');
        await api('edit', { type: 'structure-batch', count: 1 });
        const saved = await api('save');
        if (saved.runId !== branched.runId || saved.revision !== 1) throw new Error('Controller branch saved with the wrong run or revision.');
        const after = await api('inspectStoredPackage', expected.runId);
        if (before.hash !== after.hash) throw new Error('Controller branch save changed current, backup or revision of the source package.');
        return { sourceRunId: expected.runId, branchRunId: saved.runId, before, after, unchanged: true };
      }, 180_000);
    }
  }
  const invalidFrames = report.results.filter(row => row.label.endsWith('frame path') && (!row.value.valid || row.value.hashBefore !== row.value.hashAfter));
  if (invalidFrames.length || report.pageErrors.length || report.consoleErrors.length) throw new Error('Invalid camera sample or browser errors; see raw report.');
  report.status = 'measured';
} catch (error) {
  report.status = 'failed'; report.failure = String(error); process.exitCode = 1;
  try { await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true, timeout: 5000 }); } catch { /* Preserve existing raw report even if the renderer stopped responding. */ }
} finally {
  clearInterval(heapTimer); report.finishedAt = new Date().toISOString(); await persist(); await browser.close();
  console.log(JSON.stringify({ output, status: report.status, steps: report.results.length, failure: report.failure ?? null }));
}
