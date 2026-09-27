# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-add-detail-coast.spec.ts >> [detail-v4-add] two native contours, protected first coast, same-session undo, reload and overlap rejection
- Location: tests\atlas-add-detail-coast.spec.ts:189:1

# Error details

```
Test timeout of 450000ms exceeded.
```

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert')
Expected pattern: /新大陆.*(?:接触|重叠)|新旧海岸距离带过近/
Error: element(s) not found

Call log:
  - Expect "toContainText" getByRole('alert') with timeout 120000ms
  - waiting for getByRole('alert')
  - Test timeout of 450000ms exceeded.

```

```yaml
- main:
  - heading "两片山海 · 原生追加" [level=1]
  - text: 地理创作
  - button "撤销大世界编辑" [disabled]
  - button "返回原世界工坊" [disabled]
  - button "放大大世界地图" [disabled]: ＋
  - button "缩小大世界地图" [disabled]: −
  - button "全图" [disabled]
  - text: 9%
  - toolbar "地图创作工具":
    - button "浏览地图" [disabled] [pressed]: 浏览
    - button "画大陆" [disabled]
    - button "显示地块网格" [disabled]: 网格
  - region "大陆与地貌":
    - heading "大陆与地貌" [level=2]
    - paragraph: 独立保存，不覆盖原世界
    - button "展开阅读"
    - button "关闭大世界面板"
    - text: 你的山海，从一笔开始
    - button "再画一片大陆 在海面继续绘制，保留已有山河" [disabled]:
      - strong: 再画一片大陆
      - text: 在海面继续绘制，保留已有山河
    - group:
      - text: 地貌种子
      - textbox "地貌种子" [disabled]: fine-native-additive
      - text: 海岸曲折
      - slider "手绘海岸曲折" [disabled]: "32"
      - text: 湾岬变化 · 32 近海宽度
      - slider "手绘近海宽度" [disabled]: "128"
      - text: 128 世界单位 内陆起伏（米）
      - spinbutton "内陆起伏" [disabled]: "2400"
      - text: 近岸岛链
      - combobox "近岸岛链" [disabled]:
        - option "不添加" [disabled] [selected]
        - option "少量 · 1 条" [disabled]
        - option "分散 · 2 条" [disabled]
        - option "丰富 · 3 条" [disabled]
      - paragraph: 单指或鼠标画出闭合轮廓，松开后预览；双指可以调整视野。过窄或交叉的轮廓会提示修改。请与已有陆地留出海面间隔；接触、重叠或进入保护区时会提示调整，不覆盖旧大陆。
      - button "重新预览手绘大陆" [disabled]
    - status:
      - text: 追加大陆：new-component:write-continuous-heights · 56320/272384
      - button "取消操作"
  - navigation "大世界草稿工具":
    - button "地图"
    - button "创世" [pressed]
    - button "编辑"
    - button "草稿"
