import { test, expect, type Page } from '@playwright/test';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';

// Staged for tests/atlas-local-relief.spec.ts. Actual UI input and read-only
// durable bytes only. No production generator, geometry or state setter imports.
const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
const preview = (p: Page) => p.getByRole('region', { name: '山地生成预览' });
type XY = { x: number; y: number };
const contour = [[860, 1050], [1260, 810], [2020, 980], [2440, 1300], [2890, 1460], [3070, 1890], [2620, 2260], [2240, 2050], [1990, 2420], [1460, 2580], [1210, 2020], [780, 1840], [650, 1480]].map(([x, y]) => ({ x, y }));

async function frameReady(p: Page) {
  await expect.poll(async () => {
    const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>;
    return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready';
  }, { timeout: 120000 }).toBe(true);
}
async function screen(p: Page, points: XY[]) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, m = await metrics(p);
  return points.map(q => ({ x: box.x + m.camera.x + q.x * m.camera.scale, y: box.y + m.camera.y + q.y * m.camera.scale }));
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

/** Every current coarse/lock/fine record is fetched from actual readonly IDB
 * and checked against its content address. Coverage is canonicalized across
 * missing sea/uniform land/materialized samples, so a representation change
 * cannot hide a changed coverage value or create a false coverage mismatch. */
