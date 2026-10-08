import { test, expect, type Page, type TestInfo, type Request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, metrics, saved, databaseDigest, type SavedManifest } from './helpers/atlas-shape-readonly';
import { persistedCountry } from './helpers/country-readonly';

test.describe.configure({ retries: 0 });
test.use({ actionTimeout: 30000 });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const atlas = (page: Page) => page.getByTestId('atlas-studio');
const ready = (page: Page, state = 'ready') => expect(atlas(page)).toHaveAttribute('data-atlas-state', state, { timeout: 180000 });
async function press(page: Page, name: string, touch: boolean) {
  const button = page.getByRole('button', { name, exact: true }).filter({ visible: true });
  if (touch) await button.tap(); else await button.click();
}
async function tab(page: Page, name: string, touch: boolean) {
  const button = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true });
  if (touch) await button.tap(); else await button.click();
}
async function pick(page: Page, x: number, y: number, touch: boolean) {
  const box = (await page.getByTestId('atlas-canvas').boundingBox())!, view = await metrics(page);
  const point = { x: box.x + view.camera.x + x * view.camera.scale, y: box.y + view.camera.y + y * view.camera.scale };
  expect(await page.evaluate(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid'), point)).toBe('atlas-canvas');
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
async function generatePreview(page: Page, touch: boolean) {
  await press(page, '按模板生成新世界', touch);
  await page.getByLabel('模板世界名称', { exact: true }).fill('群岛列国 · 种子试玩');
  await page.getByLabel('模板世界种子', { exact: true }).fill('421730');
  await page.getByRole('radio', { name: '地貌模板 群岛', exact: true }).check();
  await press(page, '生成预览', touch);
  await expect(page.getByTestId('seed-terrain-map')).toHaveAttribute('data-seed-display', 'ready', { timeout: 240000 });
}
async function recordDownload(page: Page, info: TestInfo, touch: boolean, name: string) {
  const pending = page.waitForEvent('download'); await press(page, '保存创世记录', touch);
  const download = await pending, path = info.outputPath(name); await download.saveAs(path);
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

/** Read existing persisted elevation bytes only. The test chooses actual high
 * ground for UI interaction without importing generators or injecting state. */
async function highGround(page: Page, manifest: SavedManifest) {
  return page.evaluate(async manifest => {
    const refs = manifest.blockRefs.filter(ref => ref.key.startsWith('elevation:'));
    const blocks = await new Promise<{ key: string; hash: string; bytes: Uint8Array }[]>((resolve, reject) => {
      const opening = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      opening.onupgradeneeded = () => opening.transaction!.abort(); opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction('blocks', 'readonly'), result: { key: string; hash: string; bytes: Uint8Array }[] = [];
        for (const ref of refs) { const read = tx.objectStore('blocks').get(ref.hash); read.onsuccess = () => {
          if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
          result.push({ ...ref, bytes: read.result.bytes });
        }; }
        tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing saved elevation')); };
      };
    });
    let best: { column: number; row: number; x: number; y: number; meters: number } | null = null;
    for (const block of blocks) {
      const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(block.bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (checksum !== block.hash) throw new Error('Persisted elevation checksum mismatch');
      const [, rawX, rawY] = block.key.split(':'), bx = Number(rawX), by = Number(rawY), view = new DataView(block.bytes.buffer, block.bytes.byteOffset, block.bytes.byteLength);
      if (block.bytes.length !== 4124 || block.bytes[6] !== 1 || view.getUint32(20, true) !== 1024) throw new Error('Unexpected elevation block format');
      for (let index = 0; index < 1024; index++) {
        const column = bx * 32 + index % 32, row = by * 32 + Math.floor(index / 32), meters = view.getInt32(28 + index * 4, true);
        if (column < 5 || row < 5 || column >= 123 || row >= 123 || meters < 500 || best && best.meters >= meters) continue;
        best = { column, row, x: (column + 0.5) * 32, y: (row + 0.5) * 32, meters };
      }
    }
    if (!best) throw new Error('Generated terrain has no measured high ground for editing'); return best;
  }, manifest);
}

test('[seed-terrain] bundled creation, cancel, independent save, record lifecycle, edit and country', async ({ page }, info) => {
  test.setTimeout(900000);
  if (process.env.GAME_BASE_URL && !process.env.GAME_BUILD_DIR) throw new Error('seed-terrain requires GAME_BUILD_DIR bound to the build served by GAME_BASE_URL');
  const buildDirectory = process.env.GAME_BUILD_DIR ? resolve(process.env.GAME_BUILD_DIR) : fileURLToPath(new URL('../dist/', import.meta.url));
  const touch = !!info.project.use.hasTouch, errors: string[] = [], requests: { method: string; url: string; type: string }[] = [], workerUrls: string[] = [];
  const assets = new Map<string, { url: string; status: number; sha256: string; bytes: number }>(), pendingAssets: Promise<void>[] = [], assetFailures: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  page.on('request', request => requests.push({ method: request.method(), url: request.url(), type: request.resourceType() }));
  page.on('worker', worker => workerUrls.push(worker.url()));
  const requestedAssets = new Set<string>();
  const auditAsset = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (!/^\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(path) || requestedAssets.has(path)) return;
    requestedAssets.add(path);
    pendingAssets.push((async () => {
      const response = await request.response();
      if (!response) throw new Error(`Asset request failed without a response: ${request.url()}`);
      const body = await response.body(), local = await readFile(resolve(buildDirectory, path.slice(1)));
      expect(response.ok(), path).toBe(true); expect(hash(body), path).toBe(hash(local));
      assets.set(path, { url: response.url(), status: response.status(), sha256: hash(body), bytes: body.length });
    })().catch(error => { assetFailures.push(error); }));
  };
  page.on('request', auditAsset);
  const buildResponse = await page.request.get('/build.json'); expect(buildResponse.ok()).toBe(true);
  const buildBytes = await buildResponse.body(), build = JSON.parse(buildBytes.toString('utf8'));
  expect(hash(buildBytes)).toBe(hash(await readFile(resolve(buildDirectory, 'build.json'))));
  const expectedBuild = process.env.SEED_TERRAIN_EXPECTED_BUILD_SHA256 ?? process.env.COUNTRY_EXPECTED_BUILD_SHA256;
  if (expectedBuild) expect(hash(buildBytes)).toBe(expectedBuild);
  expect(build.seedTerrainGenerator.id).toBe('recovered-height-square-v1'); expect(build.seedTerrainGenerator.sha256).toMatch(/^[0-9a-f]{64}$/);
  await info.attach('build.json', { body: buildBytes, contentType: 'application/json' });

  // An existing real UI-created world remains in storage while a new empty
  // studio performs the complete generation/cancel/save flow.
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('原始海洋 · 保留不变');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  await press(page, '新建空白海洋草稿', touch); await ready(page);
  const originalId = (await atlas(page).getAttribute('data-atlas-id'))!, original = await saved(page, originalId, 4);
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  const beforePreview = await databaseDigest(page, 4);
  await generatePreview(page, touch);
  await page.screenshot({ path: info.outputPath('seed-preview.png'), fullPage: true });
  expect(await databaseDigest(page, 4)).toEqual(beforePreview);
  await press(page, '取消', touch); await expect(page.getByRole('alertdialog')).toHaveCount(0); await ready(page, 'empty');
  expect(await databaseDigest(page, 4)).toEqual(beforePreview); await expect(atlas(page)).toHaveAttribute('data-atlas-id', '');

  await generatePreview(page, touch);
  const preview = page.getByTestId('seed-terrain-map'), candidateId = (await preview.getAttribute('data-seed-draft'))!, sourceSha256 = (await preview.getAttribute('data-seed-source'))!;
  expect(candidateId).not.toBe(originalId); expect(await saved(page, originalId, 4)).toEqual(original);
  await press(page, '保存新世界', touch); await expect(page.getByRole('alertdialog')).toHaveCount(0, { timeout: 240000 }); await ready(page);
  await expect(atlas(page)).toHaveAttribute('data-atlas-id', candidateId); await expect(atlas(page)).toHaveAttribute('data-atlas-revision', '0');
  const created = await saved(page, candidateId, 4);
  expect(created.manifest.version).toBe(4); expect(created.manifest.generation.lastApplied).toBeNull(); expect(await saved(page, originalId, 4)).toEqual(original);
  const firstRecord = await recordDownload(page, info, touch, 'seed-creation-record.json');
  expect(firstRecord.value).toMatchObject({ format: 'lieguoji-seed-terrain-record', version: 1,
    generation: { generatorId: build.seedTerrainGenerator.id, fingerprint: build.seedTerrainGenerator.sha256, sourceSha256,
      request: { seed: '421730', template: 'archipelago', layout: 'square-v1' } },
    identity: { draftId: candidateId, sourceSha256 }, summary: { pointCount: 36864, triangleCount: 72962, width: 1536, height: 1536,
      mapping: { offsetX: 0, offsetY: 0, width: 4096, height: 4096, seaLevel: 20 } },
    receipt: { draftId: candidateId, committed: true, baseRoot: null, manifestDigest: created.root.currentManifest } });
  // Closing/switching a panel must not drop the just-created record.
  await tab(page, '地图', touch); await tab(page, '创世', touch);
  expect((await recordDownload(page, info, touch, 'seed-record-after-creation-tab.json')).bytes).toEqual(firstRecord.bytes);
  await tab(page, '草稿', touch);
  expect((await recordDownload(page, info, touch, 'seed-record-after-drafts-tab.json')).bytes).toEqual(firstRecord.bytes);
  await page.screenshot({ path: info.outputPath('seed-saved-record.png'), fullPage: true });
  await page.reload(); await ready(page); expect(await saved(page, candidateId, 4)).toEqual(created);
  const displayed = await audit(page); expect(displayed.draftId).toBe(candidateId); expect(displayed.manifestDigest).toBe(created.root.currentManifest);

  // Select high ground measured from stored bytes, then make a real local edit.
  const ground = await highGround(page, created.manifest);
  await tab(page, '地图', touch); await press(page, '全图', touch); await pick(page, ground.x, ground.y, touch);
  await expect(page.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', 'land');
  await press(page, '仅重生成山地', touch); await page.getByText('精确调整范围', { exact: true }).click();
  await page.getByLabel('山地选区起始列', { exact: true }).fill(String(ground.column - 4));
  await page.getByLabel('山地选区起始行', { exact: true }).fill(String(ground.row - 4));
  await page.getByLabel('山地过渡宽度', { exact: true }).fill('1'); await page.getByLabel('山地选区宽度', { exact: true }).fill('8'); await page.getByLabel('山地选区高度', { exact: true }).fill('8');
  await page.getByLabel('局部山地种子', { exact: true }).fill('seed-world-follow-up-relief');
  await press(page, '预览山地变化', touch); await expect(page.getByRole('region', { name: '山地生成预览' })).toBeVisible({ timeout: 180000 });
  await press(page, '确认生成并保存', touch); await ready(page); await expect(atlas(page)).toHaveAttribute('data-atlas-revision', '1');
  const edited = await saved(page, candidateId, 4); expect(edited.root.currentManifest).not.toBe(created.root.currentManifest);
  await page.reload(); await ready(page); expect(await saved(page, candidateId, 4)).toEqual(edited);
  await page.screenshot({ path: info.outputPath('seed-edited-restored.png'), fullPage: true });

  await tab(page, '草稿', touch); await press(page, '在这片地形上建国', touch);
  await page.getByLabel('建国世界名称', { exact: true }).fill('种子群岛列国'); await press(page, '创建独立建国副本', touch);
  const country = page.getByTestId('country-studio'); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 180000 });
  const worldId = (await country.getAttribute('data-country-world-id'))!;
  await page.getByRole('navigation', { name: '建国世界工具' }).getByRole('button', { name: '国家', exact: true }).click();
  await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('山海群岛国');
  await press(page, '在地图上选择国土', touch); await pick(page, ground.x - 64, ground.y - 64, touch); await pick(page, ground.x + 64, ground.y + 64, touch);
  await press(page, '预览建国', touch); await expect(page.getByRole('region', { name: '建国操作预览' })).toBeVisible({ timeout: 120000 });
  await press(page, '确认并保存', touch); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 120000 });
  const nation = await persistedCountry(page, worldId); expect(nation.document.nations[0].name).toBe('山海群岛国'); expect(nation.document.territories.length).toBeGreaterThan(0);
  await page.reload(); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 180000 });
  expect(await persistedCountry(page, worldId)).toEqual(nation); expect(await saved(page, originalId, 4)).toEqual(original); expect(await saved(page, candidateId, 4)).toEqual(edited);
  await page.screenshot({ path: info.outputPath('seed-country-restored.png'), fullPage: true });

  // Seal registration only after the last tested UI operation. Every request
  // already issued is registered, including responses still in flight.
  page.off('request', auditAsset);
  await Promise.all(pendingAssets);
  expect(assetFailures, 'Served build asset integrity failures').toEqual([]);
  expect([...assets.keys()].some(path => path.endsWith('.css'))).toBe(true); expect([...assets.keys()].some(path => path.endsWith('.js'))).toBe(true);
  expect(workerUrls.some(url => /\/assets\/seed-terrain\.worker-.*\.js$/.test(url))).toBe(true);
  expect(workerUrls.some(url => /\/assets\/terrain-import\.worker-.*\.js$/.test(url))).toBe(true);
  const writes = requests.filter(request => !['GET', 'HEAD'].includes(request.method)); expect(writes).toEqual([]); expect(errors).toEqual([]);
  await info.attach('seed-terrain-evidence.json', { body: JSON.stringify({ project: info.project.name, mobileSimulation: touch, realDevice: false,
    buildSha256: hash(buildBytes), seedTerrainGenerator: build.seedTerrainGenerator, originalId, candidateId, worldId, sourceSha256, ground,
    original: original.root, created: created.root, edited: edited.root, countryRevision: nation.document.revision,
    creationRecordSha256: hash(firstRecord.bytes), errors, writes, requests, workerUrls, assets: [...assets.values()] }), contentType: 'application/json' });
});
