import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoryFile, HistoryRecord } from '../src/history/store';
import type { World } from '../src/sim/types';

const ENGINE = '65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5';
const UNKNOWN_ENGINE = 'f'.repeat(64);
const fixturePath = (name: string) => resolve('src/compat/fixtures', name);
const fixture = <T>(name: string): T => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as T;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const runId = (page: Page) => new URL(page.url()).searchParams.get('world')!;
const amount = (value: number) => Math.round(value).toLocaleString('zh-CN');
type Expected = { entryHashes: { seq: number; day: number; hash: string }[] };
type Observation = { kind: string; id: number; seq?: number; day?: number; hash?: string; engine?: string; error?: string };
type ObserverWindow = Window & { __compatWorkerMessages: Observation[]; __compatWorkerReport: (observation: Observation) => Promise<void> };
type StoredHistory = { slotsHash: string; slotsBytes: number; revision: number; usage: string; count: number; record: HistoryRecord };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function runtime(page: Page, info: TestInfo) {
  const errors: string[] = [], failed: { url: string; error: string }[] = [], workers: string[] = [];
  const responses: { url: string; status: number; mime: string }[] = [], mimeErrors: string[] = [];
  const observations: Observation[] = [];
  const verifiedJs = new Set<string>();
  await page.exposeFunction('__compatWorkerReport', (observation: Observation) => { observations.push(observation); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  page.on('worker', worker => workers.push(worker.url()));
  page.context().on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.context().on('response', response => {
    const url = response.url();
    if (!/^https?:/.test(url) || !/\/assets\/.*\.js$/.test(new URL(url).pathname)) return;
    const status = response.status(), mime = response.headers()['content-type'] ?? '';
    responses.push({ url, status, mime });
    if (status === 304) {
      if (!verifiedJs.has(url) || (mime && !/javascript/i.test(mime))) mimeErrors.push(`${url}: unverified 304 (${mime})`);
    } else if (status !== 200 || !/javascript/i.test(mime)) mimeErrors.push(`${url}: ${status} (${mime})`);
    else verifiedJs.add(url);
  });
  // Passive listeners inspect real production Worker responses; they never change
  // requests, responses, default input behavior, application state, or old rules.
  await page.addInitScript(() => {
    const state = window as unknown as ObserverWindow;
    state.__compatWorkerMessages = [];
    function record(observation: Observation) {
      state.__compatWorkerMessages.push(observation);
      // Keep evidence across real reloads; a binding can disappear with the old
      // document during navigation, while the local observation remains intact.
      void state.__compatWorkerReport(observation).catch(() => {});
    }
    function stable(value: unknown): string {
      if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
      if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
      return JSON.stringify(value);
    }
    window.Worker = new Proxy(window.Worker, {
      construct(target, args, newTarget) {
        const worker = Reflect.construct(target, args, newTarget) as Worker;
        const url = String(args[0]), kind = url.includes('replay.worker') ? 'replay' : url.includes('sim.worker') ? 'sim' : 'other';
        worker.addEventListener('error', event => record({ kind, id: -1, error: event.message }));
        worker.addEventListener('message', (event: MessageEvent) => {
          const data = event.data;
          if (data.error) record({ kind, id: data.id, error: data.error });
          if (!data.world) return;
          const text = stable(data.world);
          const observation: Observation = { kind, id: data.id, seq: data.seq, day: data.world.day, engine: data.history?.engineFingerprint };
          void crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(digest => {
            observation.hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
            record(observation);
          }).catch(error => record({ kind, id: data.id, error: String(error) }));
        });
        return worker;
      },
    });
  });
  return {
    observations,
    async check(required: string[]) {
      for (const name of required) {
        const loaded = [...new Set(workers.filter(url => new URL(url).pathname.includes(`${name}.worker`)))];
        expect(loaded, `${name} Worker must actually start`).not.toEqual([]);
        for (const url of loaded) expect(verifiedJs.has(url), `Worker JavaScript MIME: ${url}`).toBe(true);
      }
      expect(observations.filter(item => item.error)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as ObserverWindow).__compatWorkerMessages.filter(item => item.error))).toEqual([]);
      expect(errors).toEqual([]); expect(failed).toEqual([]); expect(mimeErrors).toEqual([]);
    },
    async attach() {
      await info.attach('compatibility-runtime.json', { body: JSON.stringify({ url: page.url(), workers, responses, observations, errors, failed, mimeErrors }, null, 2), contentType: 'application/json' });
    },
  };
}

