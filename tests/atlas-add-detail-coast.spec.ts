import { test, expect, type Page } from '@playwright/test';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';

// Staged for tests/atlas-add-detail-coast.spec.ts. Imports intentionally target
// that final location. No app generator/geometry code runs in this observer.
const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
const preview = (p: Page) => p.getByRole('region', { name: '大陆生成预览' });
type XY = { x: number; y: number };
type Probe = XY & { cellId: number; minimumHeight: number; maximumHeight: number };
const firstContour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ x, y }));
const secondContour = firstContour.map(p => ({ x: p.x + 1850, y: p.y }));

async function frameReady(p: Page) {
  await expect.poll(async () => {
    const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>;
    return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready';
  }, { timeout: 120000 }).toBe(true);
}
async function screen(p: Page, points: XY[]) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  return points.map(q => ({ x: box.x + frame.camera.x + q.x * frame.camera.scale, y: box.y + frame.camera.y + q.y * frame.camera.scale }));
}
async function assertCanvasPoints(p: Page, points: XY[]) {
  expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
}
async function gesture(p: Page, points: XY[], touch: boolean) {
  await assertCanvasPoints(p, points);
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
      for (const q of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
    try { for (const q of points.slice(1)) await p.mouse.move(q.x, q.y); } finally { await p.mouse.up(); }
  }
}
async function draw(p: Page, points: XY[], touch: boolean, rejected = false) {
  await click(p, '画大陆'); await click(p, '全图'); await frameReady(p);
  await expect(studio(p)).toHaveAttribute('data-atlas-tool', 'outline');
  await gesture(p, await screen(p, [...points, points[0]]), touch);
  if (rejected) {
    await expect(p.getByRole('alert')).toContainText(/新大陆.*(?:接触|重叠)|新旧海岸距离带过近/, { timeout: 120000 });
    await expect(preview(p)).toHaveCount(0);
    await expect(studio(p)).toHaveAttribute('data-atlas-display', 'committed');
  } else {
    await expect(preview(p)).toBeVisible({ timeout: 120000 });
    await expect(studio(p)).toHaveAttribute('data-atlas-display', 'generation-preview');
  }
  await ready(p);
}

/** Read-only, independent durable observer. LGDC bytes and hashes prove the
 * stored coverage/height field; LGAB heights protect implicit Hbase on the old
 * continent. We do not infer exact SDF union or visual quality from this check. */
