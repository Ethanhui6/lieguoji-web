import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import { savedMacroTerrain, observeMacroProgress } from './helpers/atlas-hydrology-macro-readonly';
import type { AtlasRenderer } from '../src/world/renderer';
import type { HydrologyMacroPreview } from '../src/world/hydrology-macro-contract';

test.describe.configure({ retries: 0 });
const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
type XY = { x: number; y: number };
// Same native 128-world fixture as the established fine hydrology acceptance.
const contour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ x, y }));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const world = (id: number): XY => ({ x: id % 257 * 16, y: Math.floor(id / 257) * 16 });
async function press(p: Page, name: string, touch: boolean) { if (touch) await button(p, name).tap(); else await button(p, name).click(); }
async function section(p: Page, name: '地图' | '创世' | '编辑' | '水文', touch: boolean) {
  const control = p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true });
  if (touch) await control.tap(); else await control.click();
}
async function frameReady(p: Page) {
  await expect.poll(async () => { const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>; return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready'; }, { timeout: 120000 }).toBe(true);
}
async function screen(p: Page, points: XY[]) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  return points.map(q => ({ x: box.x + frame.camera.x + q.x * frame.camera.scale, y: box.y + frame.camera.y + q.y * frame.camera.scale }));
}
async function nativeGesture(p: Page, points: XY[], touch: boolean) {
  expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
      for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
    try { for (const point of points.slice(1)) await p.mouse.move(point.x, point.y); } finally { await p.mouse.up(); }
  }
}
async function displayedMacro(p: Page): Promise<HydrologyMacroPreview | null> {
  const result = await audit(p) as Awaited<ReturnType<typeof audit>> & { macroHydrology: HydrologyMacroPreview | null };
  expect(Object.hasOwn(result, 'macroHydrology')).toBe(true); return result.macroHydrology;
}
function verifySavedEdges(preview: HydrologyMacroPreview, terrain: Awaited<ReturnType<typeof savedMacroTerrain>>) {
  expect(preview.grid).toEqual({ columns: 257, rows: 257, stepWorld: 16, worldSize: 4096, coverage: 'complete-fixed-grid', sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' });
  expect(preview.stats.sampledNodes).toBe(66049);
  expect(preview.stats.landNodes).toBe(terrain.completeGrid.landNodes); expect(preview.stats.sampledSeaNodes).toBe(terrain.completeGrid.sampledSeaNodes);
  expect(preview.stats.landNodes + preview.stats.sampledSeaNodes).toBe(66049);
  expect(preview.branches.length).toBeGreaterThanOrEqual(2); expect(preview.branches.length).toBeLessThanOrEqual(64);
  expect(preview.edges.from.length).toBeGreaterThan(1); expect(preview.edges.from.length).toBeLessThanOrEqual(8192);
  expect(preview.stats.displayedBranches).toBe(preview.branches.length); expect(preview.stats.displayedEdges).toBe(preview.edges.from.length);
  const actual = new Map(terrain.displayed.map(sample => [sample.id, sample]));
  expect(actual.size).toBe(preview.nodes.ids.length);
  for (let i = 0; i < preview.nodes.ids.length; i++) {
    const sample = actual.get(preview.nodes.ids[i])!;
    expect(sample.height, 'Every displayed land or sea endpoint must come from an actual persisted fine owner').not.toBeNull();
    expect(sample.coverage).toBe(preview.nodes.coverageQ[i]); expect(sample.height).toBe(preview.nodes.groundMeters[i]);
  }
  const receivers = new Map<number, number>(); let sampledSeaEdges = 0;
  expect(preview.edges.to.length).toBe(preview.edges.from.length);
  for (let i = 0; i < preview.edges.from.length; i++) {
    const from = actual.get(preview.edges.from[i])!, to = actual.get(preview.edges.to[i])!;
    expect(from).toBeDefined(); expect(to).toBeDefined(); expect(from.coverage).toBeGreaterThanOrEqual(0);
    expect(Math.abs(from.column - to.column) + Math.abs(from.row - to.row)).toBe(8);
    expect(to.height!, 'Sea terminal edges receive the same non-uphill check as land edges').toBeLessThanOrEqual(from.height!);
    expect(receivers.has(from.id), 'One actual receiver per displayed node').toBe(false); receivers.set(from.id, to.id);
    if (to.coverage < 0) sampledSeaEdges++;
  }
  for (const branch of preview.branches) {
    const visited = new Set<number>(); let at = branch.sourceNode;
    while (receivers.has(at)) { expect(visited.has(at), 'Displayed flow is acyclic').toBe(false); visited.add(at); at = receivers.get(at)!; }
    const end = actual.get(branch.endNode)!; expect(end).toBeDefined();
    if (branch.stop === 'sampled-sea') expect(end.coverage).toBeLessThan(0);
  }
  return { checkedEdges: receivers.size, sampledSeaEdges, checkedNodes: actual.size };
}

async function nativePickBranch(p: Page, preview: HydrologyMacroPreview, touch: boolean) {
  // Real pan and zoom preserve the result. The geographic locator would clear
  // it, so this test does not use that separate editing workflow.
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [{ x: 1010, y: 1550 }]))[0];
  const center = { x: box.x + box.width * .5, y: box.y + box.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  await nativeGesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  for (let i = 0; i < 8 && (await metrics(p)).camera.scale < .5; i++) await press(p, '放大大世界地图', touch);
  await frameReady(p); const frame = await metrics(p); expect(frame.camera.scale).toBeGreaterThanOrEqual(.5);
  const receivers = new Map(preview.edges.from.map((id, i) => [id, preview.edges.to[i]]));
  const segments: { branch: number; from: number; to: number; a: XY; b: XY }[] = [];
  preview.branches.forEach((branch, index) => {
    let at = branch.sourceNode; const seen = new Set<number>();
    while (at !== branch.endNode && receivers.has(at) && !seen.has(at)) {
      seen.add(at); const next = receivers.get(at)!; segments.push({ branch: index, from: at, to: next, a: world(at), b: world(next) }); at = next;
    }
  });
  const distance = (q: XY, a: XY, b: XY) => {
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / length2)) : 0;
    return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
  };
  const candidates = segments.map(segment => {
    const midpoint = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
    const point = { x: box.x + frame.camera.x + midpoint.x * frame.camera.scale, y: box.y + frame.camera.y + midpoint.y * frame.camera.scale };
    const otherEdges = segments.filter(other => other.branch !== segment.branch).map(other => distance(midpoint, other.a, other.b));
    const otherEnds = preview.branches.filter((_branch, i) => i !== segment.branch).map(branch => distance(midpoint, world(branch.endNode), world(branch.endNode)));
    return { ...segment, midpoint, point, clearancePixels: Math.min(...otherEdges, ...otherEnds) * frame.camera.scale };
  }).filter(candidate => candidate.clearancePixels >= 3 && candidate.point.x > box.x + 24 && candidate.point.x < box.x + box.width - 24
    && candidate.point.y > box.y + 145 && candidate.point.y < box.y + box.height - 140)
    .sort((a, b) => Math.hypot(a.point.x - center.x, a.point.y - center.y) - Math.hypot(b.point.x - center.x, b.point.y - center.y));
  const unobscured = await p.evaluate(points => points.map(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), candidates.map(candidate => candidate.point));
  const chosen = candidates.find((_candidate, index) => unobscured[index]); expect(chosen, 'Actual displayed branches provide a visible unambiguous native tap target').toBeDefined();
  if (touch) await p.touchscreen.tap(chosen!.point.x, chosen!.point.y); else await p.mouse.click(chosen!.point.x, chosen!.point.y);
  await expect(studio(p)).toHaveAttribute('data-atlas-macro-selected', String(chosen!.branch));
  const details = p.getByRole('region', { name: '汇流分支详情', exact: true });
  await expect(details).toBeVisible(); await expect(details.getByRole('heading')).toContainText(`支流 ${chosen!.branch + 1} ·`);
  const start = preview.nodes.ids.indexOf(preview.branches[chosen!.branch].sourceNode);
  await expect(details).toContainText(`${preview.nodes.groundMeters[start]} 米`);
  await expect(p.getByRole('group', { name: '大陆汇流分支', exact: true }).getByRole('button').nth(chosen!.branch)).toHaveAttribute('aria-pressed', 'true');
  expect(await displayedMacro(p)).toEqual(preview);
  return { branch: chosen!.branch, edge: { from: chosen!.from, to: chosen!.to }, worldMidpoint: chosen!.midpoint, screenPoint: chosen!.point, clearancePixels: chosen!.clearancePixels, camera: frame.camera };
}

