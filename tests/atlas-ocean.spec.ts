import { createHash } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { audit, databaseDigest, geography, metrics, saved, type Geography, type SavedManifest, type SavedSnapshot } from './helpers/atlas-shape-readonly';

// UI actions are the only writes. Independent LGAB decoding and four-neighbour
// graph traversal inspect the real durable world; no game generator is imported.
const studio = (page: Page) => page.getByTestId('atlas-studio');
const candidate = (page: Page) => page.getByRole('region', { name: '大陆生成预览' });
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function collectErrors(page: Page, errors: string[] = []) {
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); return errors;
}
async function create(page: Page, name: string) {
  await page.goto('/?atlas=new&atlas-format=2'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('山海-01');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256');
  await button(page, '新建空白海洋草稿'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', '2');
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function configureOcean(page: Page) {
  await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('ocean');
  for (const [label, value] of [['地貌种子', '山海-01'], ['平均海深', '3600'], ['海底起伏', '1000'], ['陆架宽度', '320']]) await page.getByLabel(label, { exact: true }).fill(value);
}
async function previewOcean(page: Page) {
  await configureOcean(page); await button(page, '预览海床生成');
  await expect(candidate(page)).toBeVisible({ timeout: 90000 }); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'generation-preview'); return audit(page);
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
function neighbors(id: number, columns: number, rows: number) {
  const col = id % columns, row = Math.floor(id / columns);
  return [col > 0 ? id - 1 : -1, col + 1 < columns ? id + 1 : -1, row > 0 ? id - columns : -1, row + 1 < rows ? id + columns : -1].filter(value => value >= 0);
}
function waterGraph(heights: readonly number[], spec: SavedManifest['spec']) {
  const { columns, rows } = spec, ocean = new Uint8Array(heights.length), distance = new Int32Array(heights.length).fill(-1), queue: number[] = [];
  const enqueue = (id: number) => { if (heights[id] < 0 && !ocean[id]) { ocean[id] = 1; queue.push(id); } };
  for (let col = 0; col < columns; col++) { enqueue(col); enqueue((rows - 1) * columns + col); }
  for (let row = 1; row < rows - 1; row++) { enqueue(row * columns); enqueue(row * columns + columns - 1); }
  for (let head = 0; head < queue.length; head++) for (const next of neighbors(queue[head], columns, rows)) enqueue(next);
  const shore: number[] = [];
  for (let id = 0; id < ocean.length; id++) if (ocean[id] && neighbors(id, columns, rows).some(next => heights[next] >= 0)) { distance[id] = 1; shore.push(id); }
  for (let head = 0; head < shore.length; head++) for (const next of neighbors(shore[head], columns, rows)) if (ocean[next] && distance[next] < 0) { distance[next] = distance[shore[head]] + 1; shore.push(next); }
  const closed: number[] = [], land: number[] = [];
  for (let id = 0; id < heights.length; id++) if (heights[id] >= 0) land.push(id); else if (!ocean[id]) closed.push(id);
  return { ocean, distance, closed, land, oceanCells: queue.length, maximumShoreSteps: distance.reduce((max, value) => Math.max(max, value), -1) };
}
function oceanObservations(before: Geography, after: Geography, manifest: SavedManifest) {
  const graph = waterGraph(before.heights, manifest.spec), maskBefore = Uint8Array.from(before.heights, value => Number(value >= 0)), maskAfter = Uint8Array.from(after.heights, value => Number(value >= 0));
  expect(sha256(maskAfter)).toBe(sha256(maskBefore)); expect(after.xyQ).toEqual(before.xyQ);
  expect(graph.land.map(id => after.heights[id])).toEqual(graph.land.map(id => before.heights[id]));
  expect(graph.closed.map(id => after.heights[id])).toEqual(graph.closed.map(id => before.heights[id]));
  const changed: number[] = [], depths = new Set<number>(), near: number[] = [], far: number[] = [];
  const farSteps = Math.max(3, Math.floor(graph.maximumShoreSteps * .8));
  for (let id = 0; id < graph.ocean.length; id++) if (graph.ocean[id]) {
    if (before.heights[id] !== after.heights[id]) changed.push(id); depths.add(after.heights[id]);
    if (graph.distance[id] >= 1 && graph.distance[id] <= 2) near.push(id);
    if (graph.distance[id] >= farSteps) far.push(id);
  }
  expect(changed.length).toBeGreaterThan(100); expect(depths.size).toBeGreaterThan(100); expect([...depths].every(height => height < 0 && height >= -12000)).toBe(true);
  const mean = (ids: number[]) => ids.length ? ids.reduce((sum, id) => sum + after.heights[id], 0) / ids.length : null;
  return { graph, changedOceanCells: changed.length, uniqueDepths: depths.size, minimumHeight: Math.min(...depths), maximumHeight: Math.max(...depths), maskSha256: sha256(maskBefore), oceanMaskSha256: sha256(graph.ocean), near, far, nearMeanHeight: mean(near), farMeanHeight: mean(far) };
}
async function reopen(page: Page, id: string, snapshot: SavedSnapshot, errors: string[]) {
  const other = await page.context().newPage(); collectErrors(other, errors);
  try {
    await other.goto(page.url()); await ready(other); await other.reload(); await ready(other);
    expect(await saved(other, id)).toEqual(snapshot);
    expect((await audit(other)).display).toMatchObject({ source: 'committed', revision: snapshot.root.revision, version: 2, manifestDigest: snapshot.root.currentManifest });
    return await geography(other, snapshot.manifest);
  } finally { await other.close(); }
}
async function assertFingerprint(page: Page, current: SavedSnapshot, revision: number) {
  const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true);
  const build = await response.json() as { oceanGenerator: { sha256: string } }, applied = current.manifest.generation.lastApplied;
  expect(build.oceanGenerator.sha256).toMatch(/^[a-f0-9]{64}$/); expect(applied?.appliedRevision).toBe(revision);
  expect(applied?.recipe).toMatchObject({ generator: { id: 'ocean-floor', version: 1 }, parameters: { meanDepthMeters: 3600, reliefMeters: 1000, shelfWidthWorld: 320 } });
  expect(applied?.recipe.generator.fingerprint).toBe(build.oceanGenerator.sha256); expect(applied?.recipe.seed).toBe('山海-01');
  return { fingerprint: build.oceanGenerator.sha256, recipe: applied?.recipe };
}

test('海床：真实大陆与封闭洼地保持，边界连通海洋生成陆架深海，取消、保存刷新及原会话撤销', async ({ page }, info) => {
  test.setTimeout(300000); const errors = collectErrors(page), id = await create(page, '山海·大陆与深海');
  await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('macro');
  for (const [label, value] of [['地貌种子', '山海-01'], ['大陆数量', '2'], ['陆地比例', '350'], ['海岸变化尺度', '384'], ['内陆起伏', '2200']]) await page.getByLabel(label, { exact: true }).fill(value);
  await button(page, '预览大陆生成'); await expect(candidate(page)).toContainText('2 个大陆', { timeout: 90000 }); await ready(page);
  await button(page, '确认生成并保存'); await ready(page);
  const mainland = await saved(page, id), mainlandData = await geography(page, mainland.manifest), { columns, rows } = mainland.manifest.spec;
  // Create a non-vacuous enclosed depression through the same public editor a
  // player uses. Its four neighbours remain land, so no boundary-water path exists.
  const depression = mainlandData.heights.findIndex((height, cell) => height >= 0 && cell % columns > 0 && cell % columns < columns - 1 && cell >= columns && cell < columns * (rows - 1) && neighbors(cell, columns, rows).every(next => mainlandData.heights[next] >= 0));
  expect(depression).toBeGreaterThanOrEqual(0);
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(depression)); await button(page, '定位');
  await button(page, '高程'); await page.getByLabel('目标高程（米）', { exact: true }).fill('-250'); await page.getByLabel('高程编辑范围', { exact: true }).selectOption('1');
  await button(page, '预览地理编辑'); await expect(page.getByRole('region', { name: '地理编辑预览' })).toBeVisible(); await button(page, '确认地理编辑'); await ready(page);
  const before = await saved(page, id), original = await geography(page, before.manifest), baselineDatabase = await databaseDigest(page), topology = waterGraph(original.heights, before.manifest.spec);
  expect(before.root.revision).toBe(2); expect(topology.closed).toContain(depression); expect(original.heights[depression]).toBe(-250); expect(topology.land.length).toBeGreaterThan(1000);
  await panel(page, '地图'); await button(page, '全图');
  const first = await previewOcean(page);
  expect(first).toMatchObject({ revision: 2, manifestDigest: before.root.currentManifest, display: { source: 'generation-preview', revision: 3 } });
  expect(first.display.manifestDigest).not.toBe(before.root.currentManifest);
  expect(await saved(page, id)).toEqual(before); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  await shot(page, info, 'ocean-candidate-panel.png'); await button(page, '取消生成'); await ready(page);
  expect(await saved(page, id)).toEqual(before); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', manifestDigest: before.root.currentManifest });
  const second = await previewOcean(page); expect(second.display.manifestDigest).toBe(first.display.manifestDigest);
  await button(page, '确认生成并保存'); await ready(page);
  const current = await saved(page, id), currentData = await geography(page, current.manifest), observation = oceanObservations(original, currentData, current.manifest);
  expect(current.root).toMatchObject({ revision: 3, currentManifest: second.display.manifestDigest, backupManifest: before.root.currentManifest });
  expect(current.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:'))).toEqual(before.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:')));
  expect(current.manifest.constraints).toEqual(before.manifest.constraints);
  expect(observation.graph.closed.length).toBeGreaterThan(0); expect(currentData.heights[depression]).toBe(-250);
  expect(observation.near.length).toBeGreaterThan(10); expect(observation.far.length).toBeGreaterThan(10);
  expect(observation.nearMeanHeight!).toBeGreaterThan(observation.farMeanHeight!);
  const provenance = await assertFingerprint(page, current, 3); expect(await reopen(page, id, current, errors)).toEqual(currentData);
  await panel(page, '地图'); await button(page, '全图'); await shot(page, info, 'ocean-saved-full-map.png');
  const shoreCell = observation.near[Math.floor(observation.near.length / 2)];
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(shoreCell)); await button(page, '定位'); await panel(page, '地图');
  for (let i = 0; i < 10 && (await metrics(page)).cellPixels < 18; i++) { const frame = await metrics(page); await button(page, '放大大世界地图'); await expect.poll(async () => (await metrics(page)).completedFrameSequence).toBeGreaterThan(frame.completedFrameSequence); }
  expect((await metrics(page)).cellPixels).toBeGreaterThanOrEqual(18); await shot(page, info, 'ocean-saved-near-shelf-and-land.png');
  await button(page, '撤销大世界编辑'); await ready(page);
  const undone = await saved(page, id); expect(undone.root.revision).toBe(4); expect(undone.manifest.blockRefs).toEqual(before.manifest.blockRefs);
  expect(undone.manifest.constraints).toEqual(before.manifest.constraints); expect(undone.manifest.generation).toEqual(before.manifest.generation);
  expect(await geography(page, undone.manifest)).toEqual(original); await page.reload(); await ready(page); expect(await saved(page, id)).toEqual(undone);
  await info.attach('ocean-independent-topology-and-persistence.json', { contentType: 'application/json', body: JSON.stringify({ first, second, provenance, baselineDatabase,
    oceanCells: observation.graph.oceanCells, landCells: observation.graph.land.length, closedNegativeCells: observation.graph.closed.length, preservedDepression: { cell: depression, height: -250 },
    changedOceanCells: observation.changedOceanCells, uniqueDepths: observation.uniqueDepths, heightRange: [observation.minimumHeight, observation.maximumHeight], landMaskSha256: observation.maskSha256, boundaryOceanMaskSha256: observation.oceanMaskSha256,
    independentDistance: { method: 'four-neighbour BFS from actual land-adjacent boundary-connected sea cells', maximumShoreSteps: observation.graph.maximumShoreSteps, nearCells: observation.near.length, farCells: observation.far.length, nearMeanHeight: observation.nearMeanHeight, farMeanHeight: observation.farMeanHeight },
    allNonHeightRefsUnchanged: true, allLandHeightsUnchanged: true, allClosedNegativeHeightsUnchanged: true, originalGeographyRestoredAfterUndo: true, limitation: 'Mobile/tablet are browser emulation, not real-device or user visual approval.' }, null, 2) });
  expect(errors).toEqual([]);
});

