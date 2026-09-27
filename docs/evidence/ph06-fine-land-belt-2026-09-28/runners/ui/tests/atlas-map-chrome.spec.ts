import { createHash } from 'node:crypto';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { databaseDigest, metrics, saved } from '../../../../tests/helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../../../../src/world/renderer';

// Authored, not executed. This file runs from this isolated staging directory.
// One real UI-created empty v4 draft, one context, then viewport-only resizing.
// No generator imports, injected world, or IndexedDB writes. One real unfinished
// stroke generation is cancelled after the responsive checks; no committed coast.
const names = ['放大大世界地图', '缩小大世界地图', '全图', '浏览地图', '画大陆', '显示地块网格'] as const;
const studio = (page: Page) => page.getByTestId('atlas-studio');
const shelf = (page: Page) => page.getByRole('group', { name: '地图视图与创作工具', exact: true });
const tool = (page: Page, name: typeof names[number]) => shelf(page).getByRole('button', { name, exact: true });
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });

async function frameReady(page: Page) {
  await expect.poll(async () => {
    const value = await metrics(page) as ReturnType<AtlasRenderer['metrics']>;
    return value.gpu.state === 'ready' && value.completedFrameSequence === value.frameSequence;
  }, { timeout: 20000 }).toBe(true);
}

async function reachable(button: Locator) {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  // Trial performs Playwright's actual hit-target/actionability checks; it does
  // not dispatch a click or change product state.
  await button.click({ trial: true });
  const result = await button.evaluate(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      label: element.getAttribute('aria-label') || element.textContent?.trim(),
      x: box.x, y: box.y, width: box.width, height: box.height,
      fontSize: parseFloat(style.fontSize),
      centerInViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      receivesPointer: !!hit && (hit === element || element.contains(hit)),
    };
  });
  expect(result.width, `${result.label}: minimum target width`).toBeGreaterThanOrEqual(44);
  expect(result.height, `${result.label}: minimum target height`).toBeGreaterThanOrEqual(44);
  expect(result.centerInViewport, `${result.label}: center inside viewport`).toBe(true);
  expect(result.receivesPointer, `${result.label}: actual hit target`).toBe(true);
  return result;
}

async function layout(page: Page) {
  await expect(shelf(page)).toHaveClass(/atlas-tool-shelf/);
  await expect(shelf(page).getByRole('button')).toHaveCount(names.length);
  const targets = [];
  for (const name of names) targets.push(await reachable(tool(page, name)));
  const dimensions = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
    forcedColors: matchMedia('(forced-colors: active)').matches,
  }));
  // scrollWidth is integer-rounded, unlike fractional CSS layout coordinates.
  expect(dimensions.htmlScrollWidth).toBeLessThanOrEqual(dimensions.viewport.width + 1);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.viewport.width + 1);
  const shelfBounds = await shelf(page).evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(shelfBounds.x).toBeGreaterThanOrEqual(0);
  expect(shelfBounds.x + shelfBounds.width).toBeLessThanOrEqual(dimensions.viewport.width + 1);
  const canvas = await page.getByTestId('atlas-canvas').boundingBox();
  expect(canvas).not.toBeNull();
  expect(canvas!.width).toBeGreaterThan(0);
  expect(canvas!.height).toBeGreaterThan(0);
  await expect(studio(page).locator('.atlas-status')).toBeVisible();
  const header = studio(page).locator('.workbench-header');
  await expect(header.getByRole('button', { name: '撤销大世界编辑', exact: true }).locator('span')).toHaveText('撤销');
  await expect(header.getByRole('button', { name: '撤销大世界编辑', exact: true }).locator('span')).toBeVisible();
  await expect(header.getByRole('button', { name: '返回原世界工坊', exact: true }).locator('span')).toHaveText('工坊');
  await expect(header.getByRole('button', { name: '返回原世界工坊', exact: true }).locator('span')).toBeVisible();
  for (const [name, text] of [['浏览地图', '浏览'], ['画大陆', '画大陆'], ['显示地块网格', '网格']] as const) {
    await expect(tool(page, name).locator('span')).toHaveText(text);
    await expect(tool(page, name).locator('span')).toBeVisible();
  }
  return { ...dimensions, shelf: shelfBounds, canvas, targets };
}

