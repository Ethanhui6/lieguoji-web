import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';
import type { HydrologyTrace } from '../src/world/hydrology-trace';

const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true });
type XY = { x: number; y: number };
const contour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ x, y }));
async function press(p: Page, name: string, touch: boolean) { if (touch) await button(p, name).tap(); else await button(p, name).click(); }
async function section(p: Page, name: '地图' | '创世' | '编辑', touch: boolean) { if (touch) await panel(p, name).tap(); else await panel(p, name).click(); }
async function frameReady(p: Page) {
  await expect.poll(async () => { const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>; return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready'; }, { timeout: 120000 }).toBe(true);
}
async function screen(p: Page, points: XY[]) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  return points.map(q => ({ x: box.x + frame.camera.x + q.x * frame.camera.scale, y: box.y + frame.camera.y + q.y * frame.camera.scale }));
}
async function nativeGesture(p: Page, points: XY[], touch: boolean) {
  expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
      for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
    try { for (const point of points.slice(1)) await p.mouse.move(point.x, point.y); } finally { await p.mouse.up(); }
  }
}

/** Independent read of this test's saved LGDC bytes. No app sampler, kernel,
 * generation invocation, DB writes, Worker replacement or injected result. */
async function durableTerrain(p: Page, id: string, path: { column: number; row: number }[] = []) {
  return p.evaluate(async ({ id, path }) => {
    type Ref = { bx: number; by: number; hash: string };
    const source = await new Promise<{ refs: Ref[]; records: (Ref & { bytes: Uint8Array })[]; size: number; manifestDigest: string }>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
        let refs: Ref[], size: number, manifestDigest: string; const records: (Ref & { bytes: Uint8Array })[] = [];
        const root = tx.objectStore('roots').get(id);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          manifestDigest = JSON.parse(new TextDecoder().decode(root.result)).currentManifest;
          const read = tx.objectStore('manifests').get(manifestDigest);
          read.onsuccess = () => {
            if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            const manifest = JSON.parse(new TextDecoder().decode(read.result.bytes));
            if (manifest.version !== 4 || !manifest.detailCoast || manifest.spec.columns !== 128) { tx.abort(); return; }
            refs = manifest.detailCoast.refs; size = manifest.spec.columns;
            for (const ref of refs) { const block = tx.objectStore('blocks').get(ref.hash); block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); }; }
          };
        };
        tx.oncomplete = () => { db.close(); resolve({ refs, records, size, manifestDigest }); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual saved fine field')); };
      };
    });
    const tiles = new Map<string, { bx: number; by: number; mode: number; view: DataView; count: number }>(); let explicitNodes = 0;
    for (const record of source.records) {
      const b = record.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b).buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== record.hash || b.length < 16 || [76, 71, 68, 67, 1].some((n, i) => b[i] !== n) || b[6] !== record.bx || b[7] !== record.by || b[5] > 1 || b.slice(10, 16).some(Boolean)) throw new Error('Invalid durable LGDC identity/hash');
      const n = v.getUint16(8, true), expected = (record.bx ? 32 : 33) * (record.by ? 32 : 33), key = `${record.bx}:${record.by}`;
      if (n !== (b[5] ? expected : 0) || b.length !== 16 + n * 4 || tiles.has(key)) throw new Error('Invalid fine owner layout');
      tiles.set(key, { bx: record.bx, by: record.by, mode: b[5], view: v, count: n }); explicitNodes += n;
    }
    const sample = (x: number, y: number) => {
      const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
      if (!tile?.mode) return null;
      const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
      const coverage = tile.view.getInt16(16 + slot * 2, true), height = tile.view.getInt16(16 + tile.count * 2 + slot * 2, true);
      if (coverage === -32768 || height < -12000 || height > 12000 || coverage > 0 && height < 0 || coverage < 0 && height >= 0 || coverage === 0 && height !== 0) throw new Error('Fine coverage/height mismatch');
      return { coverage, height };
    };
    let point: { column: number; row: number; height: number; cellId: number; x: number; y: number } | null = null;
    // Pick a real high interior node with a strictly lower adjacent land node.
    // A .25-world inset keeps the native pick inside its cell and rounds to the
    // same fine node; the test later checks the actual trace sourceNode.
    for (const tile of tiles.values()) if (tile.mode) {
      const startX = tile.bx * 32 + (tile.bx ? 1 : 0), startY = tile.by * 32 + (tile.by ? 1 : 0), width = tile.bx ? 32 : 33;
      for (let slot = 0; slot < tile.count; slot++) {
        const column = startX + slot % width, row = startY + Math.floor(slot / width); if (column < 2 || row < 2 || column > 2046 || row > 2046) continue;
        const center = sample(column, row); if (!center || center.coverage <= 256 || center.height < 300 || point && center.height < point.height) continue;
        const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]].map(([dx, dy]) => sample(column + dx, row + dy));
        if (neighbours.some(n => !n || n.coverage <= 256) || !neighbours.slice(0, 4).some(n => n!.height < center.height)) continue;
        if (point && center.height === point.height && row * 2049 + column > point.row * 2049 + point.column) continue;
        const x = column * 2 + .25, y = row * 2 + .25;
        point = { column, row, height: center.height, x, y, cellId: Math.floor(y / (4096 / source.size)) * source.size + Math.floor(x / (4096 / source.size)) };
      }
    }
    if (!point) throw new Error('The generated saved continent has no actual interior highland probe');
    return { point, explicitNodes, ownerCount: tiles.size, manifestDigest: source.manifestDigest, pathSamples: path.map(q => sample(q.column, q.row)) };
  }, { id, path });
}

