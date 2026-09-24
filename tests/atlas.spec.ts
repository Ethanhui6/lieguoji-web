import { test, expect, type Page } from '@playwright/test';

const studio = (page: Page) => page.getByTestId('atlas-studio');
async function ready(page: Page, state = 'ready') {
  await expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
}
async function button(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}
async function panel(page: Page, name: '地图' | '编辑' | '草稿') {
  await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
}
async function create(page: Page, name: string, size = '256') {
  await page.goto('/?atlas=new');
  await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('PH04-browser-fixed-01');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption(size);
  await button(page, '新建空白海洋草稿');
  await ready(page);
  await expect(page.getByTestId('atlas-canvas')).toBeVisible();
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function locate(page: Page, id = 32896) {
  await panel(page, '编辑');
  await page.getByLabel('定位地块编号', { exact: true }).fill(String(id));
  await button(page, '定位');
  await expect(studio(page)).toHaveAttribute('data-selectedcell', String(id));
}
async function previewHeight(page: Page, height: number, range = '32') {
  await button(page, '高程');
  await page.getByLabel('目标高程（米）', { exact: true }).fill(String(height));
  await page.getByLabel('高程编辑范围', { exact: true }).selectOption(range);
  await button(page, '预览地理编辑');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toBeVisible({ timeout: 30000 });
  await ready(page);
}
async function confirm(page: Page, revision: number) {
  await button(page, '确认地理编辑');
  await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', String(revision));
}
// Read actual immutable-root bytes. Never open or modify a player's real profile.
async function rootBytes(page: Page, id: string) {
  return page.evaluate(draftId => new Promise<number[]>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('roots', 'readonly'), row = tx.objectStore('roots').get(draftId);
      tx.oncomplete = () => { db.close(); resolve([...row.result as Uint8Array]); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), id);
}

async function expectVisibleHeightHaloRepaint(page: Page) {
  const rendered = await page.getByTestId('atlas-canvas').evaluate(element => new Promise<{ camera: { x: number; y: number; scale: number }; viewport: { width: number; height: number }; repaintBlockKeys: string[] }>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { element.removeEventListener('atlas-metrics-response', listener); reject(new Error('Missing read-only repaint metrics')); }, 10000);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail; if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener('atlas-metrics-response', listener); resolve(detail.metrics);
    };
    element.addEventListener('atlas-metrics-response', listener); element.dispatchEvent(new CustomEvent('atlas-metrics-request', { detail: { requestId } }));
  }));
  // The actual edit still writes exactly four authority blocks (3/4 × 3/4).
  // True-neighbor texture halos also depend on the surrounding display cores.
  // Verify the exact visible set, instead of pretending those extra real draws
  // are the original four or raising an arbitrary numerical allowance.
  const { camera, viewport } = rendered, minX = -camera.x / camera.scale, minY = -camera.y / camera.scale;
  const maxX = (viewport.width - camera.x) / camera.scale, maxY = (viewport.height - camera.y) / camera.scale, expected: string[] = [];
  for (let by = 2; by <= 5; by++) for (let bx = 2; bx <= 5; bx++) {
    if (bx >= Math.floor(minX / 512) && bx <= Math.floor(maxX / 512) && by >= Math.floor(minY / 512) && by <= Math.floor(maxY / 512)) expected.push(`geometry:${bx}:${by}`);
  }
  expect([...rendered.repaintBlockKeys].sort()).toEqual([...expected].sort());
  expect(Number(await studio(page).getAttribute('data-atlas-repainted-blocks'))).toBe(expected.length);
}

