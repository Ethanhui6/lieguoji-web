import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import type { AtlasRenderer } from '../src/world/renderer';

type Metrics = ReturnType<AtlasRenderer['metrics']>;
type Audit = { requestId: string; ok: boolean; manifestDigest?: string; draftId?: string; atlasId?: string; revision?: number; verifiedBlocks?: number; error?: string };
type FramebufferRecord = {
  width: number; height: number; frameSequence: number; sha256: string;
  colors: { land: number; ocean: number; background: number }; nonOpaquePixels: number;
  difference: { changedPixels: number; maxChannelDifference: number } | null;
};
type WorldColorProbe = { worldX: number; worldY: number; axis: 'x' | 'y'; rgb: number[] };
type WorldColorReadback = { frameSequence: number; camera: Metrics['camera']; samples: { worldX: number; worldY: number; px: number; py: number; rgba: number[]; expected: number[] }[] };
type TerrainStripReadback = { frameSequence: number; camera: Metrics['camera']; worldY: number; samples: { worldX: number; px: number; py: number; rgba: number[] }[] };
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } } };
function comparePixels(before: Buffer, after: Buffer) {
  const a = PNG.sync.read(before), b = PNG.sync.read(after);
  expect({ width: b.width, height: b.height }).toEqual({ width: a.width, height: a.height });
  let changedPixels = 0, maxChannelDifference = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(a.data[offset + channel] - b.data[offset + channel]);
      if (delta) changed = true; maxChannelDifference = Math.max(maxChannelDifference, delta);
    }
    if (changed) changedPixels++;
  }
  return { width: a.width, height: a.height, changedPixels, maxChannelDifference };
}
declare global {
  interface Window {
    __atlasGpuHarness?: { gl: WebGLRenderingContext | WebGL2RenderingContext; extension: WEBGL_lose_context; lost: number; restored: number; last?: Metrics; events: number; pendingLossTriggered?: boolean };
    __atlasPixelHarness?: { baseline?: { bytes: Uint8Array; width: number; height: number }; result?: FramebufferRecord; error?: string };
    __atlasColorReadback?: { result?: WorldColorReadback; error?: string };
    __atlasTerrainStrip?: { result?: TerrainStripReadback; error?: string };
  }
}
const studio = (page: Page) => page.getByTestId('atlas-studio');
const canvas = (page: Page) => page.getByTestId('atlas-canvas');
async function ready(page: Page, state = 'ready') { await expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 }); }
async function button(page: Page, name: string) { await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click(); }
async function panel(page: Page, name: '地图' | '编辑' | '草稿') { await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click(); }
async function create(page: Page, name: string, size = '256') {
  await page.goto('/?atlas=new'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('PH05-rendering-production-01');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption(size);
  await button(page, '新建空白海洋草稿'); await ready(page);
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function locate(page: Page, id = 32896) {
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(id)); await button(page, '定位');
  await expect(studio(page)).toHaveAttribute('data-selectedcell', String(id));
}
async function previewHeight(page: Page, height: number, range = '32') {
  await button(page, '高程'); await page.getByLabel('目标高程（米）', { exact: true }).fill(String(height));
  await page.getByLabel('高程编辑范围', { exact: true }).selectOption(range); await button(page, '预览地理编辑');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toBeVisible({ timeout: 30000 }); await ready(page);
}
async function confirm(page: Page, revision: number) {
  await button(page, '确认地理编辑'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-revision', String(revision));
}
// Requests expose only copied diagnostics. They cannot write the renderer or authoritative world.
async function diagnostic<T>(page: Page, kind: 'metrics' | 'audit'): Promise<T> {
  return canvas(page).evaluate((element, requestKind) => new Promise<T>((resolve, reject) => {
    const requestId = crypto.randomUUID(), eventName = `atlas-${requestKind}-response`;
    const timer = setTimeout(() => { element.removeEventListener(eventName, listener); reject(new Error(`${requestKind} diagnostic timed out`)); }, 30000);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string }>).detail;
      if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener(eventName, listener); resolve(detail as T);
    };
    element.addEventListener(eventName, listener);
    element.dispatchEvent(new CustomEvent(`atlas-${requestKind}-request`, { detail: { requestId } }));
  }), kind);
}
async function metrics(page: Page) { return (await diagnostic<{ requestId: string; metrics: Metrics }>(page, 'metrics')).metrics; }
async function audit(page: Page) {
  const result = await diagnostic<Audit>(page, 'audit');
  expect(result.ok, result.error).toBe(true); expect(result.verifiedBlocks).toBeGreaterThan(0);
  expect(result.manifestDigest).toBe(await studio(page).getAttribute('data-atlas-hash'));
  // Request IDs are transport identity, not part of the world.
  return { ok: result.ok, manifestDigest: result.manifestDigest, draftId: result.draftId, atlasId: result.atlasId, revision: result.revision, verifiedBlocks: result.verifiedBlocks };
}
async function rootBytes(page: Page, id: string) {
  return page.evaluate(draftId => new Promise<number[]>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('roots', 'readonly'), row = tx.objectStore('roots').get(draftId);
      tx.oncomplete = () => { db.close(); resolve([...row.result as Uint8Array]); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), id);
}
async function nextDraw(page: Page, sequence: number) { await expect.poll(async () => (await metrics(page)).completedFrameSequence).toBeGreaterThan(sequence); }
function worldAt(value: Metrics, x: number, y: number) { return { x: (x - value.camera.x) / value.camera.scale, y: (y - value.camera.y) / value.camera.scale }; }
function samePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) { expect(actual.x).toBeCloseTo(expected.x, 6); expect(actual.y).toBeCloseTo(expected.y, 6); }
function withinBudget(value: Metrics) {
  expect(value.cache.pixels).toBeLessThanOrEqual(32 * 1024 * 1024); expect(value.cache.peakPixels).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(value.cache.created - value.cache.destroyed).toBe(value.cache.entries); expect(value.fatal).toBe(false);
  expect(value.geometryCache.entryLimit).toBe(128); expect(value.geometryCache.quadLimit).toBe(131072);
  expect(value.geometryCache.entries).toBeLessThanOrEqual(128); expect(value.geometryCache.quads).toBeLessThanOrEqual(131072);
  expect(value.geometryCache.peakQuads).toBeLessThanOrEqual(131072);
  expect(value.geometryCache.created - value.geometryCache.destroyed).toBe(value.geometryCache.entries);
  expect(value.geometryCache.quads).toBe(value.geometryCache.liveQuads + value.geometryCache.reservedQuads);
  expect(value.geometryCache.reservedQuads).toBe(0); expect(value.geometryCache.reservedEntries).toBe(0); expect(value.geometryCache.releaseFailures).toBe(0);
}