async function selectPoint(p: Page, point: Awaited<ReturnType<typeof durableTerrain>>['point'], touch: boolean) {
  await section(p, '地图', touch); await press(p, '全图', touch); await frameReady(p);
  for (let i = 0; i < 16 && (await metrics(p)).camera.scale < 2; i++) await press(p, '放大大世界地图', touch);
  await frameReady(p); expect((await metrics(p)).camera.scale).toBeGreaterThanOrEqual(2);
  await section(p, '编辑', touch); await p.getByLabel('定位地块编号', { exact: true }).fill(String(point.cellId)); await press(p, '定位', touch);
  await section(p, '地图', touch); await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [point]))[0];
  const center = { x: box.x + box.width * .5, y: box.y + box.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  await nativeGesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  await frameReady(p); const target = (await screen(p, [point]))[0];
  expect(await p.evaluate(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid'), target)).toBe('atlas-canvas');
  if (touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
  await expect(p.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', 'land');
  await expect(button(p, '查看地形流向')).toBeEnabled();
}
async function displayedTrace(p: Page): Promise<HydrologyTrace | null> {
  // Runtime data comes only from the existing read-only audit of the actual
  // renderer. A type import does not invoke any app algorithm in this test.
  const result = await audit(p) as Awaited<ReturnType<typeof audit>> & { hydrologyTrace: HydrologyTrace | null };
  expect(Object.hasOwn(result, 'hydrologyTrace')).toBe(true); return result.hydrologyTrace;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function assertVisibleFlow(p: Page, trace: HydrologyTrace) {
  await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  const horizontal = Math.min(48, box.width * .12), vertical = Math.min(144, box.height * .25);
  const points = trace.path.map(q => ({ x: q.column * 2, y: q.row * 2 }));
  if (trace.coastPointQ) points.push({ x: trace.coastPointQ.xQ / 256, y: trace.coastPointQ.yQ / 256 });
  for (const q of points) {
    const x = frame.camera.x + q.x * frame.camera.scale, y = frame.camera.y + q.y * frame.camera.scale;
    expect(x, 'Actual path stays inside the visible canvas with horizontal margin').toBeGreaterThanOrEqual(horizontal - 1e-6);
    expect(x).toBeLessThanOrEqual(box.width - horizontal + 1e-6);
    expect(y, 'Actual path leaves room for map tools above and result controls below').toBeGreaterThanOrEqual(vertical - 1e-6);
    expect(y).toBeLessThanOrEqual(box.height - vertical + 1e-6);
  }
  return { camera: frame.camera, canvas: { width: box.width, height: box.height }, horizontal, vertical, points: points.length };
}

test('[hydrology-v4] native saved continent, read-only real flow, active cancellation and deterministic reload', async ({ page }, info) => {
  test.setTimeout(450000); // Original real-workflow ceiling; zero retries in runner.
  const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true); const buildBytes = await response.body();
  const buildSha256 = createHash('sha256').update(buildBytes).digest('hex'), build = JSON.parse(buildBytes.toString()) as { version: string; commit: string; naturalDetailGenerator?: { sha256: string } };
  if (process.env.FLOW_EXPECTED_BUILD_SHA256) expect(buildSha256).toBe(process.env.FLOW_EXPECTED_BUILD_SHA256);
  expect(build.commit).toMatch(/^[a-f0-9]{40}$/); expect(build.naturalDetailGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  const touch = !!info.project.use.hasTouch, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await info.attach('actual-build.json', { body: buildBytes, contentType: 'application/json' });
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('山河流向 · 原生只读验收');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await press(page, '新建空白海洋草稿', touch); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!; expect(id).toMatch(/^atlas-/);
  await section(page, '创世', touch); await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  await press(page, '画大陆', touch); await press(page, '全图', touch); await frameReady(page);
  await nativeGesture(page, await screen(page, [...contour, contour[0]]), touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page);
  // Both decisions are reachable immediately; the description may scroll but
  // must not scroll these actions out of the mobile sheet before the first tap.
  const decisions = page.getByRole('group', { name: '大陆生成预览操作', exact: true });
  await expect(decisions.getByRole('button', { name: '取消生成', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(decisions.getByRole('button', { name: '确认生成并保存', exact: true })).toBeInViewport({ ratio: 1 });
  await press(page, '确认生成并保存', touch);
  // A native tap may finish before its click activates. "ready" was already
  // true in preview, so wait for the real commit; never retry the tap.
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 });
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toHaveCount(0); await ready(page);
  const before = await saved(page, id, 4), beforeDb = await databaseDigest(page, 4), terrain = await durableTerrain(page, id);
  expect(before.root.revision).toBe(1); expect(terrain.manifestDigest).toBe(before.root.currentManifest); expect(terrain.explicitNodes).toBeGreaterThan(0);
  expect(before.manifest.generation.lastApplied?.recipe.generator.fingerprint).toBe(build.naturalDetailGenerator!.sha256);
  await selectPoint(page, terrain.point, touch); await press(page, '查看地形流向', touch);
  await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  const first = await displayedTrace(page); expect(first).not.toBeNull();
  expect(first!.sourceNode).toEqual({ column: terrain.point.column, row: terrain.point.row });
  expect(first!.source).toMatchObject({ draftId: id, revision: 1, rootDigest: before.root.rootDigest, manifestDigest: before.root.currentManifest });
  expect(first!.path.length).toBeGreaterThan(1); expect(first!.path.length).toBeLessThanOrEqual(4096);
  expect(['ocean', 'depression', 'unresolved']).toContain(first!.terminal);
  await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', first!.terminal); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', String(first!.path.length));
  await expect(button(page, '关闭流向')).toBeVisible(); await expect(button(page, '关闭大世界面板')).toHaveCount(0);
  const actualPath = (await durableTerrain(page, id, first!.path)).pathSamples, seen = new Set<string>();
  for (let i = 0; i < first!.path.length; i++) {
    const q = first!.path[i], prior = first!.path[i - 1], sample = actualPath[i];
    expect(sample, 'Displayed route must read real saved explicit fine nodes').not.toBeNull(); expect(sample!.coverage).toBeGreaterThanOrEqual(0);
    expect(seen.has(`${q.column}:${q.row}`)).toBe(false); seen.add(`${q.column}:${q.row}`);
    if (prior) { expect(Math.abs(q.column - prior.column) + Math.abs(q.row - prior.row)).toBe(1); expect(sample!.height).toBeLessThanOrEqual(actualPath[i - 1]!.height); }
  }
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  const firstFraming = await assertVisibleFlow(page, first!); await page.screenshot({ path: info.outputPath('saved-terrain-flow.png'), fullPage: true });

  await press(page, '关闭流向', touch); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', '0');
  await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', ''); expect(await displayedTrace(page)).toBeNull();
  await section(page, '编辑', touch); await press(page, '查看地形流向', touch);
  await page.waitForFunction(() => {
    const main = document.querySelector('[data-testid="atlas-studio"]'), stage = main?.getAttribute('data-atlas-progress-stage') ?? '';
    return main?.getAttribute('data-atlas-state') === 'busy' && stage.startsWith('水文计算：') && stage !== '水文计算：capture' && Number(main.getAttribute('data-atlas-progress-completed')) > 0;
  }, undefined, { timeout: 120000, polling: 'raf' });
  const cancelledStage = await studio(page).getAttribute('data-atlas-progress-stage'), cancelledOperations = Number(await studio(page).getAttribute('data-atlas-progress-completed'));
  expect(cancelledOperations).toBeGreaterThan(0); await press(page, '取消操作', touch); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', ''); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', '0'); expect(await displayedTrace(page)).toBeNull();
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);

  await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(before); expect(await displayedTrace(page)).toBeNull();
  await selectPoint(page, terrain.point, touch); await press(page, '查看地形流向', touch);
  await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  const restored = await displayedTrace(page); expect(restored).toEqual(first); expect(digest(restored)).toBe(digest(first));
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  const restoredFraming = await assertVisibleFlow(page, restored!); await page.screenshot({ path: info.outputPath('restored-identical-flow.png'), fullPage: true });
  expect(errors).toEqual([]);
  await info.attach('hydrology-evidence.json', { contentType: 'application/json', body: JSON.stringify({ build, buildSha256, project: info.project.name, physicalDevice: false,
    input: { size: 128, contour, point: terrain.point, explicitNodes: terrain.explicitNodes, ownerCount: terrain.ownerCount }, root: before.root, database: beforeDb,
    first, restored, firstFraming, restoredFraming, pathSha256: digest(first!.path), cancelled: { stage: cancelledStage, operations: cancelledOperations, noDisplayedResult: true, savedUnchanged: true }, errors }, null, 2) });
});
