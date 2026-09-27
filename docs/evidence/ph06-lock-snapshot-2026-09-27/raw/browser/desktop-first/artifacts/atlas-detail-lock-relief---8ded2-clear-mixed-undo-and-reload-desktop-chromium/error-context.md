# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-detail-lock-relief.spec.ts >> [detail-v4-lock-relief] native nonzero coast/elevation/both locks, allowed relief, single-bit clear, mixed undo and reload
- Location: tests\atlas-detail-lock-relief.spec.ts:259:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Array [
    Object {
-     "cellId": 26948,
+     "cellId": 25925,
      "mask": 1,
    },
    Object {
-     "cellId": 27722,
+     "cellId": 26699,
      "mask": 2,
    },
    Object {
-     "cellId": 28487,
+     "cellId": 27464,
      "mask": 3,
    },
  ]
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - heading "区域保护 · 真实锁与山地" [level=1] [ref=e6]
      - generic [ref=e7]: 地理创作
    - button "撤销大世界编辑" [ref=e8] [cursor=pointer]:
      - generic [ref=e11]: 撤销
    - button "返回原世界工坊" [ref=e12] [cursor=pointer]:
      - generic [ref=e15]: 工坊
  - generic [ref=e16]:
    - generic "大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块" [ref=e18]
    - generic [ref=e19]:
      - button "放大大世界地图" [ref=e20] [cursor=pointer]: ＋
      - button "缩小大世界地图" [ref=e21] [cursor=pointer]: −
      - button "全图" [ref=e22] [cursor=pointer]
      - generic [ref=e23]: 222%
    - toolbar "地图创作工具" [ref=e24]:
      - button "浏览地图" [pressed] [ref=e25] [cursor=pointer]:
        - generic [ref=e29]: 浏览
      - button "画大陆" [ref=e30] [cursor=pointer]
      - button "显示地块网格" [ref=e34] [cursor=pointer]:
        - generic [ref=e38]: 网格
    - region "大陆与地貌" [ref=e39]:
      - generic [ref=e40]:
        - generic [ref=e41]:
          - heading "大陆与地貌" [level=2] [ref=e42]
          - paragraph [ref=e43]: 独立保存，不覆盖原世界
        - button "关闭大世界面板" [ref=e44] [cursor=pointer]
      - generic [ref=e48]:
        - generic [ref=e49]: 保留海岸 · 调整已有山河
        - heading "仅重生成山地" [level=3] [ref=e50]
        - paragraph [ref=e51]: 蓝色外框是本次范围，内框之间逐渐过渡。只在已有陆地生成山地，不添加大陆；先预览，再确认保存。
        - group [ref=e52]:
          - button "在地图上重新选择范围" [ref=e53] [cursor=pointer]
          - paragraph [ref=e54]: 当前范围 16 × 16 基础地块，过渡 2 格。
          - group [ref=e55]:
            - generic "精确调整范围" [ref=e56] [cursor=pointer]
          - generic [ref=e57]:
            - text: 山地种子
            - textbox "局部山地种子" [ref=e58]: local-relief-native-nonzero-locks
          - generic [ref=e59]:
            - text: 山地起伏（米）
            - spinbutton "局部山地起伏" [ref=e60]: "3600"
          - paragraph [ref=e61]: 完成预览后，会显示真实改变、抬升和降低的细高程节点数量。已锁定的区域不会被自动解锁。
          - button "预览山地变化" [ref=e62] [cursor=pointer]
        - button "返回画大陆" [ref=e63] [cursor=pointer]
      - generic "草稿操作反馈" [ref=e65]:
        - status [ref=e66]:
          - generic [ref=e67]: 局部山地已保存，可以继续选择其他范围，或撤销刚才的生成。
  - navigation "大世界草稿工具" [ref=e68]:
    - button "地图" [ref=e69] [cursor=pointer]
    - button "创世" [pressed] [ref=e74] [cursor=pointer]
    - button "编辑" [ref=e79] [cursor=pointer]
    - button "草稿" [ref=e83] [cursor=pointer]
