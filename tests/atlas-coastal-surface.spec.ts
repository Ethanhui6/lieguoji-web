import { expect, test, type Page } from '@playwright/test';
import { audit, databaseDigest, geography, metrics, saved, type Geography } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';

const studio = (page: Page) => page.getByTestId('atlas-studio');
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑' | '草稿') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
type Point = { x: number; y: number };
const outline = [[860, 1050], [1260, 810], [2020, 980], [2440, 1300], [2890, 1460], [3070, 1890], [2620, 2260], [2240, 2050], [1990, 2420], [1460, 2580], [1210, 2020], [780, 1840], [650, 1480]].map(([x, y]) => ({ x, y }));
async function create(page: Page, format: 2 | 3, name: string) {
  await page.goto(`/?atlas=new&atlas-format=${format}`); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('山海-自然海岸-01');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256');
  await button(page, '新建空白海洋草稿'); await ready(page);
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function screen(page: Page, points: Point[]) {
  const box = (await page.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(page);
  return points.map(p => ({ x: box.x + frame.camera.x + p.x * frame.camera.scale, y: box.y + frame.camera.y + p.y * frame.camera.scale }));
}
async function draw(page: Page, touch: boolean) {
  await button(page, '画大陆'); await button(page, '全图');
  const points = await screen(page, [...outline, outline[0]]);
  expect(await page.evaluate(ps => ps.every(p => document.elementFromPoint(p.x, p.y)?.getAttribute('data-testid') === 'atlas-canvas'), points)).toBe(true);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
    for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else {
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
  }
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 90000 }); await ready(page);
}
// Independent observer: finds a land-centred cell whose actual quad corner is
// surrounded by three sea samples. A point close to that corner is sea in the
// new contract, whereas the old whole-cell model would label both points land.
// This reads saved LGAB bytes; it never imports/calls the application geometry.
function mixedCell(data: Geography, size: number) {
  for (let y = 2; y < size - 2; y++) for (let x = 2; x < size - 2; x++) {
    const id = y * size + x; if (data.heights[id] < 0) continue;
    for (const [vx, vy] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) {
      const incident = [(vy - 1) * size + vx - 1, (vy - 1) * size + vx, vy * size + vx - 1, vy * size + vx];
      if (incident.filter(i => data.heights[i] >= 0).length !== 1) continue;
      const vertex = vy * (size + 1) + vx, corner = { x: data.xyQ[vertex * 2] / 256, y: data.xyQ[vertex * 2 + 1] / 256 };
      const ids = [y * (size + 1) + x, y * (size + 1) + x + 1, (y + 1) * (size + 1) + x + 1, (y + 1) * (size + 1) + x];
      const points = ids.map(i => ({ x: data.xyQ[i * 2], y: data.xyQ[i * 2 + 1] })), origin = points[0];
      let twiceArea = 0, nx = 0, ny = 0;
      for (let edge = 0; edge < 4; edge++) {
        const a = { x: points[edge].x - origin.x, y: points[edge].y - origin.y }, b = { x: points[(edge + 1) % 4].x - origin.x, y: points[(edge + 1) % 4].y - origin.y }, cross = a.x * b.y - b.x * a.y;
        twiceArea += cross; nx += (a.x + b.x) * cross; ny += (a.y + b.y) * cross;
      }
      const center = { x: (origin.x + Math.round(nx / (3 * twiceArea))) / 256, y: (origin.y + Math.round(ny / (3 * twiceArea))) / 256 };
      return { id, land: center, sea: { x: center.x * .15 + corner.x * .85, y: center.y * .15 + corner.y * .85 } };
    }
  }
  throw new Error('Hand-drawn fixture contains no independently identifiable mixed coastal cell');
}
async function focus(page: Page, id: number) {
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(id)); await button(page, '定位'); await panel(page, '地图');
}
async function rasterFrame(page: Page) {
  const frame = await page.getByTestId('atlas-canvas').evaluate(element => new Promise<ReturnType<AtlasRenderer['metrics']>>(resolve => {
    const requestId = crypto.randomUUID();
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.requestId !== requestId) return;
      element.removeEventListener('atlas-metrics-response', listener); resolve(detail.metrics);
    };
    element.addEventListener('atlas-metrics-response', listener);
    element.dispatchEvent(new CustomEvent('atlas-metrics-request', { detail: { requestId } }));
  }));
  expect(frame.fatal).toBe(false); expect(frame.raster).not.toBeNull();
  const raster = frame.raster!;
  const physicalDensity = frame.camera.scale * frame.viewport.resolution;
  expect(raster.requestedDensity).toBeGreaterThanOrEqual(physicalDensity);
  expect(raster.outputPixelsPerTexel).toBeCloseTo(physicalDensity / raster.density, 8);
  expect(raster.textureSide).toBeLessThanOrEqual(1024);
  expect(raster.visiblePixels).toBeLessThanOrEqual(32 * 1024 * 1024 * .75);
  expect(frame.cache.pixels).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(frame.cache.peakPixels).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(frame.cache.releaseFailures).toBe(0);
  expect(frame.cache.created - frame.cache.destroyed).toBe(frame.cache.entries);
  if (raster.fallbackReason === null) expect(raster.outputPixelsPerTexel).toBeLessThanOrEqual(1);
  else { expect(raster.fallbackReason).toBe('pixel-budget'); expect(raster.density).toBeLessThan(raster.requestedDensity); }
  return frame;
}
async function framebufferColors(page: Page, points: Point[]) {
  const sequence = (await metrics(page)).completedFrameSequence;
  await page.getByTestId('atlas-canvas').evaluate((element, args) => {
    const host = window as unknown as { __coastalColors: { result?: number[][]; error?: string } }; host.__coastalColors = {};
    const listener = (event: Event) => {
      const frame = (event as CustomEvent<ReturnType<AtlasRenderer['metrics']>>).detail;
      if (frame.gpu.state !== 'ready' || frame.frameSequence <= args.sequence || frame.frameSequence <= frame.completedFrameSequence) return;
      element.removeEventListener('atlas-render-metrics', listener);
      try {
        const canvas = element as HTMLCanvasElement, gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (!gl || gl.isContextLost() || gl.getError() !== gl.NO_ERROR || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) throw new Error('No healthy default GPU framebuffer');
        if (gl instanceof WebGL2RenderingContext && (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null || gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null)) throw new Error('Unexpected GPU read target');
        host.__coastalColors.result = args.points.map(point => {
          const x = Math.round((frame.camera.x + point.x * frame.camera.scale) * gl.drawingBufferWidth / frame.viewport.width);
          const y = gl.drawingBufferHeight - 1 - Math.round((frame.camera.y + point.y * frame.camera.scale) * gl.drawingBufferHeight / frame.viewport.height);
          if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) throw new Error('Coastal pixel probe outside actual viewport');
          const bytes = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Coastal framebuffer read failed'); return [...bytes];
        });
      } catch (error) { host.__coastalColors.error = String(error); }
    };
    element.addEventListener('atlas-render-metrics', listener);
  }, { sequence, points });
  await button(page, '放大大世界地图');
  await expect.poll(() => page.evaluate(() => { const state = (window as unknown as { __coastalColors: { result?: number[][]; error?: string } }).__coastalColors; if (state.error) throw new Error(state.error); return !!state.result; })).toBe(true);
  return page.evaluate(() => (window as unknown as { __coastalColors: { result: number[][] } }).__coastalColors.result);
}

