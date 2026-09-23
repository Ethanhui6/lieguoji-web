import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { World } from '../src/sim/types';
import type { HistoryRecord, HistoryFile } from '../src/history/store';

const runId = (page: Page) => new URL(page.url()).searchParams.get('world')!;
async function button(page: Page, name: string) { await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click(); }
async function drawer(page: Page, name: string) {
  await expect(page.locator('.game-layout')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '游戏工具' });
  if (await nav.isVisible()) await nav.getByRole('button', { name, exact: true }).click();
  else if (name === '国家' || name === '军令') await page.locator('.right-panel-switch').getByRole('button', { name, exact: true }).click();
}
async function history(page: Page) {
  await drawer(page, '纪事');
  await page.locator('.chronicle-tabs').getByRole('button', { name: '历史', exact: true }).click();
  await expect(page.getByTestId('history-panel')).toBeVisible();
}
async function createWorld(page: Page) {
  await page.goto('/'); await expect(page.getByTestId('studio-canvas')).toBeVisible();
  for (const [name, action] of [['国家', '自动分国'], ['城市', '自动城池与首都']]) {
    const nav = page.getByRole('navigation', { name: '世界工坊工具' });
    if (await nav.isVisible()) await nav.getByRole('button', { name, exact: true }).click();
    else await page.locator('.studio-panel-tabs').getByRole('button', { name, exact: true }).click();
    await button(page, action); await page.getByRole('alertdialog').getByRole('button', { name: '确认执行' }).click();
    const close = page.getByRole('button', { name: '关闭工坊面板' }); if (await close.isVisible()) await close.click();
  }
  await button(page, '开始推演 ▶');
  await expect(page.locator('.game-layout')).toBeVisible();
  await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
}
async function saveSlots(page: Page, id: string): Promise<{ bytes: string; world: World }> {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const request = indexedDB.open(`lieguoji-custom-${id}-v1`, 1);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('saves', 'readonly'), store = transaction.objectStore('saves');
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      transaction.oncomplete = () => { resolve({ bytes: JSON.stringify({ current: current.result, backup: backup.result, revision: revision.result }), world: current.result.world }); db.close(); };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    }; request.onerror = () => reject(request.error);
  }), id);
}
async function historySlots(page: Page, id: string): Promise<{ bytes: string; record: HistoryRecord; count: number }> {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const request = indexedDB.open('lieguoji-history-v1', 1);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('runs', 'readonly'), store = transaction.objectStore('runs'), value = store.get(id), count = store.count();
      transaction.oncomplete = () => { resolve({ bytes: JSON.stringify(value.result), record: value.result.current.record, count: count.result }); db.close(); };
      transaction.onerror = () => { reject(transaction.error); db.close(); };
    }; request.onerror = () => reject(request.error);
  }), id);
}
async function startRecord(page: Page) {
  const previous = page.url(); await history(page); await button(page, '开始记录副本');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认开始记录', exact: true }).click();
  await expect(page).not.toHaveURL(previous); await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
  expect(runId(page)).toMatch(/^run-h-/);
}
async function policy(page: Page, value: string) {
  await drawer(page, '国家');
  await page.locator('.government-tabs').getByRole('button', { name: '经营', exact: true }).click();
  await page.getByLabel('国家政策', { exact: true }).selectOption(value);
  await button(page, '预览国策'); await button(page, '确认国策');
  await expect(page.getByTestId('state-action-preview')).toHaveCount(0);
}
async function days(page: Page, count: number) {
  for (let index = 0; index < count; index++) { const day = Number(await page.getByTestId('day-number').innerText()); await page.getByRole('button', { name: '推进一日' }).click(); await expect(page.getByTestId('day-number')).toHaveText(String(day + 1)); }
}
async function recordedWorld(page: Page) {
  await createWorld(page); await startRecord(page);
  await policy(page, 'civilian'); await policy(page, 'balanced'); await days(page, 3);
  return historySlots(page, runId(page));
}
async function seek(page: Page, seq: number) {
  await history(page); await expect(page.getByTestId('history-replay-controls')).toBeVisible();
  await page.getByLabel('记录序号', { exact: true }).fill(String(seq)); await button(page, '定位记录');
  await expect(page.getByTestId('history-seq')).toHaveText(String(seq));
  await expect(page.getByRole('button', { name: '定位记录', exact: true })).toBeEnabled();
}