```

# Test source

```ts
  204 | type Lock = { cellId: number; flags: number };
  205 | type DetailManifest = SavedSnapshot['manifest'] & { detailCoast: { refs: { bx: number; by: number; hash: string }[] } };
  206 | function geographyUnchanged(before: SavedSnapshot, after: SavedSnapshot) {
  207 |   expect(after.manifest.blockRefs).toEqual(before.manifest.blockRefs);
  208 |   expect((after.manifest as DetailManifest).detailCoast).toEqual((before.manifest as DetailManifest).detailCoast);
  209 |   expect(after.manifest.generation).toEqual(before.manifest.generation);
  210 | }
  211 | async function lockState(p: Page, id: string) {
  212 |   const snapshot = await saved(p, id, 4);
  213 |   const flags = await p.evaluate(async source => {
  214 |     const hash = async (bytes: number[] | Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
  215 |     if (await hash(source.manifestBytes) !== source.root.currentManifest) throw new Error('Lock snapshot manifest hash mismatch');
  216 |     const refs = source.manifest.constraints.lockRefs;
  217 |     const records = await new Promise<{ bx: number; by: number; hash: string; bytes: Uint8Array }[]>((resolve, reject) => {
  218 |       const open = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
  219 |       open.onupgradeneeded = () => open.transaction!.abort(); open.onerror = () => reject(open.error);
  220 |       open.onsuccess = () => {
  221 |         const db = open.result, tx = db.transaction('blocks', 'readonly'), records: { bx: number; by: number; hash: string; bytes: Uint8Array }[] = [];
  222 |         for (const ref of refs) { const read = tx.objectStore('blocks').get(ref.hash); read.onsuccess = () => { if (!(read.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: read.result.bytes }); }; }
  223 |         tx.oncomplete = () => { db.close(); resolve(records); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing lock record')); };
  224 |       };
  225 |     });
  226 |     const flags: { cellId: number; flags: number }[] = [], seen = new Set<number>();
  227 |     for (const r of records) {
  228 |       const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  229 |       if (await hash(b) !== r.hash || b.length !== 1040 || [76, 71, 65, 76].some((x, i) => b[i] !== x) || v.getUint16(4, true) !== 1 || v.getUint16(6, true) !== r.bx || v.getUint16(8, true) !== r.by || v.getUint16(10, true) !== 1024 || v.getUint32(12, true) || !b.slice(16).some(Boolean)) throw new Error('Invalid actual LGAL lock bytes');
  230 |       for (let slot = 0; slot < 1024; slot++) {
  231 |         const value = b[16 + slot]; if (value > 3) throw new Error('Unknown lock bit');
  232 |         if (!value) continue;
  233 |         const cellId = (r.by * 32 + Math.floor(slot / 32)) * source.manifest.spec.columns + r.bx * 32 + slot % 32;
  234 |         if (seen.has(cellId)) throw new Error('Duplicate lock cell'); seen.add(cellId); flags.push({ cellId, flags: value });
  235 |       }
  236 |     }
  237 |     return flags.sort((a, b) => a.cellId - b.cellId);
  238 |   }, snapshot);
  239 |   return { snapshot, flags };
  240 | }
  241 | const sortedLocks = (locks: Lock[]) => [...locks].sort((a, b) => a.cellId - b.cellId);
  242 | async function changeLock(p: Page, id: string, region: Field['regions'][number], mask: number, action: 'set' | 'clear', before: SavedSnapshot, expected: Lock[]) {
  243 |   await panel(p, '编辑'); await p.getByLabel('定位地块编号', { exact: true }).fill(String(region.cellId)); await click(p, '定位'); await click(p, '保护区域');
  244 |   const details = p.locator('details').filter({ has: p.getByText('精确调整保护范围', { exact: true }) });
  245 |   if (!await details.evaluate(e => (e as HTMLDetailsElement).open)) await p.getByText('精确调整保护范围', { exact: true }).click();
  246 |   await p.getByLabel('保护选区起始列', { exact: true }).fill(String(region.column)); await p.getByLabel('保护选区起始行', { exact: true }).fill(String(region.row));
  247 |   await p.getByLabel('保护选区宽度', { exact: true }).fill('1'); await p.getByLabel('保护选区高度', { exact: true }).fill('1');
  248 |   await p.getByLabel('区域锁保护内容', { exact: true }).selectOption(String(mask)); await p.getByLabel('区域锁操作', { exact: true }).selectOption(action);
  249 |   await click(p, '预览区域锁修改'); await expect(p.getByRole('region', { name: '区域锁修改预览' })).toBeVisible({ timeout: 120000 }); await ready(p);
  250 |   expect(Number((await p.getByTestId('region-protection-changed-cells').innerText()).replaceAll(',', ''))).toBe(1);
  251 |   expect(await saved(p, id, 4)).toEqual(before);
  252 |   await click(p, '确认区域锁并保存'); await ready(p);
  253 |   const state = await lockState(p, id);
  254 |   expect(state.snapshot.root).toMatchObject({ revision: before.root.revision + 1, backupManifest: before.root.currentManifest });
  255 |   expect(state.flags).toEqual(sortedLocks(expected)); geographyUnchanged(before, state.snapshot);
  256 |   return state.snapshot;
  257 | }
  258 | 
  259 | test('[detail-v4-lock-relief] native nonzero coast/elevation/both locks, allowed relief, single-bit clear, mixed undo and reload', async ({ page }, info) => {
  260 |   // One natural generation and one local preview, no reload/retry loops. This
  261 |   // remains a workflow check under the existing deadline, not a performance gate.
  262 |   test.setTimeout(450000);
  263 |   const began = Date.now(), response = await page.request.get('/build.json'); expect(response.ok()).toBe(true);
  264 |   const build = await response.json() as { version: string; naturalDetailGenerator: { sha256: string }; localDetailReliefGenerator: { sha256: string } };
  265 |   expect(build.localDetailReliefGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  266 |   const errors: string[] = [], touch = info.project.name !== 'desktop-chromium';
  267 |   page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  268 |   await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  269 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('区域保护 · 真实锁与山地'); await page.getByLabel('大世界生成种子', { exact: true }).fill('fine-local-relief-native');
  270 |   await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256'); await click(page, '新建空白海洋草稿'); await ready(page);
  271 |   const id = (await studio(page).getAttribute('data-atlas-id'))!;
  272 |   await panel(page, '创世'); await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  273 |   await page.getByLabel('地貌种子', { exact: true }).fill('fine-local-relief-native'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  274 |   await click(page, '画大陆'); await click(page, '全图'); await frameReady(page); await gesture(page, await screen(page, [...contour, contour[0]]), touch);
  275 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page); await click(page, '确认生成并保存'); await ready(page);
  276 |   const first = await saved(page, id, 4), firstField = await durableField(page, id);
  277 |   expect(first.root.revision).toBe(1); expect(first.manifest.generation.lastApplied?.recipe.generator).toEqual({ id: 'shape-detail-landmass', version: 2, fingerprint: build.naturalDetailGenerator.sha256 });
  278 |   expect(firstField.fine.some(t => t.coverageIdentity !== 'land' && t.coverageIdentity !== 'sea'), 'The real continent must contain nonuniform coastal coverage').toBe(true);
  279 |   expect((await lockState(page, id)).flags).toEqual([]);
  280 |   const selection = await pickLand(page, firstField.probe, touch), [coast, elevation, both] = firstField.regions;
  281 |   const localSeed = 'local-relief-native-nonzero-locks';
  282 |   await page.getByLabel('局部山地种子', { exact: true }).fill(localSeed); await page.getByLabel('局部山地起伏', { exact: true }).fill('3600');
  283 |   await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  284 |   const allLocks = firstField.regions.map(r => ({ cellId: r.cellId, flags: r.mask }));
  285 |   await info.attach('detail-lock-relief-input.json', { contentType: 'application/json', body: JSON.stringify({ actualBuild: build, first: first.root, selection, regions: firstField.regions, localSeed, reliefMeters: 3600, localScope: '16x16, default transition2', timeoutMs: 450000 }, null, 2) });
  286 |   const lockedCoast = await changeLock(page, id, coast, 1, 'set', first, allLocks.slice(0, 1));
  287 |   const lockedElevation = await changeLock(page, id, elevation, 2, 'set', lockedCoast, allLocks.slice(0, 2));
  288 |   const locked = await changeLock(page, id, both, 3, 'set', lockedElevation, allLocks);
  289 |   const lockedField = await durableField(page, id);
  290 |   expect(lockedField.coarse).toEqual(firstField.coarse); expect(lockedField.fine).toEqual(firstField.fine); expect(lockedField.regions).toEqual(firstField.regions);
  291 |   await click(page, '返回地貌创作'); await expect(page.getByLabel('局部山地种子', { exact: true })).toHaveValue(localSeed);
  292 |   await expect(page.getByLabel('局部山地起伏', { exact: true })).toHaveValue('3600'); await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  293 |   await click(page, '预览山地变化'); await expect(preview(page)).toBeVisible({ timeout: 120000 }); await ready(page);
  294 |   const changedNodes = Number((await page.getByTestId('local-relief-changed-nodes').innerText()).replaceAll(',', '')); expect(changedNodes).toBeGreaterThan(0);
  295 |   expect(await saved(page, id, 4)).toEqual(locked); const candidate = await audit(page);
  296 |   await click(page, '确认生成并保存'); await ready(page);
  297 |   const edited = await saved(page, id, 4), editedField = await durableField(page, id);
  298 |   expect(edited.root).toMatchObject({ revision: 5, currentManifest: candidate.display.manifestDigest, backupManifest: locked.root.currentManifest });
  299 |   expect(edited.manifest.generation.lastApplied?.recipe).toMatchObject({ generator: { id: 'local-detail-relief', version: 1, fingerprint: build.localDetailReliefGenerator.sha256 }, seed: localSeed, parameters: { reliefMeters: 3600 } });
  300 |   expect((await lockState(page, id)).flags).toEqual(sortedLocks(allLocks)); protectedDataEqual(lockedField, editedField);
  301 |   const changedTiles = changedStoredHeightTiles(lockedField, editedField); expect(changedTiles.length).toBeGreaterThan(0);
  302 |   // Raw all-node footprint comparison is stronger than an unchanged tile hash:
  303 |   // allowed and protected nodes can share a west/north-owned fine tile.
> 304 |   expect(editedField.regions.map(r => ({ cellId: r.cellId, mask: r.mask }))).toEqual(lockedField.regions.map(r => ({ cellId: r.cellId, mask: r.mask })));
      |                                                                              ^ Error: expect(received).toEqual(expected) // deep equality
  305 |   for (let i = 0; i < 3; i++) expect(editedField.regions[i].nodes.map(n => ({ x: n.x, y: n.y, coverage: n.coverage }))).toEqual(lockedField.regions[i].nodes.map(n => ({ x: n.x, y: n.y, coverage: n.coverage })));
  306 |   expect(editedField.regions[1].nodes).toEqual(lockedField.regions[1].nodes); expect(editedField.regions[2].nodes).toEqual(lockedField.regions[2].nodes);
  307 |   const changedCoastNodes = editedField.regions[0].nodes.filter((node, i) => node.height !== lockedField.regions[0].nodes[i].height);
  308 |   expect(changedCoastNodes.length, 'A real coast-only lock must not freeze its allowed land heights').toBeGreaterThan(0);
  309 |   await panel(page, '地图'); await frameReady(page); await page.screenshot({ path: info.outputPath('locked-local-relief.png'), fullPage: true });
  310 | 
  311 |   const cleared = await changeLock(page, id, both, 1, 'clear', edited, allLocks.map(l => l.cellId === both.cellId ? { ...l, flags: 2 } : l));
  312 |   expect(cleared.root.revision).toBe(6);
  313 |   await click(page, '撤销大世界编辑'); await ready(page); const undoClear = await lockState(page, id);
  314 |   expect(undoClear.snapshot.root).toMatchObject({ revision: 7, backupManifest: cleared.root.currentManifest }); expect(undoClear.flags).toEqual(sortedLocks(allLocks));
  315 |   expect(undoClear.snapshot.manifest.constraints).toEqual(edited.manifest.constraints); geographyUnchanged(edited, undoClear.snapshot);
  316 |   await click(page, '撤销大世界编辑'); await ready(page); const undoRelief = await lockState(page, id);
  317 |   expect(undoRelief.snapshot.root).toMatchObject({ revision: 8, backupManifest: undoClear.snapshot.root.currentManifest }); expect(undoRelief.flags).toEqual(sortedLocks(allLocks));
  318 |   geographyUnchanged(locked, undoRelief.snapshot); expect(await durableField(page, id)).toEqual(lockedField);
  319 |   await click(page, '撤销大世界编辑'); await ready(page); const undoBoth = await lockState(page, id);
  320 |   expect(undoBoth.snapshot.root).toMatchObject({ revision: 9, backupManifest: undoRelief.snapshot.root.currentManifest }); expect(undoBoth.flags).toEqual(sortedLocks(allLocks.slice(0, 2)));
  321 |   geographyUnchanged(lockedElevation, undoBoth.snapshot); expect(undoBoth.snapshot.manifest.constraints).toEqual(lockedElevation.manifest.constraints);
  322 |   await page.reload(); await ready(page);
  323 |   const restored = await lockState(page, id); expect(restored).toEqual(undoBoth);
  324 |   const restoredField = await durableField(page, id);
  325 |   expect(restoredField.coarse).toEqual(firstField.coarse); expect(restoredField.fine).toEqual(firstField.fine); expect(restoredField.regions).toEqual(firstField.regions); expect(restoredField.coverageHash).toBe(firstField.coverageHash);
  326 |   expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 4, revision: 9, manifestDigest: restored.snapshot.root.currentManifest });
  327 |   await panel(page, '地图'); await click(page, '全图'); await frameReady(page); await page.screenshot({ path: info.outputPath('locks-mixed-undo-restored.png'), fullPage: true });
  328 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  329 |   await info.attach('detail-lock-relief-observation.json', { contentType: 'application/json', body: JSON.stringify({
  330 |     project: info.project.name, elapsedMs: Date.now() - began, input: touch ? 'native CDP touch and touchscreen tap + visible UI controls' : 'native mouse + visible UI controls', actualBuild: build,
  331 |     selection, lockedRegions: firstField.regions, allLocks: sortedLocks(allLocks), first: first.root, locked: locked.root, edited: edited.root, singleBitClear: cleared.root,
  332 |     undoClear: undoClear.snapshot.root, undoRelief: undoRelief.snapshot.root, undoBoth: undoBoth.snapshot.root, restored: restored.snapshot.root,
  333 |     coarseBlockCount: firstField.coarse.length, coverageHash: firstField.coverageHash, changedNodesInPreview: changedNodes, changedStoredHeightTiles: changedTiles, changedCoastNodes,
  334 |     scope: 'Actual nonzero 1/2/3 LGAL locks from UI; exact coarse/fine coverage identities; all stored source nodes touching three real coarse quads; allowed coast-only heights change, height/both locked footprints freeze; clear bit1 retains bit2; mixed undo and one reload. The selected cells are interior land, not a claim that this example edits a shoreline. Emulated devices only. No dense-lock performance, cancellation, hardware, natural visual or PH acceptance.'
  335 |   }, null, 2) });
  336 | });
  337 | 
```