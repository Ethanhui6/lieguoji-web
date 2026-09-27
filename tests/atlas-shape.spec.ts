import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { audit, databaseDigest, geography, metrics, saved, type Geography, type SavedManifest, type SavedSnapshot } from './helpers/atlas-shape-readonly';

// Only native mouse / CDP touch input performs drawing. The test observes DOM,
// renderer diagnostics and durable LGAB bytes; it never calls the generator or
// changes application state, storage, private candidates or React internals.
const studio = (page: Page) => page.getByTestId('atlas-studio');
const candidate = (page: Page) => page.getByRole('region', { name: '大陆生成预览' });
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
type XY = { x: number; y: number };
type InputRecord = { type: string; trusted: boolean; pointerType: string; x: number; y: number; buttons: number };
const outline: XY[] = [[900, 900], [2200, 900], [2200, 1300], [1400, 1300], [1400, 1700], [2850, 1700], [2850, 1860], [1400, 1860], [1400, 2600], [900, 2600]].map(([x, y]) => ({ x, y }));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const observed = window as unknown as { __shapeInputTrace: InputRecord[] }; observed.__shapeInputTrace = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, event => {
      if (!(event.target instanceof Element) || event.target.getAttribute('data-testid') !== 'atlas-canvas') return;
      const pointer = event as PointerEvent;
      if (pointer.type === 'pointermove' && !pointer.buttons) return;
      observed.__shapeInputTrace.push({ type: pointer.type, trusted: pointer.isTrusted, pointerType: pointer.pointerType, x: pointer.clientX, y: pointer.clientY, buttons: pointer.buttons });
    }, true);
  });
});
test.afterEach(async ({ page }, info) => {
  if (!page.isClosed()) {
    const trace = await inputTrace(page);
    if (trace?.length) await info.attach('shape-trusted-input.json', { contentType: 'application/json', body: JSON.stringify(trace, null, 2) });
  }
});
async function inputTrace(page: Page) { return page.evaluate(() => (window as unknown as { __shapeInputTrace: InputRecord[] }).__shapeInputTrace); }
function collectErrors(page: Page, errors: string[] = []) {
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); return errors;
}
async function create(page: Page, name: string) {
  await page.goto('/?atlas=new&atlas-format=2'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('PH06-shape-trusted-input');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256');
  await button(page, '新建空白海洋草稿'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', '2');
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function screenPoints(page: Page, world: XY[]) {
  const frame = await metrics(page), bounds = await page.getByTestId('atlas-canvas').boundingBox();
  if (!bounds) throw new Error('Actual drawing canvas has no bounds');
  const points = world.map(point => ({ x: bounds.x + frame.camera.x + point.x * frame.camera.scale, y: bounds.y + frame.camera.y + point.y * frame.camera.scale }));
  const exposed = await page.evaluate(points => points.map(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), points);
  expect(exposed.every(Boolean), 'Every trusted input point must reach the actual canvas, without a panel intercepting it').toBe(true);
  return { points, camera: frame.camera, bounds };
}
class Stroke {
  constructor(private page: Page, private cdp: CDPSession, private touch: boolean) {}
  async start(point: XY) {
    if (this.touch) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    else { await this.page.mouse.move(point.x, point.y); await this.page.mouse.down(); }
  }
  async move(point: XY) {
    if (this.touch) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    else await this.page.mouse.move(point.x, point.y);
  }
  async end() {
    if (this.touch) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await this.page.mouse.up();
  }
  async draw(points: XY[]) { await this.start(points[0]); for (const point of points.slice(1)) await this.move(point); await this.end(); }
}
async function startDrawing(page: Page) {
  await button(page, '画大陆'); await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'outline');
  await button(page, '全图');
}
async function drawCandidate(page: Page, stroke: Stroke) {
  await startDrawing(page); const projection = await screenPoints(page, [...outline, outline[0]]);
  await stroke.draw(projection.points);
  await expect(candidate(page)).toBeVisible({ timeout: 90000 }); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'browse');
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'generation-preview');
  return { projection, proof: await audit(page) };
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function reopen(page: Page, draftId: string, snapshot: SavedSnapshot, errors: string[]) {
  const other = await page.context().newPage(); collectErrors(other, errors);
  try {
    await other.goto(page.url()); await ready(other); await other.reload(); await ready(other);
    expect(await saved(other, draftId)).toEqual(snapshot);
    expect((await audit(other)).display).toMatchObject({ source: 'committed', revision: snapshot.root.revision, version: 2, manifestDigest: snapshot.root.currentManifest, verifiedBlocks: 256 });
    return await geography(other, snapshot.manifest);
  } finally { await other.close(); }
}
function inspectActualLand(data: Geography, spec: SavedManifest['spec']) {
  const seen = new Uint8Array(data.heights.length), componentSizes: number[] = [];
  let areaQ2 = 0, changedSea = 0, minHeight = Infinity, maxHeight = -Infinity;
  for (let id = 0; id < data.heights.length; id++) {
    const height = data.heights[id], x = id % spec.columns, y = Math.floor(id / spec.columns), a = y * (spec.columns + 1) + x;
    minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height); if (height < 0 && height > -100) changedSea++;
    if (height >= 0) {
      const vertices = [a, a + 1, a + spec.columns + 2, a + spec.columns + 1]; let cellArea = 0;
      for (let i = 0; i < 4; i++) { const p = vertices[i], q = vertices[(i + 1) % 4]; cellArea += data.xyQ[p * 2] * data.xyQ[q * 2 + 1] - data.xyQ[q * 2] * data.xyQ[p * 2 + 1]; }
      if (!(cellArea > 0) || !Number.isSafeInteger(cellArea)) throw new Error('Actual hand-drawn land has invalid shared geometry'); areaQ2 += cellArea;
      if (!seen[id]) {
        const queue = [id]; seen[id] = 1;
        for (let head = 0; head < queue.length; head++) {
          const cell = queue[head], col = cell % spec.columns;
          for (const next of [col > 0 ? cell - 1 : -1, col + 1 < spec.columns ? cell + 1 : -1, cell - spec.columns, cell + spec.columns]) if (next >= 0 && next < seen.length && !seen[next] && data.heights[next] >= 0) { seen[next] = 1; queue.push(next); }
        }
        componentSizes.push(queue.length);
      }
    }
  }
  return { areaQ2, changedSea, minHeight, maxHeight, componentSizes };
}
function assertCapturedPoints(points: { xQ: number; yQ: number }[], projection: Awaited<ReturnType<typeof screenPoints>>) {
  expect(points.length).toBeGreaterThanOrEqual(3); expect(points.length).toBeLessThanOrEqual(256);
  for (const point of points) {
    const x = projection.bounds.x + projection.camera.x + point.xQ / 256 * projection.camera.scale;
    const y = projection.bounds.y + projection.camera.y + point.yQ / 256 * projection.camera.scale;
    expect(projection.points.some(input => Math.hypot(x - input.x, y - input.y) <= 1.5), 'Saved control point must correspond to an actual native input sample').toBe(true);
  }
}