test('历史从当前日创建独立副本、取消不写原档、同日命令分别记录与刷新恢复', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await createWorld(page); await days(page, 1);
  await drawer(page, '存档'); await button(page, '保存'); await expect(page.getByText(/已保存 · 第/).filter({ visible: true })).toBeVisible();
  const originalId = runId(page), originalUrl = page.url(), original = await saveSlots(page, originalId);
  await history(page); await button(page, '开始记录副本');
  await expect(page.getByRole('alertdialog')).toContainText('第 1 日');
  expect(await page.getByRole('alertdialog').evaluate(element => element.matches(':modal'))).toBe(true);
  const mobileMap = page.getByRole('navigation', { name: '游戏工具' }).getByRole('button', { name: '舆图', exact: true });
  if (await mobileMap.isVisible()) { const bounds = await mobileMap.boundingBox(); await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2); await expect(page.getByRole('alertdialog')).toBeVisible(); }
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始记录副本', exact: true })).toBeFocused();
  expect(page.url()).toBe(originalUrl); expect((await saveSlots(page, originalId)).bytes).toBe(original.bytes);
  await startRecord(page);
  const id = runId(page), initial = await historySlots(page, id);
  expect(initial.record.history.startDay).toBe(1); expect(initial.record.history.entries).toEqual([]);
  expect(initial.record.history.initial.world.armies).toEqual(original.world.armies);
  expect(initial.record.history.parent).toBeNull(); expect(initial.record.world.custom?.id).toBe(id);
  await policy(page, 'civilian'); await policy(page, 'balanced'); await days(page, 1);
  const current = await historySlots(page, id);
  expect(current.record.history.entries.map(entry => [entry.seq, entry.input.type, entry.after.day])).toEqual([[1, 'state-action', 1], [2, 'state-action', 1], [3, 'step', 2]]);
  expect((await saveSlots(page, originalId)).bytes).toBe(original.bytes);
  await history(page); await expect(page.getByTestId('history-panel')).toContainText('从第 1 日开始');
  await expect(page.getByTestId('history-panel')).toContainText('3 / 2048 条');
  await page.screenshot({ path: info.outputPath('recording-history.png'), fullPage: true });
  await page.reload(); await expect(page.locator('.game-layout')).toBeVisible(); await expect(page.getByTestId('day-number')).toHaveText('2');
  await history(page); await expect(page.getByTestId('history-panel')).toContainText('3 / 2048 条');
  expect((await historySlots(page, id)).bytes).toBe(current.bytes);
  await drawer(page, '存档'); await expect(page.getByRole('button', { name: '导入', exact: true }).filter({ visible: true })).toBeDisabled();
  expect((await saveSlots(page, originalId)).bytes).toBe(original.bytes); expect(errors).toEqual([]);
});

