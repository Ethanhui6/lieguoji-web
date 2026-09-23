import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createWorld } from '../src/sim/demo';
import { encodeSave, type SaveEnvelope } from '../src/persistence';

type Slots = { current: unknown; backup: unknown; revision: unknown };
type StudioEnvelope = {
  format: string; version: number; checksum: string;
  data: { schemaVersion: number; draft: { schemaVersion: number; name: string } };
};

async function click(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}

async function studioPanel(page: Page, name: string) {
  const navigation = page.getByRole('navigation', { name: '世界工坊工具' });
  if (await navigation.isVisible()) await navigation.getByRole('button', { name, exact: true }).click();
  else if (name === '国家' || name === '城市') await page.locator('.studio-panel-tabs').getByRole('button', { name, exact: true }).click();
}

async function closeStudioPanel(page: Page) {
  const close = page.getByRole('button', { name: '关闭工坊面板' });
  if (await close.isVisible()) await close.click();
}

async function confirmStudio(page: Page) {
  await page.getByRole('alertdialog').getByRole('button', { name: '确认执行' }).click();
}

async function saveDraft(page: Page) {
  await click(page, '保存草稿');
  await expect(page.locator('.studio-save-status').filter({ visible: true })).toHaveText('草稿已保存');
}

async function saveGame(page: Page) {
  const navigation = page.getByRole('navigation', { name: '游戏工具' });
  if (await navigation.isVisible()) await navigation.getByRole('button', { name: '存档', exact: true }).click();
  await click(page, '保存');
  await expect(page.getByText(/已保存 · 第/).filter({ visible: true })).toBeVisible();
}

async function readSlots(page: Page, dbName: string, storeName: string): Promise<Slots> {
  return page.evaluate(({ dbName, storeName }) => new Promise<Slots>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      transaction.oncomplete = () => {
        db.close();
        resolve({ current: current.result, backup: backup.result, revision: revision.result });
      };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  }), { dbName, storeName });
}

async function replaceCurrent(page: Page, dbName: string, storeName: string, current: unknown) {
  await page.evaluate(({ dbName, storeName, current }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(current, 'current');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  }), { dbName, storeName, current });
}

test('自建推演拒绝战役及另一世界导入，原历史和版本计数保持不变', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('studio-canvas')).toBeVisible();
  await studioPanel(page, '国家');
  await click(page, '自动分国');
  await confirmStudio(page);
  await closeStudioPanel(page);
  await studioPanel(page, '城市');
  await click(page, '自动城池与首都');
  await confirmStudio(page);
  await closeStudioPanel(page);
  await click(page, '开始推演 ▶');
  await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
  for (let day = 1; day <= 2; day++) {
    await page.getByRole('button', { name: '推进一日' }).click();
    await expect(page.getByTestId('day-number')).toHaveText(String(day));
  }
  await saveGame(page);
  const runUrl = page.url(), runId = new URL(runUrl).searchParams.get('world');
  expect(runId).toMatch(/^run-/);
  const dbName = `lieguoji-custom-${runId}-v1`;
  const before = await readSlots(page, dbName, 'saves');
  const own = before.current as SaveEnvelope;
  expect(own.world.custom?.id).toBe(runId);
  const foreign = structuredClone(own);
  foreign.world.custom!.id = 'run-other-imported-world';
  foreign.checksum = createHash('sha256').update(JSON.stringify(foreign.world)).digest('hex');
  const demo = await encodeSave(createWorld());

  for (const [name, incoming] of [['demo.save.json', demo], ['other-world.save.json', foreign]] as const) {
    await page.getByLabel('选择导入存档').setInputFiles({
      name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '确认导入' }).click();
    await expect(page.getByRole('alert')).toContainText('属于其他世界');
    await expect(page.getByText('存档已载入。', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('day-number')).toHaveText('2');
    expect(page.url()).toBe(runUrl);
    expect(await readSlots(page, dbName, 'saves')).toEqual(before);
    await page.reload();
    await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
    await expect(page.getByTestId('day-number')).toHaveText('2');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await readSlots(page, dbName, 'saves')).toEqual(before);
  }
  await page.screenshot({ path: info.outputPath('custom-history-preserved.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('未来草稿 schema 在有效备份存在时仍锁写，UI 保存和导入不能覆盖原档', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const dbName = 'lieguoji-world-studio-v1';
  await page.goto('/');
  await expect(page.getByTestId('studio-canvas')).toBeVisible();
  await studioPanel(page, '世界');
  const name = page.getByLabel('世界名称', { exact: true }).filter({ visible: true });
  await name.fill('有效的旧备份');
  await saveDraft(page);
  await name.fill('需要新版读取的草稿');
  await saveDraft(page);
  const saved = await readSlots(page, dbName, 'records');
  expect((saved.backup as StudioEnvelope).data.draft.name).toBe('有效的旧备份');
  const future = structuredClone(saved.current) as StudioEnvelope;
  future.data.draft.schemaVersion = 99;
  future.checksum = createHash('sha256').update(JSON.stringify(future.data)).digest('hex');
  await replaceCurrent(page, dbName, 'records', future);
  const protectedSlots = await readSlots(page, dbName, 'records');

  await page.reload();
  await expect(page.getByTestId('world-studio')).toBeVisible();
  await expect(page.locator('.studio-notice')).toContainText('更新版本');
  await studioPanel(page, '世界');
  await expect(page.locator('.studio-save-status').filter({ visible: true })).toContainText('锁定保护');
  await expect(page.getByLabel('世界名称', { exact: true }).filter({ visible: true })).not.toHaveValue('有效的旧备份');
  await page.getByLabel('世界名称', { exact: true }).filter({ visible: true }).fill('不能覆盖原档的新稿');
  await click(page, '保存草稿');
  await expect(page.locator('.studio-notice')).toContainText('已锁定写入');
  await expect(page.getByText('世界草稿已保存。', { exact: true })).toHaveCount(0);
  expect(await readSlots(page, dbName, 'records')).toEqual(protectedSlots);

  await page.getByLabel('选择世界草稿文件').setInputFiles({
    name: 'valid-old-draft.world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved.backup)),
  });
  await confirmStudio(page);
  await expect(page.locator('.studio-notice')).toContainText('已锁定写入');
  await expect(page.getByText('草稿已导入。', { exact: true })).toHaveCount(0);
  expect(await readSlots(page, dbName, 'records')).toEqual(protectedSlots);
  await page.reload();
  await expect(page.locator('.studio-notice')).toContainText('更新版本');
  expect(await readSlots(page, dbName, 'records')).toEqual(protectedSlots);
  await page.screenshot({ path: info.outputPath('future-studio-save-protected.png'), fullPage: true });
  expect(errors).toEqual([]);
});
