import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { terrainImportFixture } from '../src/world/terrain-import.fixture';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import { persistedCountry } from './helpers/country-readonly';

test.describe.configure({ retries: 0 });
test.use({ actionTimeout: 30000 });
const atlas = (page: Page) => page.getByTestId('atlas-studio');
const ready = (page: Page, state = 'ready') => expect(atlas(page)).toHaveAttribute('data-atlas-state', state, { timeout: 180000 });
async function databaseState(page: Page) {
  const exists = await page.evaluate(async () => (await indexedDB.databases()).some(database => database.name === 'lieguoji-atlas-drafts-v4'));
  return exists ? databaseDigest(page, 4) : null;
}
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
async function choose(page: Page, buffer: Uint8Array, touch: boolean) {
  await tab(page, '草稿', touch);
  await press(page, '导入研究地形 JSON', touch);
  await page.getByLabel('导入地形草稿名称', { exact: true }).fill('合成研究岛 · 独立草稿');
  await page.getByLabel('选择研究地形 JSON', { exact: true }).setInputFiles({ name: 'synthetic-terrain.json', mimeType: 'application/json', buffer: Buffer.from(buffer) });
  await expect(page.getByTestId('terrain-import-map')).toHaveAttribute('data-import-display', 'ready', { timeout: 180000 });
}

test('[terrain-import] real file preview, cancel, independent save, edit, country and refresh', async ({ page }, info) => {
  test.setTimeout(900000);
  const touch = !!info.project.use.hasTouch, errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  const build = await page.request.get('/build.json'); expect(build.ok()).toBe(true); const buildBytes = await build.body();
  if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(buildBytes).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  await info.attach('build.json', { body: buildBytes, contentType: 'application/json' });
  const fixture = await terrainImportFixture();
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  // A malformed local file never creates or switches a draft.
  await press(page, '导入研究地形 JSON', touch);
  await page.getByLabel('选择研究地形 JSON', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"unknown"}') });
  await expect(page.getByRole('alert')).toContainText('无效', { timeout: 30000 });
  await press(page, '取消导入', touch); await ready(page, 'empty');
  expect(await atlas(page).getAttribute('data-atlas-id')).toBe('');
  // New preview can be cancelled back to a genuinely empty main scene.
  const emptyDigest = await databaseState(page);
  await choose(page, fixture.bytes, touch); await press(page, '放大导入地图', touch);
  await page.screenshot({ path: info.outputPath('import-preview-before-save.png'), fullPage: true });
  expect(await databaseState(page)).toEqual(emptyDigest);
  await press(page, '取消导入', touch); await ready(page, 'empty');
  await expect(page.getByTestId('terrain-import-map')).toHaveCount(0); expect(await databaseState(page)).toEqual(emptyDigest);
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('保留的原始海洋');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  await press(page, '新建空白海洋草稿', touch); await ready(page);
  const originalId = (await atlas(page).getAttribute('data-atlas-id'))!, original = await saved(page, originalId, 4);
  await choose(page, fixture.bytes, touch);
  expect(await saved(page, originalId, 4)).toEqual(original); expect(await atlas(page).getAttribute('data-atlas-id')).toBe(originalId);
  const candidateId = (await page.getByTestId('terrain-import-map').getAttribute('data-import-draft'))!;
  await press(page, '确认导入并保存新草稿', touch);
  await expect(page.getByRole('alertdialog')).toHaveCount(0, { timeout: 180000 }); await ready(page);
  await expect(atlas(page)).toHaveAttribute('data-atlas-id', candidateId); await expect(atlas(page)).toHaveAttribute('data-atlas-revision', '0');
  const imported = await saved(page, candidateId, 4);
  expect(imported.manifest.version).toBe(4); expect(imported.manifest.generation.lastApplied).toBeNull();
  expect(await saved(page, originalId, 4)).toEqual(original);
  const recordDownload = page.waitForEvent('download'); await press(page, '保存导入记录', touch);
  const record = await recordDownload; await record.saveAs(info.outputPath('terrain-import-record.json'));
  await page.reload(); await ready(page); expect(await saved(page, candidateId, 4)).toEqual(imported);
  const displayed = await audit(page); expect(displayed.draftId).toBe(candidateId); expect(displayed.manifestDigest).toBe(imported.root.currentManifest);
  // Use existing local relief UI against the converted real land.
  await tab(page, '地图', touch); await press(page, '全图', touch); await pick(page, 2048, 2048, touch);
  await press(page, '仅重生成山地', touch); await page.getByText('精确调整范围', { exact: true }).click();
  await page.getByLabel('山地选区起始列', { exact: true }).fill('60'); await page.getByLabel('山地选区起始行', { exact: true }).fill('60');
  await page.getByLabel('山地过渡宽度', { exact: true }).fill('1'); await page.getByLabel('山地选区宽度', { exact: true }).fill('8'); await page.getByLabel('山地选区高度', { exact: true }).fill('8');
  await page.getByLabel('局部山地种子', { exact: true }).fill('import-follow-up-relief');
  await press(page, '预览山地变化', touch); await expect(page.getByRole('region', { name: '山地生成预览' })).toBeVisible({ timeout: 180000 });
  await press(page, '确认生成并保存', touch); await ready(page); await expect(atlas(page)).toHaveAttribute('data-atlas-revision', '1');
  const edited = await saved(page, candidateId, 4); expect(edited.root.currentManifest).not.toBe(imported.root.currentManifest);
  await page.reload(); await ready(page); expect(await saved(page, candidateId, 4)).toEqual(edited);
  // Country creation remains a separate persistent world, not an empty imported panel.
  await tab(page, '草稿', touch); await press(page, '在这片地形上建国', touch);
  await page.getByLabel('建国世界名称', { exact: true }).fill('研究岛列国'); await press(page, '创建独立建国副本', touch);
  const country = page.getByTestId('country-studio'); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 180000 });
  const worldId = (await country.getAttribute('data-country-world-id'))!;
  await page.getByRole('navigation', { name: '建国世界工具' }).getByRole('button', { name: '国家', exact: true }).click();
  await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('研究岛国');
  await press(page, '在地图上选择国土', touch); await pick(page, 1920, 1920, touch); await pick(page, 2180, 2180, touch);
  await press(page, '预览建国', touch); await expect(page.getByRole('region', { name: '建国操作预览' })).toBeVisible({ timeout: 120000 });
  await press(page, '确认并保存', touch); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 120000 });
  const nation = await persistedCountry(page, worldId); expect(nation.document.nations[0].name).toBe('研究岛国');
  await page.reload(); await expect(country).toHaveAttribute('data-country-state', 'ready', { timeout: 180000 });
  expect(await persistedCountry(page, worldId)).toEqual(nation); expect(await saved(page, originalId, 4)).toEqual(original); expect(await saved(page, candidateId, 4)).toEqual(edited);
  await page.screenshot({ path: info.outputPath('imported-country-restored.png'), fullPage: true });
  expect(errors).toEqual([]); expect(writes).toEqual([]);
  await info.attach('import-evidence.json', { body: JSON.stringify({ originalId, candidateId, worldId, sourceSha256: createHash('sha256').update(fixture.bytes).digest('hex'), imported: imported.root, edited: edited.root, countryRevision: nation.document.revision, errors, writes }), contentType: 'application/json' });
});
