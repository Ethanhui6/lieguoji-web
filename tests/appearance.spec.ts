import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { closeInspector, expectNavigation, gamePanel, historyPanel, studioPanel } from './helpers/navigation';

const APPEARANCE_KEY = 'lieguoji-appearance-v1';
type Screen = 'studio' | 'game';
type CameraEvidence = { zoom: string; width: number; height: number; cssWidth: number; cssHeight: number; x: number; y: number };

async function button(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}
async function appearance(page: Page, screen: Screen) {
  if (screen === 'studio') await studioPanel(page, '世界');
  else await gamePanel(page, '世界');
  await expect(page.locator('fieldset.appearance-settings')).toHaveCount(1);
  await expect(page.getByLabel('界面外观', { exact: true })).toBeVisible();
}
async function theme(page: Page, screen: Screen, value: 'light' | 'dark' | 'system', resolved = value) {
  await appearance(page, screen);
  await page.getByLabel('界面外观', { exact: true }).selectOption(value);
  await expect(page.locator('html')).toHaveAttribute('data-theme', resolved);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))).toEqual(expect.objectContaining({ width: page.viewportSize()!.width }));
  const overflow = await page.evaluate(() => ({ root: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth }));
  expect(overflow.root).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
}
const mapCanvas = (page: Page, screen: Screen) => screen === 'studio' ? page.getByTestId('studio-canvas') : page.getByTestId('map-canvas').locator('canvas');
async function camera(page: Page, screen: Screen): Promise<CameraEvidence> {
  const geometry = await mapCanvas(page, screen).evaluate(element => {
    const canvas = element as HTMLCanvasElement, box = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, x: box.x, y: box.y };
  });
  const zoom = screen === 'studio' ? await page.getByTestId('studio-zoom').innerText() : await page.locator('.map-tools span').innerText();
  return { ...geometry, zoom };
}
async function inspectorBehavior(page: Page, screen: Screen) {
  await closeInspector(page);
  await button(page, screen === 'studio' ? '放大工坊地图' : '放大地图');
  const zoom = screen === 'studio' ? page.getByTestId('studio-zoom') : page.locator('.map-tools span');
  await expect(zoom).toHaveText(screen === 'studio' ? '130%' : '125%');
  const before = await camera(page, screen), canvas = await mapCanvas(page, screen).elementHandle();
  const navigation = page.getByRole('navigation', { name: screen === 'studio' ? '世界工坊工具' : '游戏工具', exact: true });
  const opener = navigation.getByRole('button', { name: '国家', exact: true });
  await opener.click();
  const inspector = page.locator('.context-inspector');
  await expect(inspector).toHaveAttribute('data-extent', 'half');
  await expect(inspector.locator('h2').first()).toBeFocused();
  expect(await camera(page, screen)).toEqual(before);
  const bottomSheet = await page.evaluate(() => matchMedia('(max-width: 899px), (max-width: 1279px) and (orientation: portrait)').matches);
  const expand = inspector.getByRole('button', { name: '展开阅读', exact: true });
  if (bottomSheet) {
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(inspector).toHaveAttribute('data-extent', 'reading');
    expect(await camera(page, screen)).toEqual(before);
    await noOverflow(page);
    await inspector.getByRole('button', { name: '收起为半高', exact: true }).click();
    await expect(inspector).toHaveAttribute('data-extent', 'half');
  } else {
    await expect(expand).not.toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  expect(await camera(page, screen)).toEqual(before);
  await canvas!.dispose();
}
async function createWorld(page: Page) {
  for (const [panel, action] of [['国家', '自动分国'], ['城市', '自动城池与首都']]) {
    await studioPanel(page, panel); await button(page, action);
    await page.getByRole('alertdialog').getByRole('button', { name: '确认执行', exact: true }).click();
    await closeInspector(page);
  }
  await button(page, '开始推演');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await expect(mapCanvas(page, 'game')).toBeVisible({ timeout: 15_000 });
  await expectNavigation(page, 'game');
}
async function storeFingerprint(page: Page) {
  const bytes = await page.evaluate(async () => {
    const names = (await indexedDB.databases()).map(database => database.name).filter((name): name is string => !!name && name.startsWith('lieguoji-')).sort();
    const contents: unknown[] = [];
    for (const name of names) {
      const data = await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => request.transaction!.abort();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, stores = [...db.objectStoreNames];
          if (!stores.length) { db.close(); resolve({ name, version: db.version, stores: [] }); return; }
          const transaction = db.transaction(stores, 'readonly');
          const reads = stores.map(store => ({ store, keys: transaction.objectStore(store).getAllKeys(), values: transaction.objectStore(store).getAll() }));
          transaction.oncomplete = () => { const version = db.version; db.close(); resolve({ name, version, stores: reads.map(read => ({ store: read.store, keys: read.keys.result, values: read.values.result })) }); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
      contents.push(data);
    }
    return JSON.stringify(contents);
  });
  return createHash('sha256').update(bytes).digest('hex');
}
async function photograph(page: Page, info: TestInfo, name: string) {
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
}
async function expectReducedMotion(inspector: Locator) {
  const durations = await inspector.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.transitionDuration, style.animationDuration].flatMap(value => value.split(',').map(item => Number.parseFloat(item) * (item.trim().endsWith('ms') ? 1 : 1000)));
  });
  expect(durations.every(milliseconds => milliseconds <= 1)).toBe(true);
}