test('[hydrology-macro-v4] native continent, complete saved grid, branch tap, active cancellation and deterministic reload', async ({ page }, info) => {
  test.setTimeout(450000);
  const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true); const buildBytes = await response.body();
  const buildSha256 = createHash('sha256').update(buildBytes).digest('hex'), build = JSON.parse(buildBytes.toString()) as { version: string; commit: string; naturalDetailGenerator?: { sha256: string } };
  if (process.env.MACRO_FLOW_EXPECTED_BUILD_SHA256) expect(buildSha256).toBe(process.env.MACRO_FLOW_EXPECTED_BUILD_SHA256);
  expect(build.commit).toMatch(/^[a-f0-9]{40}$/); expect(build.naturalDetailGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  const touch = !!info.project.use.hasTouch, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await info.attach('actual-build.json', { body: buildBytes, contentType: 'application/json' });
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('大陆汇流 · 原生只读验收');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await press(page, '新建空白海洋草稿', touch); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!; expect(id).toMatch(/^atlas-/);
  await section(page, '创世', touch); await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('近岸岛链', { exact: true }).selectOption('0'); await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  await press(page, '画大陆', touch); await press(page, '全图', touch); await frameReady(page);
  await nativeGesture(page, await screen(page, [...contour, contour[0]]), touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page);
  const decisions = page.getByRole('group', { name: '大陆生成预览操作', exact: true });
  await expect(decisions.getByRole('button', { name: '取消生成', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(decisions.getByRole('button', { name: '确认生成并保存', exact: true })).toBeInViewport({ ratio: 1 });
  await press(page, '确认生成并保存', touch);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 });
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); await expect(page.getByRole('region', { name: '大陆生成预览' })).toHaveCount(0); await ready(page);
  const before = await saved(page, id, 4), beforeDb = await databaseDigest(page, 4);
  expect(before.root.revision).toBe(1); expect(before.manifest.generation.lastApplied?.recipe.generator.fingerprint).toBe(build.naturalDetailGenerator!.sha256);
  // Keep a real selected map cell so editing can be entered while flow remains visible.
  const initialPick = (await screen(page, [{ x: 1010, y: 1550 }]))[0];
  if (touch) await page.touchscreen.tap(initialPick.x, initialPick.y); else await page.mouse.click(initialPick.x, initialPick.y);
  await section(page, '水文', touch); const firstProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  const firstProgress = await firstProgressPending, first = await displayedMacro(page); expect(first).not.toBeNull();
  expect(firstProgress).toContainEqual({ stage: '宏观水文读取器：采样权威细地形', completed: 66049, total: 66049 });
  expect(first!.source).toMatchObject({ draftId: id, atlasId: before.manifest.atlasId, revision: 1, rootDigest: before.root.rootDigest, manifestDigest: before.root.currentManifest });
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', String(first!.branches.length)); await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', '');
  await expect(button(page, '关闭大世界面板')).toHaveCount(0); await expect(button(page, '查看汇流详情')).toBeVisible();
  const terrain = await savedMacroTerrain(page, id, first!.nodes.ids); expect(terrain.manifestDigest).toBe(before.root.currentManifest);
  const edgeChecks = verifySavedEdges(first!, terrain);
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  await frameReady(page); const firstFrame = await metrics(page); await page.screenshot({ path: info.outputPath('macro-complete-network.png'), fullPage: true });
  const pick = await nativePickBranch(page, first!, touch); await page.screenshot({ path: info.outputPath('macro-native-branch-details.png'), fullPage: true });
  await press(page, '回地图看汇流', touch); await expect(button(page, '关闭大世界面板')).toHaveCount(0); await frameReady(page);
  await page.screenshot({ path: info.outputPath('macro-selected-branch-map.png'), fullPage: true });
  // Active editing must take precedence over a visible branch on both taps.
  await section(page, '编辑', touch); await press(page, '保护区域', touch); await press(page, '在地图上选择保护范围', touch);
  if (touch) await page.touchscreen.tap(pick.screenPoint.x, pick.screenPoint.y); else await page.mouse.click(pick.screenPoint.x, pick.screenPoint.y);
  await expect(page.getByText('已选保护范围第一角。再点对角位置；也可以再次点此处，只保护一个地块。', { exact: true })).toBeVisible();
  await expect(button(page, '关闭大世界面板')).toHaveCount(0);
  if (touch) await page.touchscreen.tap(pick.screenPoint.x, pick.screenPoint.y); else await page.mouse.click(pick.screenPoint.x, pick.screenPoint.y);
  await expect(page.getByTestId('region-protection-scope')).toContainText('当前范围 1 × 1');
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', String(pick.branch));
  expect(await displayedMacro(page)).toEqual(first);
  expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  await press(page, '关闭大世界面板', touch);
  await press(page, '查看汇流详情', touch); await expect(page.getByRole('region', { name: '汇流分支详情', exact: true })).toBeVisible();
  await press(page, '关闭大陆汇流', touch); await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', '0');
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', ''); expect(await displayedMacro(page)).toBeNull();
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);

  const cancelProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
  await page.waitForFunction(() => {
    const main = document.querySelector('[data-testid="atlas-studio"]'), stage = main?.getAttribute('data-atlas-progress-stage') ?? '';
    const completed = Number(main?.getAttribute('data-atlas-progress-completed')), total = Number(main?.getAttribute('data-atlas-progress-total'));
    return main?.getAttribute('data-atlas-state') === 'busy' && stage === '宏观水文读取器：采样权威细地形'
      && total === 66049 && completed > 0 && completed <= Math.floor(total / 4);
  }, undefined, { timeout: 120000, polling: 'raf' });
  const cancelledStage = await studio(page).getAttribute('data-atlas-progress-stage'), cancelledSamples = Number(await studio(page).getAttribute('data-atlas-progress-completed'));
  expect(cancelledSamples).toBeGreaterThan(0); expect(cancelledSamples).toBeLessThan(66049);
  await press(page, '取消操作', touch); await ready(page); const cancelProgress = await cancelProgressPending;
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', '0'); await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', ''); expect(await displayedMacro(page)).toBeNull();
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  await page.screenshot({ path: info.outputPath('macro-cancelled-readonly.png'), fullPage: true });

  await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(before); expect(await displayedMacro(page)).toBeNull();
  await section(page, '水文', touch); const restoredProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
  await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', String(first!.branches.length), { timeout: 120000 }); await ready(page);
  const restoredProgress = await restoredProgressPending, restored = await displayedMacro(page); expect(restored).toEqual(first); expect(digest(restored)).toBe(digest(first));
  expect(restoredProgress).toContainEqual({ stage: '宏观水文读取器：采样权威细地形', completed: 66049, total: 66049 });
  expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  await frameReady(page); const restoredFrame = await metrics(page); await page.screenshot({ path: info.outputPath('macro-restored-identical-network.png'), fullPage: true });
  expect(errors).toEqual([]);
  await info.attach('hydrology-macro-evidence.json', { contentType: 'application/json', body: JSON.stringify({ build, buildSha256, project: info.project.name, physicalDevice: false,
    input: { size: 128, seed: 'hydrology-native-128', contour }, root: before.root, database: beforeDb, terrain, edgeChecks, first, restored, firstFrame, restoredFrame, pick,
    resultSha256: digest(first), firstProgress, restoredProgress, cancelled: { stage: cancelledStage, completedSamples: cancelledSamples, totalSamples: 66049, progress: cancelProgress, noDisplayedResult: true, savedUnchanged: true }, errors }, null, 2) });
});