async function setLod(page: Page, level: 'far' | 'medium' | 'near') {
  await panel(page, '地图'); await button(page, '全图');
  await expect.poll(async () => (await metrics(page)).lod).toBe('far');
  for (let count = 0; count < 12 && (await metrics(page)).lod !== level; count++) {
    const sequence = (await metrics(page)).completedFrameSequence;
    await button(page, '放大大世界地图'); await nextDraw(page, sequence);
  }
  await expect.poll(async () => (await metrics(page)).lod).toBe(level);
}

async function labelLayout(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const actual = await page.getByTestId('atlas-label-layer').evaluate(layer => {
    const rect = (element: Element) => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    const visible = (element: Element) => { const b = element.getBoundingClientRect(), style = getComputedStyle(element); return b.width > 0 && b.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const labels = [...layer.querySelectorAll('[data-testid="atlas-map-label"]')].filter(visible).map(node => ({
      id: Number(node.getAttribute('data-cell-id')), elevation: Number(node.getAttribute('data-elevation-meters')),
      selected: node.getAttribute('data-selected') === 'true', text: node.textContent,
      box: rect(node), fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
    }));
    const stage = layer.closest('.workbench-stage')!;
    return { labels, lod: layer.getAttribute('data-lod'), spans: layer.querySelectorAll('span').length,
      canvas: rect(stage.querySelector('[data-testid="atlas-canvas"]')!),
      occluders: [...stage.querySelectorAll('.atlas-toolbar, .context-inspector, .atlas-status')].filter(visible).map(rect) };
  });
  const value = await metrics(page), maximum = value.viewport.width < 600 ? { far: 1, medium: 4, near: 12 } : { far: 1, medium: 8, near: 32 };
  expect(actual.lod).toBe(value.lod); expect(actual.labels.length).toBeLessThanOrEqual(maximum[value.lod]);
  expect(actual.labels.map(row => row.id).sort((a, b) => a - b)).toEqual([...value.labels.visibleIds].sort((a, b) => a - b));
  expect(value.labels.visibleCount).toBe(actual.labels.length);
  expect(value.labels.examinedCells).toBeLessThanOrEqual(256); expect(value.labels.candidateCount).toBeLessThanOrEqual(256);
  expect(value.labels.visibleNodes).toBeLessThanOrEqual(32); expect(value.labels.probeNodes).toBeLessThanOrEqual(256);
  expect(value.labels.measurementCacheEntries).toBeLessThanOrEqual(256); expect(actual.spans).toBeLessThanOrEqual(288);
  const overlap = (a: typeof actual.canvas, b: typeof actual.canvas) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const [index, row] of actual.labels.entries()) {
    expect(row.box.x).toBeGreaterThanOrEqual(actual.canvas.x - .5); expect(row.box.y).toBeGreaterThanOrEqual(actual.canvas.y - .5);
    expect(row.box.x + row.box.width).toBeLessThanOrEqual(actual.canvas.x + actual.canvas.width + .5);
    expect(row.box.y + row.box.height).toBeLessThanOrEqual(actual.canvas.y + actual.canvas.height + .5);
    for (const other of actual.labels.slice(index + 1)) expect(overlap(row.box, other.box), `labels ${row.id}/${other.id} overlap`).toBe(false);
    for (const obstacle of actual.occluders) expect(overlap(row.box, obstacle), `label ${row.id} overlaps an actual panel`).toBe(false);
  }
  withinBudget(value); return { ...actual, metrics: value };
}