async function button(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}
async function drawer(page: Page, name: string) {
  await expect(page.locator('.game-layout')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '游戏工具' });
  if (await nav.isVisible()) await nav.getByRole('button', { name, exact: true }).click();
  else if (name === '国家' || name === '军令') await page.locator('.right-panel-switch').getByRole('button', { name, exact: true }).click();
}
async function historyPanel(page: Page) {
  await drawer(page, '纪事');
  await page.locator('.chronicle-tabs').getByRole('button', { name: '历史', exact: true }).click();
  await expect(page.getByTestId('history-panel')).toBeVisible();
}
async function government(page: Page) {
  await drawer(page, '国家');
  await expect(page.getByTestId('government-panel')).toBeVisible();
}
async function historySlots(page: Page, id: string): Promise<StoredHistory> {
  const raw = await page.evaluate(id => new Promise<{ slots: string; revision: number; usage: string; count: number; record: HistoryRecord }>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-history-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['runs', 'meta'], 'readonly');
      const run = tx.objectStore('runs').get(id), usage = tx.objectStore('meta').get('usage'), count = tx.objectStore('runs').count();
      tx.oncomplete = () => {
        db.close();
        if (!run.result) { reject(new Error(`Missing synthetic history ${id}`)); return; }
        resolve({ slots: JSON.stringify(run.result), revision: run.result.revision, usage: JSON.stringify(usage.result), count: count.result, record: run.result.current.record });
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), id);
  return { slotsHash: sha(raw.slots), slotsBytes: Buffer.byteLength(raw.slots), revision: raw.revision, usage: raw.usage, count: raw.count, record: raw.record };
}
function sourceIdentity(stored: StoredHistory) {
  // Global usage grows for new independent runs. All source slots, including
  // current, backup, and revision, must remain byte-for-byte unchanged.
  return { slotsHash: stored.slotsHash, slotsBytes: stored.slotsBytes, revision: stored.revision };
}
async function writeIsolatedHistory(page: Page, id: string, slots: unknown, usage: unknown) {
  await page.evaluate(({ id, slots, usage }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-history-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('runs'); request.result.createObjectStore('meta'); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['runs', 'meta'], 'readwrite');
      tx.objectStore('runs').put(slots, id); tx.objectStore('meta').put(usage, 'usage');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), { id, slots, usage });
}
async function saveSlots(page: Page, id: string): Promise<{ slotsHash: string; world: World }> {
  const raw = await page.evaluate(id => new Promise<{ bytes: string; world: World }>((resolve, reject) => {
    const request = indexedDB.open(`lieguoji-custom-${id}-v1`, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('saves', 'readonly'), store = tx.objectStore('saves');
      const current = store.get('current'), backup = store.get('backup'), revision = store.get('revision');
      tx.oncomplete = () => { db.close(); resolve({ bytes: JSON.stringify({ current: current.result, backup: backup.result, revision: revision.result }), world: current.result.world }); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), id);
  return { slotsHash: sha(raw.bytes), world: raw.world };
}
async function importGolden(page: Page, kind: 'modern' | 'legacy') {
  await page.goto('/?demo=1');
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible({ timeout: 15_000 });
  await historyPanel(page);
  await page.getByLabel('选择历史记录文件', { exact: true }).setInputFiles(fixturePath(`golden-0.4-${kind}.json`));
  await page.getByRole('alertdialog').getByRole('button', { name: '确认导入历史', exact: true }).click();
  await expect(page).toHaveURL(/\?world=run-h-/);
  await expect(page.getByTestId('replay-banner')).toContainText('历史归档');
  await historyPanel(page);
  await expect(page.getByTestId('history-replay-controls')).toBeVisible();
  const archived = await historySlots(page, runId(page));
  expect(archived.record.readOnly).toBe(true);
  expect(archived.record.history).toEqual(fixture<HistoryFile>(`golden-0.4-${kind}.json`).history);
  expect(archived.record.world).toEqual(fixture<World>(`golden-0.4-${kind}.final-world.json`));
  return archived;
}
async function seek(page: Page, seq: number, expected: Expected) {
  await historyPanel(page);
  const count = await page.evaluate(() => (window as unknown as ObserverWindow).__compatWorkerMessages.length);
  await page.getByLabel('记录序号', { exact: true }).fill(String(seq));
  await button(page, '定位记录');
  const state = expected.entryHashes.find(item => item.seq === seq)!;
  await expect(page.getByTestId('history-seq')).toHaveText(String(seq));
  await expect(page.getByTestId('day-number')).toHaveText(String(state.day));
  await expect(page.getByRole('button', { name: '定位记录', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(({ count, seq }) => (window as unknown as ObserverWindow).__compatWorkerMessages.slice(count).find(item => item.kind === 'replay' && item.seq === seq)?.hash, { count, seq })).toBe(state.hash);
}
async function ledger(page: Page, world: World) {
  const nationId = world.nations[0].id, state = world.statecraft!.nations.find(item => item.nationId === nationId)!;
  const actual = state.lastLedger!;
  await government(page);
  await page.getByLabel('查看国家', { exact: true }).selectOption(nationId);
  await page.locator('.government-tabs').getByRole('button', { name: '经营', exact: true }).click();
  await expect(page.getByLabel('国家政策', { exact: true })).toHaveValue(state.priority);
  await expect(page.getByLabel('国家政策', { exact: true })).toBeDisabled();
  const details = page.locator('.ledger-details');
  await expect(details.locator('summary')).toContainText(`第 ${actual.day} 日`);
  if (!await details.evaluate(element => (element as HTMLDetailsElement).open)) await details.locator('summary').click();
  const rows = page.getByTestId('nation-ledger').locator('div');
  for (const [label, value] of [['期初粮库', amount(actual.openingGrain)], ['当日生产', `+${amount(actual.production)}`], ['实际民用消耗', `−${amount(actual.civilianConsumed)}`], ['实际军队消耗', `−${amount(actual.militaryConsumed)}`], ['结余粮库', amount(actual.closingGrain)]]) {
    await expect(rows.filter({ has: page.locator('dt', { hasText: label }) }).locator('dd')).toHaveText(value);
  }
  await expect(page.getByRole('button', { name: '预览国策', exact: true })).toHaveCount(0);
}
async function branch64(page: Page, source: StoredHistory, expected: Expected) {
  await seek(page, 64, expected);
  const oldUrl = page.url();
  await button(page, '从此处创建分支');
  await expect(page.getByRole('alertdialog')).toContainText('记录 #64');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认创建分支', exact: true }).click();
  await expect(page).not.toHaveURL(oldUrl);
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  const branchId = runId(page), initial = await historySlots(page, branchId);
  const point = source.record.history.checkpoints.find(item => item.seq === 64)!;
  expect(initial.record.history.engineFingerprint).toBe(ENGINE);
  expect(initial.record.history.parent).toEqual({ runId: source.record.history.runId, seq: 64, worldHash: point.hash });
  expect(initial.record.history.entries).toEqual([]);
  expect({ ...initial.record.world, custom: point.world.custom }).toEqual(point.world);
  expect(initial.record.history.runId).toBe(branchId);
  expect(initial.record.readOnly).toBe(false);
  return { branchId, day: point.world.day };
}
async function advanceAndSave(page: Page, day: number) {
  await drawer(page, '舆图');
  await page.getByRole('button', { name: '推进一日', exact: true }).click();
  await expect(page.getByTestId('day-number')).toHaveText(String(day));
  await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
  await drawer(page, '存档'); await button(page, '保存');
  await expect(page.getByText(`已保存 · 第 ${day} 日`, { exact: true }).filter({ visible: true })).toBeVisible();
}
async function expectFrozenSimulation(page: Page, day: number) {
  await expect.poll(() => page.evaluate(({ day, engine }) => (window as unknown as ObserverWindow).__compatWorkerMessages.some(item => item.kind === 'sim' && item.day === day && item.engine === engine && !!item.hash), { day, engine: ENGINE })).toBe(true);
}
async function exportHistory(page: Page, info: TestInfo): Promise<HistoryFile> {
  const pending = page.waitForEvent('download'); await button(page, '导出历史');
  const download = await pending, path = info.outputPath('exported-compatibility.json');
  await download.saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')) as HistoryFile;
}

test('0.4 modern 黄金历史实际 Worker 回放、当时账册和同引擎分支保存恢复', async ({ page }, info) => {
  const evidence = await runtime(page, info);
  try {
    const source = await importGolden(page, 'modern'), sourceId = runId(page);
    const expected = fixture<Expected>('golden-0.4-modern.expected.json');
    for (const seq of [32, 64, 70]) {
      await seek(page, seq, expected);
      const world = seq === 70 ? source.record.world : source.record.history.checkpoints.find(item => item.seq === seq)!.world;
      await ledger(page, world);
      expect(sourceIdentity(await historySlots(page, sourceId))).toEqual(sourceIdentity(source));
    }
    await page.screenshot({ path: info.outputPath('frozen-modern-ledger.png'), fullPage: true });
    const { branchId, day } = await branch64(page, source, expected);
    await advanceAndSave(page, day + 1);
    await expectFrozenSimulation(page, day + 1);
    const saved = await historySlots(page, branchId);
    expect(saved.record.history.engineFingerprint).toBe(ENGINE);
    expect(saved.record.history.entries).toHaveLength(1);
    expect(saved.record.history.entries[0].input).toEqual({ type: 'step', days: 1 });
    expect(sha(canonical({ ...saved.record.world, custom: source.record.world.custom }))).toBe(expected.entryHashes[65].hash);
    expect(sourceIdentity(await historySlots(page, sourceId))).toEqual(sourceIdentity(source));
    await page.reload();
    await expect(page.getByTestId('day-number')).toHaveText(String(day + 1));
    await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
    expect(sourceIdentity(await historySlots(page, branchId))).toEqual(sourceIdentity(saved));
    expect(sourceIdentity(await historySlots(page, sourceId))).toEqual(sourceIdentity(source));
    await historyPanel(page);
    await expect(page.getByTestId('history-panel')).toContainText('分支起点：原史记录 #64');
    await page.screenshot({ path: info.outputPath('frozen-modern-branch-restored.png'), fullPage: true });
    await evidence.check(['sim', 'replay']);
  } finally { await evidence.attach(); }
});

test('0.4 legacy 黄金继续旧规则，经营升级必须显式独立副本且原档保留', async ({ page }, info) => {
  const evidence = await runtime(page, info);
  try {
    const source = await importGolden(page, 'legacy'), sourceId = runId(page);
    const expected = fixture<Expected>('golden-0.4-legacy.expected.json');
    await seek(page, 32, expected); await seek(page, 70, expected);
    await government(page);
    await expect(page.getByTestId('government-panel')).toContainText('0.1.0');
    await expect(page.getByTestId('nation-ledger')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '创建经营推演副本', exact: true })).toHaveCount(0);
    const { branchId, day } = await branch64(page, source, expected);
    await advanceAndSave(page, day + 1);
    await expectFrozenSimulation(page, day + 1);
    const oldBranch = await historySlots(page, branchId);
    expect(oldBranch.record.world).toMatchObject({ schemaVersion: 1, rulesVersion: '0.1.0' });
    expect(oldBranch.record.world).not.toHaveProperty('statecraft');
    expect(oldBranch.record.history.engineFingerprint).toBe(ENGINE);
    expect(sha(canonical({ ...oldBranch.record.world, custom: source.record.world.custom }))).toBe(expected.entryHashes[65].hash);
    await page.reload(); await expect(page.getByTestId('day-number')).toHaveText(String(day + 1));
    expect(sourceIdentity(await historySlots(page, branchId))).toEqual(sourceIdentity(oldBranch));
    expect(sourceIdentity(await historySlots(page, sourceId))).toEqual(sourceIdentity(source));
    await page.screenshot({ path: info.outputPath('frozen-legacy-branch-restored.png'), fullPage: true });

    // History v1 has no operating-economy migration action. Exercise the existing
    // explicit copy entry using its original synthetic ordinary-save source.
    await page.goto('/'); await expect(page.getByTestId('studio-canvas')).toBeVisible();
    await page.getByLabel('选择世界草稿文件', { exact: true }).setInputFiles(fixturePath('legacy-source.json'));
    await page.getByRole('alertdialog').getByRole('button', { name: '确认执行', exact: true }).click();
    await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
    const originalId = runId(page), original = await saveSlots(page, originalId), originalUrl = page.url();
    expect(original.world).toMatchObject({ schemaVersion: 1, rulesVersion: '0.1.0', day: 7 });
    await government(page); await button(page, '创建经营推演副本');
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(page.url()).toBe(originalUrl); expect((await saveSlots(page, originalId)).slotsHash).toBe(original.slotsHash);
    await button(page, '创建经营推演副本');
    await page.getByRole('alertdialog').getByRole('button', { name: '确认创建副本', exact: true }).click();
    await expect(page).not.toHaveURL(originalUrl);
    await expect(page.getByRole('button', { name: '推进一日', exact: true })).toBeEnabled();
    const upgradedId = runId(page), upgraded = await saveSlots(page, upgradedId);
    expect(upgradedId).not.toBe(originalId);
    expect(upgraded.world).toMatchObject({ schemaVersion: 2, rulesVersion: '0.2.0', day: 7 });
    expect(upgraded.world.statecraft).toBeDefined();
    expect(upgraded.world.armies).toEqual(original.world.armies);
    expect(upgraded.world.provinces).toEqual(original.world.provinces);
    await advanceAndSave(page, 8);
    const saved = await saveSlots(page, upgradedId);
    expect(saved.world.statecraft!.nations.every(nation => nation.lastLedger?.day === 8)).toBe(true);
    await page.reload(); await expect(page.getByTestId('day-number')).toHaveText('8');
    expect((await saveSlots(page, upgradedId)).slotsHash).toBe(saved.slotsHash);
    expect((await saveSlots(page, originalId)).slotsHash).toBe(original.slotsHash);
    expect(sourceIdentity(await historySlots(page, sourceId))).toEqual(sourceIdentity(source));
    expect(sourceIdentity(await historySlots(page, branchId))).toEqual(sourceIdentity(oldBranch));
    await government(page); await page.screenshot({ path: info.outputPath('explicit-economy-copy.png'), fullPage: true });
    await evidence.check(['sim', 'replay']);
  } finally { await evidence.attach(); }
});

test('未知引擎的合法历史只读保留与导出，不回放、不计算账册且整对源库不变', async ({ page }, info) => {
  const evidence = await runtime(page, info);
  try {
    await page.goto('/'); await expect(page.getByTestId('studio-canvas')).toBeVisible();
    const history = fixture<HistoryFile>('golden-0.4-modern.json').history;
    history.engineFingerprint = UNKNOWN_ENGINE;
    // A checkpoint is not the tail: use the true seq-70 final world (day 66),
    // never the seq-64 checkpoint (day 60), so this is valid unknown evidence.
    const world = fixture<World>('golden-0.4-modern.final-world.json');
    expect(world.day).toBe(66); expect(history.checkpoints.at(-1)!.world.day).toBe(60);
    const id = 'run-h-ffffffff-0000-4000-8000-000000000001';
    const record: HistoryRecord = { storageId: id, readOnly: true, world, history };
    const envelope = { format: 'lieguoji-history-record', version: 1, checksum: sha(JSON.stringify(record)), record };
    const slots = { format: 'lieguoji-history-slots', version: 1, current: envelope, backup: envelope, revision: 7 };
    const usage = { format: 'lieguoji-history-usage', version: 1, bytes: Buffer.byteLength(JSON.stringify(envelope)) * 2 };
    await writeIsolatedHistory(page, id, slots, usage);
    const before = await historySlots(page, id);
    await page.goto(`/?world=${id}`);
    await expect(page.getByTestId('replay-banner')).toContainText('规则引擎未注册');
    await expect(page.getByTestId('day-number')).toHaveText('66');
    await expect(page.getByRole('button', { name: '推进一日', exact: true })).toHaveCount(0);
    await historyPanel(page);
    await expect(page.getByTestId('history-panel')).toContainText('可查看已有事实并导出');
    await expect(page.getByTestId('history-panel')).toContainText('不能重新计算回放、规则账册或创建分支');
    await expect(page.getByTestId('history-replay-controls')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '进入历史回放', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '从此处创建分支', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '导入历史', exact: true })).toBeDisabled();
    const exported = await exportHistory(page, info);
    expect(exported.history).toEqual(history);
    expect(exported.checksum).toBe(sha(JSON.stringify(history)));
    await government(page);
    await expect(page.getByTestId('nation-ledger')).toHaveCount(0);
    await expect(page.getByTestId('nation-population')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '预览国策', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '预览宣战', exact: true })).toHaveCount(0);
    await drawer(page, '军令');
    await expect(page.getByRole('button', { name: /^预览命令/ })).toHaveCount(0);
    await drawer(page, '存档');
    await expect(page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true })).toBeDisabled();
    expect(await historySlots(page, id)).toEqual(before);
    await page.reload(); await expect(page.getByTestId('replay-banner')).toContainText('规则引擎未注册');
    expect(await historySlots(page, id)).toEqual(before);
    expect(evidence.observations.filter(item => item.kind === 'replay' || item.kind === 'sim')).toEqual([]);
    await historyPanel(page); await page.screenshot({ path: info.outputPath('unknown-engine-preserved.png'), fullPage: true });
    await evidence.check([]);
  } finally { await evidence.attach(); }
});