async function exerciseShelf(page: Page) {
  const before = (await metrics(page)).camera.scale;
  await tool(page, '放大大世界地图').click();
  await expect.poll(async () => (await metrics(page)).camera.scale).toBeGreaterThan(before);
  const enlarged = (await metrics(page)).camera.scale;
  await tool(page, '缩小大世界地图').click();
  await expect.poll(async () => (await metrics(page)).camera.scale).toBeLessThan(enlarged);
  await tool(page, '放大大世界地图').click();
  const beforeFit = (await metrics(page)).camera.scale;
  await tool(page, '全图').click();
  await frameReady(page);
  expect((await metrics(page)).camera.scale).toBeLessThan(beforeFit);
  await tool(page, '画大陆').click();
  await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'outline');
  await expect(tool(page, '画大陆')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, '画大陆').locator('span')).toHaveText('退出绘制');
  await expect(studio(page).locator('.atlas-drawing-hint')).toBeVisible();
  // Do not stroke the canvas: the existing coast suite owns generation/restore.
  await tool(page, '浏览地图').click();
  await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'browse');
  await expect(tool(page, '浏览地图')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, '画大陆')).toHaveAttribute('aria-pressed', 'false');
  await tool(page, '显示地块网格').click();
  await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'true');
  await expect(studio(page).locator('.atlas-status')).toContainText('近景网格已开启');
  // Whole-map LOD legitimately hides cell lines: do not mislabel requested grid
  // state as proof that actual fine cell boundaries were rendered here.
  await tool(page, '显示地块网格').click();
  await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'false');
  await expect(studio(page).locator('.atlas-status')).toContainText('已隐藏网格');
}

async function keyboardFocus(page: Page) {
  // Establish one anchor, then use real Tab/Shift+Tab through all six controls.
  await tool(page, names[0]).focus();
  await page.keyboard.press('Tab');
  await expect(tool(page, names[1])).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const observations = [];
  for (let index = 0; index < names.length; index++) {
    const button = tool(page, names[index]);
    await expect(button).toBeFocused();
    const focus = await button.evaluate(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return { focusVisible: element.matches(':focus-visible'), outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth), outlineColor: style.outlineColor,
        centerInViewport: box.left + box.width / 2 >= 0 && box.right - box.width / 2 < innerWidth
          && box.top + box.height / 2 >= 0 && box.bottom - box.height / 2 < innerHeight };
    });
    expect(focus.focusVisible, `${names[index]}: keyboard focus-visible`).toBe(true);
    expect(focus.outlineStyle, `${names[index]}: visible focus outline`).not.toBe('none');
    expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focus.centerInViewport).toBe(true);
    observations.push({ name: names[index], ...focus });
    if (index < names.length - 1) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Space');
  await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'true');
  return observations;
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await frameReady(page);
  const path = info.outputPath(`${name}.png`);
  const bytes = await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: 'image/png' });
  return { name, path, sha256: createHash('sha256').update(bytes).digest('hex') };
}

type ProgressRecord = {
  at: number; stage: string; completed: number; total: number;
  state: string; display: string; revision: string; digest: string;
};
type CancelJournal = { progress: ProgressRecord[]; clicks: (ProgressRecord & { trusted: boolean })[] };
type CancelHost = Window & { __mapChromeCancelObservation?: CancelJournal & { dispose: () => void } };

async function readCancelJournal(page: Page): Promise<CancelJournal | null> {
  return page.evaluate(() => {
    const value = (window as CancelHost).__mapChromeCancelObservation;
    return value ? { progress: value.progress, clicks: value.clicks } : null;
  });
}

