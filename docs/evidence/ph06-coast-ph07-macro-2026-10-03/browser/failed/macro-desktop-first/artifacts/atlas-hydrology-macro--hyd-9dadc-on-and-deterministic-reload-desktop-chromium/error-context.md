# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-hydrology-macro.spec.ts >> [hydrology-macro-v4] native continent, complete saved grid, branch tap, active cancellation and deterministic reload
- Location: tests\atlas-hydrology-macro.spec.ts:124:1

# Error details

```
Test timeout of 450000ms exceeded.
```

```
Error: locator.click: Test timeout of 450000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '取消操作', exact: true }).visible()
    - locator resolved to <button>取消操作</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
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
        - generic [ref=e24]: 20%
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
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { createHash } from 'node:crypto';
  3   | import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
  4   | import { savedMacroTerrain, observeMacroProgress } from './helpers/atlas-hydrology-macro-readonly';
  5   | import type { AtlasRenderer } from '../src/world/renderer';
  6   | import type { HydrologyMacroPreview } from '../src/world/hydrology-macro-contract';
  7   | 
  8   | test.describe.configure({ retries: 0 });
  9   | const studio = (p: Page) => p.getByTestId('atlas-studio');
  10  | const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
  11  | const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  12  | type XY = { x: number; y: number };
  13  | // Same native 128-world fixture as the established fine hydrology acceptance.
  14  | const contour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ x, y }));
  15  | const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  16  | const world = (id: number): XY => ({ x: id % 257 * 16, y: Math.floor(id / 257) * 16 });
> 17  | async function press(p: Page, name: string, touch: boolean) { if (touch) await button(p, name).tap(); else await button(p, name).click(); }
      |                                                                                                                                  ^ Error: locator.click: Test timeout of 450000ms exceeded.
  18  | async function section(p: Page, name: '地图' | '创世' | '编辑' | '水文', touch: boolean) {
  19  |   const control = p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true });
  20  |   if (touch) await control.tap(); else await control.click();
  21  | }
  22  | async function frameReady(p: Page) {
  23  |   await expect.poll(async () => { const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>; return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready'; }, { timeout: 120000 }).toBe(true);
  24  | }
  25  | async function screen(p: Page, points: XY[]) {
  26  |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, frame = await metrics(p);
  27  |   return points.map(q => ({ x: box.x + frame.camera.x + q.x * frame.camera.scale, y: box.y + frame.camera.y + q.y * frame.camera.scale }));
  28  | }
  29  | async function nativeGesture(p: Page, points: XY[], touch: boolean) {
  30  |   expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
  31  |   if (touch) {
  32  |     const cdp = await p.context().newCDPSession(p);
  33  |     try {
  34  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
  35  |       for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
  36  |       await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  37  |     } finally { await cdp.detach(); }
  38  |   } else {
  39  |     await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
  40  |     try { for (const point of points.slice(1)) await p.mouse.move(point.x, point.y); } finally { await p.mouse.up(); }
  41  |   }
  42  | }
  43  | async function displayedMacro(p: Page): Promise<HydrologyMacroPreview | null> {
  44  |   const result = await audit(p) as Awaited<ReturnType<typeof audit>> & { macroHydrology: HydrologyMacroPreview | null };
  45  |   expect(Object.hasOwn(result, 'macroHydrology')).toBe(true); return result.macroHydrology;
  46  | }
  47  | function verifySavedEdges(preview: HydrologyMacroPreview, terrain: Awaited<ReturnType<typeof savedMacroTerrain>>) {
  48  |   expect(preview.grid).toEqual({ columns: 257, rows: 257, stepWorld: 16, worldSize: 4096, coverage: 'complete-fixed-grid', sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' });
  49  |   expect(preview.stats.sampledNodes).toBe(66049);
  50  |   expect(preview.stats.landNodes).toBe(terrain.completeGrid.landNodes); expect(preview.stats.sampledSeaNodes).toBe(terrain.completeGrid.sampledSeaNodes);
  51  |   expect(preview.stats.landNodes + preview.stats.sampledSeaNodes).toBe(66049);
  52  |   expect(preview.branches.length).toBeGreaterThanOrEqual(2); expect(preview.branches.length).toBeLessThanOrEqual(64);
  53  |   expect(preview.edges.from.length).toBeGreaterThan(1); expect(preview.edges.from.length).toBeLessThanOrEqual(8192);
  54  |   expect(preview.stats.displayedBranches).toBe(preview.branches.length); expect(preview.stats.displayedEdges).toBe(preview.edges.from.length);
  55  |   const actual = new Map(terrain.displayed.map(sample => [sample.id, sample]));
  56  |   expect(actual.size).toBe(preview.nodes.ids.length);
  57  |   for (let i = 0; i < preview.nodes.ids.length; i++) {
  58  |     const sample = actual.get(preview.nodes.ids[i])!;
  59  |     expect(sample.height, 'Every displayed land or sea endpoint must come from an actual persisted fine owner').not.toBeNull();
  60  |     expect(sample.coverage).toBe(preview.nodes.coverageQ[i]); expect(sample.height).toBe(preview.nodes.groundMeters[i]);
  61  |   }
  62  |   const receivers = new Map<number, number>(); let sampledSeaEdges = 0;
  63  |   expect(preview.edges.to.length).toBe(preview.edges.from.length);
  64  |   for (let i = 0; i < preview.edges.from.length; i++) {
  65  |     const from = actual.get(preview.edges.from[i])!, to = actual.get(preview.edges.to[i])!;
  66  |     expect(from).toBeDefined(); expect(to).toBeDefined(); expect(from.coverage).toBeGreaterThanOrEqual(0);
  67  |     expect(Math.abs(from.column - to.column) + Math.abs(from.row - to.row)).toBe(8);
  68  |     expect(to.height!, 'Sea terminal edges receive the same non-uphill check as land edges').toBeLessThanOrEqual(from.height!);
  69  |     expect(receivers.has(from.id), 'One actual receiver per displayed node').toBe(false); receivers.set(from.id, to.id);
  70  |     if (to.coverage < 0) sampledSeaEdges++;
  71  |   }
  72  |   for (const branch of preview.branches) {
  73  |     const visited = new Set<number>(); let at = branch.sourceNode;
  74  |     while (receivers.has(at)) { expect(visited.has(at), 'Displayed flow is acyclic').toBe(false); visited.add(at); at = receivers.get(at)!; }
  75  |     const end = actual.get(branch.endNode)!; expect(end).toBeDefined();
  76  |     if (branch.stop === 'sampled-sea') expect(end.coverage).toBeLessThan(0);
  77  |   }
  78  |   return { checkedEdges: receivers.size, sampledSeaEdges, checkedNodes: actual.size };
  79  | }
  80  | 
  81  | async function nativePickBranch(p: Page, preview: HydrologyMacroPreview, touch: boolean) {
  82  |   // Real pan and zoom preserve the result. The geographic locator would clear
  83  |   // it, so this test does not use that separate editing workflow.
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
```