test('65k真实大图：点选、浏览、取消、跨块编辑、共享顶点、撤销和刷新恢复', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const id = await create(page, '山河跨块验收');
  const originalRoot = await rootBytes(page, id);
  const canvas = page.getByTestId('atlas-canvas'), bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width * .5, y = bounds.y + bounds.height * .35;
  if (info.project.name === 'desktop-chromium') await page.mouse.click(x, y);
  else await page.touchscreen.tap(x, y);
  await expect(studio(page)).not.toHaveAttribute('data-selectedcell', '');
  await panel(page, '地图');
  const initialZoom = await page.getByTestId('atlas-zoom').innerText();
  await button(page, '放大大世界地图');
  await expect(page.getByTestId('atlas-zoom')).not.toHaveText(initialZoom);
  if (info.project.name === 'desktop-chromium') {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 35, y + 20, { steps: 5 }); await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + 35, y: y + 20 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const beforePinch = await page.getByTestId('atlas-zoom').innerText();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 25, y }, { id: 2, x: x + 25, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 55, y }, { id: 2, x: x + 55, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.getByTestId('atlas-zoom')).not.toHaveText(beforePinch);
    } finally { await cdp.detach(); }
  }
  expect(await rootBytes(page, id)).toEqual(originalRoot);
  await locate(page);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  await previewHeight(page, 200);
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toHaveAttribute('data-atlas-preview-cells', '1024');
  expect(await rootBytes(page, id)).toEqual(originalRoot);
  await button(page, '取消编辑');
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  expect(await rootBytes(page, id)).toEqual(originalRoot);
  await previewHeight(page, 200); await confirm(page, 1);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('200 米');
  const heightRoot = await rootBytes(page, id);
  expect(heightRoot).not.toEqual(originalRoot);
  await expectVisibleHeightHaloRepaint(page);
  await button(page, '共享顶点');
  await page.getByLabel('顶点东西位移', { exact: true }).fill('0.25');
  await page.getByLabel('顶点南北位移', { exact: true }).fill('0');
  await button(page, '预览地理编辑');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toHaveAttribute('data-atlas-preview-cells', '4');
  await ready(page); await confirm(page, 2);
  expect(await rootBytes(page, id)).not.toEqual(heightRoot);
  await button(page, '撤销大世界编辑'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '3');
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('200 米');
  const savedRoot = await rootBytes(page, id), hash = await studio(page).getAttribute('data-atlas-hash');
  await page.reload(); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-id', id);
  await expect(studio(page)).toHaveAttribute('data-atlas-hash', hash!);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '3');
  expect(await rootBytes(page, id)).toEqual(savedRoot);
  await locate(page); await expect(page.getByTestId('atlas-selected-height')).toHaveText('200 米');
  await page.screenshot({ path: info.outputPath('atlas-restored.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('只读备份生成独立可编辑草稿，原主备不被回滚或覆盖', async ({ page }, info) => {
  test.setTimeout(150000);
  const id = await create(page, '备份来源', '128');
  await locate(page, 8256); await previewHeight(page, 120, '1'); await confirm(page, 1);
  const source = await rootBytes(page, id);
  await panel(page, '草稿'); await button(page, '查看备份 备份来源');
  await page.getByRole('alertdialog').getByRole('button', { name: '读取只读备份', exact: true }).click();
  await ready(page, 'readonly');
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0');
  await locate(page, 8256); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  await expect(page.getByRole('button', { name: '预览地理编辑', exact: true })).toHaveCount(0);
  expect(await rootBytes(page, id)).toEqual(source);
  await expect(page).toHaveURL(/atlas-source=backup/);
  await page.reload(); await ready(page, 'readonly');
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0');
  await locate(page, 8256); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  expect(await rootBytes(page, id)).toEqual(source);
  await panel(page, '草稿'); await button(page, '创建独立副本');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认创建独立副本', exact: true }).click();
  await ready(page);
  const copyId = (await studio(page).getAttribute('data-atlas-id'))!;
  expect(new URL(page.url()).searchParams.has('atlas-source')).toBe(false);
  expect(copyId).not.toBe(id); expect(await rootBytes(page, id)).toEqual(source);
  await locate(page, 8256); await previewHeight(page, 500, '1'); await confirm(page, 1);
  expect(await rootBytes(page, id)).toEqual(source);
  await page.reload(); await ready(page); await locate(page, 8256);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('500 米');
  expect(await rootBytes(page, id)).toEqual(source);
  await page.screenshot({ path: info.outputPath('atlas-independent-backup-copy.png'), fullPage: true });
});

test('双标签陈旧命令拒绝覆盖，新标签恢复已经提交的内容', async ({ page, context }) => {
  test.setTimeout(150000);
  const id = await create(page, '双标签冲突', '128');
  await locate(page, 8256); await previewHeight(page, 120, '1');
  const other = await context.newPage();
  try {
    await other.goto(page.url()); await ready(other); await locate(other, 8256);
    await previewHeight(other, 450, '1'); await confirm(other, 1);
    const committed = await rootBytes(other, id);
    await button(page, '确认地理编辑');
    await expect(page.getByRole('alert')).toContainText(/CAS|变化|冲突/, { timeout: 30000 });
    expect(await rootBytes(page, id)).toEqual(committed);
    await page.reload(); await ready(page); await locate(page, 8256);
    await expect(page.getByTestId('atlas-selected-height')).toHaveText('450 米');
    expect(await rootBytes(page, id)).toEqual(committed);
  } finally { await other.close(); }
});

test('缺失大世界链接不伪造新世界；原工坊可往返且大世界选择独立', async ({ page }) => {
  await page.goto('/?atlas=atlas-00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toContainText('没有找到该草稿存档');
  await expect(studio(page)).toHaveAttribute('data-atlas-id', '');
  await page.getByRole('button', { name: '返回原世界工坊', exact: true }).first().click();
  await expect(page.getByTestId('world-studio')).toBeVisible();
  await page.getByRole('navigation', { name: '世界工坊工具' }).getByRole('button', { name: '世界', exact: true }).click();
  await page.getByRole('button', { name: /^大世界草稿/ }).click();
  await ready(page, 'empty');
  await expect(page).toHaveURL(/\?atlas=new$/);
});

test('取消扩展草稿准备保持原存档；旧备份链接轮换后拒绝悄悄换时点', async ({ page, context }) => {
  test.setTimeout(150000);
  const id = await create(page, '取消与时点保护', '128');
  const original = await rootBytes(page, id);
  await panel(page, '草稿');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('512');
  await button(page, '新建空白海洋草稿');
  await page.getByRole('alertdialog').getByRole('button', { name: '确认新建草稿', exact: true }).click();
  await button(page, '取消操作'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-id', id);
  expect(await rootBytes(page, id)).toEqual(original);
  await locate(page, 8256); await previewHeight(page, 120, '1'); await confirm(page, 1);
  await panel(page, '草稿'); await button(page, '查看备份 取消与时点保护');
  await page.getByRole('alertdialog').getByRole('button', { name: '读取只读备份', exact: true }).click();
  await ready(page, 'readonly'); const boundUrl = page.url();
  const other = await context.newPage();
  try {
    await other.goto(`/?atlas=${id}`); await ready(other); await locate(other, 8256);
    await previewHeight(other, 350, '1'); await confirm(other, 2);
    const source = await rootBytes(other, id);
    await page.goto(boundUrl);
    await expect(page.getByRole('alert')).toContainText('备份位置已变化', { timeout: 30000 });
    await expect(studio(page)).toHaveAttribute('data-atlas-id', '');
    await expect(page.getByRole('button', { name: '预览地理编辑', exact: true })).toHaveCount(0);
    expect(await rootBytes(page, id)).toEqual(source);
    await expect(page).toHaveURL(boundUrl);
  } finally { await other.close(); }
});

test('已打开草稿的备份被换成未知版本时，确认与刷新都保护原主备', async ({ page }) => {
  test.setTimeout(120000);
  const id = await create(page, '未来备份保护', '128');
  await locate(page, 8256); await previewHeight(page, 120, '1'); await confirm(page, 1);
  const savedRoot = await rootBytes(page, id);
  const backupKey = JSON.parse(new TextDecoder().decode(new Uint8Array(savedRoot))).backupManifest as string;
  // Inject into this test's isolated origin after the Worker owns its baseline.
  const changedBackup = await page.evaluate(key => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('manifests', 'readwrite'), store = tx.objectStore('manifests'), row = store.get(key); let value: unknown;
      row.onsuccess = () => { value = { ...row.result, version: 99 }; store.put(value, key); };
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(value)); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }), backupKey);
  await previewHeight(page, 500, '1'); await button(page, '确认地理编辑');
  await expect(page.getByRole('alert')).toContainText(/版本|兼容|原像|变化|CAS/, { timeout: 30000 });
  expect(await rootBytes(page, id)).toEqual(savedRoot);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(/版本|兼容|原像|变化|CAS/, { timeout: 30000 });
  await expect(studio(page)).toHaveAttribute('data-atlas-id', '');
  expect(await rootBytes(page, id)).toEqual(savedRoot);
  const backupAfter = await page.evaluate(key => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('manifests', 'readonly'), row = tx.objectStore('manifests').get(key);
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(row.result)); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }), backupKey);
  expect(backupAfter).toBe(changedBackup);
});

