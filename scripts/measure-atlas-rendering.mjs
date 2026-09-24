import { chromium } from '@playwright/test';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import os from 'node:os';

// Production UI only. Diagnostic events and exact-target IDB reads are read-only.
const args = Object.fromEntries(process.argv.slice(2).map(value => { const split = value.indexOf('='); return [value.slice(2, split < 0 ? undefined : split), split < 0 ? 'true' : value.slice(split + 1)]; }));
if (args.help) { console.log('node scripts/measure-atlas-rendering.mjs --mode=smoke|formal --presentation=headless|headed --dpr=1|2 --url=http://127.0.0.1:4173 [--calibration-only]\nCalibration-only runs the same isolated pure-DOM native wheel preflight, never creates a game world and never produces measured/formal coverage.'); process.exit(0); }
const mode = args.mode ?? 'smoke', presentation = args.presentation ?? 'headless', dpr = Number(args.dpr ?? 1);
if (!['smoke', 'formal'].includes(mode) || !['headless', 'headed'].includes(presentation) || ![1, 2].includes(dpr)) throw new Error('Invalid mode/presentation/DPR');
if (args['calibration-only'] !== undefined && args['calibration-only'] !== 'true') throw new Error('Use --calibration-only without a value');
const calibrationOnly = args['calibration-only'] === 'true';
const baseURL = args.url ?? 'http://127.0.0.1:4173';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) throw new Error('Use an isolated localhost production preview');
const durationMs = mode === 'formal' ? 60000 : 5000, repetitions = mode === 'formal' ? 3 : 1;
// Four float32 unit roundoffs (u=2^-24), not four machine epsilons.
// This bound applies only to native wheel/DPR representations. Timing, LOD,
// world data, zero wheel axes and physical canvas pixel counts stay unchanged.
const nativeRelativeTolerance = 2 ** -22;
const nativeClose = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= Math.abs(expected) * nativeRelativeTolerance;
const output = resolve('.autopilot/ph05/render-measurements', `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${calibrationOnly ? 'calibration-only-' : ''}${presentation}-dpr${dpr}`);
await mkdir(output, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const log = async message => { const line = `${new Date().toISOString()} ${message}`; console.log(line); await appendFile(resolve(output, 'run.log'), `${line}\n`); };
async function files(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`; if (entry.isSymbolicLink()) throw new Error(`Symlink in measured source: ${path}`);
    if (entry.isDirectory()) paths.push(...await files(path)); else paths.push(path);
  }
  return paths.sort();
}
async function fingerprint(paths) {
  const rows = [];
  for (const path of paths) { const bytes = await readFile(path); rows.push({ path, bytes: bytes.length, sha256: sha(bytes), modified: (await stat(path)).mtimeMs }); }
  return { sha256: sha(JSON.stringify(rows.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))), files: rows };
}
const trackedPaths = async () => [...await files('src'), ...await files('public'), 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'scripts/measure-atlas-rendering.mjs', 'scripts/summarize-atlas-rendering.mjs', 'docs/adr/0008-scale-benchmark-and-production-budgets.md', 'docs/adr/0010-atlas-camera-and-render-cache.md'].sort();
const report = { format: 'lieguoji-ph05-render-measurement', version: 1, mode, calibrationOnly, presentation, dpr, durationMs, repetitions, startedAt: new Date().toISOString(),
  launch: { channel: 'chromium', headless: presentation === 'headless' }, viewport: { width: 1440, height: 960 },
  host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus().map(cpu => cpu.model), totalMemory: os.totalmem() },
  trajectory: { id: 'ph05-ui-pan-zoom-select-v2', cycleMs: mode === 'formal' ? 12000 : 5000, inputCadenceMs: 40, cycles: mode === 'formal' ? 5 : 1, wheelDelta: 320, wheelUnits: 'trusted-dom-css-pixels', inwardSteps: 6, outwardSteps: 6, phaseSeconds: { zoomIn: [0, 1.5], drag: [1.5, 8.5], select: [8.5, 10.5], zoomOut: [10.5, 12] }, dragAmplitude: { width: .16, height: .11 }, selection: 'alternate nearest-central legal-recipe land/sea neighboring nominal centers; actual shared-geometry pick and DOM label checked' },
  scenes: [], samples: [], errors: [], consoleErrors: [], pageErrors: [], requestFailures: [],
  limitations: ['Geography-only production drafts, not full society/entities or the PH06 generator.', 'rAF intervals are observed callback intervals, never physical-display FPS or GPU completion.', 'Draw CPU includes the entire renderer draw and synchronous metric listener work; no trimmed outliers.', 'Cold means new document/renderer after required initial fit frame, without trajectory preheating; browser/OS caches are not flushed.', 'Warm immediately repeats the same timed input path in the same renderer; its prior selection is recorded.', 'Managed texture logical pixels do not establish total GPU/Worker/process memory.', 'Headed window screenshots are evidence of rendered output, not human visual approval or physical scanout measurement.', 'Background activity outside this browser is not proven absent.'] };
const persist = () => writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let browser;
async function calibrateNativeWheel() {
  // This separate context never loads the game, creates a canvas, or imports a
  // game script. Calibration measures native API->DOM units, not map performance.
  const calibration = { id: 'ph05-native-wheel-css-v2', status: 'running', startedAt: new Date().toISOString(),
    presentation, browserVersion: report.browserVersion, contextOptions: { viewport: { ...report.viewport }, deviceScaleFactor: dpr },
    apiUnitsPerCssUnitRange: { min: .25, max: 4 },
    numericPrecision: { model: 'ieee754-float32-four-unit-roundoffs-v1', float32UnitRoundoff: 2 ** -24, relativeTolerance: nativeRelativeTolerance,
      wheelAbsoluteTolerance: 320 * nativeRelativeTolerance, dprAbsoluteTolerance: dpr * nativeRelativeTolerance,
      appliesOnlyTo: ['native-wheel-delta', 'reported-dpr', 'renderer-resolution'], zeroAxes: 'exact', physicalPixels: 'exact-round-css-times-target-dpr' },
    targetCssMagnitude: 320, probes: [], allEvents: [], requests: [], workers: [], errors: [],
    pageClosed: false, contextClosed: false };
  report.wheelCalibration = calibration;
  const context = await browser.newContext(calibration.contextOptions);
  let page;
  const environment = () => page.evaluate(() => ({ url: window.location.href, dpr: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight }, visibility: document.visibilityState, focused: document.hasFocus(),
    resources: performance.getEntriesByType('resource').map(entry => entry.name), canvases: document.querySelectorAll('canvas').length, scripts: document.scripts.length }));
  const validNative = event => event?.type === 'wheel' && event.trusted === true && event.target === 'wheel-calibration-target'
    && event.deltaMode === 0 && event.deltaX === 0 && event.deltaZ === 0 && Number.isFinite(event.deltaY) && event.deltaY !== 0;
  try {
    await context.route('**/*', async route => { calibration.requests.push(route.request().url()); await route.abort(); });
    page = await context.newPage(); page.on('worker', worker => calibration.workers.push(worker.url()));
    await page.setContent('<!doctype html><html><head><title>PH05 native wheel calibration</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}main{width:100vw;height:100vh;background:#f3f3f3}</style></head><body><main id="wheel-calibration-target"></main></body></html>');
    await page.evaluate(() => {
      window.__atlasNativeWheelProbe = { events: [] };
      document.addEventListener('wheel', event => {
        window.__atlasNativeWheelProbe.events.push({ at: performance.now(), type: event.type, trusted: event.isTrusted, target: event.target?.id,
          x: event.clientX, y: event.clientY, deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ });
        event.preventDefault();
      }, { capture: true, passive: false });
    });
    await page.bringToFront(); await page.mouse.move(report.viewport.width / 2, report.viewport.height / 2);
    calibration.environmentBefore = await environment();
    const probe = async (stage, apiDeltaY, targetCssDeltaY = null) => {
      const boundary = await page.evaluate(() => ({ eventOffset: window.__atlasNativeWheelProbe.events.length, startedAt: performance.now() }));
      const row = { index: calibration.probes.length, stage, apiDeltaX: 0, apiDeltaY, targetCssDeltaY, ...boundary, events: [] };
      calibration.probes.push(row);
      await page.mouse.wheel(0, apiDeltaY);
      await page.waitForFunction(offset => window.__atlasNativeWheelProbe.events.length > offset, boundary.eventOffset, { timeout: 3000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      Object.assign(row, await page.evaluate(offset => ({ endedAt: performance.now(), events: window.__atlasNativeWheelProbe.events.slice(offset) }), boundary.eventOffset));
      if (row.events.length !== 1 || !validNative(row.events[0]) || Math.sign(row.events[0].deltaY) !== Math.sign(apiDeltaY)) throw new Error('Wheel calibration did not observe exactly one supported trusted pixel-mode native event');
      if (targetCssDeltaY !== null && !nativeClose(row.events[0].deltaY, targetCssDeltaY)) throw new Error('Calibrated native wheel differs from the requested CSS delta beyond the fixed float32 representation bound');
      return row.events[0];
    };
    const negative = await probe('discovery', -320), positive = await probe('discovery', 320);
    const negativeRatio = negative.deltaY / -320, positiveRatio = positive.deltaY / 320;
    if (!nativeClose(positiveRatio, negativeRatio) || !Number.isFinite(negativeRatio) || negativeRatio <= 0) throw new Error('Native wheel conversion is not a finite consistent positive ratio');
    const multiplier = 1 / negativeRatio;
    if (!Number.isFinite(multiplier) || multiplier < calibration.apiUnitsPerCssUnitRange.min || multiplier > calibration.apiUnitsPerCssUnitRange.max) throw new Error(`Native wheel API/CSS multiplier is outside the supported finite range: ${multiplier}`);
    calibration.observedCssUnitsPerApiUnit = negativeRatio; calibration.apiUnitsPerCssUnit = multiplier;
    for (const target of [-320, 320, -320, 320]) await probe('verification', target * multiplier, target);
    calibration.environmentAfter = await environment();
    calibration.allEvents = await page.evaluate(() => window.__atlasNativeWheelProbe.events);
    if (JSON.stringify(calibration.allEvents) !== JSON.stringify(calibration.probes.flatMap(row => row.events))) throw new Error('Unassigned native wheel events were observed during calibration');
    for (const env of [calibration.environmentBefore, calibration.environmentAfter]) {
      if (env.url !== 'about:blank' || !nativeClose(env.dpr, dpr) || env.viewport.width !== report.viewport.width || env.viewport.height !== report.viewport.height
        || env.visibility !== 'visible' || presentation === 'headed' && !env.focused || env.resources.length || env.canvases || env.scripts) throw new Error('Native wheel calibration was not an isolated visible pure-DOM page with the locked configuration');
    }
    if (calibration.requests.length || calibration.workers.length) throw new Error('Pure-DOM calibration attempted a resource request or Worker');
    calibration.status = 'calibrated';
  } catch (error) { calibration.status = 'failed'; calibration.errors.push(String(error)); throw error; }
  finally {
    if (page && !page.isClosed()) {
      calibration.allEvents = await page.evaluate(() => window.__atlasNativeWheelProbe?.events ?? []).catch(() => calibration.allEvents);
      await page.close(); calibration.pageClosed = page.isClosed();
    }
    await context.close(); calibration.contextClosed = true; calibration.completedAt = new Date().toISOString(); await persist();
  }
  if (!calibration.pageClosed || !calibration.contextClosed) throw new Error('Native wheel calibration did not close its isolated page/context');
  await log(`NATIVE WHEEL calibrated API/CSS=${calibration.apiUnitsPerCssUnit}, +/-320 CSS pixels verified within relative 2^-22 on pure DOM; raw values retained`);
}
async function ready(page, state = 'ready') { await page.waitForFunction(expected => document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state') === expected, state, { timeout: 120000 }); }
async function button(page, name) { await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click(); }
async function panel(page, name) { await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click(); }
async function identity(page) { return page.getByTestId('atlas-studio').evaluate(node => ({ draftId: node.getAttribute('data-atlas-id'), manifestDigest: node.getAttribute('data-atlas-hash'), revision: Number(node.getAttribute('data-atlas-revision')), state: node.getAttribute('data-atlas-state') })); }
async function diagnostic(page, kind, boundary = null) {
  return page.getByTestId('atlas-canvas').evaluate((canvas, { type, boundary }) => new Promise((resolve, reject) => {
    const requestId = `ph05-${crypto.randomUUID()}`, response = `atlas-${type}-response`;
    const timer = setTimeout(() => { canvas.removeEventListener(response, receive); reject(new Error(`${type} response timed out`)); }, 120000);
    function receive(event) {
      if (event.detail?.requestId !== requestId) return; clearTimeout(timer); canvas.removeEventListener(response, receive);
      const value = structuredClone(event.detail);
      if (type === 'metrics') value.labels = window.__atlasRenderingObservation.labels();
      // The baseline/final slot and observer boundary share one JS task, so an
      // intervening draw cannot fall between two separate evaluate calls.
      if (boundary === 'start') value.observation = window.__atlasRenderingObservation.start();
      if (boundary === 'stop') value.observation = window.__atlasRenderingObservation.stop();
      resolve(value);
    }
    canvas.addEventListener(response, receive); canvas.dispatchEvent(new window.CustomEvent(`atlas-${type}-request`, { detail: { requestId } }));
  }), { type: kind, boundary });
}
async function metrics(page) { const result = await diagnostic(page, 'metrics'); if (!result.metrics) throw new Error('Missing read-only renderer metrics'); return result.metrics; }
async function audit(page) { const result = await diagnostic(page, 'audit'); if (!result.ok || result.verifiedBlocks !== 256 || !/^[a-f0-9]{64}$/.test(result.manifestDigest)) throw new Error(`Full 256-block audit failed: ${JSON.stringify(result)}`); return result; }
async function rootBytes(page, draftId) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    if (!/^atlas-[0-9a-f-]{36}$/.test(id)) { reject(new Error('Invalid exact draft ID')); return; }
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onupgradeneeded = () => request.transaction.abort(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Read-only root open blocked'));
    request.onsuccess = () => {
      const db = request.result; if (!db.objectStoreNames.contains('roots')) { db.close(); reject(new Error('No Atlas roots store')); return; }
      const tx = db.transaction('roots', 'readonly'), row = tx.objectStore('roots').get(id);
      tx.oncomplete = () => { db.close(); if (!(row.result instanceof Uint8Array)) reject(new Error('No known raw root')); else resolve([...row.result]); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), draftId);
}
function patchesFor(scene) {
  const patches = [];
  const add = (column, row, range, height) => patches.push({ cellId: row * 256 + column, column, row, range, height });
  if (scene === 'archipelago') {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) add(24 + x * 40 + (y % 2) * 8, 24 + y * 40, 8, [120, 450, 1100, 2200, 3700][(x + y * 2) % 5]);
  } else {
    for (let y = 1; y <= 6; y++) for (let x = 1; x <= 6; x++) if ((x - 3.5) ** 2 / 10 + (y - 3.5) ** 2 / 12 < 1) add(16 + x * 32, 16 + y * 32, 32, 80 + ((x * 3 + y * 2) % 5) * 170);
    if (scene === 'mountains') {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) add(72 + x * 32 + (y % 2) * 8, 48 + y * 24, 8, 1900 + ((x * 5 + y) % 4) * 900);
    } else {
      for (let i = 0; i < 8; i++) add(72 + i * 16, 112 + (i % 3) * 8, 8, i % 2 ? -150 : 1800);
    }
  }
  return patches;
}
function selectionPlanFor(scene) {
  // Independent expected data from completed ordinary UI edits, never injected
  // into a Worker/store. The untouched production ocean starts at -100 metres.
  const heights = new Int32Array(256 * 256).fill(-100);
  for (const { column, row, range, height } of scene.commands) for (let y = row - range / 2; y < row + range / 2; y++) for (let x = column - range / 2; x < column + range / 2; x++) heights[y * 256 + x] = height;
  let pair = null, score = Infinity;
  for (let row = 1; row < 255; row++) for (let column = 1; column < 255; column++) {
    const id = row * 256 + column; if (heights[id] < 0) continue;
    for (const neighbor of [id - 1, id + 1, id - 256, id + 256]) {
      const distance = (column - 127.5) ** 2 + (row - 127.5) ** 2;
      if (heights[neighbor] >= 0 || distance >= score) continue;
      const cell = cellId => ({ cellId, expectedElevation: heights[cellId], world: { x: (cellId % 256 + .5) * 16, y: (Math.floor(cellId / 256) + .5) * 16 } });
      score = distance; pair = { source: 'completed-legal-ui-edits-v1', initialOceanMeters: -100, land: cell(id), sea: cell(neighbor) };
    }
  }
  if (!pair) throw new Error('No real land/sea neighbor pair in the completed UI geography');
  return pair;
}
async function buildScene(page, name) {
  await page.goto(`${baseURL}/?atlas=new`); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(`PH05-${name}-非正式测量地理`);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('ph05-ui-geography-v1');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256');
  await button(page, '新建空白海洋草稿'); await ready(page);
  const scene = { name, recipe: 'ph05-ui-geography-v1', initial: await identity(page), commands: [], declaredScope: 'Synthetic geography through ordinary editing UI; not formal canon or procedural generation.' }; report.scenes.push(scene); await persist();
  await panel(page, '编辑');
  for (const patch of patchesFor(name)) {
    await page.getByLabel('定位地块编号', { exact: true }).fill(String(patch.cellId)); await button(page, '定位');
    if (scene.commands.length === 0) await button(page, '高程');
    await page.getByLabel('高程编辑范围', { exact: true }).selectOption(String(patch.range)); await page.getByLabel('目标高程（米）', { exact: true }).fill(String(patch.height));
    const before = await identity(page); await button(page, '预览地理编辑'); await page.getByRole('region', { name: '地理编辑预览' }).waitFor(); await ready(page);
    const previewCells = Number(await page.getByRole('region', { name: '地理编辑预览' }).getAttribute('data-atlas-preview-cells'));
    await button(page, '确认地理编辑'); await ready(page);
    const after = await identity(page), selectedHeight = await page.getByTestId('atlas-selected-height').innerText();
    scene.commands.push({ ...patch, before, after, previewCells, selectedHeight });
    if (after.revision !== before.revision + 1 || before.manifestDigest === after.manifestDigest || selectedHeight !== `${patch.height} 米` || previewCells !== patch.range ** 2) throw new Error(`UI geography edit did not commit: ${name}/${scene.commands.length}`);
    await persist();
  }
  scene.selectionPlan = selectionPlanFor(scene);
  await panel(page, '地图'); await button(page, '全图'); scene.final = await identity(page); scene.audit = await audit(page); scene.root = await rootBytes(page, scene.final.draftId);
  await page.screenshot({ path: resolve(output, `${name}-constructed.png`) }); await persist(); return scene;
}
async function installObserver(context) {
  await context.addInitScript(() => {
    // Only private observer arrays are written. No game objects or authoritative data are exposed or replaced.
    let current = null, frame = 0;
    const labels = () => [...document.querySelectorAll('[data-testid="atlas-map-label"]')].filter(node => !node.hidden).map(node => ({ cellId: Number(node.dataset.cellId), elevationMeters: Number(node.dataset.elevationMeters), selected: node.dataset.selected === 'true', text: node.textContent }));
    window.__atlasRenderingObservation = {
      labels,
      start() {
        if (current) throw new Error('A sample is already active');
        current = { startedAt: performance.now(), endedAt: null, initialVisibility: document.visibilityState, initialFocus: document.hasFocus(), frames: [], draws: [], visibility: [], focus: [], gpuEvents: [], inputs: [] };
        function tick(at) { if (!current) return; current.frames.push(at); frame = requestAnimationFrame(tick); }
        frame = requestAnimationFrame(tick); return current.startedAt;
      },
      stop() { if (!current) return null; cancelAnimationFrame(frame); current.endedAt = performance.now(); const result = current; current = null; return result; },
    };
    document.addEventListener('atlas-render-metrics', event => { if (current && event.target?.matches?.('[data-testid="atlas-canvas"]')) current.draws.push({ at: performance.now(), metrics: structuredClone(event.detail), labels: labels() }); }, true);
    document.addEventListener('visibilitychange', () => { if (current) current.visibility.push({ at: performance.now(), state: document.visibilityState }); });
    for (const type of ['focus', 'blur']) window.addEventListener(type, () => { if (current) current.focus.push({ at: performance.now(), type, focused: document.hasFocus() }); });
    for (const type of ['webglcontextlost', 'webglcontextrestored']) document.addEventListener(type, event => { if (current) current.gpuEvents.push({ at: performance.now(), type, trusted: event.isTrusted }); }, true);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'click']) document.addEventListener(type, event => {
      if (current) current.inputs.push({ at: performance.now(), type, trusted: event.isTrusted, target: event.target?.getAttribute?.('data-testid') ?? event.target?.closest?.('button')?.textContent?.trim() ?? event.target?.tagName, x: event.clientX, y: event.clientY, deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, buttons: event.buttons });
    }, { capture: true, passive: true });
  });
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, Math.max(0, milliseconds)));
function safeNominalPick(camera, anchor, bounds) {
  if (![camera.x, camera.y, camera.scale].every(Number.isFinite) || camera.scale <= 0) throw new Error('No valid camera for the nominal-center pick');
  const step = 16, margin = 2;
  const candidateWorld = { x: (anchor.x - camera.x) / camera.scale, y: (anchor.y - camera.y) / camera.scale };
  const limits = (offset, size) => ({ min: Math.max(0, Math.ceil((margin - offset) / camera.scale / step - .5)), max: Math.min(255, Math.floor((size - margin - offset) / camera.scale / step - .5)) });
  const columns = limits(camera.x, bounds.width), rows = limits(camera.y, bounds.height);
  if (columns.min > columns.max || rows.min > rows.max) throw new Error('The current viewport contains no safe nominal cell center');
  const column = Math.max(columns.min, Math.min(columns.max, Math.floor(candidateWorld.x / step))), row = Math.max(rows.min, Math.min(rows.max, Math.floor(candidateWorld.y / step)));
  // This runner creates worlds with model jitter <= step/12 and performs ONLY
  // height edits. Nominal centers are therefore strictly inside their original
  // shared quads. Floor merely chooses that cell; it never classifies the
  // arbitrary anchor point against the jittered boundary.
  const safeWorld = { x: (column + .5) * step, y: (row + .5) * step }, local = { x: safeWorld.x * camera.scale + camera.x, y: safeWorld.y * camera.scale + camera.y };
  if (![local.x, local.y].every(Number.isFinite) || local.x < margin || local.x > bounds.width - margin || local.y < margin || local.y > bounds.height - margin) throw new Error('Safe world center did not project inside the actual viewport');
  return { expected: row * 256 + column, column, row, candidateScreen: anchor, candidateWorld, safeWorld, local, jitterBoundWorld: step / 12, viewportMarginCssPixels: margin };
}
async function drive(page, bounds, evidence, scene) {
  const began = performance.now(), cycleMs = report.trajectory.cycleMs, executed = new Set(); let down = false, cycle = -1;
  let center, wheelIndex = 0;
  while (performance.now() - began < durationMs) {
    const elapsed = performance.now() - began, currentCycle = Math.floor(elapsed / cycleMs), phase = elapsed % cycleMs / cycleMs * 12;
    if (currentCycle !== cycle) {
      if (down) { await page.mouse.up(); down = false; } await panel(page, '地图'); await button(page, '全图'); cycle = currentCycle;
      const fitted = await metrics(page), land = scene.selectionPlan.land.world, sea = scene.selectionPlan.sea.world;
      center = { x: bounds.x + (land.x + sea.x) / 2 * fitted.camera.scale + fitted.camera.x, y: bounds.y + (land.y + sea.y) / 2 * fitted.camera.scale + fitted.camera.y };
      evidence.actions.push({ atMs: performance.now() - began, kind: 'cycle-start', cycle, camera: fitted.camera, lod: fitted.lod, anchor: center });
    }
    if (phase < 1.5 || phase >= 10.5) {
      if (down) { await page.mouse.up(); down = false; }
      const inward = phase < 1.5, slot = Math.floor((inward ? phase : phase - 10.5) / .25), key = `${cycle}/${inward ? 'in' : 'out'}/${slot}`;
      if (!executed.has(key)) {
        const cssDeltaY = inward ? -320 : 320, apiDeltaY = cssDeltaY * report.wheelCalibration.apiUnitsPerCssUnit;
        await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, apiDeltaY); executed.add(key);
        evidence.actions.push({ atMs: performance.now() - began, kind: 'zoom', key, wheelIndex: wheelIndex++, x: center.x, y: center.y,
          deltaY: cssDeltaY, cssDeltaX: 0, cssDeltaY, apiDeltaX: 0, apiDeltaY });
      }
    } else if (phase < 8.5) {
      const angle = (phase - 1.5) / 7 * Math.PI * 2;
      if (!down) { await page.mouse.move(center.x, center.y); await page.mouse.down(); down = true; }
      const x = center.x + Math.sin(angle) * bounds.width * .16, y = center.y + Math.sin(angle * 2) * bounds.height * .11;
      await page.mouse.move(x, y); evidence.actions.push({ atMs: performance.now() - began, kind: 'drag', x, y });
    } else {
      if (down) { await page.mouse.up(); down = false; }
      const slot = Math.floor((phase - 8.5) / .5), key = `${cycle}/select/${slot}`;
      if (!executed.has(key)) {
        const terrain = slot % 2 ? 'sea' : 'land', target = scene.selectionPlan[terrain], before = await metrics(page);
        const anchor = { x: target.world.x * before.camera.scale + before.camera.x, y: target.world.y * before.camera.scale + before.camera.y }, pick = safeNominalPick(before.camera, anchor, bounds);
        if (pick.expected !== target.cellId) throw new Error('Planned real land/sea nominal center is outside the viewport');
        await page.mouse.click(bounds.x + pick.local.x, bounds.y + pick.local.y); const after = await diagnostic(page, 'metrics');
        const selectedLabel = after.labels.find(label => label.cellId === target.cellId && label.selected);
        evidence.actions.push({ atMs: performance.now() - began, kind: 'select', key, ...pick, actual: after.metrics.selected, cameraBefore: before.camera, terrain, expectedElevation: target.expectedElevation, selectedLabel, lod: after.metrics.lod, gridVisible: after.metrics.gridVisible }); executed.add(key);
        if (after.metrics.selected !== pick.expected || selectedLabel?.elevationMeters !== target.expectedElevation || after.metrics.lod !== 'near' || !after.metrics.gridVisible) throw new Error('Actual near-grid land/sea pick or current selected label differs from the completed UI geography'); await panel(page, '地图');
      }
    }
    const next = (Math.floor((performance.now() - began) / 40) + 1) * 40; await sleep(Math.min(next, durationMs) - (performance.now() - began));
  }
  if (down) await page.mouse.up();
}
async function sample(page, scene, repetition, temperature) {
  const label = `${scene.name}-r${repetition}-${temperature}`, raw = { label, scene: scene.name, repetition, temperature, targetDurationMs: durationMs, trajectory: report.trajectory.id, actions: [], errors: [] };
  await log(`START ${label}`); let observing = false;
  try {
    await page.bringToFront(); await ready(page); await panel(page, '地图'); await button(page, '全图');
    raw.identityBefore = await identity(page); raw.auditBefore = await audit(page); raw.rootBefore = await rootBytes(page, scene.final.draftId);
    raw.boundsBefore = await page.getByTestId('atlas-canvas').boundingBox();
    if (!raw.boundsBefore || raw.boundsBefore.width < 1280 || raw.boundsBefore.height < 800) throw new Error('Production canvas differs from the locked configuration');
    const started = await diagnostic(page, 'metrics', 'start'); raw.metricsBefore = started.metrics; raw.labelsBefore = started.labels; raw.browserSampleStartedAt = started.observation; observing = true;
    if (!nativeClose(raw.metricsBefore.viewport.resolution, dpr)) throw new Error('Renderer DPR differs from the locked configuration beyond the fixed float32 representation bound');
    await drive(page, raw.boundsBefore, raw, scene);
    // Keep the observer alive for the final queued draw and retrieve its completed
    // measurement (the public render event intentionally reports the prior draw).
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const stopped = await diagnostic(page, 'metrics', 'stop'); raw.metricsAfter = stopped.metrics; raw.labelsAfter = stopped.labels; raw.observation = stopped.observation; observing = false;
    raw.boundsAfter = await page.getByTestId('atlas-canvas').boundingBox(); raw.identityAfter = await identity(page); raw.auditAfter = await audit(page); raw.rootAfter = await rootBytes(page, scene.final.draftId);
    const gl = await page.getByTestId('atlas-canvas').evaluate(canvas => {
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl'); if (!context) return null;
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      return { version: context.getParameter(context.VERSION), vendor: context.getParameter(context.VENDOR), renderer: context.getParameter(context.RENDERER), unmaskedVendor: extension ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null, unmaskedRenderer: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null, lost: context.isContextLost(), canvasWidth: canvas.width, canvasHeight: canvas.height,
        drawingBufferWidth: context.drawingBufferWidth, drawingBufferHeight: context.drawingBufferHeight, dpr: window.devicePixelRatio };
    }); raw.webgl = gl;
    if (!gl || gl.canvasWidth !== Math.round(raw.boundsAfter.width * dpr) || gl.canvasHeight !== Math.round(raw.boundsAfter.height * dpr)
      || gl.drawingBufferWidth !== gl.canvasWidth || gl.drawingBufferHeight !== gl.canvasHeight) throw new Error('Actual canvas/drawing-buffer pixels differ from exact rounded CSS dimensions times target DPR');
    raw.screenshot = `${label}.png`; const screenshot = await page.screenshot({ path: resolve(output, raw.screenshot) }); raw.screenshotSha256 = sha(screenshot);
    raw.completed = true;
  } catch (error) { raw.errors.push(String(error)); throw error; }
  finally {
    if (observing) raw.observation = await page.evaluate(() => window.__atlasRenderingObservation.stop()).catch(error => ({ error: String(error) }));
    const name = `${label}.raw.json`, bytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`); await writeFile(resolve(output, name), bytes);
    report.samples.push({ label, scene: scene.name, repetition, temperature, path: name, bytes: bytes.length, sha256: sha(bytes), completed: raw.completed === true }); await persist(); await log(`END ${label} completed=${raw.completed === true}`);
  }
}
try {
  report.source = await fingerprint(await trackedPaths()); report.dist = await fingerprint(await files('dist'));
  const buildTime = (await stat('dist/index.html')).mtimeMs;
  if (report.source.files.some(row => !row.path.startsWith('scripts/') && !row.path.startsWith('docs/') && row.modified > buildTime)) throw new Error('Source newer than dist: build once before measuring');
  if (!calibrationOnly) {
    const served = await fetch(`${baseURL}/`); if (!served.ok || sha(Buffer.from(await served.arrayBuffer())) !== sha(await readFile('dist/index.html'))) throw new Error('Served index is not the fingerprinted production build'); report.servedIndexVerified = true;
  }
  await persist(); await log(`LAUNCH ${presentation} DPR${dpr} ${mode}`); browser = await chromium.launch(report.launch); report.browserVersion = browser.version();
  const cdp = await browser.newBrowserCDPSession(); report.systemInfo = await cdp.send('SystemInfo.getInfo'); await cdp.detach();
  await calibrateNativeWheel();
  for (const name of calibrationOnly ? [] : ['continental', 'archipelago', 'mountains']) {
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: dpr }); await installObserver(context);
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ scene: name, at: new Date().toISOString(), message: message.text() }); });
    page.on('pageerror', error => report.pageErrors.push({ scene: name, at: new Date().toISOString(), message: error.message }));
    page.on('requestfailed', request => report.requestFailures.push({ scene: name, url: request.url(), failure: request.failure() }));
    try {
      await log(`BUILD SCENE ${name} via legitimate UI`); const scene = await buildScene(page, name);
      for (let repetition = 1; repetition <= repetitions; repetition++) {
        await page.goto(`${baseURL}/?atlas=${scene.final.draftId}`); await ready(page);
        await sample(page, scene, repetition, 'cold'); await sample(page, scene, repetition, 'warm');
      }
    } finally { await context.close(); }
  }
  if (report.consoleErrors.length || report.pageErrors.length || report.requestFailures.length) throw new Error('Browser/resource errors were observed; raw evidence retained');
  report.status = calibrationOnly ? 'calibrated' : 'measured';
} catch (error) { report.status = 'failed'; report.errors.push({ at: new Date().toISOString(), message: String(error), stack: error?.stack }); process.exitCode = 1; }
finally {
  try { report.sourceAfter = await fingerprint(await trackedPaths()); report.distAfter = await fingerprint(await files('dist')); report.sourceUnchanged = report.sourceAfter.sha256 === report.source?.sha256; report.distUnchanged = report.distAfter.sha256 === report.dist?.sha256; if (!report.sourceUnchanged || !report.distUnchanged) { report.status = 'failed'; report.errors.push({ message: 'Source/dist changed during the measurement' }); process.exitCode = 1; } } catch (error) { report.status = 'failed'; report.errors.push({ message: `Fingerprint failure: ${String(error)}` }); process.exitCode = 1; }
  report.completedAt = new Date().toISOString(); await persist(); await browser?.close(); await log(`EVIDENCE ${relative(process.cwd(), output)} status=${report.status}`);
}
