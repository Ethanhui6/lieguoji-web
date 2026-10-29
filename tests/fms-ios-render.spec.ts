import {tool} from './fms-culture47-fixture';
import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Buffer } } } };
async function renderedTerrain(page: Page) {
  const png = PNG.sync.read(await page.screenshot({ scale: 'css' }));
  const colors = new Set<string>(); let white = 0, total = 0;
  // Central map area clear of the HUD: rejects both the white rectangle and a
  // uniform blue/clear-color canvas, even if renderer metadata was published.
  for (let y = Math.floor(png.height * .4); y < png.height * .6; y += 2) for (let x = Math.floor(png.width * .3); x < png.width * .7; x += 2) {
    const i = (y * png.width + x) * 4, [r,g,b] = png.data.subarray(i,i+3);
    colors.add(`${r>>3},${g>>3},${b>>3}`); white += Number(r>248 && g>248 && b>248); total++;
  }
  expect(colors.size).toBeGreaterThan(30); expect(white / total).toBeLessThan(.05);
}

async function separate(page: Page, a: string, b: string) {
  const first = await page.locator(a).boundingBox(), second = await page.locator(b).boundingBox();
  expect(first).not.toBeNull(); expect(second).not.toBeNull();
  expect(first!.x + first!.width <= second!.x || second!.x + second!.width <= first!.x || first!.y + first!.height <= second!.y || second!.y + second!.height <= first!.y).toBe(true);
}
// Custom scheme semantics require WKWebView. This exercises the actual bundled
// assets/worker graph over same-origin HTTP with no CORS headers, under a subpath.
test('iPhone bundled editor → world, safe areas and local saves', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'webkit', 'Run with playwright.ios.config.ts');
  const errors: string[] = [], failed: string[] = [], textures: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); if (/parchment.*\.jpg/.test(r.url())) textures.push(r.url()); });
  const landscape = info.project.name.includes('landscape');
  await page.addInitScript(({ landscape }) => {
    Object.assign(window, { __forceIosShell: true });
    document.addEventListener('DOMContentLoaded', () => {
      for (const [key, value] of Object.entries({ sat:landscape?0:47, sab:landscape?21:34, sal:landscape?47:0, sar:landscape?47:0 })) document.documentElement.style.setProperty(`--${key}`, `${value}px`);
    });
  }, { landscape });
  const response = await page.goto('./');
  expect(response?.headers()['access-control-allow-origin']).toBeUndefined();
  await expect(page.getByTestId('fms-canvas')).toBeVisible();
  await page.getByLabel('整图种子', { exact:true }).fill('421730');
  await page.getByRole('button', { name:'预览整张地图', exact:true }).click();
  await page.getByRole('button', { name:'确认整图', exact:true }).click({ timeout:90000 });
  await expect.poll(() => textures.length).toBeGreaterThan(0);
  await separate(page, '.fms-header', '.play-entry');
  const canvas = page.getByTestId('fms-canvas');
  const box = await canvas.boundingBox();
  expect(Math.abs(box!.width - (landscape?852:393))).toBeLessThan(1); expect(Math.abs(box!.height - (landscape?393:852))).toBeLessThan(1);
  await page.getByRole('button', { name:'保存地图', exact:true }).click();
  await expect(page.getByTestId('fms-app')).toHaveAttribute('data-dirty', 'false');
  const land = await page.getByTestId('fms-app').getAttribute('data-land-cells');
  await renderedTerrain(page);
  await page.screenshot({ path:info.outputPath('editor.png') });
  await page.screenshot({ path:`docs/ios-proof/${info.project.name}-editor.jpg`, quality:75, scale:'css' });
  await page.reload();
  await expect(page.getByTestId('fms-app')).toHaveAttribute('data-land-cells', land!);
  await page.getByRole('button', { name:'进入世界 →', exact:true }).click();
  await page.getByLabel('城市数量', { exact:true }).selectOption('60');
  await page.getByRole('button', { name:'从当前地图创建文化世界', exact:true }).click();
  const world = page.getByTestId('culture47-map');
  await expect(world).toHaveAttribute('data-renderer', 'original', { timeout:90000 });
  await expect.poll(async () => Number(await world.getAttribute('data-original-cells'))).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name:'重新显示地图', exact:true })).toHaveCount(0);
  await page.getByRole('button',{name:'展开工具栏',exact:true}).click();
  await separate(page, '.c47-bar', '.c47-rail');
  if (await page.locator('.c47-news').isVisible()) { await separate(page, '.c47-bar', '.c47-news'); await separate(page, '.c47-news', '.c47-rail'); }
  await renderedTerrain(page);
  await page.screenshot({ path:info.outputPath('world.png') });
  await page.screenshot({ path:`docs/ios-proof/${info.project.name}-world.jpg`, quality:75, scale:'css' });
  for (const button of await page.locator('.c47-rail button').all()) {
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  await page.getByRole('button',{name:'展开工具栏',exact:true}).click();
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).some(face => face.family === 'LieguojiKai' && face.status === 'loaded'))).toBe(true);
  for (const name of ['国家', '军事模式', '查看大事记', '统计']) {
    await tool(page,name);
    const panel = page.locator('.c47-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name:'收起详情', exact:true })).toBeInViewport();
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole('button', { name:'收起详情', exact:true }).click();
  }
  // Exercise real panel controls; each drawer must scroll and its close control
  // must be reachable above the home indicator in both orientations.
  for (const [open, close, panel] of [
    ['地图样式', '关闭地图样式', '.c47-map-menu'],
    ['菜单选项', '关闭菜单选项', '.c47-menu'],
    ['AI全局配置', '关闭AI全局配置', '.c47-ai-global'],
    ['编辑国家', '完成编辑', '.c47-territory'],
  ]) {
    if(['国家','军事模式','查看大事记','统计','编辑国家','AI全局配置','生成地图'].includes(open))await tool(page,open);else await page.getByRole('button', { name:open, exact:true }).click();
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.getByRole('button', { name:close, exact:true })).toBeInViewport();
    await page.getByRole('button', { name:close, exact:true }).click();
  }
  await tool(page,'生成地图');
  await expect(page.getByRole('alertdialog', { name:'生成地图' })).toBeInViewport();
  await page.getByRole('button', { name:'否', exact:true }).click();
  await page.getByRole('button', { name:'保存文化世界', exact:true }).click();
  await expect(page.locator('.c47-notice')).toContainText('已保存');
  await page.reload();
  await expect(page.getByTestId('culture47-map')).toHaveAttribute('data-renderer', 'original', { timeout:90000 });
  await renderedTerrain(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('[crossorigin]').count()).toBe(0);
  expect(textures.every(url => new URL(url).pathname.startsWith('/ios-proof/assets/'))).toBe(true);
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});