test('关闭正在创建大世界的页面后，原草稿仍可恢复且没有半成品根', async ({ page, context }) => {
  test.setTimeout(120000);
  const id = await create(page, '关页保护来源', '128');
  const original = await rootBytes(page, id);
  const pending = await context.newPage();
  await pending.goto('/?atlas=new'); await ready(pending, 'empty');
  await pending.getByLabel('大世界地理规模', { exact: true }).selectOption('512');
  await button(pending, '新建空白海洋草稿');
  await expect(pending.locator('.inspector-notice[role="status"]')).toContainText('创建空白海洋共享地理', { timeout: 30000 });
  await pending.close();
  await page.reload(); await ready(page);
  expect(await rootBytes(page, id)).toEqual(original);
  const keys = await page.evaluate(() => new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('roots', 'readonly'), rows = tx.objectStore('roots').getAllKeys();
      tx.oncomplete = () => { db.close(); resolve(rows.result); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  }));
  expect(keys).toEqual([id]);
  await locate(page, 8256); await previewHeight(page, 210, '1'); await confirm(page, 1);
  await page.reload(); await ready(page); await locate(page, 8256);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('210 米');
});

test('存储已提交后取消接收画面，明确锁定显示并刷新恢复该提交', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?atlas=new'); await ready(page, 'empty');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('512');
  await button(page, '新建空白海洋草稿');
  await expect(page.locator('.inspector-notice[role="status"]')).toContainText('建立地块空间索引', { timeout: 90000 });
  const id = new URL(page.url()).searchParams.get('atlas')!;
  expect(id).toMatch(/^atlas-[0-9a-f-]+$/);
  const committed = await rootBytes(page, id);
  expect(committed.length).toBeGreaterThan(0);
  await button(page, '取消操作');
  await ready(page, 'fatal');
  await expect(page.getByRole('alert')).toContainText(/已提交的草稿仍保留|存档已保留/);
  await expect(page.getByRole('button', { name: '新建空白海洋草稿', exact: true }).filter({ visible: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '撤销大世界编辑', exact: true }).filter({ visible: true })).toBeDisabled();
  expect(await rootBytes(page, id)).toEqual(committed);
  await button(page, '刷新并恢复已保存草稿'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-id', id);
  expect(await rootBytes(page, id)).toEqual(committed);
  await locate(page, 261630);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
});