for (const color of ['light', 'dark'] as const) {
  test(`${color === 'light' ? '浅色' : '深色'}统一五项导航、真实创世国家历史与面板相机焦点`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/'); await expect(mapCanvas(page, 'studio')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNavigation(page, 'studio');
    await expect(page.locator('.context-inspector')).toHaveCount(0);
    await theme(page, 'studio', color === 'light' ? 'dark' : 'light');
    const otherSurface = await page.locator('.context-inspector').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    await theme(page, 'studio', color);
    const surface = await page.locator('.context-inspector').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    expect(surface.color).not.toBe(otherSurface.color); expect(surface.background).not.toBe(otherSurface.background);
    await closeInspector(page);
    await inspectorBehavior(page, 'studio');
    await photograph(page, info, `${color}-studio-map.png`);
    await studioPanel(page, '国家');
    await photograph(page, info, `${color}-studio-nations.png`);
    await createWorld(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', color);
    await inspectorBehavior(page, 'game');
    await photograph(page, info, `${color}-simulation-map.png`);
    await gamePanel(page, '国家');
    await expect(page.getByTestId('nation-population')).toBeVisible();
    expect(Number((await page.getByTestId('nation-population').innerText()).replace(/,/g, ''))).toBeGreaterThan(0);
    await photograph(page, info, `${color}-nation-details.png`);
    await historyPanel(page); await button(page, '开始记录副本');
    await page.getByRole('alertdialog').getByRole('button', { name: '确认开始记录', exact: true }).click();
    await expect(page).toHaveURL(/\?world=run-h-/);
    await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
    for (const day of [1, 2]) {
      await button(page, '推进一日'); await expect(page.getByTestId('day-number')).toHaveText(String(day));
    }
    await historyPanel(page); await button(page, '进入历史回放');
    await expect(page.getByTestId('history-replay-controls')).toBeVisible();
    await page.getByLabel('记录序号', { exact: true }).fill('1'); await button(page, '定位记录');
    await expect(page.getByTestId('history-seq')).toHaveText('1');
    await expect(page.getByTestId('day-number')).toHaveText('1');
    await expect(page.getByTestId('replay-banner')).toContainText('只读');
    await photograph(page, info, `${color}-read-only-history.png`);
    await gamePanel(page, '国家');
    await expect(page.getByLabel('国家政策', { exact: true })).toBeDisabled();
    await photograph(page, info, `${color}-historical-nation.png`);
    expect(errors).toEqual([]);
  });
}

test('360px 系统主题、减少动态透明和较大文字保持可玩且不写世界存档', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/'); await expect(mapCanvas(page, 'studio')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNavigation(page, 'studio');
  await appearance(page, 'studio');
  const normalFont = await page.getByLabel('界面外观', { exact: true }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await theme(page, 'studio', 'system', 'dark');
  await page.getByLabel('减少透明效果', { exact: true }).check();
  await page.getByLabel('较大文字', { exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  const largerFont = await page.getByLabel('界面外观', { exact: true }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(largerFont).toBeGreaterThan(normalFont);
  await expectReducedMotion(page.locator('.context-inspector'));
  const navigation = page.getByRole('navigation', { name: '世界工坊工具', exact: true });
  expect(await navigation.evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await photograph(page, info, '360-system-large-settings.png');
  await createWorld(page);
  const originalWorldStores = await storeFingerprint(page);
  await theme(page, 'game', 'light');
  await page.getByLabel('较大文字', { exact: true }).uncheck();
  await page.getByLabel('减少透明效果', { exact: true }).uncheck();
  await theme(page, 'game', 'system', 'dark');
  await page.getByLabel('较大文字', { exact: true }).check();
  await page.getByLabel('减少透明效果', { exact: true }).check();
  expect(await storeFingerprint(page)).toBe(originalWorldStores);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), APPEARANCE_KEY)).toEqual({ version: 1, theme: 'system', reduceTransparency: true, largeText: true });
  await gamePanel(page, '国家');
  await expect(page.getByTestId('nation-population')).toBeVisible();
  await expectReducedMotion(page.locator('.context-inspector'));
  await photograph(page, info, '360-large-nation.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('.context-inspector')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '游戏工具', exact: true }).getByRole('button', { name: '国家', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'reduced');
  await expectNavigation(page, 'game');
  await appearance(page, 'game');
  await expect(page.getByLabel('界面外观', { exact: true })).toHaveValue('system');
  await expect(page.getByLabel('较大文字', { exact: true })).toBeChecked();
  await expect(page.getByLabel('减少透明效果', { exact: true })).toBeChecked();
  expect(await storeFingerprint(page)).toBe(originalWorldStores);
  await closeInspector(page); await button(page, '推进一日');
  await expect(page.getByTestId('day-number')).toHaveText('1');
  await gamePanel(page, '国家');
  await photograph(page, info, '360-large-playable.png');
  expect(errors).toEqual([]);
});