async function durableField(p: Page, id: string) {
  return p.evaluate(async id => {
    type Ref = { bx: number; by: number; hash: string };
    type Manifest = { version: number; spec: { columns: number; rows: number }; blockRefs: { key: string; hash: string }[]; detailCoast: { refs: Ref[] } };
    type Row = { key?: string; bx?: number; by?: number; hash: string; bytes: Uint8Array };
    const rows = await new Promise<{ manifest: Manifest; records: Row[] }>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
        let manifest: Manifest; const records: Row[] = [];
        const root = tx.objectStore('roots').get(id);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          const read = tx.objectStore('manifests').get(JSON.parse(new TextDecoder().decode(root.result)).currentManifest);
          read.onsuccess = () => {
            if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            manifest = JSON.parse(new TextDecoder().decode(read.result.bytes));
            if (manifest.version !== 4 || !manifest.detailCoast) { tx.abort(); return; }
            for (const ref of [...manifest.detailCoast.refs, ...manifest.blockRefs.filter(ref => ref.key.startsWith('elevation:'))]) {
              const block = tx.objectStore('blocks').get(ref.hash);
              block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
            }
          };
        };
        tx.oncomplete = () => { db.close(); resolve({ manifest, records }); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual v4 source')); };
      };
    });
    const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    const tiles = new Map<string, { mode: number; coverage: number[]; heights: number[] }>();
    const coarse = new Int32Array(rows.manifest.spec.columns ** 2), seen = new Uint8Array(coarse.length);
    let sampledTiles = 0, landTiles = 0;
    for (const r of rows.records) {
      if (await digest(r.bytes) !== r.hash) throw new Error('Stored content hash mismatch');
      const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (r.key) {
        const [layer, rawX, rawY] = r.key.split(':'), bx = Number(rawX), by = Number(rawY);
        if (layer !== 'elevation' || b.length !== 28 + 1024 * 4 || [76, 71, 65, 66].some((value, index) => b[index] !== value)
          || v.getUint16(4, true) !== 1 || b[6] !== 1 || b[7] !== 1 || v.getUint16(8, true) !== bx || v.getUint16(10, true) !== by
          || v.getUint32(12, true) !== 0 || b[16] !== 2 || b.slice(17, 20).some(Boolean) || v.getUint32(20, true) !== 1024 || v.getUint32(24, true) !== 4096) throw new Error('Malformed coarse height block');
        for (let i = 0; i < 1024; i++) {
          const cell = (by * 32 + Math.floor(i / 32)) * rows.manifest.spec.columns + bx * 32 + i % 32, h = v.getInt32(28 + i * 4, true);
          if (seen[cell] || h < -12000 || h > 12000) throw new Error('Invalid coarse height identity/value');
          seen[cell] = 1; coarse[cell] = h;
        }
      } else {
        const bx = r.bx!, by = r.by!, n = v.getUint16(8, true), expected = (bx === 0 ? 33 : 32) * (by === 0 ? 33 : 32);
        if ([76, 71, 68, 67, 1].some((x, i) => b[i] !== x) || b[6] !== bx || b[7] !== by || b.slice(10, 16).some(Boolean)
          || b[5] > 1 || b.length !== 16 + n * 4 || n !== (b[5] ? expected : 0) || tiles.has(`${bx}:${by}`)) throw new Error('Malformed fine owner block');
        const coverage: number[] = [], heights: number[] = [];
        for (let i = 0; i < n; i++) {
          const c = v.getInt16(16 + i * 2, true), h = v.getInt16(16 + n * 2 + i * 2, true);
          if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h >= 0 || c === 0 && h !== 0) throw new Error('Stored coast height/sign mismatch');
          coverage.push(c); heights.push(h);
        }
        tiles.set(`${bx}:${by}`, { mode: b[5], coverage, heights }); if (b[5]) sampledTiles++; else landTiles++;
      }
    }
    if (seen.some(v => v !== 1)) throw new Error('Missing coarse height samples');
    const sample = (x: number, y: number) => {
      const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
      if (!tile?.mode) return null; // Probes use four actually stored samples, never a guessed Hbase.
      const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
      return { coverage: tile.coverage[slot], height: tile.heights[slot] };
    };
    type Point = { x: number; y: number; cellId: number; minimumHeight: number; maximumHeight: number };
    const groups = new Map<number, { land?: Point; sea?: Point }>(), step = 4096 / rows.manifest.spec.columns;
    for (const [key, tile] of tiles) if (tile.mode) {
      const [bx, by] = key.split(':').map(Number); if (bx * 64 >= 1800) continue;
      for (let y = by * 32; y < by * 32 + 32; y++) for (let x = bx * 32; x < bx * 32 + 32; x++) {
        const raw = [sample(x, y), sample(x + 1, y), sample(x + 1, y + 1), sample(x, y + 1)];
        if (raw.some(v => v === null)) continue;
        const values = raw.map(v => v!), land = values.every(v => v.coverage > 256), sea = values.every(v => v.coverage < -256);
        if (!land && !sea) continue;
        const cellId = Math.floor((y * 2 + 1) / step) * rows.manifest.spec.columns + Math.floor((x * 2 + 1) / step);
        const point = { x: x * 2 + 1, y: y * 2 + 1, cellId, minimumHeight: Math.min(...values.map(v => v.height)), maximumHeight: Math.max(...values.map(v => v.height)) };
        const group = groups.get(cellId) ?? {}; if (land) group.land ??= point; else group.sea ??= point; groups.set(cellId, group);
      }
    }
    const pair = [...groups.entries()].sort(([a], [b]) => a - b).find(([, group]) => group.land && group.sea);
    if (!pair) throw new Error('First coastline lacks two independently stored probes in one coarse cell');
    // First contour (including roughness/islands) is left of 1800. This region
    // extends beyond its 2.5-step compact Hbase support. The second is >2400.
    const leftColumns = Math.floor(1900 / step), protectedHeights: number[] = [];
    for (let y = 0; y < rows.manifest.spec.rows; y++) for (let x = 0; x < leftColumns; x++) protectedHeights.push(coarse[y * rows.manifest.spec.columns + x]);
    return { refs: rows.manifest.detailCoast.refs, sampledTiles, landTiles,
      geometryRefs: rows.manifest.blockRefs.filter(r => r.key.startsWith('geometry:')),
      firstRegionHeightSha256: await digest(new Uint8Array(new Int32Array(protectedHeights).buffer)),
      firstRegionSamples: protectedHeights.length, probe: { land: pair[1].land!, sea: pair[1].sea! } };
  }, id);
}
type DurableField = Awaited<ReturnType<typeof durableField>>;
function firstContinentPreserved(first: DurableField, next: DurableField) {
  expect(first.sampledTiles).toBeGreaterThan(0); expect(first.firstRegionSamples).toBeGreaterThan(1000);
  const current = new Map(next.refs.map(ref => [`${ref.bx}:${ref.by}`, ref.hash]));
  for (const ref of first.refs) expect(current.get(`${ref.bx}:${ref.by}`), `Original owner ${ref.bx}:${ref.by}`).toBe(ref.hash);
  expect(next.geometryRefs).toEqual(first.geometryRefs);
  expect(next.firstRegionHeightSha256).toBe(first.firstRegionHeightSha256);
}
async function observePoint(p: Page, point: Probe, kind: 'land' | 'sea', touch: boolean) {
  await panel(p, '编辑'); await p.getByLabel('定位地块编号', { exact: true }).fill(String(point.cellId)); await click(p, '定位');
  await panel(p, '地图'); await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [point]))[0];
  const center = { x: box.x + box.width * .5, y: box.y + box.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  const movement = Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 }));
  await gesture(p, movement, touch); await frameReady(p);
  const target = (await screen(p, [point]))[0]; await assertCanvasPoints(p, [target]);
  if (touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
  const result = p.getByTestId('atlas-picked-surface'); await expect(result).toHaveAttribute('data-land', kind);
  const text = (await result.textContent())!, match = /·\s*(-?\d+)\s*米/.exec(text); expect(match).not.toBeNull();
  const height = Number(match![1]);
  // Four same-sign source nodes keep the entire fine cell in one class. A
  // barycentric height must stay inside their stored range, rounded to metres.
  expect(height).toBeGreaterThanOrEqual(Math.floor(point.minimumHeight)); expect(height).toBeLessThanOrEqual(Math.ceil(point.maximumHeight));
  return { kind, world: { x: point.x, y: point.y }, screen: target, text, expectedHeightRange: [point.minimumHeight, point.maximumHeight] };
}
async function observeFirstCoast(p: Page, field: DurableField, touch: boolean) {
  await panel(p, '地图'); await click(p, '全图'); await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, maximum = Math.min(box.width, box.height) / 4096 * .9 * 80, target = Math.min(8, maximum);
  for (let i = 0; i < 16 && (await metrics(p)).camera.scale < target - 1e-9; i++) {
    const before = (await metrics(p)).camera.scale; await click(p, '放大大世界地图'); await frameReady(p); expect((await metrics(p)).camera.scale).toBeGreaterThan(before);
  }
  expect((await metrics(p)).camera.scale).toBeGreaterThanOrEqual(target - 1e-9);
  return [await observePoint(p, field.probe.land, 'land', touch), await observePoint(p, field.probe.sea, 'sea', touch)];
}