test('手绘大陆：真实闭合凹湾笔迹自动预览，取消无写，再画保存，刷新恢复和原会话撤销', async ({ page }, info) => {
  test.setTimeout(300000); const errors = collectErrors(page), id = await create(page, '一笔山海·可信输入验收');
  const cdp = await page.context().newCDPSession(page), stroke = new Stroke(page, cdp, info.project.name !== 'desktop-chromium');
  const blank = await saved(page, id), baselineDatabase = await databaseDigest(page), blankData = await geography(page, blank.manifest);
  const first = await drawCandidate(page, stroke);
  expect(first.proof).toMatchObject({ revision: 0, manifestDigest: blank.root.currentManifest, display: { source: 'generation-preview', revision: 1, verifiedBlocks: 256 } });
  expect(first.proof.display.manifestDigest).not.toBe(blank.root.currentManifest);
  expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  await shot(page, info, 'shape-candidate-panel.png'); await panel(page, '地图'); await button(page, '全图');
  await shot(page, info, 'shape-candidate-full-map.png');
  await panel(page, '创世'); await button(page, '取消生成'); await ready(page);
  expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', manifestDigest: blank.root.currentManifest });
  const second = await drawCandidate(page, stroke);
  expect(second.proof.display.manifestDigest).toBe(first.proof.display.manifestDigest);
  const trace = await inputTrace(page); expect(trace.length).toBeGreaterThan(20); expect(trace.every(event => event.trusted)).toBe(true);
  expect(trace.some(event => event.pointerType === (info.project.name === 'desktop-chromium' ? 'mouse' : 'touch'))).toBe(true);
  await info.attach('shape-native-drawing-input.json', { contentType: 'application/json', body: JSON.stringify(trace, null, 2) });
  await button(page, '确认生成并保存'); await ready(page);
  const committed = await saved(page, id), data = await geography(page, committed.manifest), shape = inspectActualLand(data, committed.manifest.spec);
  expect(committed.root).toMatchObject({ revision: 1, currentManifest: second.proof.display.manifestDigest, backupManifest: blank.root.currentManifest });
  const applied = committed.manifest.generation.lastApplied!;
  expect(applied).toMatchObject({ appliedRevision: 1, recipe: { generator: { id: 'shape-landmass', version: 1 }, parameters: { coastRoughnessWorld: 32, coastWavelengthWorld: 192, shelfWidthWorld: 128 } } });
  const points = applied.recipe.parameters.pointsQ; if (!Array.isArray(points)) throw new Error('Saved shape recipe lost actual input points'); assertCapturedPoints(points, second.projection);
  const buildResponse = await page.request.get('/build.json'); expect(buildResponse.ok()).toBe(true);
  const build = await buildResponse.json() as { shapeGenerator: { sha256: string } };
  expect(applied.recipe.generator.fingerprint).toBe(build.shapeGenerator.sha256); expect(build.shapeGenerator.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(committed.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:'))).toEqual(blank.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:')));
  expect(committed.manifest.constraints).toEqual(blank.manifest.constraints); expect(data.xyQ).toEqual(blankData.xyQ);
  expect(shape.componentSizes).toHaveLength(1); expect(shape.componentSizes[0]).toBeGreaterThan(1000); expect(shape.changedSea).toBeGreaterThan(100); expect(shape.maxHeight).toBeGreaterThan(100);
  const heightAt = (x: number, y: number) => data.heights[Math.floor(y / 16) * 256 + Math.floor(x / 16)];
  expect(heightAt(1800, 1500)).toBeLessThan(0); expect(heightAt(2750, 1780)).toBeGreaterThanOrEqual(0); expect(heightAt(1150, 2100)).toBeGreaterThanOrEqual(0); expect(heightAt(3600, 3300)).toBe(-100);
  expect(await reopen(page, id, committed, errors)).toEqual(data);
  await panel(page, '地图'); await button(page, '全图'); await shot(page, info, 'shape-saved-full-map.png');
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(Math.floor(2100 / 16) * 256 + Math.floor(1150 / 16))); await button(page, '定位'); await panel(page, '地图');
  for (let i = 0; i < 10 && (await metrics(page)).cellPixels < 18; i++) {
    const before = await metrics(page); await button(page, '放大大世界地图');
    await expect.poll(async () => (await metrics(page)).completedFrameSequence).toBeGreaterThan(before.completedFrameSequence);
  }
  expect((await metrics(page)).cellPixels).toBeGreaterThanOrEqual(18); await shot(page, info, 'shape-saved-near-terrain.png');
  await button(page, '撤销大世界编辑'); await ready(page);
  const undone = await saved(page, id); expect(undone.root.revision).toBe(2); expect(undone.manifest.blockRefs).toEqual(blank.manifest.blockRefs); expect(undone.manifest.generation.lastApplied).toBeNull();
  expect(await geography(page, undone.manifest)).toEqual(blankData); await page.reload(); await ready(page); expect(await saved(page, id)).toEqual(undone);
  await info.attach('shape-independent-persistence.json', { contentType: 'application/json', body: JSON.stringify({ first: first.proof, second: second.proof, shape, controlPoints: points, sourceFingerprint: build.shapeGenerator.sha256,
    unchangedNonHeightLayers: true, restoredOriginalAfterUndo: true, baselineDatabase, limitations: 'Browser mobile/tablet emulation is not physical-device or user visual acceptance.' }, null, 2) });
  expect(errors).toEqual([]); await cdp.detach();
});