- button "select to enable accessibility for this content"
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
  3   | import type { AtlasRenderer } from '../src/world/renderer';
  4   | 
  5   | // Staged for tests/atlas-add-detail-coast.spec.ts. Imports intentionally target
  6   | // that final location. No app generator/geometry code runs in this observer.
  7   | const studio = (p: Page) => p.getByTestId('atlas-studio');
  8   | const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
  9   | const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
  10  | const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
  11  | const preview = (p: Page) => p.getByRole('region', { name: '大陆生成预览' });
  12  | type XY = { x: number; y: number };
  13  | type Probe = XY & { cellId: number; minimumHeight: number; maximumHeight: number };
  14  | const firstContour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ x, y }));
  15  | const secondContour = firstContour.map(p => ({ x: p.x + 1850, y: p.y }));
  16  | 
  17  | async function frameReady(p: Page) {
  18  |   await expect.poll(async () => {
  19  |     const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>;
  20  |     return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready';
  21  |   }, { timeout: 120000 }).toBe(true);
  22  | }
  23  | async function screen(p: Page, points: XY[]) {
  24  |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  25  |   return points.map(q => ({ x: box.x + frame.camera.x + q.x * frame.camera.scale, y: box.y + frame.camera.y + q.y * frame.camera.scale }));
  26  | }
  27  | async function assertCanvasPoints(p: Page, points: XY[]) {
  28  |   expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
  29  | }
  30  | async function gesture(p: Page, points: XY[], touch: boolean) {
  31  |   await assertCanvasPoints(p, points);
  32  |   if (touch) {
  33  |     const cdp = await p.context().newCDPSession(p);
  34  |     try {
  35  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
  36  |       for (const q of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 1 }] });
  37  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  38  |     } finally { await cdp.detach(); }
  39  |   } else {
  40  |     await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
  41  |     try { for (const q of points.slice(1)) await p.mouse.move(q.x, q.y); } finally { await p.mouse.up(); }
  42  |   }
  43  | }
  44  | async function draw(p: Page, points: XY[], touch: boolean, rejected = false) {
  45  |   await click(p, '画大陆'); await click(p, '全图'); await frameReady(p);
  46  |   await expect(studio(p)).toHaveAttribute('data-atlas-tool', 'outline');
  47  |   await gesture(p, await screen(p, [...points, points[0]]), touch);
  48  |   if (rejected) {
> 49  |     await expect(p.getByRole('alert')).toContainText(/新大陆.*(?:接触|重叠)|新旧海岸距离带过近/, { timeout: 120000 });
      |                                        ^ Error: expect(locator).toContainText(expected) failed
  50  |     await expect(preview(p)).toHaveCount(0);
  51  |     await expect(studio(p)).toHaveAttribute('data-atlas-display', 'committed');
  52  |   } else {
  53  |     await expect(preview(p)).toBeVisible({ timeout: 120000 });
  54  |     await expect(studio(p)).toHaveAttribute('data-atlas-display', 'generation-preview');
  55  |   }
  56  |   await ready(p);
  57  | }
  58  | 
  59  | /** Read-only, independent durable observer. LGDC bytes and hashes prove the
  60  |  * stored coverage/height field; LGAB heights protect implicit Hbase on the old
  61  |  * continent. We do not infer exact SDF union or visual quality from this check. */
  62  | async function durableField(p: Page, id: string) {
  63  |   return p.evaluate(async id => {
  64  |     type Ref = { bx: number; by: number; hash: string };
  65  |     type Manifest = { version: number; spec: { columns: number; rows: number }; blockRefs: { key: string; hash: string }[]; detailCoast: { refs: Ref[] } };
  66  |     type Row = { key?: string; bx?: number; by?: number; hash: string; bytes: Uint8Array };
  67  |     const rows = await new Promise<{ manifest: Manifest; records: Row[] }>((resolve, reject) => {
  68  |       const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
  69  |       request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
  70  |       request.onsuccess = () => {
  71  |         const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
  72  |         let manifest: Manifest; const records: Row[] = [];
  73  |         const root = tx.objectStore('roots').get(id);
  74  |         root.onsuccess = () => {
  75  |           if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
  76  |           const read = tx.objectStore('manifests').get(JSON.parse(new TextDecoder().decode(root.result)).currentManifest);
  77  |           read.onsuccess = () => {
  78  |             if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
  79  |             manifest = JSON.parse(new TextDecoder().decode(read.result.bytes));
  80  |             if (manifest.version !== 4 || !manifest.detailCoast) { tx.abort(); return; }
  81  |             for (const ref of [...manifest.detailCoast.refs, ...manifest.blockRefs.filter(ref => ref.key.startsWith('elevation:'))]) {
  82  |               const block = tx.objectStore('blocks').get(ref.hash);
  83  |               block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
  84  |             }
  85  |           };
  86  |         };
  87  |         tx.oncomplete = () => { db.close(); resolve({ manifest, records }); };
  88  |         tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual v4 source')); };
  89  |       };
  90  |     });
  91  |     const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
  92  |     const tiles = new Map<string, { mode: number; coverage: number[]; heights: number[] }>();
  93  |     const coarse = new Int32Array(rows.manifest.spec.columns ** 2), seen = new Uint8Array(coarse.length);
  94  |     let sampledTiles = 0, landTiles = 0;
  95  |     for (const r of rows.records) {
  96  |       if (await digest(r.bytes) !== r.hash) throw new Error('Stored content hash mismatch');
  97  |       const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  98  |       if (r.key) {
  99  |         const [layer, rawX, rawY] = r.key.split(':'), bx = Number(rawX), by = Number(rawY);
  100 |         if (layer !== 'elevation' || b.length !== 28 + 1024 * 4 || [76, 71, 65, 66].some((value, index) => b[index] !== value)
  101 |           || v.getUint16(4, true) !== 1 || b[6] !== 1 || b[7] !== 1 || v.getUint16(8, true) !== bx || v.getUint16(10, true) !== by
  102 |           || v.getUint32(12, true) !== 0 || b[16] !== 2 || b.slice(17, 20).some(Boolean) || v.getUint32(20, true) !== 1024 || v.getUint32(24, true) !== 4096) throw new Error('Malformed coarse height block');
  103 |         for (let i = 0; i < 1024; i++) {
  104 |           const cell = (by * 32 + Math.floor(i / 32)) * rows.manifest.spec.columns + bx * 32 + i % 32, h = v.getInt32(28 + i * 4, true);
  105 |           if (seen[cell] || h < -12000 || h > 12000) throw new Error('Invalid coarse height identity/value');
  106 |           seen[cell] = 1; coarse[cell] = h;
  107 |         }
  108 |       } else {
  109 |         const bx = r.bx!, by = r.by!, n = v.getUint16(8, true), expected = (bx === 0 ? 33 : 32) * (by === 0 ? 33 : 32);
  110 |         if ([76, 71, 68, 67, 1].some((x, i) => b[i] !== x) || b[6] !== bx || b[7] !== by || b.slice(10, 16).some(Boolean)
  111 |           || b[5] > 1 || b.length !== 16 + n * 4 || n !== (b[5] ? expected : 0) || tiles.has(`${bx}:${by}`)) throw new Error('Malformed fine owner block');
  112 |         const coverage: number[] = [], heights: number[] = [];
  113 |         for (let i = 0; i < n; i++) {
  114 |           const c = v.getInt16(16 + i * 2, true), h = v.getInt16(16 + n * 2 + i * 2, true);
  115 |           if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h >= 0 || c === 0 && h !== 0) throw new Error('Stored coast height/sign mismatch');
  116 |           coverage.push(c); heights.push(h);
  117 |         }
  118 |         tiles.set(`${bx}:${by}`, { mode: b[5], coverage, heights }); if (b[5]) sampledTiles++; else landTiles++;
  119 |       }
  120 |     }
  121 |     if (seen.some(v => v !== 1)) throw new Error('Missing coarse height samples');
  122 |     const sample = (x: number, y: number) => {
  123 |       const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
  124 |       if (!tile?.mode) return null; // Probes use four actually stored samples, never a guessed Hbase.
  125 |       const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
  126 |       return { coverage: tile.coverage[slot], height: tile.heights[slot] };
  127 |     };
  128 |     type Point = { x: number; y: number; cellId: number; minimumHeight: number; maximumHeight: number };
  129 |     const groups = new Map<number, { land?: Point; sea?: Point }>(), step = 4096 / rows.manifest.spec.columns;
  130 |     for (const [key, tile] of tiles) if (tile.mode) {
  131 |       const [bx, by] = key.split(':').map(Number); if (bx * 64 >= 1800) continue;
  132 |       for (let y = by * 32; y < by * 32 + 32; y++) for (let x = bx * 32; x < bx * 32 + 32; x++) {
  133 |         const raw = [sample(x, y), sample(x + 1, y), sample(x + 1, y + 1), sample(x, y + 1)];
  134 |         if (raw.some(v => v === null)) continue;
  135 |         const values = raw.map(v => v!), land = values.every(v => v.coverage > 256), sea = values.every(v => v.coverage < -256);
  136 |         if (!land && !sea) continue;
  137 |         const cellId = Math.floor((y * 2 + 1) / step) * rows.manifest.spec.columns + Math.floor((x * 2 + 1) / step);
  138 |         const point = { x: x * 2 + 1, y: y * 2 + 1, cellId, minimumHeight: Math.min(...values.map(v => v.height)), maximumHeight: Math.max(...values.map(v => v.height)) };
  139 |         const group = groups.get(cellId) ?? {}; if (land) group.land ??= point; else group.sea ??= point; groups.set(cellId, group);
  140 |       }
  141 |     }
  142 |     const pair = [...groups.entries()].sort(([a], [b]) => a - b).find(([, group]) => group.land && group.sea);
  143 |     if (!pair) throw new Error('First coastline lacks two independently stored probes in one coarse cell');
  144 |     // First contour (including roughness/islands) is left of 1800. This region
  145 |     // extends beyond its 2.5-step compact Hbase support. The second is >2400.
  146 |     const leftColumns = Math.floor(1900 / step), protectedHeights: number[] = [];
  147 |     for (let y = 0; y < rows.manifest.spec.rows; y++) for (let x = 0; x < leftColumns; x++) protectedHeights.push(coarse[y * rows.manifest.spec.columns + x]);
  148 |     return { refs: rows.manifest.detailCoast.refs, sampledTiles, landTiles,
  149 |       geometryRefs: rows.manifest.blockRefs.filter(r => r.key.startsWith('geometry:')),
```