# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-generation-completion.spec.ts >> 标准256长任务：手绘和海床真实运行中取消，250ms进度与500ms取消保持源库
- Location: tests\atlas-generation-completion.spec.ts:418:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByLabel('草稿操作反馈')
Expected substring: "取消"
Received string:    "signal is aborted without reason"
Timeout: 5000ms

Call log:
  - Expect "toContainText" getByLabel('草稿操作反馈') with timeout 5000ms
  - waiting for getByLabel('草稿操作反馈')
    14 × locator resolved to <div tabindex="0" aria-label="草稿操作反馈" class="inspector-feedback">…</div>
       - unexpected value "signal is aborted without reason"

```

```yaml
- alert: signal is aborted without reason
```

# Test source

```ts
  289 |       const realArea = area(triangle); if (landArea + seaArea !== realArea) throw new Error(`Independent v3 area not conserved at ${cell}`); total += realArea;
  290 |       if (landArea) land.push(a); if (seaArea) sea.push(b);
  291 |       if (landArea && seaArea) { const zero = a.filter(point => point.coverage === 0); if (zero.length !== 2) throw new Error('Independent shore is not a segment'); shore.push(zero.map(point => [point.x, point.y])); }
  292 |       else if (points[side].coverage === 0 && points[(side + 1) % 4].coverage === 0 && adjacent[side] >= 0 && (data.heights[adjacent[side]] >= 0) !== (data.heights[cell] >= 0)) shore.push([points[side], points[(side + 1) % 4]].map(point => [point.x, point.y]));
  293 |     }
  294 |     if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Independent cell area missing');
  295 |     const coordinates = (polygons: IndependentCoastalPoint[][], heights: boolean) => polygons.map(polygon => polygon.map(point => heights ? [point.x, point.y, point.height] : [point.x, point.y]));
  296 |     return { geometry: JSON.stringify([coordinates(land, false), coordinates(sea, false), shore]), height: JSON.stringify([coordinates(land, true), coordinates(sea, true)]), shoreSegments: shore.length };
  297 |   };
  298 | }
  299 | function verifyDerivedCoastalProtection(before: Geography, after: Geography, size: number, rect: Rectangle, locks: number[]) {
  300 |   const affected = new Set<number>(), compare = new Set<number>();
  301 |   const include = (id: number) => {
  302 |     const x = id % size, y = Math.floor(id / size);
  303 |     for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) affected.add((y + dy) * size + x + dx);
  304 |   };
  305 |   for (let id = 0; id < before.heights.length; id++) { if (before.heights[id] !== after.heights[id]) include(id); if (locks[id]) compare.add(id); }
  306 |   for (let vertex = 0; vertex < before.xyQ.length / 2; vertex++) if (before.xyQ[vertex * 2] !== after.xyQ[vertex * 2] || before.xyQ[vertex * 2 + 1] !== after.xyQ[vertex * 2 + 1]) {
  307 |     const x = vertex % (size + 1), y = Math.floor(vertex / (size + 1));
  308 |     for (const dy of [-1, 0]) for (const dx of [-1, 0]) if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) include((y + dy) * size + x + dx);
  309 |   }
  310 |   for (const id of affected) if (distance(id, size, rect) < 0 || locks[id]) compare.add(id);
  311 |   // The full outside two-cell perimeter is also inspected, even when the real
  312 |   // changed neighborhood contains no outside cells. No vacuous outside pass.
  313 |   for (let y = Math.max(0, rect.row - 2); y < Math.min(size, rect.row + rect.rows + 2); y++) for (let x = Math.max(0, rect.column - 2); x < Math.min(size, rect.column + rect.columns + 2); x++) {
  314 |     const id = y * size + x; if (distance(id, size, rect) < 0) compare.add(id);
  315 |   }
  316 |   const original = persistedCoastalOracle(before, size), actual = persistedCoastalOracle(after, size); let outsideCells = 0, coastLockedCells = 0, heightLockedCells = 0, lockedShoreCells = 0;
  317 |   for (const id of [...compare].sort((a, b) => a - b)) {
  318 |     const a = original(id), b = actual(id), outside = distance(id, size, rect) < 0;
  319 |     if ((outside || locks[id] & 1) && a.geometry !== b.geometry) throw new Error(`Actual persisted v3 coast changed in ${outside ? 'outside-scope' : 'coast-locked'} cell ${id}`);
  320 |     if (locks[id] & 2 && a.height !== b.height) throw new Error(`Actual persisted v3 height changed in height-locked cell ${id}`);
  321 |     if (outside) outsideCells++; if (locks[id] & 1) { coastLockedCells++; if (a.shoreSegments) lockedShoreCells++; } if (locks[id] & 2) heightLockedCells++;
  322 |   }
  323 |   expect(outsideCells).toBeGreaterThan(0); expect(coastLockedCells).toBe(64); expect(lockedShoreCells).toBeGreaterThan(0);
  324 |   return { contract: 'Independent Q8*6 land-mask-fan-v1 polygons from persisted LGAB; exact geometry and interpolated heights', comparedCells: compare.size, changedDependencyCells: affected.size, outsideCells, coastLockedCells, heightLockedCells, lockedShoreCells,
  325 |     limitation: 'This successful UI route uses coast locks (mask 1). V3 elevation-lock rejection remains covered by the existing unit/session/storage evidence, not claimed as a successful browser generation here.' };
  326 | }
  327 | 
  328 | test('局部生成闭环：真实山系与细海岸保持范围外、区域锁与过渡带，保存刷新一致', async ({ page }, info) => {
  329 |   test.setTimeout(360000); const errors = errorsOn(page), id = await create(page, '256', `PH06局部完成门-${info.project.name}`);
  330 |   await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('macro');
  331 |   await fields(page, [['地貌种子', '山海-01'], ['大陆数量', '2'], ['陆地比例', '350'], ['海岸变化尺度', '384'], ['内陆起伏', '2200']]);
  332 |   await button(page, '预览大陆生成'); await awaitCandidate(page); await confirm(page);
  333 |   const macro = await saved(page, id), original = await geography(page, macro.manifest), fixture = localFixture(original, 256);
  334 |   await regionTools(page); await page.getByLabel('显示区域锁选区', { exact: true }).check(); await setRectangle(page, fixture.locks);
  335 |   await page.getByLabel('区域锁保护内容', { exact: true }).selectOption('1'); await page.getByLabel('区域锁操作', { exact: true }).selectOption('set');
  336 |   await button(page, '预览区域锁修改'); await expect(page.getByRole('region', { name: '区域锁修改预览' })).toBeVisible({ timeout: 90000 }); await ready(page);
  337 |   await button(page, '确认区域锁并保存'); await ready(page);
  338 |   let baseline = await saved(page, id), before = await geography(page, baseline.manifest); const locks = await readLocks(page, baseline);
  339 |   expect(locks).toEqual(Array.from({ length: 256 * 256 }, (_, cell) => distance(cell, 256, fixture.locks) >= 0 ? 1 : 0));
  340 |   expect(before).toEqual(original); const reports: unknown[] = [];
  341 |   for (const operation of ['landforms', 'coast'] as const) {
  342 |     await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption(operation); await regionTools(page);
  343 |     await page.getByLabel('地貌生成范围', { exact: true }).selectOption('local'); await setRectangle(page, fixture.rect);
  344 |     await page.getByLabel('过渡带宽度', { exact: true }).fill(String(fixture.transition));
  345 |     if (operation === 'landforms') await fields(page, [['地貌种子', 'PH06-local-terrain'], ['山系数量', '3'], ['盆地数量', '1'], ['内陆起伏', '2400']]);
  346 |     else await fields(page, [['目标平滑强度', '200'], ['细化轮数', '1']]);
  347 |     const database = await databaseDigest(page);
  348 |     await button(page, operation === 'landforms' ? '预览山系与盆地' : '预览海岸细化'); await awaitCandidate(page);
  349 |     await expect(candidate(page)).toContainText('局部生成：'); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
  350 |     await page.screenshot({ path: info.outputPath(`${operation}-actual-local-candidate.png`), fullPage: true });
  351 |     await confirm(page); const committed = await saved(page, id), after = await geography(page, committed.manifest);
  352 |     const last = committed.manifest.generation.lastApplied as NonNullable<typeof committed.manifest.generation.lastApplied> & { scope: Rectangle & { kind: string; transitionCells: number } };
  353 |     expect(last.scope).toEqual({ kind: 'cell-rectangle', ...fixture.rect, transitionCells: fixture.transition });
  354 |     expect(committed.root.revision).toBe(baseline.root.revision + 1); expect(committed.manifest.constraints).toEqual(baseline.manifest.constraints); expect(await readLocks(page, committed)).toEqual(locks);
  355 |     const changedLayer = operation === 'landforms' ? 'elevation:' : 'geometry:';
  356 |     expect(committed.manifest.blockRefs.filter(ref => !ref.key.startsWith(changedLayer))).toEqual(baseline.manifest.blockRefs.filter(ref => !ref.key.startsWith(changedLayer)));
  357 |     reports.push({ operation, fixture, ...verifyLocal(before, after, 256, fixture.rect, locks, fixture.transition, operation),
  358 |       derivedCoastalProtection: verifyDerivedCoastalProtection(before, after, 256, fixture.rect, locks),
  359 |       transitionOracle: operation === 'coast' ? verifyCoastTransition(before, after, 256, fixture.rect, locks, fixture.transition) : null, revision: committed.root.revision, recipe: last });
  360 |     await restored(page, id, committed, after); baseline = committed; before = after;
  361 |   }
  362 |   await info.attach('local-independent-persistence.json', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, reports, errors, physicalDeviceTest: false }, null, 2) });
  363 |   expect(errors).toEqual([]);
  364 | });
  365 | 
  366 | async function draw(page: Page, cdp: CDPSession, touch: boolean) {
  367 |   await button(page, '画大陆'); await button(page, '全图');
  368 |   const world = [[900, 900], [2200, 900], [2200, 1300], [1400, 1300], [1400, 1700], [2850, 1700], [2850, 1860], [1400, 1860], [1400, 2600], [900, 2600], [900, 900]];
  369 |   const frame = await metrics(page), bounds = await page.getByTestId('atlas-canvas').boundingBox(); if (!bounds) throw new Error('No actual canvas bounds');
  370 |   const points = world.map(([x, y]) => ({ x: bounds.x + frame.camera.x + x * frame.camera.scale, y: bounds.y + frame.camera.y + y * frame.camera.scale }));
  371 |   const exposed = await page.evaluate(points => points.every(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), points); expect(exposed).toBe(true);
  372 |   const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: XY) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] : [] });
  373 |   if (touch) { await send('touchStart', points[0]); for (const point of points.slice(1)) await send('touchMove', point); await send('touchEnd'); }
  374 |   else { await page.mouse.move(points[0].x, points[0].y); await page.mouse.down(); for (const point of points.slice(1)) await page.mouse.move(point.x, point.y); await page.mouse.up(); }
  375 | }
  376 | async function ocean(page: Page) {
  377 |   await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('ocean');
  378 |   await fields(page, [['地貌种子', 'PH06-completion-ocean'], ['平均海深', '3600'], ['海底起伏', '1000'], ['陆架宽度', '320']]); await button(page, '预览海床生成');
  379 | }
  380 | async function runningCancel(page: Page, operation: Observation['operation'], phase: 'generator' | 'coastal' = 'generator') {
  381 |   await page.waitForFunction(({ operation, phase }) => {
  382 |     const record = (window as unknown as ObserverHost).__completionActive, state = document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state');
  383 |     const stages = operation === 'shape' ? /量测手绘轮廓|读取手绘区域|从闭合轮廓生成/ : /读取海床真实|识别世界边界海水|沿真实共享边识别外海/;
  384 |     const match = (document.querySelector('.inspector-notice span')?.textContent ?? '').match(/^(.*?) · (\d+)\/(\d+)$/);
  385 |     return state === 'busy' && record?.operation === operation && record.finishedAt === null && !!match
  386 |       && (phase === 'generator' ? stages.test(match[1]) : match[1] === '核验实际裁切海岸面积与保护边界') && Number(match[2]) > 0 && Number(match[2]) < Number(match[3]);
  387 |   }, { operation, phase }, { timeout: phase === 'coastal' ? 90000 : 15000 });
  388 |   await expect(candidate(page)).toHaveCount(0); await button(page, '取消操作'); await ready(page); await expect(candidate(page)).toHaveCount(0);
> 389 |   await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); await expect(page.getByLabel('草稿操作反馈')).toContainText('取消');
      |                                                                                                                          ^ Error: expect(locator).toContainText(expected) failed
  390 |   const record = (await observations(page)).at(-1); expect(record?.cancelSnapshot?.phase).toBe(phase); expect(record?.cancelSnapshot?.algorithmRunning).toBe(true);
  391 | }
  392 | async function longTaskScenario(page: Page, info: TestInfo, size: '256' | '512') {
  393 |   test.setTimeout(360000); const errors = errorsOn(page), id = await create(page, size, `PH06长任务-${size}-${info.project.name}`);
  394 |   const cdp = await page.context().newCDPSession(page), baseline = await saved(page, id), database = await databaseDigest(page);
  395 |   try {
  396 |     for (const operation of ['shape', 'ocean'] as const) {
  397 |       const start = () => operation === 'shape' ? draw(page, cdp, info.project.name !== 'desktop-chromium') : ocean(page);
  398 |       await start(); await awaitCandidate(page); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
  399 |       await button(page, '取消生成'); await ready(page); expect(await databaseDigest(page)).toEqual(database);
  400 |       await start(); await runningCancel(page, operation); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
  401 |       expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 3, revision: 0, manifestDigest: baseline.root.currentManifest });
  402 |     }
  403 |     const runs = await observations(page); expect(runs).toHaveLength(4);
  404 |     for (const operation of ['shape', 'ocean'] as const) {
  405 |       const records = runs.filter(run => run.operation === operation); expect(records).toHaveLength(2); expect(records.filter(run => run.cancelRequestedAt !== null)).toHaveLength(1);
  406 |       for (const run of records) {
  407 |         expect.soft(run.progress250msGate, `${size} ${operation} maximum observed progress gap ${run.maximumGapMs} ms`).toBe(true);
  408 |         if (run.cancelRequestedAt !== null) expect.soft(run.cancellation500msGate, `${size} ${operation} actual running cancellation ${run.cancellationResponseMs} ms`).toBe(true);
  409 |       }
  410 |     }
  411 |     const inputs = await page.evaluate(() => (window as unknown as ObserverHost).__completionInputs);
  412 |     expect(inputs.length).toBeGreaterThan(20); expect(inputs.every(input => input.trusted)).toBe(true);
  413 |     expect(inputs.some(input => input.pointerType === (info.project.name === 'desktop-chromium' ? 'mouse' : 'touch'))).toBe(true);
  414 |     await info.attach('long-task-unchanged-database.json', { contentType: 'application/json', body: JSON.stringify({ size, project: info.project.name, baselineRoot: baseline.root, wholeDatabase: database, finalWholeDatabase: await databaseDigest(page), sourceUnchangedAfterBothRunningCancellations: true, errors }, null, 2) });
  415 |     expect(errors).toEqual([]);
  416 |   } finally { await cdp.detach(); }
  417 | }
  418 | test('标准256长任务：手绘和海床真实运行中取消，250ms进度与500ms取消保持源库', async ({ page }, info) => { await longTaskScenario(page, info, '256'); });
  419 | test('桌面512长任务：手绘和海床真实运行中取消，250ms进度与500ms取消保持源库', async ({ page }, info) => {
  420 |   test.skip(info.project.name !== 'desktop-chromium', 'The existing bound is 512 on desktop; standard 256 runs on all three projects.');
  421 |   await longTaskScenario(page, info, '512');
  422 | });
  423 | test('桌面512裁切后段：真实v3面积与保护核验中取消，250ms进度与500ms取消保持源库', async ({ page }, info) => {
  424 |   test.skip(info.project.name !== 'desktop-chromium', 'The additional v3-only late-phase sample is bounded to 512 desktop.');
  425 |   test.setTimeout(360000); const errors = errorsOn(page), id = await create(page, '512', 'PH06-v3裁切后段取消');
  426 |   const baseline = await saved(page, id), database = await databaseDigest(page);
  427 |   await ocean(page); await runningCancel(page, 'ocean', 'coastal');
  428 |   expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
  429 |   expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 3, revision: 0, manifestDigest: baseline.root.currentManifest });
  430 |   const runs = await observations(page); expect(runs).toHaveLength(1); const run = runs[0];
  431 |   expect(run.cancelSnapshot).toMatchObject({ phase: 'coastal', stage: '核验实际裁切海岸面积与保护边界', state: 'busy', candidateVisible: false, algorithmRunning: true });
  432 |   expect.soft(run.progress250msGate, `512 v3 late phase maximum observed progress gap ${run.maximumGapMs} ms`).toBe(true);
  433 |   expect.soft(run.cancellation500msGate, `512 v3 late phase actual running cancellation ${run.cancellationResponseMs} ms`).toBe(true);
  434 |   await info.attach('coastal-late-phase-unchanged-database.json', { contentType: 'application/json', body: JSON.stringify({ size: 512, format: 3, project: info.project.name, baselineRoot: baseline.root,
  435 |     wholeDatabase: database, finalWholeDatabase: await databaseDigest(page), run, errors, physicalDeviceTest: false,
  436 |     limitation: 'This empty-ocean sample exercises the shared v3 clipping/area audit after the ocean algorithm. It is not a claim of all protected-shore fixtures or real-device performance.' }, null, 2) });
  437 |   expect(errors).toEqual([]);
  438 | });
  439 | 
```