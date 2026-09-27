# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-hydrology.spec.ts >> [hydrology-v4] native saved continent, read-only real flow, active cancellation and deterministic reload
- Location: tests\atlas-hydrology.spec.ts:140:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByTestId('atlas-studio')
Expected: "1"
Received: "0"
Timeout:  120000ms

Call log:
  - Expect "toHaveAttribute" getByTestId('atlas-studio') with timeout 120000ms
  - waiting for getByTestId('atlas-studio')
    238 × locator resolved to <main data-mode="atlas" data-selectedcell="" data-atlas-format="4" data-atlas-gpu="ready" data-chrome="map-first" data-atlas-revision="0" data-atlas-tool="browse" data-atlas-state="ready" data-atlas-flow-points="0" data-testid="atlas-studio" data-atlas-selectedcell="" data-atlas-flow-terminal="" data-atlas-progress-stage="" data-atlas-progress-total="" class="atlas-studio workbench" data-atlas-request-bytes="3646" data-atlas-progress-completed="" data-atlas-repainted-blocks="16" data-atlas-response-…>…</main>
        - unexpected value "0"

```

```yaml
- main:
  - heading "山河流向 · 原生只读验收" [level=1]
  - text: 生成预览 · 尚未保存
  - button "撤销大世界编辑" [disabled]: 撤销
  - button "返回原世界工坊": 工坊
  - group "地图视图与创作工具"
  - region "大陆与地貌"
  - navigation "大世界草稿工具"