async function cancelDuringFineHeightWrite(page: Page, info: TestInfo, draftId: string, screenshots: unknown[]) {
  const record: { completed: boolean; journal: CancelJournal | null; before?: unknown; cancelled?: unknown; restored?: unknown; contour?: unknown } = { completed: false, journal: null };
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('navigation', { name: '大世界草稿工具', exact: true }).getByRole('button', { name: '地图', exact: true }).click();
    await tool(page, '全图').click();
    await frameReady(page);
    const baseline = await saved(page, draftId, 4), beforeDatabase = await databaseDigest(page, 4);
    record.before = { root: baseline.root, database: beforeDatabase };
    // This observer only reads real DOM attributes and trusted UI clicks. It
    // neither changes the progress stage nor invokes application cancellation.
    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="atlas-studio"]');
      if (!element) throw new Error('Missing real Atlas Studio');
      const snapshot = (): ProgressRecord => ({
        at: performance.now(), stage: element.getAttribute('data-atlas-progress-stage') ?? '',
        completed: Number(element.getAttribute('data-atlas-progress-completed')),
        total: Number(element.getAttribute('data-atlas-progress-total')),
        state: element.getAttribute('data-atlas-state') ?? '',
        display: element.getAttribute('data-atlas-display') ?? '',
        revision: element.getAttribute('data-atlas-revision') ?? '',
        digest: element.getAttribute('data-atlas-hash') ?? '',
      });
      const progress: ProgressRecord[] = [], clicks: (ProgressRecord & { trusted: boolean })[] = [];
      const observe = () => {
        const next = snapshot(), last = progress.at(-1);
        if (progress.length < 2048 && (!last || next.stage !== last.stage || next.completed !== last.completed || next.state !== last.state)) progress.push(next);
      };
      const clicked = (event: Event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (button?.textContent?.trim() === '取消操作') clicks.push({ ...snapshot(), trusted: event.isTrusted });
      };
      const observer = new MutationObserver(observe);
      observer.observe(element, { attributes: true, attributeFilter: ['data-atlas-progress-stage', 'data-atlas-progress-completed', 'data-atlas-progress-total', 'data-atlas-state'] });
      document.addEventListener('click', clicked, true); observe();
      (window as CancelHost).__mapChromeCancelObservation = { progress, clicks, dispose: () => {
        observer.disconnect(); document.removeEventListener('click', clicked, true);
      } };
    });
    await tool(page, '画大陆').click();
    await expect(studio(page)).toHaveAttribute('data-atlas-tool', 'outline');
    const frame = await metrics(page), box = await page.getByTestId('atlas-canvas').boundingBox();
    if (!box) throw new Error('Missing actual map canvas bounds');
    const { width, height } = baseline.manifest.spec;
    const world = [[.18, .42], [.28, .25], [.55, .20], [.78, .34], [.84, .65], [.65, .82], [.36, .78], [.18, .60], [.18, .42]]
      .map(([x, y]) => ({ x: x * width, y: y * height }));
    const points = world.map(point => ({ x: box.x + frame.camera.x + point.x * frame.camera.scale, y: box.y + frame.camera.y + point.y * frame.camera.scale }));
    record.contour = { world, screen: points, camera: frame.camera };
    expect(await page.evaluate(points => points.every(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), points)).toBe(true);
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    try { for (const point of points.slice(1)) await page.mouse.move(point.x, point.y); }
    finally { await page.mouse.up(); }

    // Observe and cancel exactly once. A phase which was too fast to observe is
    // an honest failure, not a reason to retry, inject delays, or cancel a preview.
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="atlas-studio"]');
      const done = Number(element?.getAttribute('data-atlas-progress-completed'));
      const total = Number(element?.getAttribute('data-atlas-progress-total'));
      return element?.getAttribute('data-atlas-state') === 'busy'
        && /write-continuous-heights/.test(element.getAttribute('data-atlas-progress-stage') ?? '')
        && done > 0 && done < total;
    }, undefined, { timeout: 90000, polling: 'raf' });
    await expect(page.getByRole('region', { name: '大陆生成预览', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '取消操作', exact: true }).filter({ visible: true }).click();
    record.journal = await readCancelJournal(page);
    expect(record.journal?.clicks).toHaveLength(1);
    const clicked = record.journal!.clicks[0];
    expect(clicked.trusted).toBe(true);
    expect(clicked.stage).toMatch(/write-continuous-heights/);
    expect(clicked.state).toBe('busy');
    expect(clicked.completed).toBeGreaterThan(0);
    expect(clicked.completed).toBeLessThan(clicked.total);
    await ready(page);
    await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
    await expect(page.getByRole('region', { name: '大陆生成预览', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('草稿操作反馈', { exact: true })).toContainText('取消');
    await frameReady(page);
    const cancelled = await saved(page, draftId, 4), cancelledDatabase = await databaseDigest(page, 4);
    record.cancelled = { root: cancelled.root, database: cancelledDatabase };
    expect(cancelled.rootBytes).toEqual(baseline.rootBytes);
    expect(cancelled.manifestBytes).toEqual(baseline.manifestBytes);
    expect(cancelledDatabase).toEqual(beforeDatabase);
    record.journal = await readCancelJournal(page);
    screenshots.push(await screenshot(page, info, 'desktop-running-generation-cancelled'));
    await page.reload(); await ready(page); await frameReady(page);
    await expect(studio(page)).toHaveAttribute('data-atlas-id', draftId);
    await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
    await expect(page.getByRole('region', { name: '大陆生成预览', exact: true })).toHaveCount(0);
    const restored = await saved(page, draftId, 4), restoredDatabase = await databaseDigest(page, 4);
    record.restored = { root: restored.root, database: restoredDatabase };
    expect(restored.rootBytes).toEqual(baseline.rootBytes);
    expect(restored.manifestBytes).toEqual(baseline.manifestBytes);
    expect(restoredDatabase).toEqual(beforeDatabase);
    screenshots.push(await screenshot(page, info, 'desktop-cancelled-ocean-restored'));
    record.completed = true;
  } finally {
    try {
      const latest = await readCancelJournal(page);
      if (latest) record.journal = latest;
      await page.evaluate(() => (window as CancelHost).__mapChromeCancelObservation?.dispose());
    } catch { /* Keep already captured evidence if the actual page has closed. */ }
    await info.attach('map-chrome-running-cancel-observations', { contentType: 'application/json', body: JSON.stringify({
      scope: 'One real mouse stroke, one real cancel click during the v4 continuous-height write stage; no artificial delay, retries, or latency PASS claim.', ...record,
    }, null, 2) });
  }
}

test('map chrome and v4 running cancellation: one UI-created ocean draft', async ({ page }, info) => {
  const errors: string[] = [], states: unknown[] = [], screenshots: unknown[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  let draftId: string | null = null, completedAllAssertions = false;
  try {
    await page.goto('/?atlas=new&atlas-format=4');
    await ready(page, 'empty');
    await page.getByLabel('大世界草稿名称', { exact: true }).fill('地图工具架 · 独立空白海洋');
    await page.getByLabel('大世界生成种子', { exact: true }).fill('map-chrome-accessibility-v1');
    await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
    await page.getByRole('button', { name: '新建空白海洋草稿', exact: true }).click();
    await ready(page);
    await expect(studio(page)).toHaveAttribute('data-atlas-format', '4');
    await page.getByRole('navigation', { name: '大世界草稿工具', exact: true }).getByRole('button', { name: '地图', exact: true }).click();
    await frameReady(page);
    draftId = await studio(page).getAttribute('data-atlas-id');
    expect(draftId).toBeTruthy();
    const baseline = await saved(page, draftId!, 4);
    expect(baseline.manifest.spec.columns).toBe(128);
    expect(baseline.manifest.generation.lastApplied).toBeNull();
    await expect(studio(page).locator('.workbench-header').getByRole('button', { name: '撤销大世界编辑', exact: true })).toBeDisabled();

    for (const state of [
      { name: 'desktop', width: 1440, height: 960 },
      { name: 'tablet', width: 810, height: 1080 },
      { name: 'phone', width: 393, height: 852 },
    ]) {
      await page.setViewportSize({ width: state.width, height: state.height });
      await tool(page, '全图').click();
      await frameReady(page);
      const bounds = await layout(page);
      await exerciseShelf(page);
      const focus = await keyboardFocus(page);
      screenshots.push(await screenshot(page, info, `${state.name}-toolbar-grid-keyboard-focus`));
      states.push({ state: state.name, bounds, focus, actualCamera: (await metrics(page)).camera });
      await page.keyboard.press('Space');
      await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'false');
    }

    // Explicit text-only stress, not a claim of OS text sizing or browser zoom.
    // Tokens are rem-based. Verify the actual control text doubled, rather than
    // assuming that adding a CSS declaration enlarged the displayed text.
    const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const controlPx = await tool(page, '画大陆').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const textStyle = await page.addStyleTag({ content: `html { font-size: ${rootPx * 2}px !important; }` });
    try {
      await expect.poll(() => tool(page, '画大陆').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(controlPx * 2, 1);
      await frameReady(page);
      const bounds = await layout(page);
      await exerciseShelf(page);
      const focus = await keyboardFocus(page);
      screenshots.push(await screenshot(page, info, 'phone-200-percent-text-grid-keyboard-focus'));
      states.push({ state: 'phone-200-percent-rem-text', bounds, focus, baselineControlFontPx: controlPx });
      await page.keyboard.press('Space');
      await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'false');
    } finally { await textStyle.evaluate(element => element.remove()); }

    await page.emulateMedia({ forcedColors: 'active' });
    try {
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      const bounds = await layout(page);
      await exerciseShelf(page);
      const focus = await keyboardFocus(page);
      screenshots.push(await screenshot(page, info, 'phone-forced-colors-grid-keyboard-focus'));
      states.push({ state: 'phone-forced-colors', bounds, focus });
      await page.keyboard.press('Space');
      await expect(tool(page, '显示地块网格')).toHaveAttribute('aria-pressed', 'false');
    } finally { await page.emulateMedia({ forcedColors: 'none' }); }

    await expect(studio(page)).toHaveAttribute('data-atlas-id', draftId!);
    await expect(studio(page)).toHaveAttribute('data-atlas-state', 'ready');
    await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
    const after = await saved(page, draftId!, 4);
    expect(after.rootBytes).toEqual(baseline.rootBytes);
    expect(after.manifestBytes).toEqual(baseline.manifestBytes);
    await cancelDuringFineHeightWrite(page, info, draftId!, screenshots);
    expect(errors).toEqual([]);
    completedAllAssertions = true;
  } finally {
    await info.attach('map-chrome-observations', { contentType: 'application/json', body: JSON.stringify({
      scope: 'Responsive Chromium viewport emulation; real UI-created empty v4 ocean; rem text stress, forced-colors emulation, and one v4 running generation cancellation followed by reload. Not real devices, terrain visual approval, performance acceptance, or the full committed coast save/restore workflow.',
      draftId, states, screenshots, errors,
      completedAllAssertions,
    }, null, 2) });
  }
});