test('远中近细节和真实标签保持相同地块，显示有界且避让实际面板', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, '大世界细节与标签'); await locate(page); await previewHeight(page, 650); await confirm(page, 1);
  const original = await audit(page), root = await rootBytes(page, id);
  for (const level of ['far', 'medium', 'near'] as const) {
    await setLod(page, level);
    await expect(page.getByTestId('atlas-map-label').filter({ visible: true })).not.toHaveCount(0);
    const layout = await labelLayout(page); expect(layout.metrics.gridVisible).toBe(false);
    await expect(page.getByRole('button', { name: '显示地块网格', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await info.attach(`lod-${level}-actual-layout`, { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
    expect(layout.labels.find(row => row.id === 32896)).toMatchObject({ elevation: 650, selected: true });
    expect(layout.labels.every(row => row.elevation === 650)).toBe(true);
    if (level === 'far') expect(layout.labels).toHaveLength(1);
    if (level === 'near') { expect(layout.labels.length).toBeGreaterThan(1); expect(layout.labels.find(row => row.id === 32896)?.text).toContain('32896'); }
    // All three views pick the actual nominal center, strictly inside the
    // unchanged shared quad. Labels must not intercept this real input.
    const bounds = (await canvas(page).boundingBox())!, camera = layout.metrics.camera;
    const x = bounds.x + camera.x + 2056 * camera.scale, y = bounds.y + camera.y + 2056 * camera.scale;
    if (info.project.name === 'desktop-chromium') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y);
    await expect(studio(page)).toHaveAttribute('data-selectedcell', '32896');
    await expect(page.getByRole('region', { name: '地块 #32896', exact: true })).toBeVisible();
    await labelLayout(page); await panel(page, '地图'); await labelLayout(page);
    await page.screenshot({ path: info.outputPath(`atlas-lod-${level}.png`), fullPage: true });
    await button(page, '显示地块网格');
    await expect(page.getByRole('button', { name: '显示地块网格', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => ({ requested: (await metrics(page)).gridRequested, visible: (await metrics(page)).gridVisible })).toEqual({ requested: true, visible: level === 'near' });
    await expect(studio(page)).toHaveAttribute('data-selectedcell', '32896');
    if (level === 'near') await page.screenshot({ path: info.outputPath('atlas-lod-near-explicit-grid.png'), fullPage: true });
    await button(page, '显示地块网格');
    await expect(page.getByRole('button', { name: '显示地块网格', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await metrics(page)).gridVisible).toBe(false);
    await expect(studio(page)).toHaveAttribute('data-selectedcell', '32896');
    await labelLayout(page); expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
  }
  expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root); expect(errors).toEqual([]);
});

test('标签随真实高程编辑撤销恢复，大字与GPU恢复不留下重叠或旧节点', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, '大字与标签恢复'); await locate(page); await previewHeight(page, 650); await confirm(page, 1); await setLod(page, 'near');
  // Use the stable real entity attribute directly; hidden reusable pool nodes
  // must not count as another visible label for that entity.
  const currentLabel = () => page.locator('[data-testid="atlas-map-label"][data-cell-id="32896"]').filter({ visible: true });
  await expect(currentLabel()).toHaveAttribute('data-elevation-meters', '650');
  const initialFont = (await labelLayout(page)).labels.find(row => row.id === 32896)!.fontSize;
  await panel(page, '编辑'); await previewHeight(page, 950, '1'); await confirm(page, 2); await panel(page, '地图');
  await expect(currentLabel()).toHaveAttribute('data-elevation-meters', '950');
  await button(page, '撤销大世界编辑'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-revision', '3');
  await expect(currentLabel()).toHaveAttribute('data-elevation-meters', '650');
  const original = await audit(page), root = await rootBytes(page, id);
  await panel(page, '草稿'); await page.getByLabel('较大文字', { exact: true }).check();
  await page.getByLabel('减少透明效果', { exact: true }).check(); await page.getByLabel('界面外观', { exact: true }).selectOption('dark');
  await panel(page, '地图');
  await expect.poll(async () => currentLabel().evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(initialFont * 1.25);
  await labelLayout(page); expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
  await page.reload(); await ready(page); expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
  await locate(page); await setLod(page, 'near'); await expect(currentLabel()).toHaveAttribute('data-elevation-meters', '650');
  const restored = await labelLayout(page); expect(restored.labels.find(row => row.id === 32896)!.fontSize).toBeGreaterThan(initialFont * 1.25);
  await info.attach('lod-large-text-restored-layout', { body: JSON.stringify(restored, null, 2), contentType: 'application/json' });
  await installGpuHarness(page); await loseGpu(page, 1);
  await expect(page.getByTestId('atlas-map-label').filter({ visible: true })).toHaveCount(0);
  await restoreGpu(page, 1); await ready(page); await expect(currentLabel()).toHaveAttribute('data-elevation-meters', '650'); await labelLayout(page);
  await page.screenshot({ path: info.outputPath('atlas-lod-large-dark-restored.png'), fullPage: true });
  expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
  await button(page, '返回原世界工坊'); await expect(page.getByTestId('world-studio')).toBeVisible();
  await expect(page.getByTestId('atlas-label-layer')).toHaveCount(0);
  const disposed = await page.evaluate(() => window.__atlasGpuHarness!.last!); expect(disposed.destroyed).toBe(true);
  expect(disposed.labels.visibleNodes).toBe(0); expect(disposed.labels.probeNodes).toBe(0); expect(disposed.labels.measurementCacheEntries).toBe(0);
  expect(await rootBytes(page, id)).toEqual(root); expect(errors).toEqual([]);
});

test('真实画布的指针锚点、缩放后拾取及窗口变更保持世界数据', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, '相机与坐标验收'), original = await audit(page), root = await rootBytes(page, id);
  await locate(page); await panel(page, '地图');
  const bounds = (await canvas(page).boundingBox())!;
  if (info.project.name === 'desktop-chromium') { expect(bounds.width).toBeGreaterThanOrEqual(1280); expect(bounds.height).toBeGreaterThanOrEqual(800); }
  // Native wheel/touch transport quantizes fractional CSS coordinates. Feed it
  // integer client coordinates and compare against that actual pointer anchor.
  const x = Math.round(bounds.x + bounds.width * .42) - bounds.x, y = Math.round(bounds.y + bounds.height * .35) - bounds.y;
  if (info.project.name === 'desktop-chromium') await page.mouse.click(bounds.x + x, bounds.y + y);
  else await page.touchscreen.tap(bounds.x + x, bounds.y + y);
  const selected = await studio(page).getAttribute('data-selectedcell'); expect(selected).not.toBe(''); await panel(page, '地图');
  const before = await metrics(page), anchor = worldAt(before, x, y);
  if (info.project.name === 'desktop-chromium') {
    await page.mouse.move(bounds.x + x, bounds.y + y); await page.mouse.wheel(0, -340);
  } else {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: bounds.x + x - 24, y: bounds.y + y }, { id: 2, x: bounds.x + x + 24, y: bounds.y + y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: bounds.x + x - 55, y: bounds.y + y }, { id: 2, x: bounds.x + x + 55, y: bounds.y + y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  }
  await expect.poll(async () => (await metrics(page)).camera.scale).toBeGreaterThan(before.camera.scale);
  const zoomed = await metrics(page); samePoint(worldAt(zoomed, x, y), anchor); withinBudget(zoomed);
  if (info.project.name === 'desktop-chromium') await page.mouse.click(bounds.x + x, bounds.y + y);
  else await page.touchscreen.tap(bounds.x + x, bounds.y + y);
  await expect(studio(page)).toHaveAttribute('data-selectedcell', selected!); await panel(page, '地图');
  const previous = await metrics(page), center = worldAt(previous, previous.viewport.width / 2, previous.viewport.height / 2);
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await expect.poll(async () => (await metrics(page)).viewport.width).not.toBe(previous.viewport.width);
  const resized = await metrics(page); samePoint(worldAt(resized, resized.viewport.width / 2, resized.viewport.height / 2), center); withinBudget(resized);
  expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
  await page.screenshot({ path: info.outputPath('atlas-camera-resized.png'), fullPage: true }); expect(errors).toEqual([]);
});

test('双指转单指与真实触控取消不会误选，下一次点选仍然有效', async ({ page }, info) => {
  test.setTimeout(120000);
  const id = await create(page, '触控生命周期验收'), root = await rootBytes(page, id), original = await audit(page);
  await locate(page); await panel(page, '地图'); const selected = await studio(page).getAttribute('data-selectedcell');
  const bounds = (await canvas(page).boundingBox())!, x = bounds.x + bounds.width * .5, y = bounds.y + bounds.height * .3;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 20, y }, { id: 2, x: x + 20, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 45, y }, { id: 2, x: x + 45, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 1, x: x - 45, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(studio(page)).toHaveAttribute('data-selectedcell', selected!);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: x + 40, y: y + 15 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(studio(page)).toHaveAttribute('data-selectedcell', selected!);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 4, x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(studio(page)).not.toHaveAttribute('data-selectedcell', selected!);
  } finally { await cdp.detach(); }
  expect(await rootBytes(page, id)).toEqual(root); expect(await audit(page)).toEqual(original); withinBudget(await metrics(page));
  await page.screenshot({ path: info.outputPath('atlas-touch-cancel.png'), fullPage: true });
});

test('不可见地形提交延迟绘制，返回视口后按新数据重建', async ({ page }, info) => {
  test.setTimeout(150000);
  await create(page, '离屏失效验收'); await locate(page); await panel(page, '地图'); await button(page, '全图');
  for (let i = 0; i < 6; i++) await button(page, '放大大世界地图');
  await panel(page, '编辑'); await previewHeight(page, 650);
  // Move only the camera using its real keyboard controls, leaving the pending edit intact.
  await canvas(page).focus();
  for (let i = 0; i < 70; i++) await page.keyboard.press('ArrowRight');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await metrics(page); await confirm(page, 1);
  expect(Number(await studio(page).getAttribute('data-atlas-repainted-blocks'))).toBe(0);
  const offscreen = await metrics(page); withinBudget(offscreen); expect(offscreen.cache.created).toBe(before.cache.created);
  const committed = await audit(page); await locate(page); await panel(page, '地图');
  await nextDraw(page, offscreen.completedFrameSequence);
  const returned = await metrics(page); withinBudget(returned); expect(returned.cache.created).toBeGreaterThan(offscreen.cache.created);
  expect(await audit(page)).toEqual(committed);
  await panel(page, '编辑'); await expect(page.getByTestId('atlas-selected-height')).toHaveText('650 米');
  await page.screenshot({ path: info.outputPath('atlas-rebuilt-visible-edit.png'), fullPage: true });
});

async function installGpuHarness(page: Page) {
  await canvas(page).evaluate(element => {
    const surface = element as HTMLCanvasElement;
    const gl = surface.getContext('webgl2') ?? surface.getContext('webgl');
    if (!gl) throw new Error('No real WebGL context; GPU recovery has not been verified.');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context unavailable; do not replace it with synthetic DOM events.');
    const state = { gl, extension, lost: 0, restored: 0, events: 0, last: undefined as Metrics | undefined };
    surface.addEventListener('webglcontextlost', () => { state.lost++; });
    surface.addEventListener('webglcontextrestored', () => { state.restored++; });
    surface.addEventListener('atlas-render-metrics', event => { state.last = (event as CustomEvent<Metrics>).detail; state.events++; });
    window.__atlasGpuHarness = state;
  });
}
async function loseGpu(page: Page, lossCount: number) {
  await page.evaluate(() => window.__atlasGpuHarness!.extension.loseContext());
  await expect.poll(() => page.evaluate(() => ({ lost: window.__atlasGpuHarness!.lost, isLost: window.__atlasGpuHarness!.gl.isContextLost() }))).toEqual({ lost: lossCount, isLost: true });
  await expect.poll(async () => (await metrics(page)).gpu.state).toBe('lost');
}
async function restoreGpu(page: Page, restorationCount: number) {
  await page.evaluate(() => window.__atlasGpuHarness!.extension.restoreContext());
  await expect.poll(() => page.evaluate(() => ({ restored: window.__atlasGpuHarness!.restored, isLost: window.__atlasGpuHarness!.gl.isContextLost() })), { timeout: 30000 }).toEqual({ restored: restorationCount, isLost: false });
  await expect.poll(async () => (await metrics(page)).gpu.state, { timeout: 30000 }).toBe('ready');
}

async function readActualFramebuffer(page: Page, baseline: boolean) {
  const sequence = (await metrics(page)).completedFrameSequence;
  await canvas(page).evaluate((element, { baseline, sequence }) => {
    const state = window.__atlasPixelHarness ??= {};
    state.result = undefined; state.error = undefined;
    const surface = element as HTMLCanvasElement, gl = window.__atlasGpuHarness!.gl;
    const listener = (event: Event) => {
      const value = (event as CustomEvent<Metrics>).detail;
      if (value.gpu.state !== 'ready' || value.destroyed || value.fatal || value.frameSequence <= sequence
        || value.frameSequence <= value.completedFrameSequence) return;
      element.removeEventListener('atlas-render-metrics', listener);
      try {
        // Copy synchronously after the actual render, before the browser may discard
        // the default framebuffer. No bindings, clear, packing or scene mutations.
        const require = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
        require(!gl.isContextLost(), 'Framebuffer context is lost');
        require(gl.getError() === gl.NO_ERROR, 'GL error present before readPixels');
        require(gl.getParameter(gl.FRAMEBUFFER_BINDING) === null, 'Draw target is not the default framebuffer');
        if (gl instanceof WebGL2RenderingContext) {
          require(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === null, 'Read target is not the default framebuffer');
          require(gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === null, 'Unexpected pixel pack buffer');
        }
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        require(width > 0 && height > 0 && width === surface.width && height === surface.height, 'Invalid drawing buffer dimensions');
        const bytes = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        require(gl.getError() === gl.NO_ERROR, 'readPixels failed');
        const colors = { land: 0, ocean: 0, background: 0 };
        let nonOpaquePixels = 0, changedPixels = 0, maxChannelDifference = 0;
        if (!baseline) require(Boolean(state.baseline && state.baseline.width === width && state.baseline.height === height), 'Restored framebuffer dimensions changed');
        for (let offset = 0; offset < bytes.length; offset += 4) {
          if (bytes[offset] === 139 && bytes[offset + 1] === 163 && bytes[offset + 2] === 112) colors.land++;
          if (bytes[offset] === 76 && bytes[offset + 1] === 151 && bytes[offset + 2] === 168) colors.ocean++;
          if (bytes[offset] === 16 && bytes[offset + 1] === 40 && bytes[offset + 2] === 63) colors.background++;
          if (bytes[offset + 3] !== 255) nonOpaquePixels++;
          if (!baseline) {
            let changed = false;
            for (let channel = 0; channel < 4; channel++) {
              const delta = Math.abs(bytes[offset + channel] - state.baseline!.bytes[offset + channel]);
              if (delta) changed = true; maxChannelDifference = Math.max(maxChannelDifference, delta);
            }
            if (changed) changedPixels++;
          }
        }
        require(Object.values(colors).every(count => count >= 100), `Expected real land, ocean and outside-world background: ${JSON.stringify(colors)}`);
        require(nonOpaquePixels === 0, `Unexpected transparent pixels: ${nonOpaquePixels}`);
        if (baseline) state.baseline = { bytes, width, height };
        // Only hashing awaits; the complete pixel copy and comparison above are synchronous.
        void crypto.subtle.digest('SHA-256', bytes).then(hash => {
          state.result = { width, height, frameSequence: value.frameSequence,
            sha256: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
            colors, nonOpaquePixels, difference: baseline ? null : { changedPixels, maxChannelDifference } };
        }).catch(error => { state.error = String(error); });
      } catch (error) { state.error = String(error); }
    };
    element.addEventListener('atlas-render-metrics', listener);
  }, { baseline, sequence });
  await button(page, '全图');
  await expect.poll(() => page.evaluate(() => {
    const state = window.__atlasPixelHarness!;
    if (state.error) throw new Error(state.error);
    return Boolean(state.result);
  })).toBe(true);
  return page.evaluate(() => window.__atlasPixelHarness!.result!);
}

test('[atlas-gpu] 两次真实WebGL丢失恢复保持地图像素、相机、选择与主备，卸载释放受管理纹理', async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, '显卡恢复验收'); await locate(page); await previewHeight(page, 650); await confirm(page, 1);
  await panel(page, '地图'); await button(page, '全图');
  await installGpuHarness(page);
  const initialFramebuffer = await readActualFramebuffer(page, true);
  await info.attach('context-baseline-full-framebuffer', { body: JSON.stringify(initialFramebuffer, null, 2), contentType: 'application/json' });
  const initial = await metrics(page), original = await audit(page), root = await rootBytes(page, id);
  const initialLabels = (await labelLayout(page)).labels;
  const picture = await canvas(page).screenshot({ path: info.outputPath('atlas-before-real-context-loss.png') });
  for (let iteration = 1; iteration <= 2; iteration++) {
    const before = await metrics(page); await loseGpu(page, iteration);
    await expect(page.getByRole('button', { name: '撤销大世界编辑', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '放大大世界地图', exact: true })).toBeDisabled();
    expect(await rootBytes(page, id)).toEqual(root);
    await restoreGpu(page, iteration); await ready(page);
    const recovered = await metrics(page); withinBudget(recovered);
    expect(recovered.gpu.epoch).toBeGreaterThan(before.gpu.epoch);
    expect(recovered.cache.created).toBeGreaterThan(before.cache.created);
    expect(recovered.camera).toEqual(initial.camera); expect(recovered.selected).toBe(initial.selected);
    expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
    await expect(page.getByRole('button', { name: '撤销大世界编辑', exact: true })).toBeEnabled();
    const framebuffer = await readActualFramebuffer(page, false);
    await info.attach(`context-restoration-${iteration}-full-framebuffer`, { body: JSON.stringify(framebuffer, null, 2), contentType: 'application/json' });
    // Compare every physical GPU pixel, including pixels behind DOM panels.
    // Recreated targets may round an interpolated 8-bit channel by one level.
    expect(framebuffer.difference!.maxChannelDifference, 'Every restored framebuffer channel must agree within one quantization level.').toBeLessThanOrEqual(1);
    expect((await metrics(page)).camera).toEqual(initial.camera);
    expect((await labelLayout(page)).labels).toEqual(initialLabels);
    const restoredPicture = await canvas(page).screenshot({ path: info.outputPath(`atlas-restored-context-${iteration}.png`) });
    const difference = comparePixels(picture, restoredPicture);
    await info.attach(`context-restoration-${iteration}-pixel-difference`, { body: JSON.stringify(difference, null, 2), contentType: 'application/json' });
    // Preserve the complete composed PNG comparison as diagnostics. DOM rounded
    // panel edges are browser compositing, separately checked by actual layout;
    // the authoritative map-pixel assertion uses the entire raw framebuffer.
  }
  await button(page, '返回原世界工坊'); await expect(page.getByTestId('world-studio')).toBeVisible();
  const disposed = await page.evaluate(() => window.__atlasGpuHarness!.last!);
  expect(disposed.destroyed).toBe(true); expect(disposed.cache.pixels).toBe(0); expect(disposed.cache.entries).toBe(0);
  expect(disposed.cache.created).toBe(disposed.cache.destroyed); expect(await rootBytes(page, id)).toEqual(root);
  withinBudget(disposed); expect(disposed.geometryCache.quads).toBe(0); expect(disposed.geometryCache.entries).toBe(0);
  // This is the explicit cache lifecycle only, not a claim about all process or GPU memory.
  expect(errors).toEqual([]);
  await page.evaluate(() => { delete window.__atlasPixelHarness; });
});

