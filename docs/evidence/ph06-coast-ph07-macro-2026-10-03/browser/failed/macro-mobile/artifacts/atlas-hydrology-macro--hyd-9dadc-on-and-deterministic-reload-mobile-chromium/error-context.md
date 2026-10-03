# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-hydrology-macro.spec.ts >> [hydrology-macro-v4] native continent, complete saved grid, branch tap, active cancellation and deterministic reload
- Location: tests\atlas-hydrology-macro.spec.ts:124:1

# Error details

```
TimeoutError: page.waitForFunction: Timeout 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - heading "大陆汇流 · 原生只读验收" [level=1] [ref=e6]
        - generic [ref=e7]: 地理创作
      - button "撤销大世界编辑" [ref=e8] [cursor=pointer]:
        - generic [ref=e11]: 撤销
      - button "返回原世界工坊" [ref=e12] [cursor=pointer]:
        - generic [ref=e15]: 工坊
    - generic [ref=e16]:
      - generic "大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块" [ref=e18]
      - group "地图视图与创作工具" [ref=e19]:
        - generic [ref=e20]:
          - button "放大大世界地图" [ref=e21] [cursor=pointer]: ＋
          - button "缩小大世界地图" [ref=e22] [cursor=pointer]: −
          - button "全图" [ref=e23] [cursor=pointer]
          - generic [ref=e24]: 9%
        - toolbar "地图创作工具" [ref=e25]:
          - button "浏览地图" [pressed] [ref=e26] [cursor=pointer]:
            - generic [ref=e30]: 浏览
          - button "画大陆" [ref=e31] [cursor=pointer]
          - button "显示地块网格" [ref=e35] [cursor=pointer]:
            - generic [ref=e39]: 网格
      - generic "草稿操作反馈" [ref=e41]:
        - status [ref=e42]:
          - generic [ref=e43]: 已显示 34 支大陆汇流。点选线条查看去向；16 世界单位采样，本次分析完成。
          - button "查看汇流详情" [ref=e44] [cursor=pointer]
          - button "关闭大陆汇流" [ref=e45] [cursor=pointer]
    - navigation "大世界草稿工具" [ref=e46]:
      - button "地图" [pressed] [ref=e47] [cursor=pointer]
      - button "创世" [ref=e52] [cursor=pointer]
      - button "编辑" [ref=e57] [cursor=pointer]
      - button "水文" [ref=e61] [cursor=pointer]
      - button "草稿" [ref=e65] [cursor=pointer]
  - button "select to enable accessibility for this content" [ref=e70] [cursor=pointer]
```

# Test source

