# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-add-detail-coast.spec.ts >> [detail-v4-add] two native contours, protected first coast, same-session undo, reload and overlap rejection
- Location: tests\atlas-add-detail-coast.spec.ts:189:1

# Error details

```
Error: Test timeout of 450000ms exceeded
```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - main [ref=f1e3]:
    - generic [ref=f1e4]:
      - generic [ref=f1e5]:
        - heading "两片山海 · 原生追加" [level=1] [ref=f1e6]
        - generic [ref=f1e7]: 地理创作
      - button "撤销大世界编辑" [disabled] [ref=f1e8]:
        - generic [ref=f1e11]: 撤销
      - button "返回原世界工坊" [ref=f1e12] [cursor=pointer]:
        - generic [ref=f1e15]: 工坊
    - generic [ref=f1e16]:
      - generic "大世界草稿地图，拖动平移，双指或滚轮缩放，点选地块" [ref=f1e18]
      - generic [ref=f1e19]:
        - button "放大大世界地图" [active] [ref=f1e20] [cursor=pointer]: ＋
        - button "缩小大世界地图" [ref=f1e21] [cursor=pointer]: −
        - button "全图" [ref=f1e22] [cursor=pointer]
        - generic [ref=f1e23]: 203%
      - toolbar "地图创作工具" [ref=f1e24]:
        - button "浏览地图" [pressed] [ref=f1e25] [cursor=pointer]:
          - generic [ref=f1e29]: 浏览
        - button "画大陆" [ref=f1e30] [cursor=pointer]
        - button "显示地块网格" [ref=f1e34] [cursor=pointer]:
          - generic [ref=f1e38]: 网格
      - generic "草稿操作反馈" [ref=f1e40]:
        - status [ref=f1e41]:
          - generic [ref=f1e42]: 草稿已保存 · 修订 4
    - navigation "大世界草稿工具" [ref=f1e43]:
      - button "地图" [pressed] [ref=f1e44] [cursor=pointer]
      - button "创世" [ref=f1e49] [cursor=pointer]
      - button "编辑" [ref=f1e54] [cursor=pointer]
      - button "草稿" [ref=f1e58] [cursor=pointer]
  - button "select to enable accessibility for this content" [ref=f1e63] [cursor=pointer]
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
> 21  |   }, { timeout: 120000 }).toBe(true);
      |                           ^ Error: Test timeout of 450000ms exceeded
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
  49  |     await expect(p.getByRole('alert')).toContainText(/新大陆.*(?:接触|重叠)|新旧海岸距离带过近/, { timeout: 120000 });
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
```