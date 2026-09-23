import { test, expect, type Page } from '@playwright/test';
import type { World } from '../src/sim/types';

async function visibleButton(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}
async function studioPanel(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: '世界工坊工具' });
  if (await nav.isVisible()) await nav.getByRole('button', { name, exact: true }).click();
  else await page.locator('.studio-panel-tabs').getByRole('button', { name, exact: true }).click();
}
async function createWorld(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('studio-canvas')).toBeVisible();
  await studioPanel(page, '国家');
  await visibleButton(page, '自动分国');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认执行' }).click();
  const close = page.getByRole('button', { name: '关闭工坊面板' });
  if (await close.isVisible()) await close.click();
  await studioPanel(page, '城市');
  await visibleButton(page, '自动城池与首都');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认执行' }).click();
  if (await close.isVisible()) await close.click();
  await visibleButton(page, '开始推演 ▶');
  await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
  await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible();
}
async function government(page: Page) {
  await expect(page.locator('.game-layout')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '游戏工具' });
  if (await nav.isVisible()) await nav.getByRole('button', { name: '国家', exact: true }).click();
  else await page.locator('.right-panel-switch').getByRole('button', { name: '国家', exact: true }).click();
  await expect(page.getByTestId('government-panel')).toBeVisible();
}
async function save(page: Page) {
  await expect(page.locator('.game-layout')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '游戏工具' });
  if (await nav.isVisible()) await nav.getByRole('button', { name: '存档', exact: true }).click();
  await visibleButton(page, '保存');
  await expect(page.getByText(/已保存 · 第/).filter({ visible: true })).toBeVisible();
}
async function savedWorld(page: Page): Promise<World> {
  const id = new URL(page.url()).searchParams.get('world')!;
  return page.evaluate(id => new Promise((resolve, reject) => {
    const request = indexedDB.open(`lieguoji-custom-${id}-v1`, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('saves', 'readonly'), read = transaction.objectStore('saves').get('current');
      transaction.oncomplete = () => { resolve(read.result.world); db.close(); };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  }), id);
}

test('国家经营真实账目、政策取消与过期保护、确认后保存刷新', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await createWorld(page);
  const initial = await savedWorld(page);
  expect(initial.schemaVersion).toBe(2);
  expect(initial.rulesVersion).toBe('0.2.0');
  expect(initial.statecraft).toBeTruthy();
  const nationId = initial.nations[0].id;
  await government(page);
  await page.getByLabel('查看国家', { exact: true }).selectOption(nationId);
  const population = initial.statecraft!.provinces.filter(item => initial.provinces.find(p => p.id === item.provinceId)?.controller === nationId).reduce((sum, item) => sum + item.population, 0);
  await expect(page.getByTestId('nation-population')).toHaveText(Math.round(population).toLocaleString('zh-CN'));
  await page.screenshot({ path: info.outputPath('national-overview.png'), fullPage: true });
  await page.getByLabel('国家政策', { exact: true }).selectOption('civilian');
  await visibleButton(page, '预览国策');
  await expect(page.getByTestId('state-action-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认国策', exact: true })).toBeEnabled();
  await visibleButton(page, '取消决策');
  await save(page);
  const canceled = await savedWorld(page);
  expect(canceled.statecraft).toEqual(initial.statecraft);
  expect(canceled.events).toEqual(initial.events);
  await government(page);
  await page.getByRole('button', { name: '继续推演' }).click();
  await visibleButton(page, '预览国策');
  await expect(page.getByRole('button', { name: '继续推演' })).toBeEnabled();
  const settledDay = Number(await page.getByTestId('day-number').innerText()) + 1;
  await page.getByRole('button', { name: '推进一日' }).click();
  await expect(page.getByTestId('day-number')).toHaveText(String(settledDay));
  await expect(page.getByTestId('state-action-preview')).toContainText('此预览已过期');
  await expect(page.getByRole('button', { name: '确认国策', exact: true })).toBeDisabled();
  await visibleButton(page, '取消决策');
  await visibleButton(page, '预览国策');
  await visibleButton(page, '确认国策');
  await expect(page.getByTestId('state-decision')).toContainText('民生');
  await page.getByText('最近结算', { exact: false }).click();
  await expect(page.getByTestId('nation-ledger')).toContainText('实际军队消耗');
  await expect(page.getByTestId('nation-ledger')).toContainText('实际民用消耗');
  await page.screenshot({ path: info.outputPath('national-economy.png'), fullPage: true });
  await save(page);
  const saved = await savedWorld(page);
  expect(saved.statecraft!.nations.find(item => item.nationId === nationId)?.priority).toBe('civilian');
  const ledger = saved.statecraft!.nations.find(item => item.nationId === nationId)!.lastLedger!;
  expect(ledger.day).toBe(settledDay);
  expect(ledger.production).toBeGreaterThan(0);
  expect(ledger.civilianConsumed).toBeGreaterThan(0);
  expect(ledger.militaryConsumed).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('day-number')).toHaveText(String(settledDay));
  await government(page);
  await page.getByLabel('查看国家', { exact: true }).selectOption(nationId);
  await expect(page.getByLabel('国家政策', { exact: true })).toHaveValue('civilian');
  await expect(page.getByTestId('state-decision')).toContainText('民生');
  expect(await savedWorld(page)).toEqual(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('外交取消无修改、陆邻宣战与停战保护、刷新保留双边关系', async ({ page }, info) => {
  await createWorld(page);
  const initial = await savedWorld(page);
  const province = initial.provinces.find(item => item.neighbors.some(id => initial.provinces.find(other => other.id === id)?.controller !== item.controller))!;
  const neighbor = initial.provinces.find(item => province.neighbors.includes(item.id) && item.controller !== province.controller)!;
  const a = province.controller, b = neighbor.controller;
  const pair = (world: World) => world.statecraft!.relations.find(item => [item.a, item.b].includes(a) && [item.a, item.b].includes(b))!;
  expect(pair(initial).status).toBe('peace');
  await government(page);
  await page.getByLabel('查看国家', { exact: true }).selectOption(a);
  await visibleButton(page, '外交');
  await page.getByLabel('外交对象', { exact: true }).selectOption(b);
  await visibleButton(page, '预览宣战');
  await expect(page.getByRole('button', { name: '确认宣战', exact: true })).toBeEnabled();
  await visibleButton(page, '取消决策');
  await save(page);
  expect((await savedWorld(page)).statecraft).toEqual(initial.statecraft);
  await government(page);
  await visibleButton(page, '预览宣战');
  await visibleButton(page, '确认宣战');
  await expect(page.getByTestId('diplomatic-status')).toContainText('交战');
  await expect(page.getByTestId('state-decision')).toBeVisible();
  await save(page);
  expect(pair(await savedWorld(page)).status).toBe('war');
  await government(page);
  await visibleButton(page, '预览停战');
  await expect(page.getByTestId('state-action-preview')).toBeVisible();
  await visibleButton(page, '确认停战');
  await expect(page.getByTestId('diplomatic-status')).toContainText('和平');
  await expect(page.getByTestId('truce-status')).toContainText('剩余 10 日');
  await visibleButton(page, '预览宣战');
  await expect(page.getByTestId('state-action-preview')).toContainText('停战');
  await expect(page.getByRole('button', { name: '确认宣战', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('diplomatic-truce.png'), fullPage: true });
  await visibleButton(page, '取消决策');
  await save(page);
  const saved = await savedWorld(page);
  expect(pair(saved).status).toBe('peace');
  expect(pair(saved).truceUntilDay).toBe(10);
  expect(saved.events.some(event => event.kind === 'diplomacy')).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('day-number')).toHaveText('0');
  await government(page);
  await page.getByLabel('查看国家', { exact: true }).selectOption(a);
  await visibleButton(page, '外交');
  await page.getByLabel('外交对象', { exact: true }).selectOption(b);
  await expect(page.getByTestId('diplomatic-status')).toContainText('和平');
  await expect(page.getByTestId('truce-status')).toContainText('剩余 10 日');
  expect(await savedWorld(page)).toEqual(saved);
  const controls = page.getByRole('navigation', { name: '游戏工具' });
  if (await controls.isVisible()) {
    expect(await controls.getByRole('button').count()).toBe(6);
    for (const item of await controls.getByRole('button').all()) { const box = await item.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
  }
});