test('未来版本读取失败仍能导出受保护原始主备，刷新后原库和版本不变', async ({ page }, info) => {
  const evidence = await runtime(page, info);
  try {
    await page.goto('/'); await expect(page.getByTestId('studio-canvas')).toBeVisible();
    const id = 'run-h-ffffffff-0000-4000-8000-000000000002', scope = `custom-${id}`;
    const futureEnvelope = (marker: string) => {
      const old = fixture<HistoryFile>('golden-0.4-modern.json').history;
      const futureWorld = (world: World) => ({ ...world, schemaVersion: 99, rulesVersion: '9.0.0', futureField: { marker, values: [1, 2, 3] } });
      const history = {
        ...old, version: 99, rulesVersion: '9.0.0', futureHistory: { marker, preserveUnknownFields: true },
        initial: { ...old.initial, world: futureWorld(old.initial.world) },
        checkpoints: old.checkpoints.map(point => ({ ...point, world: futureWorld(point.world) })),
      };
      const record = { storageId: id, readOnly: true, world: futureWorld(fixture<World>('golden-0.4-modern.final-world.json')), history };
      return { format: 'lieguoji-history-record', version: 1, checksum: sha(JSON.stringify(record)), record };
    };
    const current = futureEnvelope('未来当前结构'), backup = futureEnvelope('未来备份结构');
    const slots = { format: 'lieguoji-history-slots', version: 1, current, backup, revision: 11 };
    const usage = { format: 'lieguoji-history-usage', version: 1, bytes: Buffer.byteLength(JSON.stringify(current)) + Buffer.byteLength(JSON.stringify(backup)) };
    await writeIsolatedHistory(page, id, slots, usage);
    const before = await historySlots(page, id);
    const original = { ...sourceIdentity(before), usage: before.usage, count: before.count };
    await page.goto(`/?world=${id}`);
    for (const attempt of ['initial', 'after-reload']) {
      if (attempt === 'after-reload') await page.reload();
      await expect(page.getByRole('heading', { name: '尚未载入推演', exact: true })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: '版本不兼容' })).toBeVisible();
      await expect(page.getByTestId('map-canvas')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '推进一日', exact: true })).not.toBeVisible();
      await expect(page.getByRole('button', { name: '继续推演', exact: true })).not.toBeVisible();
      const exportButton = page.getByRole('button', { name: '导出受保护原始备份', exact: true });
      await expect(exportButton).toBeEnabled();
      const pending = page.waitForEvent('download'); await exportButton.click();
      const download = await pending, path = info.outputPath(`future-protected-${attempt}.json`);
      await download.saveAs(path);
      const exported = JSON.parse(await readFile(path, 'utf8')) as {
        format: string; version: number; scope: string; createdAt: string; checksum: string;
        records: { kind: string; database: string; databaseVersion: number; storageId: string; run: { present: boolean; value: unknown }; usageStorePresent: boolean; usage: { present: boolean; value: unknown } };
      };
      expect(exported).toMatchObject({ format: 'lieguoji-protected-backup', version: 1, scope });
      expect(Number.isFinite(Date.parse(exported.createdAt))).toBe(true);
      expect(exported.checksum).toBe(sha(JSON.stringify(exported.records)));
      expect(exported.records).toEqual({
        kind: 'history', database: 'lieguoji-history-v1', databaseVersion: 1, storageId: id,
        run: { present: true, value: slots }, usageStorePresent: true, usage: { present: true, value: usage },
      });
      // Includes both distinct future payloads, current/backup envelopes, their
      // true JSON checksums, the complete 70-input histories, and revision 11.
      expect(sha(JSON.stringify(exported.records.run.value))).toBe(before.slotsHash);
      const after = await historySlots(page, id);
      expect({ ...sourceIdentity(after), usage: after.usage, count: after.count }).toEqual(original);
    }
    expect(evidence.observations.filter(item => item.kind === 'replay' || item.kind === 'sim')).toEqual([]);
    await page.screenshot({ path: info.outputPath('future-version-export-protection.png'), fullPage: true });
    await evidence.check([]);
  } finally { await evidence.attach(); }
});
