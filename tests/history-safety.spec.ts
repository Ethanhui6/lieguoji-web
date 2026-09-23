import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import {studioPanel,closeInspector as closeStudioPanel,closeInspector as closeChronicle,historyPanel,backToStudio} from './helpers/navigation';

type HistoryEvidence = { slots: string; slotBytes: number; pairBytes: number; usage: string; revision: number; day: number; sequence: number; hasBackup: boolean };

async function button(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}
async function createRecording(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('studio-canvas')).toBeVisible();
  await studioPanel(page, '国家'); await button(page, '自动分国');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认执行', exact: true }).click();
  await closeStudioPanel(page);
  await studioPanel(page, '城市'); await button(page, '自动城池与首都');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认执行', exact: true }).click();
  await closeStudioPanel(page);
  await button(page, '开始推演');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await historyPanel(page);
  await button(page, '开始记录副本');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认开始记录', exact: true }).click();
  await expect(page).toHaveURL(/\?world=run-h-/);
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  return new URL(page.url()).searchParams.get('world')!;
}
async function step(page: Page, day: number) {
  await closeChronicle(page);
  await page.getByRole('button', { name: '推进一日', exact: true }).click();
  await expect(page.getByTestId('day-number')).toHaveText(String(day));
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
}
async function evidence(page: Page, storageId: string): Promise<HistoryEvidence> {
  const raw: HistoryEvidence = await page.evaluate(id => new Promise<HistoryEvidence>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-history-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(['runs', 'meta'], 'readonly');
      const run = transaction.objectStore('runs').get(id), usage = transaction.objectStore('meta').get('usage');
      transaction.oncomplete = () => {
        const slots = run.result;
        const text = JSON.stringify(slots), bytes = (value: unknown) => value == null ? 0 : new TextEncoder().encode(JSON.stringify(value)).byteLength;
        resolve({ slots: text, slotBytes: new TextEncoder().encode(text).byteLength, pairBytes: bytes(slots.current) + bytes(slots.backup), usage: JSON.stringify(usage.result), revision: slots.revision, day: slots.current.record.world.day, sequence: slots.current.record.history.entries.length, hasBackup: slots.backup !== null });
        db.close();
      };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    };
  }), storageId);
  // Compare every stored byte without dumping entire synthetic worlds on an assertion failure.
  return { ...raw, slots: createHash('sha256').update(raw.slots).digest('hex') };
}
async function expectNewRecordUsage(page: Page, sourceId: string, before: HistoryEvidence) {
  const after = await evidence(page, sourceId);
  expect(after).toEqual({ ...before, usage: after.usage });
  const newId = new URL(page.url()).searchParams.get('world')!;
  expect(newId).not.toBe(sourceId);
  const created = await evidence(page, newId);
  expect(JSON.parse(after.usage).bytes - JSON.parse(before.usage).bytes).toBe(created.pairBytes);
}
async function failNextHistoryPut(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    const state = window as unknown as { historyQuotaFailures: number };
    state.historyQuotaFailures = 0;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'runs' && this.transaction.mode === 'readwrite' && this.transaction.db.name === 'lieguoji-history-v1') {
        IDBObjectStore.prototype.put = original; state.historyQuotaFailures++;
        throw new DOMException('history-safety: storage quota fault', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
}
async function failNextReplayConstructor(page: Page) {
  await page.evaluate(() => {
    const original = window.Worker;
    const state = window as unknown as { historyWorkerFailures: number };
    state.historyWorkerFailures = 0;
    window.Worker = new Proxy(original, {
      construct(target, args, newTarget) {
        if (String(args[0]).includes('replay.worker')) {
          window.Worker = original; state.historyWorkerFailures++;
          throw new DOMException('history-safety: replay worker constructor fault', 'SecurityError');
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
  });
}
async function expectWorkerFault(page: Page) {
  await expect(page.getByRole('alert').filter({ hasText: 'history-safety: replay worker constructor fault' }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { historyWorkerFailures: number }).historyWorkerFailures)).toBe(1);
}
async function saveInStudio(page: Page) {
  await backToStudio(page);
  await expect(page.getByTestId('world-studio')).toBeVisible();
  await studioPanel(page, '世界');
  await button(page, '保存草稿');
  await expect(page.locator('.studio-save-status').filter({ visible: true })).toHaveText('草稿已保存');
}

test('历史写入配额故障保持整对快照与备份，暂停锁写后刷新恢复', async ({ page }) => {
  const storageId = await createRecording(page);
  await step(page, 1);
  const before = await evidence(page, storageId);
  expect(before).toMatchObject({ day: 1, sequence: 1, revision: 2, hasBackup: true });
  await failNextHistoryPut(page);
  await page.getByRole('button', { name: '继续推演', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '历史保存失败' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '继续推演', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '暂停推演', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('day-number')).toHaveText('1');
  expect(await page.evaluate(() => (window as unknown as { historyQuotaFailures: number }).historyQuotaFailures)).toBe(1);
  expect(await evidence(page, storageId)).toEqual(before);

  // Protection now blocks new input before it can reach the locked writer.
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '继续推演', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: '推演速度', exact: true })).toBeDisabled();
  await expect(page.getByTestId('day-number')).toHaveText('1');
  expect(await evidence(page, storageId)).toEqual(before);
  await historyPanel(page);
  await expect(page.getByTestId('history-panel')).toContainText('1 / 2048 条');

  await page.reload();
  await expect(page.getByTestId('day-number')).toHaveText('1');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  expect(await evidence(page, storageId)).toEqual(before);
  await step(page, 2);
  expect(await evidence(page, storageId)).toMatchObject({ day: 2, sequence: 2, revision: 3, hasBackup: true });
});

test('回放线程构造失败释放忙碌与只读状态，原记录仍能正常推进', async ({ page }) => {
  const storageId = await createRecording(page);
  await step(page, 1);
  const before = await evidence(page, storageId);
  await historyPanel(page);
  await failNextReplayConstructor(page);
  await button(page, '进入历史回放');
  await expectWorkerFault(page);
  await expect(page.getByTestId('replay-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '进入历史回放', exact: true })).toBeEnabled();
  expect(await evidence(page, storageId)).toEqual(before);
  await step(page, 2);
  expect(await evidence(page, storageId)).toMatchObject({ day: 2, sequence: 2, revision: 3 });
  await historyPanel(page);
  await button(page, '进入历史回放');
  await expect(page.getByTestId('history-replay-controls')).toBeVisible();
  await expect(page.getByTestId('history-seq')).toHaveText('2');
  await button(page, '退出回放');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
});

test('根分支线程构造失败可取消重试，源史不变且工坊锁被释放', async ({ page }) => {
  const storageId = await createRecording(page);
  await step(page, 1);
  await historyPanel(page); await button(page, '进入历史回放');
  await expect(page.getByTestId('history-seq')).toHaveText('1');
  const before = await evidence(page, storageId), sourceUrl = page.url();
  // branchPoint reuses the existing session; the next constructor belongs to RootApp.
  await failNextReplayConstructor(page);
  await button(page, '从此处创建分支');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认创建分支', exact: true }).click();
  await expectWorkerFault(page);
  await expect(page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true })).toBeEnabled();
  expect(page.url()).toBe(sourceUrl);
  expect(await evidence(page, storageId)).toEqual(before);
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();

  await button(page, '从此处创建分支');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认创建分支', exact: true }).click();
  await expect(page).not.toHaveURL(sourceUrl);
  await expect(page).toHaveURL(/\?world=run-h-/);
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await expect(page.getByTestId('day-number')).toHaveText('1');
  await expectNewRecordUsage(page, storageId, before);
  await saveInStudio(page);
});

test('根历史导入线程构造失败可取消重试并保存工坊，原记录不被覆盖', async ({ page }, info) => {
  const storageId = await createRecording(page);
  await step(page, 1); await historyPanel(page);
  const download = page.waitForEvent('download'); await button(page, '导出历史');
  const path = info.outputPath('history-safety-export.history.json'); await (await download).saveAs(path);
  const before = await evidence(page, storageId), sourceUrl = page.url();
  await failNextReplayConstructor(page);
  await page.getByLabel('选择历史记录文件', { exact: true }).setInputFiles(path);
  await page.getByRole('alertdialog').getByRole('button', { name: '确认导入历史', exact: true }).click();
  await expectWorkerFault(page);
  await expect(page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true })).toBeEnabled();
  expect(page.url()).toBe(sourceUrl);
  expect(await evidence(page, storageId)).toEqual(before);
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();

  await page.getByLabel('选择历史记录文件', { exact: true }).setInputFiles(path);
  await page.getByRole('alertdialog').getByRole('button', { name: '确认导入历史', exact: true }).click();
  await expect(page).not.toHaveURL(sourceUrl);
  await expect(page.getByTestId('replay-banner')).toContainText('历史归档 · 只读');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toHaveCount(0);
  await expectNewRecordUsage(page, storageId, before);
  await saveInStudio(page);
});
