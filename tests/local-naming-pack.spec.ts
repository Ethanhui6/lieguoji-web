import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { metrics, saved } from './helpers/atlas-shape-readonly';
import { persistedCountry } from './helpers/country-readonly';

test.describe.configure({ retries: 0 });
const country = (page: Page) => page.getByTestId('country-studio');
const ready = (page: Page) => expect(country(page)).toHaveAttribute('data-country-state', 'ready', { timeout: 120000 });
async function press(page: Page, name: string, touch: boolean) {
  const button = page.getByRole('button', { name, exact: true }).filter({ visible: true });
  if (touch) await button.tap(); else await button.click();
}
async function tab(page: Page, name: string, touch: boolean) {
  const button = page.getByRole('navigation', { name: '建国世界工具' }).getByRole('button', { name, exact: true });
  if (touch) await button.tap(); else await button.click();
}
async function point(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('atlas-canvas').boundingBox())!, view = await metrics(page);
  return { x: box.x + view.camera.x + x * view.camera.scale, y: box.y + view.camera.y + y * view.camera.scale };
}
async function pick(page: Page, x: number, y: number, touch: boolean) {
  const position = await point(page, x, y);
  expect(await page.evaluate(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid'), position)).toBe('atlas-canvas');
  if (touch) await page.touchscreen.tap(position.x, position.y); else await page.mouse.click(position.x, position.y);
}
async function draw(page: Page, touch: boolean) {
  const contour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580], [650, 1300]];
  const points = await Promise.all(contour.map(([x, y]) => point(page, x, y)));
  expect(await page.evaluate(points => points.every(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') === 'atlas-canvas'), points)).toBe(true);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
      for (const position of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...position, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    try { for (const position of points.slice(1)) await page.mouse.move(position.x, position.y); } finally { await page.mouse.up(); }
  }
}
async function confirm(page: Page, touch: boolean) {
  await ready(page); await expect(page.getByRole('region', { name: '建国操作预览' })).toBeVisible();
  await press(page, '确认并保存', touch); await ready(page); await expect(country(page)).toHaveAttribute('data-country-display', 'committed');
}
/** Synthetic names only. No extracted game content is embedded in a test or build. */
function namingFixture() {
  const culture = (id: string, display: string, countries: string[], cities: string[]) => {
    const entries = (names: string[]) => names.map((name, i) => ({ key: `${i}`, name }));
    return { id, displayName: { zh: display, en: id }, color: null, nameOrder: null,
      names: { zh: { countries: entries(countries), cities: entries(cities) }, en: { countries: entries(countries.map((_, i) => `${id} nation ${i}`)), cities: entries(cities.map((_, i) => `${id} city ${i}`)) } },
      sourceFiles: [`Base/Culture/${id}/StateNames.csv`, `Base/Culture/${id}/CityNames.csv`] };
  };
  const cultures = [culture('TestNorth', '河原命名', ['河原国', '北野国'], ['河原城', '临溪']), culture('TestSouth', '海隅命名', ['海隅国'], ['海隅城'])];
  return { format: 'world-culture-content-pack', version: 1, source: { label: '合成验收命名包', files: cultures.flatMap(culture => culture.sourceFiles.map(path => ({ path, sha256: 'a'.repeat(64), bytes: 64 }))) }, cultures };
}

test('[local-naming-pack] local import, selected names, cancellation and real Worker persistence', async ({ page }, info) => {
  test.setTimeout(600000);
  const touch = !!info.project.use.hasTouch, errors: string[] = [], remoteWrites: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) remoteWrites.push(request.method() + ' ' + request.url()); });
  const build = await page.request.get('/build.json'); expect(build.ok()).toBe(true); const buildBytes = await build.body();
  await info.attach('actual-build.json', { body: buildBytes, contentType: 'application/json' });
  if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(buildBytes).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  // Each Playwright context starts empty. Create geography through the native UI.
  await page.goto('/?atlas=new&atlas-format=4'); const atlas = page.getByTestId('atlas-studio');
  await expect(atlas).toHaveAttribute('data-atlas-state', 'empty', { timeout: 120000 });
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('本地命名 · 隔离地理');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await press(page, '新建空白海洋草稿', touch);
  await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 });
  const sourceId = (await atlas.getAttribute('data-atlas-id'))!;
  const creation = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true });
  if (touch) await creation.tap(); else await creation.click();
  await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await press(page, '画大陆', touch); await press(page, '全图', touch); await draw(page, touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await press(page, '确认生成并保存', touch);
  await expect(atlas).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 }); await expect(atlas).toHaveAttribute('data-atlas-state', 'ready');
  const sourceBefore = await saved(page, sourceId, 4);
  const drafts = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '草稿', exact: true });
  if (touch) await drafts.tap(); else await drafts.click();
  await press(page, '在这片地形上建国', touch); await expect(country(page)).toHaveAttribute('data-country-state', 'empty', { timeout: 120000 });
  await page.getByLabel('建国世界名称', { exact: true }).fill('命名包 · 独立世界'); await press(page, '创建独立建国副本', touch); await ready(page);
  const worldId = (await country(page).getAttribute('data-country-world-id'))!, url = page.url(), before = await persistedCountry(page, worldId);
  await tab(page, '国家', touch); await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('保留手填国名');
  await press(page, '使用本地命名包', touch);
  const file = page.getByLabel('本地命名包文件', { exact: true }), pack = namingFixture();
  await file.setInputFiles({ name: 'synthetic-naming.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.getByTestId('local-naming-pack-status')).toContainText('已载入 2 种命名文化');
  await file.setInputFiles({ name: 'future-naming.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...pack, version: 2 })) });
  await expect(page.getByRole('alert')).toContainText('版本不受支持'); await expect(page.getByTestId('local-naming-pack-status')).toContainText('已载入 2 种命名文化');
  await tab(page, '国家', touch); await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('保留手填国名');
  await page.getByLabel('国家命名文化', { exact: true }).selectOption('TestSouth'); await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('保留手填国名');
  await page.getByLabel('国家命名文化', { exact: true }).selectOption('TestNorth'); await press(page, '换个国名', touch);
  await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('河原国'); await press(page, '换个国名', touch);
  await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('北野国'); await press(page, '换个国名', touch);
  await page.screenshot({ path: info.outputPath('name-suggestion.png'), fullPage: true });
  await press(page, '在地图上选择国土', touch); await pick(page, 800, 1300, touch); await pick(page, 1060, 1660, touch);
  await press(page, '预览建国', touch); await ready(page); await expect(page.getByRole('region', { name: '建国操作预览' })).toContainText('河原国');
  expect(await persistedCountry(page, worldId)).toEqual(before);
  await press(page, '取消预览', touch); await ready(page); expect(await persistedCountry(page, worldId)).toEqual(before);
  await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('河原国'); await press(page, '预览建国', touch); await confirm(page, touch);
  const nationSaved = await persistedCountry(page, worldId), nationId = nationSaved.document.nations[0].id;
  expect(nationSaved.document.nations[0].name).toBe('河原国');
  await press(page, '新建国家', touch); await press(page, '换个国名', touch); await expect(page.getByLabel('国家名称', { exact: true })).toHaveValue('北野国');
  await expect(page.getByRole('button', { name: '换个国名', exact: true })).toBeDisabled();
  await tab(page, '城市', touch); await page.getByLabel('城市所属国家', { exact: true }).selectOption(nationId);
  await page.getByLabel('城市名称', { exact: true }).fill('保留手填城名'); await page.getByLabel('城市名称语言', { exact: true }).selectOption('en');
  await expect(page.getByLabel('城市名称', { exact: true })).toHaveValue('保留手填城名'); await page.getByLabel('城市名称语言', { exact: true }).selectOption('zh');
  await press(page, '换个城名', touch); await expect(page.getByLabel('城市名称', { exact: true })).toHaveValue('河原城');
  await press(page, '在地图上选择城市位置', touch); await pick(page, 950, 1450, touch); await press(page, '预览建城', touch); await ready(page);
  expect(await persistedCountry(page, worldId)).toEqual(nationSaved); await press(page, '取消预览', touch); await ready(page);
  await expect(page.getByLabel('城市名称', { exact: true })).toHaveValue('河原城'); await press(page, '预览建城', touch); await confirm(page, touch);
  const committed = await persistedCountry(page, worldId); expect(committed.document.cities[0].name).toBe('河原城');
  expect(committed.geoSha256).toBe(before.geoSha256); expect(await saved(page, sourceId, 4)).toEqual(sourceBefore);
  expect(JSON.stringify(committed.document)).not.toContain('world-culture-content-pack'); expect(JSON.stringify(committed.document)).not.toContain('TestNorth');
  await page.goto(url); await ready(page); expect(await persistedCountry(page, worldId)).toEqual(committed);
  await tab(page, '国家', touch); await expect(page.getByRole('button', { name: '国家 河原国', exact: true })).toBeVisible();
  await tab(page, '城市', touch); await expect(page.getByRole('button', { name: '城市 河原城', exact: true })).toBeVisible();
  await tab(page, '世界', touch); await expect(page.getByTestId('local-naming-pack-status')).toContainText('尚未载入');
  await page.screenshot({ path: info.outputPath('names-restored-pack-cleared.png'), fullPage: true });
  expect(errors).toEqual([]); expect(remoteWrites).toEqual([]);
  await info.attach('naming-persistence.json', { body: JSON.stringify({ worldId, sourceId, nationId, nation: '河原国', city: '河原城', revision: committed.document.revision, geoSha256: committed.geoSha256, noPackInWorld: true, originalGeographyUnchanged: true, restoredWithoutPack: true }), contentType: 'application/json' });
});