```ts
  84  |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [{ x: 1010, y: 1550 }]))[0];
  85  |   const center = { x: box.x + box.width * .5, y: box.y + box.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  86  |   await nativeGesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  87  |   for (let i = 0; i < 8 && (await metrics(p)).camera.scale < .5; i++) await press(p, '放大大世界地图', touch);
  88  |   await frameReady(p); const frame = await metrics(p); expect(frame.camera.scale).toBeGreaterThanOrEqual(.5);
  89  |   const receivers = new Map(preview.edges.from.map((id, i) => [id, preview.edges.to[i]]));
  90  |   const segments: { branch: number; from: number; to: number; a: XY; b: XY }[] = [];
  91  |   preview.branches.forEach((branch, index) => {
  92  |     let at = branch.sourceNode; const seen = new Set<number>();
  93  |     while (at !== branch.endNode && receivers.has(at) && !seen.has(at)) {
  94  |       seen.add(at); const next = receivers.get(at)!; segments.push({ branch: index, from: at, to: next, a: world(at), b: world(next) }); at = next;
  95  |     }
  96  |   });
  97  |   const distance = (q: XY, a: XY, b: XY) => {
  98  |     const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  99  |     const t = length2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / length2)) : 0;
  100 |     return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
  101 |   };
  102 |   const candidates = segments.map(segment => {
  103 |     const midpoint = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
  104 |     const point = { x: box.x + frame.camera.x + midpoint.x * frame.camera.scale, y: box.y + frame.camera.y + midpoint.y * frame.camera.scale };
  105 |     const otherEdges = segments.filter(other => other.branch !== segment.branch).map(other => distance(midpoint, other.a, other.b));
  106 |     const otherEnds = preview.branches.filter((_branch, i) => i !== segment.branch).map(branch => distance(midpoint, world(branch.endNode), world(branch.endNode)));
  107 |     return { ...segment, midpoint, point, clearancePixels: Math.min(...otherEdges, ...otherEnds) * frame.camera.scale };
  108 |   }).filter(candidate => candidate.clearancePixels >= 3 && candidate.point.x > box.x + 24 && candidate.point.x < box.x + box.width - 24
  109 |     && candidate.point.y > box.y + 145 && candidate.point.y < box.y + box.height - 140)
  110 |     .sort((a, b) => Math.hypot(a.point.x - center.x, a.point.y - center.y) - Math.hypot(b.point.x - center.x, b.point.y - center.y));
  111 |   const unobscured = await p.evaluate(points => points.map(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), candidates.map(candidate => candidate.point));
  112 |   const chosen = candidates.find((_candidate, index) => unobscured[index]); expect(chosen, 'Actual displayed branches provide a visible unambiguous native tap target').toBeDefined();
  113 |   if (touch) await p.touchscreen.tap(chosen!.point.x, chosen!.point.y); else await p.mouse.click(chosen!.point.x, chosen!.point.y);
  114 |   await expect(studio(p)).toHaveAttribute('data-atlas-macro-selected', String(chosen!.branch));
  115 |   const details = p.getByRole('region', { name: '汇流分支详情', exact: true });
  116 |   await expect(details).toBeVisible(); await expect(details.getByRole('heading')).toContainText(`支流 ${chosen!.branch + 1} ·`);
  117 |   const start = preview.nodes.ids.indexOf(preview.branches[chosen!.branch].sourceNode);
  118 |   await expect(details).toContainText(`${preview.nodes.groundMeters[start]} 米`);
  119 |   await expect(p.getByRole('group', { name: '大陆汇流分支', exact: true }).getByRole('button').nth(chosen!.branch)).toHaveAttribute('aria-pressed', 'true');
  120 |   expect(await displayedMacro(p)).toEqual(preview);
  121 |   return { branch: chosen!.branch, edge: { from: chosen!.from, to: chosen!.to }, worldMidpoint: chosen!.midpoint, screenPoint: chosen!.point, clearancePixels: chosen!.clearancePixels, camera: frame.camera };
  122 | }
  123 | 
  124 | test('[hydrology-macro-v4] native continent, complete saved grid, branch tap, active cancellation and deterministic reload', async ({ page }, info) => {
  125 |   test.setTimeout(450000);
  126 |   const response = await page.request.get('/build.json'); expect(response.ok()).toBe(true); const buildBytes = await response.body();
  127 |   const buildSha256 = createHash('sha256').update(buildBytes).digest('hex'), build = JSON.parse(buildBytes.toString()) as { version: string; commit: string; naturalDetailGenerator?: { sha256: string } };
  128 |   if (process.env.MACRO_FLOW_EXPECTED_BUILD_SHA256) expect(buildSha256).toBe(process.env.MACRO_FLOW_EXPECTED_BUILD_SHA256);
  129 |   expect(build.commit).toMatch(/^[a-f0-9]{40}$/); expect(build.naturalDetailGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  130 |   const touch = !!info.project.use.hasTouch, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  131 |   await info.attach('actual-build.json', { body: buildBytes, contentType: 'application/json' });
  132 |   await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  133 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('大陆汇流 · 原生只读验收');
  134 |   await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  135 |   await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await press(page, '新建空白海洋草稿', touch); await ready(page);
  136 |   const id = (await studio(page).getAttribute('data-atlas-id'))!; expect(id).toMatch(/^atlas-/);
  137 |   await section(page, '创世', touch); await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128');
  138 |   await page.getByLabel('近岸岛链', { exact: true }).selectOption('0'); await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  139 |   await press(page, '画大陆', touch); await press(page, '全图', touch); await frameReady(page);
  140 |   await nativeGesture(page, await screen(page, [...contour, contour[0]]), touch);
  141 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page);
  142 |   const decisions = page.getByRole('group', { name: '大陆生成预览操作', exact: true });
  143 |   await expect(decisions.getByRole('button', { name: '取消生成', exact: true })).toBeInViewport({ ratio: 1 });
  144 |   await expect(decisions.getByRole('button', { name: '确认生成并保存', exact: true })).toBeInViewport({ ratio: 1 });
  145 |   await press(page, '确认生成并保存', touch);
  146 |   await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 });
  147 |   await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); await expect(page.getByRole('region', { name: '大陆生成预览' })).toHaveCount(0); await ready(page);
  148 |   const before = await saved(page, id, 4), beforeDb = await databaseDigest(page, 4);
  149 |   expect(before.root.revision).toBe(1); expect(before.manifest.generation.lastApplied?.recipe.generator.fingerprint).toBe(build.naturalDetailGenerator!.sha256);
  150 |   // Keep a real selected map cell so editing can be entered while flow remains visible.
  151 |   const initialPick = (await screen(page, [{ x: 1010, y: 1550 }]))[0];
  152 |   if (touch) await page.touchscreen.tap(initialPick.x, initialPick.y); else await page.mouse.click(initialPick.x, initialPick.y);
  153 |   await section(page, '水文', touch); const firstProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
  154 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', /^[1-9]\d*$/, { timeout: 120000 }); await ready(page);
  155 |   const firstProgress = await firstProgressPending, first = await displayedMacro(page); expect(first).not.toBeNull();
  156 |   expect(firstProgress).toContainEqual({ stage: '宏观水文读取器：采样权威细地形', completed: 66049, total: 66049 });
  157 |   expect(first!.source).toMatchObject({ draftId: id, atlasId: before.manifest.atlasId, revision: 1, rootDigest: before.root.rootDigest, manifestDigest: before.root.currentManifest });
  158 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', String(first!.branches.length)); await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', '');
  159 |   await expect(button(page, '关闭大世界面板')).toHaveCount(0); await expect(button(page, '查看汇流详情')).toBeVisible();
  160 |   const terrain = await savedMacroTerrain(page, id, first!.nodes.ids); expect(terrain.manifestDigest).toBe(before.root.currentManifest);
  161 |   const edgeChecks = verifySavedEdges(first!, terrain);
  162 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  163 |   await frameReady(page); const firstFrame = await metrics(page); await page.screenshot({ path: info.outputPath('macro-complete-network.png'), fullPage: true });
  164 |   const pick = await nativePickBranch(page, first!, touch); await page.screenshot({ path: info.outputPath('macro-native-branch-details.png'), fullPage: true });
  165 |   await press(page, '回地图看汇流', touch); await expect(button(page, '关闭大世界面板')).toHaveCount(0); await frameReady(page);
  166 |   await page.screenshot({ path: info.outputPath('macro-selected-branch-map.png'), fullPage: true });
  167 |   // Active editing must take precedence over a visible branch on both taps.
  168 |   await section(page, '编辑', touch); await press(page, '保护区域', touch); await press(page, '在地图上选择保护范围', touch);
  169 |   if (touch) await page.touchscreen.tap(pick.screenPoint.x, pick.screenPoint.y); else await page.mouse.click(pick.screenPoint.x, pick.screenPoint.y);
  170 |   await expect(page.getByText('已选保护范围第一角。再点对角位置；也可以再次点此处，只保护一个地块。', { exact: true })).toBeVisible();
  171 |   await expect(button(page, '关闭大世界面板')).toHaveCount(0);
  172 |   if (touch) await page.touchscreen.tap(pick.screenPoint.x, pick.screenPoint.y); else await page.mouse.click(pick.screenPoint.x, pick.screenPoint.y);
  173 |   await expect(page.getByTestId('region-protection-scope')).toContainText('当前范围 1 × 1');
  174 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', String(pick.branch));
  175 |   expect(await displayedMacro(page)).toEqual(first);
  176 |   expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  177 |   await press(page, '关闭大世界面板', touch);
  178 |   await press(page, '查看汇流详情', touch); await expect(page.getByRole('region', { name: '汇流分支详情', exact: true })).toBeVisible();
  179 |   await press(page, '关闭大陆汇流', touch); await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', '0');
  180 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', ''); expect(await displayedMacro(page)).toBeNull();
  181 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  182 | 
  183 |   const cancelProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
> 184 |   await page.waitForFunction(() => {
      |              ^ TimeoutError: page.waitForFunction: Timeout 120000ms exceeded.
  185 |     const main = document.querySelector('[data-testid="atlas-studio"]'), stage = main?.getAttribute('data-atlas-progress-stage') ?? '';
  186 |     const completed = Number(main?.getAttribute('data-atlas-progress-completed')), total = Number(main?.getAttribute('data-atlas-progress-total'));
  187 |     return main?.getAttribute('data-atlas-state') === 'busy' && stage === '宏观水文读取器：采样权威细地形'
  188 |       && total === 66049 && completed > 0 && completed <= Math.floor(total / 4);
  189 |   }, undefined, { timeout: 120000, polling: 'raf' });
  190 |   const cancelledStage = await studio(page).getAttribute('data-atlas-progress-stage'), cancelledSamples = Number(await studio(page).getAttribute('data-atlas-progress-completed'));
  191 |   expect(cancelledSamples).toBeGreaterThan(0); expect(cancelledSamples).toBeLessThan(66049);
  192 |   await press(page, '取消操作', touch); await ready(page); const cancelProgress = await cancelProgressPending;
  193 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', '0'); await expect(studio(page)).toHaveAttribute('data-atlas-macro-selected', ''); expect(await displayedMacro(page)).toBeNull();
  194 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  195 |   await page.screenshot({ path: info.outputPath('macro-cancelled-readonly.png'), fullPage: true });
  196 | 
  197 |   await page.reload(); await ready(page); expect(await saved(page, id, 4)).toEqual(before); expect(await displayedMacro(page)).toBeNull();
  198 |   await section(page, '水文', touch); const restoredProgressPending = observeMacroProgress(page); await press(page, '查看大陆汇流', touch);
  199 |   await expect(studio(page)).toHaveAttribute('data-atlas-macro-branches', String(first!.branches.length), { timeout: 120000 }); await ready(page);
  200 |   const restoredProgress = await restoredProgressPending, restored = await displayedMacro(page); expect(restored).toEqual(first); expect(digest(restored)).toBe(digest(first));
  201 |   expect(restoredProgress).toContainEqual({ stage: '宏观水文读取器：采样权威细地形', completed: 66049, total: 66049 });
  202 |   expect(await saved(page, id, 4)).toEqual(before); expect(await databaseDigest(page, 4)).toEqual(beforeDb);
  203 |   await frameReady(page); const restoredFrame = await metrics(page); await page.screenshot({ path: info.outputPath('macro-restored-identical-network.png'), fullPage: true });
  204 |   expect(errors).toEqual([]);
  205 |   await info.attach('hydrology-macro-evidence.json', { contentType: 'application/json', body: JSON.stringify({ build, buildSha256, project: info.project.name, physicalDevice: false,
  206 |     input: { size: 128, seed: 'hydrology-native-128', contour }, root: before.root, database: beforeDb, terrain, edgeChecks, first, restored, firstFrame, restoredFrame, pick,
  207 |     resultSha256: digest(first), firstProgress, restoredProgress, cancelled: { stage: cancelledStage, completedSamples: cancelledSamples, totalSamples: 66049, progress: cancelProgress, noDisplayedResult: true, savedUnchanged: true }, errors }, null, 2) });
  208 | });
  209 | 
```