test('历史逐条与日期定位、播放暂停、地图账册只读、退出和回工坊均不改源库', async ({ page, context }, info) => {
  const errors: string[] = [], failed: { url: string; error: string }[] = [], workerUrls: string[] = [];
  const mimeErrors: string[] = [], verifiedJsMime = new Map<string, string>();
  const jsResponses: { url: string; status: number; mime: string }[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  page.on('worker', worker => workerUrls.push(worker.url()));
  context.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  context.on('response', response => {
    const url = response.url(); if (!/^https?:/.test(url) || !/\/assets\/.*\.js$/.test(new URL(url).pathname)) return;
    const status = response.status(), mime = response.headers()['content-type'] ?? '';
    jsResponses.push({ url, status, mime });
    // A 304 may omit representation headers, but it must revalidate a previously verified 200.
    if (status === 304) { if (!verifiedJsMime.has(url) || (mime && !/javascript/i.test(mime))) mimeErrors.push(`${url} [status=304,mime=${mime || '<missing>'},previous=${verifiedJsMime.get(url) || '<unverified>'}]`); return; }
    if (status !== 200 || !/javascript/i.test(mime)) { mimeErrors.push(`${url} [status=${status},mime=${mime || '<missing>'}]`); return; }
    verifiedJsMime.set(url, mime);
  });
  try {
  const source = await recordedWorld(page), id = runId(page), url = page.url();
  await history(page); await button(page, '进入历史回放'); await expect(page.getByTestId('history-replay-controls')).toBeVisible();
  await seek(page, 1); await expect(page.getByTestId('day-number')).toHaveText('0');
  await expect(page.getByTestId('replay-banner')).toContainText('只读');
  await drawer(page, '国家'); await expect(page.getByLabel('国家政策', { exact: true })).toHaveValue('civilian');
  await expect(page.getByLabel('国家政策', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '预览国策', exact: true })).toHaveCount(0);
  await button(page, '外交'); await expect(page.getByRole('button', { name: '预览宣战', exact: true })).toHaveCount(0);
  await drawer(page, '军令'); await expect(page.getByRole('button', { name: /^预览命令/ })).toHaveCount(0);
  await expect(page.locator('.orders-panel')).toContainText('只读历史');
  await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible();
  await drawer(page, '存档'); await expect(page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入', exact: true }).filter({ visible: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '推进一日' })).toHaveCount(0);
  await seek(page, 0); await button(page, '播放回放');
  await expect.poll(async () => Number(await page.getByTestId('history-seq').innerText())).toBeGreaterThan(0);
  await button(page, '暂停回放'); await expect(page.getByRole('button', { name: '播放回放', exact: true })).toBeVisible();
  await page.getByLabel('按日期定位', { exact: true }).fill('0'); await button(page, '定位当日末条');
  await expect(page.getByTestId('history-seq')).toHaveText('2');
  await page.screenshot({ path: info.outputPath('read-only-replay.png'), fullPage: true });
  expect((await historySlots(page, id)).bytes).toBe(source.bytes);
  await button(page, '退出回放'); await expect(page.getByTestId('replay-banner')).toHaveCount(0);
  await expect(page.getByTestId('day-number')).toHaveText('3'); await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
  expect((await historySlots(page, id)).bytes).toBe(source.bytes);
  await button(page, '进入历史回放'); await seek(page, 0); await button(page, '世界工坊');
  await expect(page.getByTestId('studio-canvas')).toBeVisible(); expect((await historySlots(page, id)).bytes).toBe(source.bytes);
  await expect(page.getByRole('combobox', { name: '已保存的推演' })).toBeVisible();
  await page.getByRole('combobox', { name: '已保存的推演' }).selectOption(id);
  await expect(page).toHaveURL(url); await expect(page.locator('.game-layout')).toBeVisible(); await expect(page.getByTestId('day-number')).toHaveText('3');
  expect((await historySlots(page, id)).bytes).toBe(source.bytes);
  for (const name of ['sim.worker', 'replay.worker']) {
    const loaded = [...new Set(workerUrls.filter(workerUrl => new URL(workerUrl).pathname.includes(name)))];
    expect(loaded, `${name} must actually start`).not.toEqual([]);
    for (const workerUrl of loaded) expect(verifiedJsMime.has(workerUrl), `${name} must load with a verified 200 JavaScript response: ${workerUrl}`).toBe(true);
  }
  expect(errors).toEqual([]); expect(failed).toEqual([]); expect(mimeErrors).toEqual([]);
  } finally {
    await info.attach('replay-runtime-evidence.json', { body: JSON.stringify({ url: page.url(), workerUrls, jsResponses, errors, failed, mimeErrors }, null, 2), contentType: 'application/json' });
  }
});

test('分支预览取消与独立改史、历史文件导入只读、坏档和未来版本不覆盖', async ({ page }, info) => {
  const source = await recordedWorld(page), sourceId = runId(page), sourceUrl = page.url();
  await history(page);
  const downloadPromise = page.waitForEvent('download'); await button(page, '导出历史');
  const file = await downloadPromise, path = info.outputPath('original.history.json'); await file.saveAs(path);
  const exported = JSON.parse(await fs.readFile(path, 'utf8')) as HistoryFile;
  expect(exported.history.entries).toHaveLength(5);
  await button(page, '进入历史回放'); await seek(page, 1);
  await button(page, '从此处创建分支'); await expect(page.getByRole('alertdialog')).toContainText('记录 #1');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
  expect(page.url()).toBe(sourceUrl); expect((await historySlots(page, sourceId)).bytes).toBe(source.bytes);
  expect((await historySlots(page, sourceId)).count).toBe(source.count);
  await button(page, '从此处创建分支'); await page.getByRole('alertdialog').getByRole('button', { name: '确认创建分支', exact: true }).click();
  await expect(page).not.toHaveURL(sourceUrl); await expect(page.getByRole('button', { name: '推进一日' })).toBeEnabled();
  const branchId = runId(page), branchUrl = page.url(), branch = await historySlots(page, branchId);
  expect(branch.record.history.parent).toEqual({ runId: sourceId, seq: 1, worldHash: source.record.history.entries[0].after.hash });
  expect(branch.record.history.entries).toEqual([]); expect(branch.record.world.day).toBe(0);
  expect(branch.record.world.statecraft!.nations[0].priority).toBe('civilian');
  await policy(page, 'military'); const changed = await historySlots(page, branchId);
  expect(changed.record.world.statecraft!.nations[0].priority).toBe('military');
  expect(changed.record.history.entries).toHaveLength(1); expect((await historySlots(page, sourceId)).bytes).toBe(source.bytes);
  await history(page);
  for (const [name, contents] of [['broken.history.json', '{"format":"lieguoji-history-export","version":1}'], ['future.history.json', JSON.stringify({ ...exported, version: 99 })]]) {
    await page.getByLabel('选择历史记录文件').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(contents) });
    const dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: '确认导入历史', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible(); await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect(page.url()).toBe(branchUrl); expect((await historySlots(page, branchId)).bytes).toBe(changed.bytes);
    expect((await historySlots(page, sourceId)).bytes).toBe(source.bytes); expect((await historySlots(page, sourceId)).count).toBe(changed.count);
  }
  await page.getByLabel('选择历史记录文件').setInputFiles(path);
  await page.getByRole('alertdialog').getByRole('button', { name: '确认导入历史', exact: true }).click();
  await expect(page).not.toHaveURL(branchUrl); await expect(page.locator('.game-layout')).toBeVisible();
  const archiveId = runId(page), archive = await historySlots(page, archiveId);
  expect(archiveId).not.toBe(sourceId); expect(archiveId).not.toBe(branchId);
  expect(archive.record.readOnly).toBe(true); expect(archive.record.history).toEqual(exported.history);
  await expect(page.getByTestId('replay-banner')).toContainText('历史归档');
  await expect(page.getByRole('button', { name: '推进一日' })).toHaveCount(0);
  await history(page); await expect(page.getByTestId('history-replay-controls')).toBeVisible(); await seek(page, 1);
  await expect(page.getByRole('button', { name: '退出回放', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '从此处创建分支', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('independent-history-archive.png'), fullPage: true });
  await page.reload(); await expect(page.locator('.game-layout')).toBeVisible(); await expect(page.getByTestId('replay-banner')).toContainText('历史归档');
  expect((await historySlots(page, archiveId)).bytes).toBe(archive.bytes);
  expect((await historySlots(page, sourceId)).bytes).toBe(source.bytes); expect((await historySlots(page, branchId)).bytes).toBe(changed.bytes);
});