```

# Test source

```ts
  62  |         tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual saved fine field')); };
  63  |       };
  64  |     });
  65  |     const tiles = new Map<string, { bx: number; by: number; mode: number; view: DataView; count: number }>(); let explicitNodes = 0;
  66  |     for (const record of source.records) {
  67  |       const b = record.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b).buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
  68  |       if (digest !== record.hash || b.length < 16 || [76, 71, 68, 67, 1].some((n, i) => b[i] !== n) || b[6] !== record.bx || b[7] !== record.by || b[5] > 1 || b.slice(10, 16).some(Boolean)) throw new Error('Invalid durable LGDC identity/hash');
  69  |       const n = v.getUint16(8, true), expected = (record.bx ? 32 : 33) * (record.by ? 32 : 33), key = `${record.bx}:${record.by}`;
  70  |       if (n !== (b[5] ? expected : 0) || b.length !== 16 + n * 4 || tiles.has(key)) throw new Error('Invalid fine owner layout');
  71  |       tiles.set(key, { bx: record.bx, by: record.by, mode: b[5], view: v, count: n }); explicitNodes += n;
  72  |     }
  73  |     const sample = (x: number, y: number) => {
  74  |       const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
  75  |       if (!tile?.mode) return null;
  76  |       const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
  77  |       const coverage = tile.view.getInt16(16 + slot * 2, true), height = tile.view.getInt16(16 + tile.count * 2 + slot * 2, true);
  78  |       if (coverage === -32768 || height < -12000 || height > 12000 || coverage > 0 && height < 0 || coverage < 0 && height >= 0 || coverage === 0 && height !== 0) throw new Error('Fine coverage/height mismatch');
  79  |       return { coverage, height };
  80  |     };
  81  |     let point: { column: number; row: number; height: number; cellId: number; x: number; y: number } | null = null;
  82  |     // Pick a real high interior node with a strictly lower adjacent land node.
  83  |     // A .25-world inset keeps the native pick inside its cell and rounds to the
  84  |     // same fine node; the test later checks the actual trace sourceNode.
  85  |     for (const tile of tiles.values()) if (tile.mode) {
  86  |       const startX = tile.bx * 32 + (tile.bx ? 1 : 0), startY = tile.by * 32 + (tile.by ? 1 : 0), width = tile.bx ? 32 : 33;
  87  |       for (let slot = 0; slot < tile.count; slot++) {
  88  |         const column = startX + slot % width, row = startY + Math.floor(slot / width); if (column < 2 || row < 2 || column > 2046 || row > 2046) continue;
  89  |         const center = sample(column, row); if (!center || center.coverage <= 256 || center.height < 300 || point && center.height < point.height) continue;
  90  |         const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]].map(([dx, dy]) => sample(column + dx, row + dy));
  91  |         if (neighbours.some(n => !n || n.coverage <= 256) || !neighbours.slice(0, 4).some(n => n!.height < center.height)) continue;
  92  |         if (point && center.height === point.height && row * 2049 + column > point.row * 2049 + point.column) continue;
  93  |         const x = column * 2 + .25, y = row * 2 + .25;
  94  |         point = { column, row, height: center.height, x, y, cellId: Math.floor(y / (4096 / source.size)) * source.size + Math.floor(x / (4096 / source.size)) };
  95  |       }
  96  |     }
  97  |     if (!point) throw new Error('The generated saved continent has no actual interior highland probe');
  98  |     return { point, explicitNodes, ownerCount: tiles.size, manifestDigest: source.manifestDigest, pathSamples: path.map(q => sample(q.column, q.row)) };
  99  |   }, { id, path });
  100 | }
  101 | 
  102 | async function selectPoint(p: Page, point: Awaited<ReturnType<typeof durableTerrain>>['point'], touch: boolean) {
  103 |   await section(p, '地图', touch); await press(p, '全图', touch); await frameReady(p);
  104 |   for (let i = 0; i < 16 && (await metrics(p)).camera.scale < 2; i++) await press(p, '放大大世界地图', touch);
  105 |   await frameReady(p); expect((await metrics(p)).camera.scale).toBeGreaterThanOrEqual(2);
  106 |   await section(p, '编辑', touch); await p.getByLabel('定位地块编号', { exact: true }).fill(String(point.cellId)); await press(p, '定位', touch);
  107 |   await section(p, '地图', touch); await frameReady(p);
  108 |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [point]))[0];
  109 |   const center = { x: box.x + box.width * .5, y: box.y + box.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  110 |   await nativeGesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  111 |   await frameReady(p); const target = (await screen(p, [point]))[0];
  112 |   expect(await p.evaluate(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid'), target)).toBe('atlas-canvas');
  113 |   if (touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
  114 |   await expect(p.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', 'land');
  115 |   await expect(button(p, '查看地形流向')).toBeEnabled();
  116 | }
  117 | async function displayedTrace(p: Page): Promise<HydrologyTrace | null> {
  118 |   // Runtime data comes only from the existing read-only audit of the actual
  119 |   // renderer. A type import does not invoke any app algorithm in this test.
  120 |   const result = await audit(p) as Awaited<ReturnType<typeof audit>> & { hydrologyTrace: HydrologyTrace | null };
  121 |   expect(Object.hasOwn(result, 'hydrologyTrace')).toBe(true); return result.hydrologyTrace;
  122 | }
  123 | const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  124 | async function assertVisibleFlow(p: Page, trace: HydrologyTrace) {
  125 |   await frameReady(p);
  126 |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  127 |   const horizontal = Math.min(48, box.width * .12), vertical = Math.min(144, box.height * .25);
  128 |   const points = trace.path.map(q => ({ x: q.column * 2, y: q.row * 2 }));
  129 |   if (trace.coastPointQ) points.push({ x: trace.coastPointQ.xQ / 256, y: trace.coastPointQ.yQ / 256 });
  130 |   for (const q of points) {
  131 |     const x = frame.camera.x + q.x * frame.camera.scale, y = frame.camera.y + q.y * frame.camera.scale;
  132 |     expect(x, 'Actual path stays inside the visible canvas with horizontal margin').toBeGreaterThanOrEqual(horizontal - 1e-6);
  133 |     expect(x).toBeLessThanOrEqual(box.width - horizontal + 1e-6);
  134 |     expect(y, 'Actual path leaves room for map tools above and result controls below').toBeGreaterThanOrEqual(vertical - 1e-6);
  135 |     expect(y).toBeLessThanOrEqual(box.height - vertical + 1e-6);
  136 |   }
  137 |   return { camera: frame.camera, canvas: { width: box.width, height: box.height }, horizontal, vertical, points: points.length };
  138 | }
  139 | 
  140 | test('[hydrology-v4] native saved continent, read-only real flow, active cancellation and deterministic reload', async ({ page }, info) => {
  141 |   test.setTimeout(450000); // Original real-workflow ceiling; zero retries in runner.
  142 |   const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true); const buildBytes = await response.body();
  143 |   const buildSha256 = createHash('sha256').update(buildBytes).digest('hex'), build = JSON.parse(buildBytes.toString()) as { version: string; commit: string; naturalDetailGenerator?: { sha256: string } };
  144 |   if (process.env.FLOW_EXPECTED_BUILD_SHA256) expect(buildSha256).toBe(process.env.FLOW_EXPECTED_BUILD_SHA256);
  145 |   expect(build.commit).toMatch(/^[a-f0-9]{40}$/); expect(build.naturalDetailGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  146 |   const touch = !!info.project.use.hasTouch, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  147 |   await info.attach('actual-build.json', { body: buildBytes, contentType: 'application/json' });
  148 |   await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  149 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('山河流向 · 原生只读验收');
  150 |   await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  151 |   await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await press(page, '新建空白海洋草稿', touch); await ready(page);
  152 |   const id = (await studio(page).getAttribute('data-atlas-id'))!; expect(id).toMatch(/^atlas-/);
  153 |   await section(page, '创世', touch); await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128');
  154 |   await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  155 |   await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  156 |   await press(page, '画大陆', touch); await press(page, '全图', touch); await frameReady(page);
  157 |   await nativeGesture(page, await screen(page, [...contour, contour[0]]), touch);
  158 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page);
  159 |   await press(page, '确认生成并保存', touch);
  160 |   // A native tap may finish before its click activates. "ready" was already
  161 |   // true in preview, so wait for the real commit; never retry the tap.
> 162 |   await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 });
      |                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  163 |   await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
  164 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toHaveCount(0); await ready(page);
  165 |   const before = await saved(page, id, 4), beforeDb = await databaseDigest(page, 4), terrain = await durableTerrain(page, id);
  166 |   expect(before.root.revision).toBe(1); expect(terrain.manifestDigest).toBe(before.root.currentManifest); expect(terrain.explicitNodes).toBeGreaterThan(0);
  167 |   expect(before.manifest.generation.lastApplied?.recipe.generator.fingerprint).toBe(build.naturalDetailGenerator!.sha256);
  168 |   await selectPoint(page, terrain.point, touch); await press(page, '查看地形流向', touch);
  169 |   await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  170 |   const first = await displayedTrace(page); expect(first).not.toBeNull();
  171 |   expect(first!.sourceNode).toEqual({ column: terrain.point.column, row: terrain.point.row });
  172 |   expect(first!.source).toMatchObject({ draftId: id, revision: 1, rootDigest: before.root.rootDigest, manifestDigest: before.root.currentManifest });
  173 |   expect(first!.path.length).toBeGreaterThan(1); expect(first!.path.length).toBeLessThanOrEqual(4096);
  174 |   expect(['ocean', 'depression', 'unresolved']).toContain(first!.terminal);
  175 |   await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', first!.terminal); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', String(first!.path.length));
  176 |   await expect(button(page, '关闭流向')).toBeVisible(); await expect(button(page, '关闭大世界面板')).toHaveCount(0);
  177 |   const actualPath = (await durableTerrain(page, id, first!.path)).pathSamples, seen = new Set<string>();
  178 |   for (let i = 0; i < first!.path.length; i++) {
  179 |     const q = first!.path[i], prior = first!.path[i - 1], sample = actualPath[i];
  180 |     expect(sample, 'Displayed route must read real saved explicit fine nodes').not.toBeNull(); expect(sample!.coverage).toBeGreaterThanOrEqual(0);
  181 |     expect(seen.has(`${q.column}:${q.row}`)).toBe(false); seen.add(`${q.column}:${q.row}`);
  182 |     if (prior) { expect(Math.abs(q.column - prior.column) + Math.abs(q.row - prior.row)).toBe(1); expect(sample!.height).toBeLessThanOrEqual(actualPath[i - 1]!.height); }
  183 |   }
  184 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  185 |   const firstFraming = await assertVisibleFlow(page, first!); await page.screenshot({ path: info.outputPath('saved-terrain-flow.png'), fullPage: true });
  186 | 
  187 |   await press(page, '关闭流向', touch); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', '0');
  188 |   await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', ''); expect(await displayedTrace(page)).toBeNull();
  189 |   await section(page, '编辑', touch); await press(page, '查看地形流向', touch);
  190 |   await page.waitForFunction(() => {
  191 |     const main = document.querySelector('[data-testid="atlas-studio"]'), stage = main?.getAttribute('data-atlas-progress-stage') ?? '';
  192 |     return main?.getAttribute('data-atlas-state') === 'busy' && stage.startsWith('水文计算：') && stage !== '水文计算：capture' && Number(main.getAttribute('data-atlas-progress-completed')) > 0;
  193 |   }, undefined, { timeout: 120000, polling: 'raf' });
  194 |   const cancelledStage = await studio(page).getAttribute('data-atlas-progress-stage'), cancelledOperations = Number(await studio(page).getAttribute('data-atlas-progress-completed'));
  195 |   expect(cancelledOperations).toBeGreaterThan(0); await press(page, '取消操作', touch); await ready(page);
  196 |   await expect(studio(page)).toHaveAttribute('data-atlas-flow-terminal', ''); await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', '0'); expect(await displayedTrace(page)).toBeNull();
  197 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  198 | 
  199 |   await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(before); expect(await displayedTrace(page)).toBeNull();
  200 |   await selectPoint(page, terrain.point, touch); await press(page, '查看地形流向', touch);
  201 |   await expect(studio(page)).toHaveAttribute('data-atlas-flow-points', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  202 |   const restored = await displayedTrace(page); expect(restored).toEqual(first); expect(digest(restored)).toBe(digest(first));
  203 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  204 |   const restoredFraming = await assertVisibleFlow(page, restored!); await page.screenshot({ path: info.outputPath('restored-identical-flow.png'), fullPage: true });
  205 |   expect(errors).toEqual([]);
  206 |   await info.attach('hydrology-evidence.json', { contentType: 'application/json', body: JSON.stringify({ build, buildSha256, project: info.project.name, physicalDevice: false,
  207 |     input: { size: 128, contour, point: terrain.point, explicitNodes: terrain.explicitNodes, ownerCount: terrain.ownerCount }, root: before.root, database: beforeDb,
  208 |     first, restored, firstFraming, restoredFraming, pathSha256: digest(first!.path), cancelled: { stage: cancelledStage, operations: cancelledOperations, noDisplayedResult: true, savedUnchanged: true }, errors }, null, 2) });
  209 | });
  210 | 
```