test('[coastal-v3] 手绘真实海陆分片，取消不写，同格两侧拾取与画面一致，保存刷新和GPU恢复', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const id = await create(page, 3, '自然大陆 · 海岸分片验收'), baseline = await saved(page, id, 3), digest = await databaseDigest(page, 3);
  await draw(page, info.project.name !== 'desktop-chromium');
  const candidate = await audit(page); expect(candidate.display.version).toBe(3);
  expect(await saved(page, id, 3)).toEqual(baseline); expect(await databaseDigest(page, 3)).toEqual(digest);
  await button(page, '取消生成'); await ready(page); expect(await databaseDigest(page, 3)).toEqual(digest);
  await draw(page, info.project.name !== 'desktop-chromium'); expect((await audit(page)).display.manifestDigest).toBe(candidate.display.manifestDigest);
  await button(page, '确认生成并保存'); await ready(page);
  const committed = await saved(page, id, 3), data = await geography(page, committed.manifest), probe = mixedCell(data, committed.manifest.spec.columns);
  expect(committed.root).toMatchObject({ domain: 'atlas-draft-v3', revision: 1, currentManifest: candidate.display.manifestDigest });
  expect(committed.manifest).toMatchObject({ version: 3, surface: { kind: 'land-mask-fan-v1', coordinateScale: 256 } });
  expect(committed.manifest.generation.lastApplied?.recipe.parameters.coastRoughnessWorld).toBe(96);
  await panel(page, '地图'); await button(page, '全图');
  await page.screenshot({ path: info.outputPath('coastal-v3-world.png'), fullPage: true });
  await focus(page, probe.id);
  while ((await metrics(page)).camera.scale < 3) await button(page, '放大大世界地图');
  await focus(page, probe.id);
  await rasterFrame(page);
  const colors = await framebufferColors(page, [probe.land, probe.sea]);
  expect(colors[0][1]).toBeGreaterThan(colors[0][2]); expect(colors[1][2]).toBeGreaterThan(colors[1][0]); expect(colors[0]).not.toEqual(colors[1]);
  for (const [kind, point] of [['land', probe.land], ['sea', probe.sea]] as const) {
    await panel(page, '地图'); const [p] = await screen(page, [point]);
    if (info.project.name === 'desktop-chromium') await page.mouse.click(p.x, p.y); else await page.touchscreen.tap(p.x, p.y);
    await expect(studio(page)).toHaveAttribute('data-selectedcell', String(probe.id));
    await expect(page.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', kind);
  }
  await panel(page, '地图'); await page.screenshot({ path: info.outputPath('coastal-v3-shore.png'), fullPage: true });
  // Exercise the actual UI zoom ceiling. The texture ledger includes old/new
  // cache cores while they are replaced; no saved geography is edited here.
  const zoomFrames = [await rasterFrame(page)];
  for (let attempt = 0; attempt < 24; attempt++) {
    const previous = zoomFrames.at(-1)!; await button(page, '放大大世界地图');
    const frame = await rasterFrame(page); zoomFrames.push(frame);
    if (frame.camera.scale === previous.camera.scale) break;
  }
  expect(zoomFrames.length).toBeLessThan(25);
  expect(zoomFrames.at(-1)!.raster!.density).toBeGreaterThan(4);
  expect(zoomFrames.at(-1)!.labels.visibleCount).toBe(0);
  await button(page, '显示地块网格');
  const withGrid = await rasterFrame(page); expect(withGrid.gridVisible).toBe(true); expect(withGrid.labels.visibleCount).toBeGreaterThan(0);
  await button(page, '显示地块网格');
  const withoutGrid = await rasterFrame(page); expect(withoutGrid.gridVisible).toBe(false); expect(withoutGrid.labels.visibleCount).toBe(0);
  await page.screenshot({ path: info.outputPath('coastal-v3-maximum-zoom.png'), fullPage: true });
  expect(await saved(page, id, 3)).toEqual(committed);
  await info.attach('coastal-raster-density.json', { body: JSON.stringify({ zoomFrames, withGrid, withoutGrid }, null, 2), contentType: 'application/json' });
  await info.attach('coastal-pixel-and-pick.json', { body: JSON.stringify({ probe, colors, beforeReload: await audit(page) }, null, 2), contentType: 'application/json' });
  await page.reload(); await ready(page); expect(await saved(page, id, 3)).toEqual(committed); expect((await audit(page)).display.manifestDigest).toBe(committed.root.currentManifest);
  await page.getByTestId('atlas-canvas').evaluate(async element => {
    const c = element as HTMLCanvasElement, gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) throw new Error('Actual WebGL context unavailable');
    const extension = gl.getExtension('WEBGL_lose_context'); if (!extension) throw new Error('Actual loss extension unavailable');
    (window as unknown as { __coastalRestore: () => void }).__coastalRestore = () => extension.restoreContext();
    await new Promise<void>(resolve => { c.addEventListener('webglcontextlost', () => resolve(), { once: true }); extension.loseContext(); });
  });
  await expect(studio(page)).toHaveAttribute('data-atlas-gpu', 'lost');
  await page.evaluate(() => (window as unknown as { __coastalRestore: () => void }).__coastalRestore());
  await expect(studio(page)).toHaveAttribute('data-atlas-gpu', 'ready', { timeout: 30000 });
  expect((await audit(page)).display.manifestDigest).toBe(committed.root.currentManifest); expect(await saved(page, id, 3)).toEqual(committed);
  await focus(page, probe.id); while ((await metrics(page)).camera.scale < 3) await button(page, '放大大世界地图'); await focus(page, probe.id);
  await rasterFrame(page);
  const restoredColors = await framebufferColors(page, [probe.land, probe.sea]);
  for (let p = 0; p < colors.length; p++) for (let channel = 0; channel < 4; channel++) expect(Math.abs(colors[p][channel] - restoredColors[p][channel])).toBeLessThanOrEqual(1);
  await info.attach('coastal-restored-pixels.json', { body: JSON.stringify({ colors, restoredColors }), contentType: 'application/json' });
  expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('[coastal-entry] 工坊入口默认进入自然海岸新世界，刷新链接保持第三版', async ({ page }) => {
  test.setTimeout(90000); await page.goto('/');
  await page.getByRole('navigation', { name: '世界工坊工具' }).getByRole('button', { name: '世界', exact: true }).click();
  await page.getByRole('button', { name: /^大世界草稿/ }).click(); await ready(page, 'empty');
  expect(new URL(page.url()).searchParams.get('atlas-format')).toBe('3');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await button(page, '新建空白海洋草稿'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', '3');
  const id = (await studio(page).getAttribute('data-atlas-id'))!, before = await saved(page, id, 3);
  await page.reload(); await ready(page); expect(await saved(page, id, 3)).toEqual(before);
});

test('[coastal-copy] 旧地图显式另存自然海岸副本，原库与原链接保持不变', async ({ page }, info) => {
  test.setTimeout(180000);
  const old = await create(page, 2, '保留的旧海岸'), oldUrl = page.url(), oldState = await saved(page, old), oldDb = await databaseDigest(page);
  await panel(page, '创世'); await button(page, '创建自然海岸副本');
  await expect(page.getByRole('alertdialog')).toContainText('沿岸地块的陆海面积会变化；原草稿不会改写。');
  await page.getByRole('alertdialog').getByRole('button', { name: '创建自然海岸副本', exact: true }).click(); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', '3');
  expect(new URL(page.url()).searchParams.get('atlas-format')).toBe('3');
  const nextId = (await studio(page).getAttribute('data-atlas-id'))!, next = await saved(page, nextId, 3);
  expect(nextId).not.toBe(old); expect(next.manifest).toMatchObject({ version: 3, origin: { sourceFormat: 2, sourceDraftId: old } });
  expect(next.manifest.blockRefs).toEqual(oldState.manifest.blockRefs); expect(await databaseDigest(page)).toEqual(oldDb);
  await page.reload(); await ready(page); expect(await saved(page, nextId, 3)).toEqual(next);
  await page.goto(oldUrl); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-format', '2'); expect(await saved(page, old)).toEqual(oldState);
  await info.attach('coastal-copy-binding.json', { body: JSON.stringify({ oldId: old, nextId, oldRoot: oldState.root, nextRoot: next.root }), contentType: 'application/json' });
});
