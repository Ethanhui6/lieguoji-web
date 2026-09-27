import { test, expect } from '@playwright/test';
import { studioPanel } from './helpers/navigation';

test('[natural-entry] homepage creation opens v4 while explicit legacy routes retain their formats', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/'); await expect(page.getByTestId('studio-canvas')).toBeVisible();
  await studioPanel(page, '世界'); await page.getByRole('button', { name: '大世界草稿 →', exact: true }).click();
  await expect(page).toHaveURL(/atlas=new&atlas-format=4/);
  await expect(page.getByTestId('atlas-studio')).toHaveAttribute('data-atlas-state', 'empty', { timeout: 30000 });
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('首页自然创世');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  await page.getByRole('button', { name: '新建空白海洋草稿', exact: true }).click();
  await expect(page.getByTestId('atlas-studio')).toHaveAttribute('data-atlas-state', 'ready', { timeout: 30000 });
  await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }).click();
  await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('主要湾岬变化', { exact: true })).toHaveValue('96');
  // No implicit conversion of existing deep links or no-format legacy routes.
  for (const [suffix, format] of [['', '1'], ['&atlas-format=2', '2'], ['&atlas-format=3', '3']]) {
    await page.goto(`/?atlas=new${suffix}`);
    await expect(page.getByTestId('atlas-studio')).toHaveAttribute('data-atlas-state', 'empty', { timeout: 30000 });
    await expect(page.getByTestId('atlas-studio')).toHaveAttribute('data-atlas-format', format);
    await expect(page).toHaveURL(`/?atlas=new${suffix}`);
  }
});