test('海床空海：无需陆地即可生成真实深度，不合法参数及取消保留全库，确认后刷新恢复', async ({ page }, info) => {
  test.setTimeout(180000); const errors = collectErrors(page), id = await create(page, '山海·无垠海洋');
  const blank = await saved(page, id), blankData = await geography(page, blank.manifest), baselineDatabase = await databaseDigest(page);
  expect(blankData.heights.every(height => height < 0)).toBe(true);
  await configureOcean(page); await page.getByLabel('平均海深', { exact: true }).fill('999'); await button(page, '预览海床生成');
  await expect(page.getByRole('alert')).toBeVisible(); await ready(page); await expect(candidate(page)).toHaveCount(0);
  expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  const first = await previewOcean(page); expect(first.display.manifestDigest).not.toBe(blank.root.currentManifest);
  expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  await button(page, '取消生成'); await ready(page); expect(await saved(page, id)).toEqual(blank); expect(await databaseDigest(page)).toEqual(baselineDatabase);
  const second = await previewOcean(page); expect(second.display.manifestDigest).toBe(first.display.manifestDigest);
  await button(page, '确认生成并保存'); await ready(page);
  const current = await saved(page, id), data = await geography(page, current.manifest), observation = oceanObservations(blankData, data, current.manifest);
  expect(current.root).toMatchObject({ revision: 1, currentManifest: second.display.manifestDigest, backupManifest: blank.root.currentManifest });
  expect(observation.graph.oceanCells).toBe(256 * 256); expect(observation.graph.land).toHaveLength(0); expect(observation.graph.closed).toHaveLength(0);
  expect(current.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:'))).toEqual(blank.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:')));
  expect(current.manifest.constraints).toEqual(blank.manifest.constraints); const provenance = await assertFingerprint(page, current, 1);
  expect(await reopen(page, id, current, errors)).toEqual(data); await panel(page, '地图'); await button(page, '全图'); await shot(page, info, 'ocean-empty-world-saved.png');
  await info.attach('ocean-empty-world-depths.json', { contentType: 'application/json', body: JSON.stringify({ provenance, oceanCells: observation.graph.oceanCells, changedOceanCells: observation.changedOceanCells,
    uniqueDepths: observation.uniqueDepths, minimumHeight: observation.minimumHeight, maximumHeight: observation.maximumHeight, landMaskSha256: observation.maskSha256, confirmedManifest: current.root.currentManifest, candidateDeterministic: true, cancelledDatabase: baselineDatabase }, null, 2) });
  expect(errors).toEqual([]);
});