test('已提交新草稿接收画面途中真实丢失GPU，恢复后只开放新草稿', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const oldId = await create(page, 'GPU恢复旧草稿', '128'), oldRoot = await rootBytes(page, oldId);
  await installGpuHarness(page);
  // Trigger the real extension only after a render event during the actual new-draft paint batches.
  // This observes production progress; it neither pauses nor fabricates acceptance.
  await canvas(page).evaluate(element => {
    const onMetrics = () => {
      const state = window.__atlasGpuHarness!;
      if (state.pendingLossTriggered || document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state') !== 'busy'
        || !document.querySelector('[aria-label="草稿操作反馈"]')?.textContent?.includes('绘制已核验地理块')) return;
      state.pendingLossTriggered = true; element.removeEventListener('atlas-render-metrics', onMetrics); state.extension.loseContext();
    };
    element.addEventListener('atlas-render-metrics', onMetrics);
  });
  await panel(page, '草稿'); await page.getByLabel('大世界草稿名称', { exact: true }).fill('GPU恢复新草稿');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('512'); await button(page, '新建空白海洋草稿');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认新建草稿', exact: true }).click();
  await expect.poll(() => page.evaluate(() => ({ triggered: window.__atlasGpuHarness!.pendingLossTriggered, lost: window.__atlasGpuHarness!.lost, isLost: window.__atlasGpuHarness!.gl.isContextLost() })), { timeout: 90000 })
    .toEqual({ triggered: true, lost: 1, isLost: true });
  const newId = new URL(page.url()).searchParams.get('atlas')!; expect(newId).not.toBe(oldId);
  const committedNewRoot = await rootBytes(page, newId); expect(await rootBytes(page, oldId)).toEqual(oldRoot);
  await expect(page.getByRole('button', { name: '撤销大世界编辑', exact: true })).toBeDisabled();
  await restoreGpu(page, 1); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-id', newId);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0'); withinBudget(await metrics(page));
  const restoredWorld = await audit(page); expect(restoredWorld.draftId).toBe(newId);
  expect(await rootBytes(page, newId)).toEqual(committedNewRoot); expect(await rootBytes(page, oldId)).toEqual(oldRoot);
  await locate(page, 261630); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  await page.screenshot({ path: info.outputPath('atlas-pending-accept-context-restored.png'), fullPage: true });
  await page.reload(); await ready(page); expect(await audit(page)).toEqual(restoredWorld);
  expect(await rootBytes(page, newId)).toEqual(committedNewRoot); expect(await rootBytes(page, oldId)).toEqual(oldRoot); expect(errors).toEqual([]);
});