test('手绘边界：短笔和交叉拒绝，双指中断绘制仍可缩放，Escape与浏览切换不写入且下一笔无残留', async ({ page }, info) => {
  test.setTimeout(240000); const errors = collectErrors(page), id = await create(page, '手绘边界与手势保护');
  const blank = await saved(page, id), baselineDatabase = await databaseDigest(page), cdp = await page.context().newCDPSession(page);
  const stroke = new Stroke(page, cdp, info.project.name !== 'desktop-chromium');
  const unchanged = async () => {
    await ready(page); await expect(candidate(page)).toHaveCount(0); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
    expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  };
  await startDrawing(page); const short = (await screenPoints(page, [{ x: 1600, y: 1500 }])).points[0];
  await stroke.draw([short, { x: short.x + 1, y: short.y + 1 }]);
  await expect(page.getByLabel('草稿操作反馈')).toContainText('取消'); await unchanged();
  await button(page, '浏览地图'); await startDrawing(page);
  const crossed = await screenPoints(page, [[1000, 1000], [2800, 2500], [2800, 1000], [1000, 2500], [1000, 1000]].map(([x, y]) => ({ x, y })));
  await stroke.draw(crossed.points); await expect(page.getByRole('alert')).toContainText(/配方|轮廓/, { timeout: 90000 }); await unchanged();

  await startDrawing(page); const beforePinch = await metrics(page), middle = (await screenPoints(page, [{ x: 1800, y: 1800 }])).points[0];
  const touch = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 3, radiusY: 3, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, middle.x - 20, middle.y)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, middle.x - 30, middle.y - 10)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, middle.x - 30, middle.y - 10), touch(2, middle.x + 30, middle.y + 10)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, middle.x - 65, middle.y - 15), touch(2, middle.x + 65, middle.y + 15)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await metrics(page)).camera.scale).toBeGreaterThan(beforePinch.camera.scale * 1.2);
  await unchanged(); await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'outline');
  await button(page, '浏览地图'); await startDrawing(page);
  const escapePoints = (await screenPoints(page, [{ x: 1400, y: 1400 }, { x: 1900, y: 1400 }, { x: 1900, y: 1800 }])).points;
  await stroke.start(escapePoints[0]); await stroke.move(escapePoints[1]); await stroke.move(escapePoints[2]); await page.keyboard.press('Escape'); await stroke.end();
  await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'browse'); await unchanged();
  await startDrawing(page);
  // A held touch pointer plus a trusted toolbar click exercises mode change
  // while a real stroke is active, rather than merely toggling an idle mode.
  const heldTouch = new Stroke(page, cdp, true), modePoints = (await screenPoints(page, [{ x: 1400, y: 1400 }, { x: 1800, y: 1500 }, { x: 2000, y: 1700 }])).points;
  await heldTouch.start(modePoints[0]); await heldTouch.move(modePoints[1]); await heldTouch.move(modePoints[2]);
  await button(page, '浏览地图'); await heldTouch.end(); await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'browse'); await unchanged();
  const good = await drawCandidate(page, stroke); await button(page, '确认生成并保存'); await ready(page);
  const final = await saved(page, id), points = final.manifest.generation.lastApplied?.recipe.parameters.pointsQ;
  if (!Array.isArray(points)) throw new Error('Final stroke did not retain its own actual input'); assertCapturedPoints(points, good.projection);
  expect(final.root.revision).toBe(1); await panel(page, '地图'); await shot(page, info, 'shape-after-cancelled-gestures.png');
  const trace = await inputTrace(page); expect(trace.length).toBeGreaterThan(10); expect(trace.every(event => event.trusted)).toBe(true);
  expect(trace.some(event => event.pointerType === 'touch')).toBe(true);
  if (info.project.name === 'desktop-chromium') expect(trace.some(event => event.pointerType === 'mouse')).toBe(true);
  expect(errors).toEqual([]); await cdp.detach();
});