test('[detail-v4-add] two native contours, protected first coast, same-session undo, reload and overlap rejection', async ({ page }, info) => {
  // Four bounded generation attempts: first, second, repeated second after undo,
  // and the overlapping attempt. This is a correctness ceiling, not a perf gate.
  test.setTimeout(450000);
  const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true);
  const build = await response.json() as { version: string; commit?: string; detailShapeGenerator?: { sha256: string }; addDetailGenerator?: { sha256: string } };
  expect(build.addDetailGenerator?.sha256, 'Requires the actual newly built additive source; preview.7 has no add recipe').toMatch(/^[a-f0-9]{64}$/);
  expect(build.detailShapeGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  const touch = info.project.name !== 'desktop-chromium', errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('两片山海 · 原生追加');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('fine-native-additive');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256'); await click(page, '新建空白海洋草稿'); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!;
  await panel(page, '创世'); await page.getByLabel('地貌种子', { exact: true }).fill('fine-native-additive');
  await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await draw(page, firstContour, touch); await click(page, '确认生成并保存'); await ready(page);
  const first = await saved(page, id, 4), firstField = await durableField(page, id);
  expect(first.root.revision).toBe(1); expect(first.manifest.generation.lastApplied?.recipe.generator).toEqual({ id: 'shape-detail-landmass', version: 1, fingerprint: build.detailShapeGenerator!.sha256 });
  const firstPicks = await observeFirstCoast(page, firstField, touch), beforePreview = await databaseDigest(page, 4);

  await draw(page, secondContour, touch); const secondPreview = await audit(page);
  await expect(preview(page)).toContainText('本次新增陆地'); expect(await saved(page, id, 4)).toEqual(first); expect(await databaseDigest(page, 4)).toEqual(beforePreview);
  await panel(page, '地图'); await frameReady(page); await page.screenshot({ path: info.outputPath('second-continent-preview.png'), fullPage: true });
  await panel(page, '创世'); await click(page, '确认生成并保存'); await ready(page);
  const second = await saved(page, id, 4), secondField = await durableField(page, id);
  expect(second.root).toMatchObject({ revision: 2, currentManifest: secondPreview.display.manifestDigest, backupManifest: first.root.currentManifest });
  expect(second.manifest.generation.lastApplied?.recipe.generator).toEqual({ id: 'add-detail-landmass', version: 1, fingerprint: build.addDetailGenerator!.sha256 });
  firstContinentPreserved(firstField, secondField); expect(secondField.refs.length).toBeGreaterThan(firstField.refs.length);

  // Undo before navigation/reload, while the real transaction history exists.
  await click(page, '撤销大世界编辑'); await ready(page);
  const undone = await saved(page, id, 4), undoneField = await durableField(page, id);
  expect(undone.root).toMatchObject({ revision: 3, backupManifest: second.root.currentManifest });
  expect(undone.manifest.blockRefs).toEqual(first.manifest.blockRefs); expect(undone.manifest.generation.lastApplied).toEqual(first.manifest.generation.lastApplied);
  expect(undoneField).toEqual(firstField);
  await draw(page, secondContour, touch); await click(page, '确认生成并保存'); await ready(page);
  const repeated = await saved(page, id, 4), repeatedField = await durableField(page, id);
  expect(repeated.root).toMatchObject({ revision: 4, backupManifest: undone.root.currentManifest });
  firstContinentPreserved(firstField, repeatedField); expect(repeatedField).toEqual(secondField);
  expect(repeated.manifest.generation.lastApplied?.recipe.generator.fingerprint).toBe(build.addDetailGenerator!.sha256);
  await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(repeated); expect(await durableField(page, id)).toEqual(repeatedField);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 4, revision: 4, manifestDigest: repeated.root.currentManifest });
  const restoredPicks = await observeFirstCoast(page, firstField, touch);
  await panel(page, '地图'); await click(page, '全图'); await frameReady(page); await page.screenshot({ path: info.outputPath('two-continents-restored.png'), fullPage: true });

  await panel(page, '创世');
  await expect(page.getByLabel('地貌种子', { exact: true })).toHaveValue('fine-native-additive');
  await expect(page.getByLabel('近岸岛链', { exact: true })).toHaveValue('0');
  const beforeOverlap = await databaseDigest(page, 4); await draw(page, firstContour, touch, true);
  const rejection = await page.getByRole('alert').textContent(); expect(await saved(page, id, 4)).toEqual(repeated);
  expect(await databaseDigest(page, 4)).toEqual(beforeOverlap); // Includes actual main/backup roots, manifests and content stores.
  expect((await audit(page)).display.manifestDigest).toBe(repeated.root.currentManifest);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  await info.attach('additive-persistence-observation.json', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, input: touch ? 'native CDP touch + touchscreen taps' : 'native mouse', actualBuild: build,
    first: { root: first.root, sampleTiles: firstField.sampledTiles, refs: firstField.refs, protectedHeightRegion: firstField.firstRegionHeightSha256 },
    second: { root: second.root, refs: secondField.refs }, undo: undone.root, repeated: repeated.root,
    firstPicks, restoredPicks, rejection, unchangedAfterRejection: beforeOverlap,
    scope: 'Actual UI and read-only stored-field observation. Browser emulation only; no physical-device, natural-visual or performance acceptance.'
  }, null, 2) });
});
