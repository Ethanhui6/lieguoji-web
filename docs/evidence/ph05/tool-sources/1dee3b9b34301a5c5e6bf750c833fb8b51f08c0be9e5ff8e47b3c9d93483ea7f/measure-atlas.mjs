import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';

// Observe real production UI and actual binary Worker traffic, with no game API.
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const mode = args.mode ?? 'smoke';
if (!['smoke', 'edits', 'loads', 'transport', 'cancel'].includes(mode)) throw new Error('Unknown atlas measurement mode');
const baseURL = args.url ?? 'http://127.0.0.1:4173';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw new Error('Measurements require isolated localhost preview');
const output = resolve('.autopilot/ph04/measurements', `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`);
await mkdir(output, { recursive: true });
async function files(root) {
  const list = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Evidence source must not contain symlinks');
    if (entry.isDirectory()) list.push(...await files(path)); else list.push(path);
  }
  return list.sort();
}
async function fingerprint(paths) {
  const rows = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    rows.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), modified: (await stat(path)).mtimeMs });
  }
  return { sha256: createHash('sha256').update(JSON.stringify(rows.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))).digest('hex'), files: rows };
}
const sourcePaths = [...await files('src'), ...await files('public'), 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'scripts/measure-atlas.mjs', 'scripts/summarize-atlas.mjs'].sort();
const source = await fingerprint(sourcePaths), dist = await fingerprint(await files('dist'));
const buildTime = (await stat('dist/index.html')).mtimeMs;
if (source.files.some(row => row.path !== 'scripts/measure-atlas.mjs' && row.modified > buildTime)) throw new Error('Source newer than production build: rebuild before measurement');
const report = { format: 'lieguoji-ph04-production-measurement', version: 1, mode, startedAt: new Date().toISOString(), source, dist, host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus().map(cpu => cpu.model), totalMemory: os.totalmem() }, launch: { channel: 'chromium', headless: true }, results: [], errors: [], consoleErrors: [], pageErrors: [], limitations: ['Desktop Chromium production build; no real-phone or user-visual acceptance.', 'Correct-frame timestamps are CPU renderer submission and a frame opportunity, not physical presentation or GPU completion.', 'Logical wire byte counts include headers, ACKs and progress; no zero-copy inference.'] };
const persist = () => writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
const browser = await chromium.launch(report.launch);
report.browserVersion = browser.version();
async function measured(label, action) {
  console.log(`${new Date().toISOString()} ${label}`);
  const started = performance.now();
  try { const value = await action(); report.results.push({ label, elapsedMs: performance.now() - started, value }); await persist(); return value; }
  catch (error) { report.errors.push({ label, elapsedMs: performance.now() - started, message: String(error), ...(error.measurementEvidence ? { evidence: error.measurementEvidence } : {}) }); await persist(); throw error; }
}
async function observe(context) {
  await context.addInitScript(() => {
    const evidence = { wire: [], clicks: [], changes: [], progress: [] };
    window.__atlasWireEvidence = evidence;
    const NativeWorker = window.Worker;
    function record(direction, bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.length < 4) return;
      try {
        const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
        const header = JSON.parse(new window.TextDecoder().decode(bytes.subarray(4, 4 + count)));
        if (header.version !== 1) return;
        evidence.wire.push({ at: performance.now(), direction, bytes: bytes.byteLength, id: header.id, type: header.type, operation: header.body?.type ?? header.body?.operation, metrics: header.body?.metrics, computation: header.type === 'timing' ? header.body?.computation : undefined, error: header.type === 'error' ? header.body : undefined, stage: header.type === 'progress' ? header.body : undefined });
      } catch { /* Other application Workers have independent protocols. */ }
    }
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); this.addEventListener('message', event => record('worker-main', event.data)); }
      postMessage(message, ...options) { record('main-worker', message); return super.postMessage(message, ...options); }
    };
    document.addEventListener('click', event => {
      const button = event.target instanceof window.Element ? event.target.closest('button') : null;
      if (button) evidence.clicks.push({ at: performance.now(), label: button.getAttribute('aria-label') ?? button.textContent?.trim() });
    }, true);
    new window.MutationObserver(records => {
      const node = document.querySelector('[data-testid="atlas-studio"]');
      if (!node) return;
      if (records.some(row => row.type === 'attributes' && row.target === node)) evidence.changes.push({ at: performance.now(), state: node.getAttribute('data-atlas-state'), revision: node.getAttribute('data-atlas-revision'), commitMs: Number(node.getAttribute('data-atlas-commit-ms')) });
      const text = node.querySelector('.inspector-notice')?.textContent, state = node.getAttribute('data-atlas-state'), previous = evidence.progress.at(-1);
      if (text && (text !== previous?.text || state !== previous?.state)) evidence.progress.push({ at: performance.now(), text, state });
    }).observe(document, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ['data-atlas-state', 'data-atlas-revision', 'data-atlas-commit-ms'] });
  });
}
async function setup() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  await observe(context);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  const cdp = await browser.newBrowserCDPSession();
  report.systemInfo ??= await cdp.send('SystemInfo.getInfo'); await cdp.detach();
  return { context, page };
}
async function ready(page, state = 'ready') {
  await page.waitForFunction(value => document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state') === value, state, { timeout: 120000 });
}
async function click(page, name) { await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click(); }
async function panel(page, name) { await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click(); }
async function readEvidence(page) {
  return page.evaluate(() => {
    const node = document.querySelector('[data-testid="atlas-studio"]');
    return { attributes: Object.fromEntries([...node.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])), wire: structuredClone(window.__atlasWireEvidence), mapBounds: document.querySelector('[data-testid="atlas-canvas"]').getBoundingClientRect().toJSON() };
  });
}
async function readRendering(page) {
  return page.getByTestId('atlas-canvas').evaluate(canvas => new Promise((resolve, reject) => {
    const requestId = `ph04-regression-${crypto.randomUUID()}`;
    const timer = setTimeout(() => { canvas.removeEventListener('atlas-metrics-response', receive); reject(new Error('Missing read-only renderer metrics')); }, 120000);
    function receive(event) {
      if (event.detail?.requestId !== requestId) return;
      clearTimeout(timer); canvas.removeEventListener('atlas-metrics-response', receive);
      if (!event.detail.metrics) reject(new Error('Read-only renderer response has no metrics'));
      else resolve(structuredClone(event.detail.metrics));
    }
    canvas.addEventListener('atlas-metrics-response', receive);
    canvas.dispatchEvent(new window.CustomEvent('atlas-metrics-request', { detail: { requestId } }));
  }));
}
function expectedVisibleHaloCoreKeys(rendering, size, column, row) {
  const { camera, viewport } = rendering;
  if (![128, 256, 512].includes(size) || ![column, row].every(value => Number.isSafeInteger(value) && value > 0 && value < size && value % 32 === 0)
    || !camera || !['x', 'y', 'scale'].every(key => Number.isFinite(camera[key])) || camera.scale <= 0
    || !viewport || !['width', 'height'].every(key => Number.isFinite(viewport[key]) && viewport[key] > 0)) throw new Error('Invalid camera, viewport or four-block edit intersection');
  const span = 4096 / size * 32, lastCore = size / 32 - 1;
  const visibleMinX = Math.floor(-camera.x / camera.scale / span), visibleMaxX = Math.floor((viewport.width - camera.x) / camera.scale / span);
  const visibleMinY = Math.floor(-camera.y / camera.scale / span), visibleMaxY = Math.floor((viewport.height - camera.y) / camera.scale / span);
  // A 32x32 edit centered on this intersection writes owners [c/32-1,c/32]
  // x [r/32-1,r/32]. Neighbor texture halos add one display core on each side.
  // Derive that set from edit coordinates and intersect the actual visible
  // core range; renderer-reported keys are never used to construct the oracle.
  const minX = Math.max(0, column / 32 - 2, visibleMinX), maxX = Math.min(lastCore, column / 32 + 1, visibleMaxX);
  const minY = Math.max(0, row / 32 - 2, visibleMinY), maxY = Math.min(lastCore, row / 32 + 1, visibleMaxY), keys = [];
  for (let by = minY; by <= maxY; by++) for (let bx = minX; bx <= maxX; bx++) keys.push(`geometry:${bx}:${by}`);
  return keys.sort();
}
async function resetEvidence(page) { await page.evaluate(() => { for (const key of ['wire', 'clicks', 'changes', 'progress']) window.__atlasWireEvidence[key].length = 0; }); }
function summarize(evidence, operation) {
  const rows = evidence.wire.wire, request = rows.find(row => row.operation === operation && row.type === 'request');
  if (!request) throw new Error(`No observed ${operation} request`);
  const traffic = rows.filter(row => row.id === request.id), complete = traffic.find(row => row.type === 'complete');
  if (!complete) throw new Error(`No observed ${operation} completion`);
  const progress = [request.at, ...traffic.filter(row => row.type === 'progress').map(row => row.at), (traffic.find(row => row.type === 'timing') ?? complete).at];
  const userProgress = evidence.wire.progress.filter(row => row.at >= request.at), settled = userProgress.findIndex(row => row.state === 'ready' || row.state === 'readonly');
  const visibleTimes = [request.at, ...(settled < 0 ? userProgress : userProgress.slice(0, settled + 1)).map(row => row.at)];
  return { trafficBytes: traffic.reduce((sum, row) => sum + row.bytes, 0), largestPacketBytes: Math.max(...traffic.map(row => row.bytes)), packets: traffic.length,
    packetTypes: Object.fromEntries([...new Set(traffic.map(row => row.type))].map(type => [type, traffic.filter(row => row.type === type).length])),
    maxProgressGapMs: Math.max(...progress.slice(1).map((at, i) => at - progress[i])), maxVisibleProgressGapMs: visibleTimes.length > 1 ? Math.max(...visibleTimes.slice(1).map((at, i) => at - visibleTimes[i])) : null, visibleCompletionObserved: settled >= 0, metrics: complete.metrics, computation: traffic.find(row => row.type === 'timing')?.computation };
}
async function create(page, size = 256) {
  await page.goto(`${baseURL}/?atlas=new`); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(`测量-${size}`);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('PH04-performance-fixed-01');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption(String(size));
  await resetEvidence(page); await click(page, '新建空白海洋草稿'); await ready(page);
  const evidence = await readEvidence(page); return { ...evidence, totals: summarize(evidence, 'create') };
}
async function position(page, size) {
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(size * (size / 2) + size / 2)); await click(page, '定位');
  await page.getByLabel('高程编辑范围', { exact: true }).selectOption('32');
}
async function edit(page, index, size) {
  // Nine fixed four-block intersections, with a new elevation at every edit.
  // This exercises real new content writes instead of alternating two cached blobs.
  const column = size / 2 + ((index % 3) - 1) * 32, row = size / 2 + ((Math.floor(index / 3) % 3) - 1) * 32;
  await page.getByLabel('定位地块编号', { exact: true }).fill(String(row * size + column)); await click(page, '定位');
  const targetHeight = 100 + index * 3;
  await page.getByLabel('目标高程（米）', { exact: true }).fill(String(targetHeight));
  await click(page, '预览地理编辑'); await page.getByRole('region', { name: '地理编辑预览' }).waitFor(); await ready(page);
  const before = await page.getByTestId('atlas-studio').evaluate(node => ({ revision: Number(node.getAttribute('data-atlas-revision')), hash: node.getAttribute('data-atlas-hash') }));
  await resetEvidence(page); await click(page, '确认地理编辑'); await ready(page);
  const evidence = { ...await readEvidence(page), before, trajectory: { column, row, range: 32, targetHeight } };
  try {
    evidence.readonlyRendering = await readRendering(page);
    evidence.expectedCoreKeys = expectedVisibleHaloCoreKeys(evidence.readonlyRendering, size, column, row);
    const totals = summarize(evidence, 'edit'); evidence.totals = totals;
    if (totals.metrics?.writeBlocks !== 4 || totals.metrics?.affectedCells !== 1024 || !totals.metrics?.localBudgetEligible) throw new Error('Measured edit is not the locked 1024-cell/four-data-block operation');
    if (Number(evidence.attributes['data-atlas-revision']) !== before.revision + 1 || evidence.attributes['data-atlas-hash'] === before.hash) throw new Error('Actual UI did not accept the committed revision and changed hash');
    const rendering = evidence.readonlyRendering, actualKeys = rendering.repaintBlockKeys;
    if (!Array.isArray(actualKeys) || new Set(actualKeys).size !== actualKeys.length || JSON.stringify([...actualKeys].sort()) !== JSON.stringify(evidence.expectedCoreKeys)
      || rendering.repaintBlocks !== evidence.expectedCoreKeys.length || Number(evidence.attributes['data-atlas-repainted-blocks']) !== evidence.expectedCoreKeys.length
      || rendering.acceptedRevision !== before.revision + 1) throw new Error('Actual renderer/UI repaint differs from the exact visible halo core set');
    const clickEvent = evidence.wire.clicks.find(row => row.label === '确认地理编辑');
    const feedback = clickEvent && evidence.wire.changes.find(row => row.at >= clickEvent.at && row.state === 'busy');
    if (!feedback) throw new Error('No measured immediate busy feedback: sample is invalid');
    return { ...evidence, totals: { ...totals, feedbackMs: feedback.at - clickEvent.at } };
  } catch (error) { error.measurementEvidence = evidence; throw error; }
}
async function readRoots(page) {
  // The isolated measurement context contains only synthetic measurement drafts.
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('roots', 'readonly'), store = tx.objectStore('roots');
      const keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => { db.close(); resolve(keys.result.map((key, i) => [key, Array.from(values.result[i])])); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function cancelCreate(page, sample) {
  const before = await readRoots(page);
  await panel(page, '草稿');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('512');
  await click(page, '新建空白海洋草稿'); await resetEvidence(page);
  await page.getByRole('alertdialog').getByRole('button', { name: '确认新建草稿', exact: true }).click();
  // Cancel after actual completed geometry batches, before staging or committing.
  const target = [128, 256, 512][sample % 3];
  await page.waitForFunction(count => window.__atlasWireEvidence.wire.some(row => row.type === 'progress' && row.stage?.stage === '创建空白海洋共享地理' && row.stage.completed >= count), target);
  await click(page, '取消操作'); await ready(page);
  const evidence = await readEvidence(page), after = await readRoots(page);
  const request = evidence.wire.wire.find(row => row.type === 'request' && row.operation === 'create');
  const traffic = evidence.wire.wire.filter(row => row.id === request?.id), cancelled = traffic.find(row => row.type === 'error');
  const clickEvent = evidence.wire.clicks.find(row => row.label === '取消操作');
  const settled = evidence.wire.changes.find(row => row.at >= clickEvent?.at && row.state === 'ready');
  if (!cancelled?.error?.cancelled || cancelled.error.committed || !settled || traffic.some(row => row.type === 'complete')) throw new Error('Cancellation was not a measured precommit abort');
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Cancelled creation changed the saved root set or source bytes');
  return { ...evidence, target, rootsBefore: before, rootsAfter: after, cancelToWorkerAbortMs: cancelled.at - clickEvent.at, cancelToInteractiveMs: settled.at - clickEvent.at, rootBytesUnchanged: true };
}
try {
  if (mode === 'cancel') {
    for (let sample = 0; sample < 10; sample++) {
      const { context, page } = await setup();
      try { await measured(`cancel-source-${sample + 1}`, () => create(page, 128)); await measured(`cancel-extended-${sample + 1}`, () => cancelCreate(page, sample)); }
      finally { await context.close(); }
    }
  } else if (mode === 'loads') {
    for (let sample = 0; sample < 10; sample++) {
      const { context, page } = await setup();
      try {
        const initial = await measured(`standard-initial-save-${sample + 1}`, () => create(page));
        const id = initial.attributes['data-atlas-id'];
        await measured(`standard-fresh-document-restore-${sample + 1}`, async () => { await page.goto(`${baseURL}/?atlas=${id}`); await ready(page); const evidence = await readEvidence(page); for (const key of ['data-atlas-id', 'data-atlas-hash', 'data-atlas-revision']) if (initial.attributes[key] !== evidence.attributes[key]) throw new Error(`Restored ${key} differs from saved state`); return { ...evidence, totals: summarize(evidence, 'restore'), identityAndHashUnchanged: true, cacheScope: 'New document, Worker, app state and decoded block cache; same browser and storage, OS/disk cache not cleared.' }; });
      } finally { await context.close(); }
    }
  } else {
    for (const size of mode === 'transport' ? [128, 256, 512] : [256]) {
      const { context, page } = await setup();
      try {
        await measured(`${size}-initial-save`, () => create(page, size)); await position(page, size);
        const count = mode === 'edits' ? 100 : mode === 'transport' ? 3 : 6;
        for (let index = 0; index < count; index++) await measured(`${size}-edit-${index + 1}`, () => edit(page, index, size));
        await page.screenshot({ path: resolve(output, `${size}-edited.png`), fullPage: true });
      } finally { await context.close(); }
    }
  }
  if (report.pageErrors.length || report.consoleErrors.length) throw new Error('Browser reported errors; inspect raw report');
  report.sourceUnchanged = (await fingerprint(sourcePaths)).sha256 === source.sha256;
  report.distUnchanged = (await fingerprint(await files('dist'))).sha256 === dist.sha256;
  if (!report.sourceUnchanged || !report.distUnchanged) throw new Error('Source/build changed during measurements');
  report.status = 'measured';
} catch (error) { report.status = 'failed'; report.errors.push({ message: String(error) }); process.exitCode = 1; }
finally { report.completedAt = new Date().toISOString(); await persist(); await browser.close(); console.log(`Evidence ${relative(process.cwd(), output)}`); }