async function durableField(p: Page, id: string) {
  return p.evaluate(async id => {
    type Ref = { bx: number; by: number; hash: string };
    type Manifest = { version: number; spec: { columns: number; rows: number }; blockRefs: { key: string; hash: string }[]; constraints: { lockRefs: Ref[] }; detailCoast: { refs: Ref[] } };
    type Row = { kind: 'coarse' | 'lock' | 'fine'; key?: string; bx?: number; by?: number; hash: string; bytes: Uint8Array };
    const { manifest, records, manifestBytes, manifestHash } = await new Promise<{ manifest: Manifest; records: Row[]; manifestBytes: Uint8Array; manifestHash: string }>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
        let manifest: Manifest, manifestBytes: Uint8Array, manifestHash: string; const records: Row[] = [];
        const root = tx.objectStore('roots').get(id);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          manifestHash = JSON.parse(new TextDecoder().decode(root.result)).currentManifest;
          const read = tx.objectStore('manifests').get(manifestHash);
          read.onsuccess = () => {
            if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            manifestBytes = read.result.bytes; manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
            if (manifest.version !== 4 || !manifest.detailCoast || !manifest.constraints) { tx.abort(); return; }
            const refs = [...manifest.blockRefs.map(ref => ({ ...ref, kind: 'coarse' as const })), ...manifest.constraints.lockRefs.map(ref => ({ ...ref, kind: 'lock' as const })), ...manifest.detailCoast.refs.map(ref => ({ ...ref, kind: 'fine' as const }))];
            for (const ref of refs) {
              const block = tx.objectStore('blocks').get(ref.hash);
              block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
            }
          };
        };
        tx.oncomplete = () => { db.close(); resolve({ manifest, records, manifestBytes, manifestHash }); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual v4 durable record')); };
      };
    });
    const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    const textDigest = (value: unknown) => digest(new TextEncoder().encode(JSON.stringify(value)));
    if (await digest(manifestBytes) !== manifestHash) throw new Error('Manifest bytes differ from durable root hash');
    const tiles = new Map<string, { bx: number; by: number; mode: number; coverage: number[]; heights: number[]; coverageIdentity: string; heightHash: string; hash: string }>();
    const coarse: { key: string; hash: string }[] = [], locks: Ref[] = [];
    for (const r of records) {
      if (await digest(r.bytes) !== r.hash) throw new Error(`Content hash mismatch in ${r.kind}`);
      if (r.kind === 'coarse') { coarse.push({ key: r.key!, hash: r.hash }); continue; }
      if (r.kind === 'lock') { locks.push({ bx: r.bx!, by: r.by!, hash: r.hash }); continue; }
      const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), bx = r.bx!, by = r.by!, count = v.getUint16(8, true), expected = (bx ? 32 : 33) * (by ? 32 : 33);
      if ([76, 71, 68, 67, 1].some((x, i) => b[i] !== x) || b[6] !== bx || b[7] !== by || b.slice(10, 16).some(Boolean) || b[5] > 1 || count !== (b[5] ? expected : 0) || b.length !== 16 + count * 4 || tiles.has(`${bx}:${by}`)) throw new Error('Malformed or duplicate fine owner');
      const coverage: number[] = [], heights: number[] = [];
      for (let i = 0; i < count; i++) {
        const c = v.getInt16(16 + i * 2, true), h = v.getInt16(16 + count * 2 + i * 2, true);
        if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h >= 0 || c === 0 && h !== 0) throw new Error('Stored fine coverage/height mismatch');
        coverage.push(c); heights.push(h);
      }
      const coverageIdentity = !b[5] || coverage.every(c => c === 32767) ? 'land' : coverage.every(c => c === -32767) ? 'sea' : await digest(b.slice(16, 16 + count * 2));
      tiles.set(`${bx}:${by}`, { bx, by, mode: b[5], coverage, heights, coverageIdentity, heightHash: b[5] ? await digest(b.slice(16 + count * 2)) : 'implicit-base', hash: r.hash });
    }
    coarse.sort((a, b) => a.key.localeCompare(b.key)); locks.sort((a, b) => a.by - b.by || a.bx - b.bx);
    if (coarse.length !== 4 * (manifest.spec.columns / 32) * (manifest.spec.rows / 32) || new Set(coarse.map(r => r.key)).size !== coarse.length) throw new Error('Incomplete coarse blocks');
    const coverageIdentity: string[] = [];
    for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) coverageIdentity.push(tiles.get(`${bx}:${by}`)?.coverageIdentity ?? 'sea');
    const sample = (x: number, y: number) => {
      const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
      if (!tile?.mode) return null; // Probe only raw stored nodes, never an inferred Hbase height.
      const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
      return { coverage: tile.coverage[slot], height: tile.heights[slot] };
    };
    let probe: { x: number; y: number; cellId: number; minimumHeight: number; maximumHeight: number; rank: number } | null = null;
    const step = 4096 / manifest.spec.columns;
    for (const tile of tiles.values()) if (tile.mode) for (let y = tile.by * 32; y < tile.by * 32 + 32; y++) for (let x = tile.bx * 32; x < tile.bx * 32 + 32; x++) {
      const q = [sample(x, y), sample(x + 1, y), sample(x + 1, y + 1), sample(x, y + 1)];
      if (q.some(s => !s || s.coverage < 2048)) continue;
      const values = q.map(s => s!), px = x * 2 + 1, py = y * 2 + 1, rank = (px - 1150) ** 2 + (py - 1480) ** 2;
      if (!probe || rank < probe.rank) probe = { x: px, y: py, cellId: Math.floor(py / step) * manifest.spec.columns + Math.floor(px / step), minimumHeight: Math.min(...values.map(v => v.height)), maximumHeight: Math.max(...values.map(v => v.height)), rank };
    }
    if (!probe) throw new Error('Actual continent lacks a four-stored-node interior land probe');
    return { coarse, locks, coarseHash: await textDigest(coarse), lockHash: await textDigest(locks), coverageHash: await textDigest(coverageIdentity),
      fine: [...tiles.values()].sort((a, b) => a.by - b.by || a.bx - b.bx).map(t => ({ bx: t.bx, by: t.by, mode: t.mode, hash: t.hash, coverageIdentity: t.coverageIdentity, heightHash: t.heightHash })), probe };
  }, id);
}
type Field = Awaited<ReturnType<typeof durableField>>;
function protectedDataEqual(before: Field, after: Field) {
  expect(after.coarse).toEqual(before.coarse); expect(after.coarseHash).toBe(before.coarseHash);
  expect(after.locks).toEqual(before.locks); expect(after.lockHash).toBe(before.lockHash);
  expect(after.coverageHash).toBe(before.coverageHash);
}
function changedStoredHeightTiles(before: Field, after: Field) {
  return before.fine.filter(a => a.mode === 1).flatMap(a => {
    const b = after.fine.find(b => b.bx === a.bx && b.by === a.by);
    return b?.mode === 1 && b.coverageIdentity === a.coverageIdentity && b.heightHash !== a.heightHash ? [{ bx: a.bx, by: a.by, before: a.heightHash, after: b.heightHash }] : [];
  });
}
async function pickLand(p: Page, point: Field['probe'], touch: boolean) {
  await panel(p, '地图'); await click(p, '全图'); await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, zoomMaximum = Math.min(box.width, box.height) / 4096 * .9 * 80, zoomTarget = Math.min(2, zoomMaximum);
  for (let i = 0; i < 16 && (await metrics(p)).camera.scale < zoomTarget - 1e-9; i++) {
    const before = (await metrics(p)).camera.scale; await click(p, '放大大世界地图'); await frameReady(p); expect((await metrics(p)).camera.scale).toBeGreaterThan(before);
  }
  expect((await metrics(p)).camera.scale).toBeGreaterThanOrEqual(zoomTarget - 1e-9);
  await panel(p, '编辑'); await p.getByLabel('定位地块编号', { exact: true }).fill(String(point.cellId)); await click(p, '定位');
  await panel(p, '地图'); await frameReady(p);
  const frame = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [point]))[0];
  const center = { x: frame.x + frame.width * .5, y: frame.y + frame.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  await gesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  await frameReady(p); const target = (await screen(p, [point]))[0]; await assertCanvasPoints(p, [target]);
  if (touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
  await expect(p.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', 'land');
  await panel(p, '编辑'); await expect(p.getByRole('button', { name: '仅重生成山地', exact: true })).toBeEnabled(); await click(p, '仅重生成山地');
  return { world: { x: point.x, y: point.y }, screen: target, zoomTarget, zoomMaximum, actualScale: (await metrics(p)).camera.scale };
}
async function localPreview(p: Page) {
  await panel(p, '创世'); await click(p, '预览山地变化'); await expect(preview(p)).toBeVisible({ timeout: 120000 }); await ready(p);
  const changedNodes = Number((await p.getByTestId('local-relief-changed-nodes').innerText()).replaceAll(',', ''));
  expect(changedNodes).toBeGreaterThan(0); await expect(p.getByRole('button', { name: '确认生成并保存', exact: true }).filter({ visible: true })).toBeEnabled();
  return { changedNodes, audit: await audit(p) };
}

test('[detail-v4-local-relief] native saved continent, land selection, private cancel, real height edit, undo and reload', async ({ page }, info) => {
  // One first-continent generation and three local previews. No timeout inflation,
  // retries, reload loops or application state injection to make this flow pass.
  test.setTimeout(450000);
  const began = Date.now(), response = await page.request.get('/build.json'); expect(response.ok()).toBe(true);
  const build = await response.json() as { version: string; naturalDetailGenerator: { sha256: string }; localDetailReliefGenerator?: { sha256: string } };
  expect(build.localDetailReliefGenerator?.sha256, 'Actual build must include the implemented local generator').toMatch(/^[a-f0-9]{64}$/);
  const errors: string[] = [], touch = info.project.name !== 'desktop-chromium';
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('本地山河 · 真实选区');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('fine-local-relief-native');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256'); await click(page, '新建空白海洋草稿'); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!;
  await panel(page, '创世'); await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  await page.getByLabel('地貌种子', { exact: true }).fill('fine-local-relief-native'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await click(page, '画大陆'); await click(page, '全图'); await frameReady(page); await gesture(page, await screen(page, [...contour, contour[0]]), touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page); await click(page, '确认生成并保存'); await ready(page);
  const first = await saved(page, id, 4), firstField = await durableField(page, id);
  expect(first.root.revision).toBe(1); expect(first.manifest.generation.lastApplied?.recipe.generator).toEqual({ id: 'shape-detail-landmass', version: 2, fingerprint: build.naturalDetailGenerator.sha256 });
  const selection = await pickLand(page, firstField.probe, touch);
  await page.getByLabel('局部山地种子', { exact: true }).fill('local-relief-native-change'); await page.getByLabel('局部山地起伏', { exact: true }).fill('3600');
  await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  const beforePreview = await databaseDigest(page, 4), canceled = await localPreview(page);
  expect(await saved(page, id, 4)).toEqual(first); expect(await databaseDigest(page, 4)).toEqual(beforePreview);
  await click(page, '取消生成'); await ready(page); await expect(preview(page)).toHaveCount(0);
  expect(await saved(page, id, 4)).toEqual(first); expect(await databaseDigest(page, 4)).toEqual(beforePreview);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', manifestDigest: first.root.currentManifest });

  const candidate = await localPreview(page);
  expect(candidate.audit.display.manifestDigest).toBe(canceled.audit.display.manifestDigest); expect(candidate.changedNodes).toBe(canceled.changedNodes);
  await panel(page, '地图'); await frameReady(page); await page.screenshot({ path: info.outputPath('local-relief-preview.png'), fullPage: true });
  await panel(page, '创世'); await click(page, '确认生成并保存'); await ready(page);
  const edited = await saved(page, id, 4), editedField = await durableField(page, id);
  expect(edited.root).toMatchObject({ revision: 2, currentManifest: candidate.audit.display.manifestDigest, backupManifest: first.root.currentManifest });
  expect(edited.manifest.generation.lastApplied?.recipe).toMatchObject({ generator: { id: 'local-detail-relief', version: 1, fingerprint: build.localDetailReliefGenerator!.sha256 }, seed: 'local-relief-native-change', parameters: { reliefMeters: 3600 } });
  expect(edited.manifest.blockRefs).toEqual(first.manifest.blockRefs); expect(edited.manifest.constraints).toEqual(first.manifest.constraints);
  protectedDataEqual(firstField, editedField); const changedHeights = changedStoredHeightTiles(firstField, editedField); expect(changedHeights.length).toBeGreaterThan(0);

  await click(page, '撤销大世界编辑'); await ready(page);
  const undone = await saved(page, id, 4), undoneField = await durableField(page, id);
  expect(undone.root).toMatchObject({ revision: 3, backupManifest: edited.root.currentManifest });
  expect(undone.manifest.blockRefs).toEqual(first.manifest.blockRefs); expect(undone.manifest.constraints).toEqual(first.manifest.constraints); expect(undone.manifest.generation).toEqual(first.manifest.generation);
  expect(undoneField).toEqual(firstField);
  const repeatedPreview = await localPreview(page); expect(repeatedPreview.changedNodes).toBe(candidate.changedNodes);
  await click(page, '确认生成并保存'); await ready(page);
  const repeated = await saved(page, id, 4), repeatedField = await durableField(page, id);
  expect(repeated.root).toMatchObject({ revision: 4, currentManifest: repeatedPreview.audit.display.manifestDigest, backupManifest: undone.root.currentManifest });
  expect(repeatedField).toEqual(editedField); protectedDataEqual(firstField, repeatedField);
  await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(repeated); expect(await durableField(page, id)).toEqual(repeatedField);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 4, revision: 4, manifestDigest: repeated.root.currentManifest });
  await panel(page, '创世'); await expect(page.getByLabel('局部山地种子', { exact: true })).toHaveValue('local-relief-native-change'); await expect(page.getByLabel('局部山地起伏', { exact: true })).toHaveValue('3600'); await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  await panel(page, '地图'); await click(page, '全图'); await frameReady(page); await page.screenshot({ path: info.outputPath('local-relief-restored.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  await info.attach('local-relief-observation.json', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, elapsedMs: Date.now() - began, input: touch ? 'native CDP touch and touchscreen tap' : 'native mouse', actualBuild: build,
    selection, first: first.root, canceledPreview: canceled, committed: edited.root, undo: undone.root, repeated: repeated.root,
    protected: { coarseBlockCount: firstField.coarse.length, coarseHash: firstField.coarseHash, coverageHash: firstField.coverageHash, lockCount: firstField.locks.length, lockHash: firstField.lockHash },
    changedStoredHeightTiles: changedHeights, changedNodesInPreview: candidate.changedNodes,
    scope: 'Actual UI + all current coarse/lock hashes + all fine coverage semantics + changed stored fine height bytes. Empty lock sets, if observed, do not prove a populated lock conflict. Emulated devices only; no natural visual or performance acceptance.'
  }, null, 2) });
});