async function sampleWorldPixelsOnZoom(page: Page, probes: WorldColorProbe[]) {
  const sequence = (await metrics(page)).completedFrameSequence;
  await canvas(page).evaluate((element, { sequence, probes }) => {
    const state: NonNullable<Window['__atlasColorReadback']> = {}; window.__atlasColorReadback = state;
    const surface = element as HTMLCanvasElement;
    const listener = (event: Event) => {
      const value = (event as CustomEvent<Metrics>).detail;
      if (value.gpu.state !== 'ready' || value.destroyed || value.fatal || value.frameSequence <= sequence || value.frameSequence <= value.completedFrameSequence) return;
      element.removeEventListener('atlas-render-metrics', listener);
      try {
        const gl = surface.getContext('webgl2') ?? surface.getContext('webgl');
        if (!gl || gl.isContextLost() || gl.getError() !== gl.NO_ERROR || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw new Error('No healthy default framebuffer for geographic probes');
        if (gl instanceof WebGL2RenderingContext && (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null || gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null)) throw new Error('Unexpected read target or pack buffer');
        const samples: WorldColorReadback['samples'] = [], width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        if (width !== surface.width || height !== surface.height) throw new Error('Probe buffer dimensions differ from actual surface');
        for (const probe of probes) {
          const x = Math.round((value.camera.x + probe.worldX * value.camera.scale) * width / value.viewport.width);
          const topY = Math.round((value.camera.y + probe.worldY * value.camera.scale) * height / value.viewport.height);
          for (let delta = -3; delta <= 3; delta++) {
            const px = x + (probe.axis === 'x' ? delta : 0), py = height - 1 - (topY + (probe.axis === 'y' ? delta : 0));
            if (px < 0 || px >= width || py < 0 || py >= height) throw new Error(`Geographic probe outside viewport: ${px},${py}`);
            const rgba = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            if (gl.getError() !== gl.NO_ERROR) throw new Error('Geographic pixel read failed');
            samples.push({ worldX: probe.worldX, worldY: probe.worldY, px, py, rgba: [...rgba], expected: [...probe.rgb, 255] });
          }
        }
        state.result = { frameSequence: value.frameSequence, camera: value.camera, samples };
      } catch (error) { state.error = String(error); }
    };
    element.addEventListener('atlas-render-metrics', listener);
  }, { sequence, probes });
  await button(page, '放大大世界地图');
  await expect.poll(() => page.evaluate(() => {
    if (window.__atlasColorReadback?.error) throw new Error(window.__atlasColorReadback.error);
    return Boolean(window.__atlasColorReadback?.result);
  })).toBe(true);
  const result = await page.evaluate(() => window.__atlasColorReadback!.result!);
  for (const row of result.samples) for (let channel = 0; channel < 4; channel++) expect(Math.abs(row.rgba[channel] - row.expected[channel]), JSON.stringify(row)).toBeLessThanOrEqual(1);
  return result;
}

async function terrainStrip(page: Page) {
  // Re-establish the same camera through public controls for each revision.
  // Keep the actual selection four cells away; no overlay is hidden for sampling.
  await locate(page, 32900); await setLod(page, 'near');
  for (let step = 0; step < 12 && (await metrics(page)).cellPixels < 36; step++) {
    const sequence = (await metrics(page)).completedFrameSequence;
    await button(page, '放大大世界地图'); await nextDraw(page, sequence);
  }
  const before = await metrics(page); expect(before.cellPixels).toBeGreaterThanOrEqual(36); expect(before.gridVisible).toBe(false);
  await canvas(page).evaluate((element, sequence) => {
    const state: NonNullable<Window['__atlasTerrainStrip']> = {}; window.__atlasTerrainStrip = state;
    const surface = element as HTMLCanvasElement;
    const listener = (event: Event) => {
      const value = (event as CustomEvent<Metrics>).detail;
      if (value.gpu.state !== 'ready' || value.destroyed || value.fatal || value.frameSequence <= sequence || value.frameSequence <= value.completedFrameSequence) return;
      element.removeEventListener('atlas-render-metrics', listener);
      try {
        const gl = surface.getContext('webgl2') ?? surface.getContext('webgl');
        if (!gl || gl.isContextLost() || gl.getError() !== gl.NO_ERROR || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw new Error('No healthy default framebuffer for continuous terrain');
        if (gl instanceof WebGL2RenderingContext && (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null || gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null)) throw new Error('Unexpected terrain read target or pack buffer');
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        if (width !== surface.width || height !== surface.height) throw new Error('Terrain buffer dimensions differ from actual surface');
        const scaleX = width / value.viewport.width, scaleY = height / value.viewport.height;
        const start = Math.ceil((value.camera.x + 2034 * value.camera.scale) * scaleX);
        const end = Math.floor((value.camera.x + 2078 * value.camera.scale) * scaleX);
        const topY = Math.floor((value.camera.y + 2056 * value.camera.scale) * scaleY), py = height - 1 - topY;
        if (start < 0 || end >= width || end <= start || py < 0 || py >= height) throw new Error('Continuous terrain strip is outside the actual viewport');
        const bytes = new Uint8Array((end - start + 1) * 4);
        gl.readPixels(start, py, end - start + 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Continuous terrain readPixels failed');
        const samples: TerrainStripReadback['samples'] = [];
        for (let px = start; px <= end; px++) {
          const offset = (px - start) * 4;
          samples.push({ worldX: ((px + .5) / scaleX - value.camera.x) / value.camera.scale, px, py, rgba: [...bytes.subarray(offset, offset + 4)] });
        }
        state.result = { frameSequence: value.frameSequence, camera: value.camera,
          worldY: ((topY + .5) / scaleY - value.camera.y) / value.camera.scale, samples };
      } catch (error) { state.error = String(error); }
    };
    element.addEventListener('atlas-render-metrics', listener);
  }, before.completedFrameSequence);
  await button(page, '放大大世界地图');
  await expect.poll(() => page.evaluate(() => {
    if (window.__atlasTerrainStrip?.error) throw new Error(window.__atlasTerrainStrip.error);
    return Boolean(window.__atlasTerrainStrip?.result);
  })).toBe(true);
  const result = await page.evaluate(() => window.__atlasTerrainStrip!.result!);
  expect(Math.abs(result.worldY - 2056)).toBeLessThan(.5);
  expect(result.samples.length).toBeGreaterThan(80);
  for (const sample of result.samples) expect(sample.rgba[3], JSON.stringify(sample)).toBe(255);
  withinBudget(await metrics(page)); return result;
}

test('[atlas-continuous] 单格真实高峰具有格内连续颜色，共享边无跳色，撤销与刷新恢复相同地表', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, '连续地表真实编辑'); await locate(page); await previewHeight(page, 650); await confirm(page, 1);
  const flat = await terrainStrip(page), flatAudit = await audit(page), flatRoot = await rootBytes(page, id);
  for (const sample of flat.samples) for (let channel = 0; channel < 4; channel++) {
    expect(Math.abs(sample.rgba[channel] - [139, 163, 112, 255][channel]), JSON.stringify(sample)).toBeLessThanOrEqual(1);
  }
  await locate(page); await previewHeight(page, 3200, '1');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toHaveAttribute('data-atlas-preview-cells', '1');
  await confirm(page, 2); await expect(page.getByTestId('atlas-selected-height')).toHaveText('3200 米');
  const peak = await terrainStrip(page), peakAudit = await audit(page), peakRoot = await rootBytes(page, id);
  expect(peak.camera).toEqual(flat.camera); expect(peakAudit.manifestDigest).not.toBe(flatAudit.manifestDigest); expect(peakRoot).not.toEqual(flatRoot);
  // These are physical pixels strictly inside ONE unselected authoritative cell.
  // Per-cell colour changes and selection ink cannot satisfy this assertion.
  const interior = peak.samples.filter(sample => sample.worldX > 2049 && sample.worldX < 2063);
  expect(interior.length).toBeGreaterThan(24);
  expect(new Set(interior.map(sample => sample.rgba.slice(0, 3).join(','))).size).toBeGreaterThanOrEqual(8);
  const channelRanges = [0, 1, 2].map(channel => Math.max(...interior.map(sample => sample.rgba[channel])) - Math.min(...interior.map(sample => sample.rgba[channel])));
  expect(Math.max(...channelRanges), 'A real height peak must visibly vary inside its own cell.').toBeGreaterThanOrEqual(24);
  const edgeChecks = [];
  // x=2048 is also a render-core boundary. A shared endpoint may change slope,
  // but its one-pixel step must stay within the adjacent local gradients plus
  // the two 8-bit endpoint rounding levels; no whole-image tolerance is used.
  for (const edge of [2048, 2064]) {
    const at = peak.samples.findIndex(sample => sample.worldX >= edge);
    expect(at).toBeGreaterThan(4); expect(at + 4).toBeLessThan(peak.samples.length);
    for (let channel = 0; channel < 3; channel++) {
      const difference = (index: number) => Math.abs(peak.samples[index].rgba[channel] - peak.samples[index - 1].rgba[channel]);
      const adjacent = [at - 3, at - 2, at - 1, at + 1, at + 2, at + 3].map(difference), jump = difference(at), maximumAdjacent = Math.max(...adjacent);
      edgeChecks.push({ edge, channel, jump, maximumAdjacent });
      expect(jump, JSON.stringify(edgeChecks.at(-1))).toBeLessThanOrEqual(maximumAdjacent + 2);
    }
  }
  await page.screenshot({ path: info.outputPath('atlas-continuous-single-peak.png'), fullPage: true });
  await button(page, '撤销大世界编辑'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-revision', '3');
  await locate(page); await expect(page.getByTestId('atlas-selected-height')).toHaveText('650 米');
  const undone = await terrainStrip(page), restoredAudit = await audit(page), restoredRoot = await rootBytes(page, id);
  await page.reload(); await ready(page); expect(await audit(page)).toEqual(restoredAudit); expect(await rootBytes(page, id)).toEqual(restoredRoot);
  const refreshed = await terrainStrip(page);
  for (const restored of [undone, refreshed]) {
    expect(restored.camera).toEqual(flat.camera); expect(restored.samples.length).toBe(flat.samples.length);
    for (const [index, sample] of restored.samples.entries()) {
      expect({ px: sample.px, py: sample.py, worldX: sample.worldX }).toEqual({ px: flat.samples[index].px, py: flat.samples[index].py, worldX: flat.samples[index].worldX });
      for (let channel = 0; channel < 4; channel++) expect(Math.abs(sample.rgba[channel] - flat.samples[index].rgba[channel]), JSON.stringify({ index, sample, baseline: flat.samples[index] })).toBeLessThanOrEqual(1);
    }
  }
  await info.attach('continuous-terrain-actual-framebuffer.json', { body: JSON.stringify({ flat, peak, undone, refreshed, edgeChecks, channelRanges, flatAudit, peakAudit, restoredAudit }, null, 2), contentType: 'application/json' });
  expect(await rootBytes(page, id)).toEqual(restoredRoot); expect(errors).toEqual([]);
});

test('[atlas-seams] 远景缓存核心之间没有透明接缝，邻近海陆使用真实颜色', async ({ page }, info) => {
  test.setTimeout(120000);
  const id = await create(page, '缓存连续色验收');
  async function inspectStrips(name: string, samples: { worldX: number; worldY: number; axis: 'x' | 'y'; rgb: number[] }[]) {
    const view = await metrics(page), bounds = (await canvas(page).boundingBox())!;
    const screenshot = await canvas(page).screenshot({ path: info.outputPath(`${name}.png`) }), png = PNG.sync.read(screenshot);
    const observations = [];
    for (const sample of samples) {
      const x = Math.round((view.camera.x + sample.worldX * view.camera.scale) * png.width / bounds.width);
      const y = Math.round((view.camera.y + sample.worldY * view.camera.scale) * png.height / bounds.height);
      for (let delta = -3; delta <= 3; delta++) {
        const px = x + (sample.axis === 'x' ? delta : 0), py = y + (sample.axis === 'y' ? delta : 0);
        expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThan(png.width);
        expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThan(png.height);
        const offset = (py * png.width + px) * 4, actual = [...png.data.subarray(offset, offset + 4)];
        observations.push({ worldX: sample.worldX, worldY: sample.worldY, px, py, actual, expected: [...sample.rgb, 255] });
      }
    }
    await info.attach(`${name}-pixels`, { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    // Uniform interiors must remain uniform across cache boundaries. The same
    // one-level quantization allowance cannot conceal the observed 3–6 level seam.
    for (const observation of observations) for (let channel = 0; channel < 4; channel++) {
      expect(Math.abs(observation.actual[channel] - observation.expected[channel]), JSON.stringify(observation)).toBeLessThanOrEqual(1);
    }
  }
  const ocean = [76, 151, 168], land = [139, 163, 112];
  await inspectStrips('atlas-uniform-ocean-core-seams', Array.from({ length: 7 }, (_, index) => ({ worldX: (index + 1) * 512, worldY: 1792, axis: 'x' as const, rgb: ocean })));
  await locate(page); await previewHeight(page, 650); await confirm(page, 1); await panel(page, '地图'); await button(page, '全图');
  // Move the legitimate selected-entity label away from the fixed seam probes.
  // No image region is masked, recoloured or removed from the pixel checks.
  const positioned = await metrics(page), bounds = (await canvas(page).boundingBox())!;
  await page.mouse.click(bounds.x + positioned.camera.x + 3800 * positioned.camera.scale, bounds.y + positioned.camera.y + 3400 * positioned.camera.scale);
  await panel(page, '地图'); await button(page, '全图');
  const original = await audit(page), root = await rootBytes(page, id);
  await inspectStrips('atlas-land-and-ocean-core-seams', [
    { worldX: 2048, worldY: 1984, axis: 'x', rgb: land },
    { worldX: 1984, worldY: 2048, axis: 'y', rgb: land },
    { worldX: 2048, worldY: 1744, axis: 'x', rgb: ocean },
    { worldX: 2048, worldY: 1840, axis: 'x', rgb: land },
  ]);
  // Density changes reuse only verified geographic shapes. Inspect the actual
  // GPU pixels below labels as well, using real zoom controls. Grid is off by
  // default at both levels; retain the existing interior probes and also cross
  // the near-view core edges, where a raster seam must not become grid ink.
  for (const level of ['medium', 'near'] as const) {
    await setLod(page, level);
    const beforeFraming = await metrics(page);
    // Keep every original geographic probe in the narrow viewport after the
    // next real zoom. Cell 32382 centers on (2024,2024); its selected quad at
    // 2016..2032 does not intersect any sampled strip. This only reframes the
    // same shared edges through the public UI; no pixel or world data is moved.
    expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
    await locate(page, 32382); await panel(page, '地图');
    await expect(studio(page)).toHaveAttribute('data-selectedcell', '32382');
    const framed = await metrics(page);
    expect(framed.lod).toBe(level); expect(framed.gridVisible).toBe(false);
    expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root);
    const probes: WorldColorProbe[] = level === 'medium' ? [
      { worldX: 2048, worldY: 1984, axis: 'x', rgb: land },
      { worldX: 1984, worldY: 2048, axis: 'y', rgb: land },
    ] : [
      { worldX: 2048, worldY: 1984, axis: 'x', rgb: land },
      { worldX: 1984, worldY: 2048, axis: 'y', rgb: land },
      { worldX: 2040, worldY: 1992, axis: 'x', rgb: land },
      { worldX: 2056, worldY: 1992, axis: 'x', rgb: land },
      { worldX: 1992, worldY: 2040, axis: 'y', rgb: land },
      { worldX: 1992, worldY: 2056, axis: 'y', rgb: land },
    ];
    const readback = await sampleWorldPixelsOnZoom(page, probes);
    await expect(studio(page)).toHaveAttribute('data-selectedcell', '32382');
    await info.attach(`atlas-${level}-geographic-gpu-probes`, { body: JSON.stringify({ ...readback,
      framing: { selected: 32382, beforeCamera: beforeFraming.camera, beforeViewport: beforeFraming.viewport, camera: framed.camera, viewport: framed.viewport } }, null, 2), contentType: 'application/json' });
  }
  expect(await audit(page)).toEqual(original); expect(await rootBytes(page, id)).toEqual(root); withinBudget(await metrics(page));
});
