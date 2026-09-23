import { expect, type Page } from '@playwright/test';

const studioPanels: Record<string, string | null> = { 地图: null, 画笔: 'tools', 国家: 'nations', 城市: 'cities', 世界: 'world' };
const gamePanels: Record<string, { navigation: string; panel: string | null }> = {
  舆图: { navigation: '舆图', panel: null },
  军情: { navigation: '军情', panel: 'armies' },
  军令: { navigation: '军情', panel: 'orders' },
  国家: { navigation: '国家', panel: 'government' },
  纪事: { navigation: '纪事', panel: 'events' },
  世界: { navigation: '世界', panel: 'world' },
  存档: { navigation: '世界', panel: 'world' },
};

/** One real navigation path on desktop, phone, and tablet; no hidden fallbacks. */
export async function studioPanel(page: Page, name: string) {
  if (!Object.hasOwn(studioPanels, name)) throw new Error(`Unknown studio navigation: ${name}`);
  const navigation = page.getByRole('navigation', { name: '世界工坊工具', exact: true });
  await expect(navigation).toBeVisible();
  const panel = studioPanels[name];
  if (panel === null) {
    await navigation.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.context-inspector')).toHaveCount(0);
  } else {
    const inspector = page.locator(`.context-inspector[data-panel="${panel}"]`);
    if (!await inspector.isVisible()) await navigation.getByRole('button', { name, exact: true }).click();
    await expect(inspector).toBeVisible();
  }
}

/** Legacy test intent is mapped to its actual PH02 entry, not a fake button. */
export async function gamePanel(page: Page, name: string) {
  const destination = gamePanels[name];
  if (!destination) throw new Error(`Unknown game navigation: ${name}`);
  const navigation = page.getByRole('navigation', { name: '游戏工具', exact: true });
  await expect(navigation).toBeVisible();
  if (destination.panel === null) {
    await navigation.getByRole('button', { name: destination.navigation, exact: true }).click();
    await expect(page.locator('.context-inspector')).toHaveCount(0);
    return;
  }
  const inspector = page.locator(`.context-inspector[data-panel="${destination.panel}"]`);
  if (!await inspector.isVisible()) {
    await navigation.getByRole('button', { name: destination.navigation, exact: true }).click();
    if (name === '军令') {
      await page.locator('.context-inspector[data-panel="armies"]').getByRole('button', { name: '当前编队', exact: true }).click();
    }
  }
  await expect(inspector).toBeVisible();
}

export async function closeInspector(page: Page) {
  const inspector = page.locator('.context-inspector');
  if (await inspector.isVisible()) await inspector.locator('.inspector-header .inspector-close').click();
  await expect(inspector).toHaveCount(0);
}

export async function backToStudio(page: Page) {
  // Failed loads have no workbench; their recovery action remains directly visible.
  if (await page.locator('.game-layout').isVisible()) await gamePanel(page, '世界');
  await page.getByRole('button', { name: '世界工坊', exact: true }).click();
  await expect(page.getByTestId('studio-canvas')).toBeVisible();
}

export async function historyPanel(page: Page) {
  await gamePanel(page, '纪事');
  await page.locator('.chronicle-tabs').getByRole('button', { name: '历史', exact: true }).click();
  await expect(page.getByTestId('history-panel')).toBeVisible();
}

export async function expectNavigation(page: Page, screen: 'studio' | 'game') {
  const navigation = page.getByRole('navigation', { name: screen === 'studio' ? '世界工坊工具' : '游戏工具', exact: true });
  const labels = screen === 'studio' ? ['地图', '画笔', '国家', '城市', '世界'] : ['舆图', '军情', '国家', '纪事', '世界'];
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button')).toHaveCount(5);
  for (const label of labels) {
    const control = navigation.getByRole('button', { name: label, exact: true });
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds!.height, `${label} target height`).toBeGreaterThanOrEqual(44);
    expect(bounds!.width, `${label} target width`).toBeGreaterThanOrEqual(44);
  }
  for (const name of ['家族', '信仰']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
}
