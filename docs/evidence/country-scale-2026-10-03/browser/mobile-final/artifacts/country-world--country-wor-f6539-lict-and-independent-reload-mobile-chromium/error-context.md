# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: country-world.spec.ts >> [country-world] native nations, two cities, capital, cancellation, conflict and independent reload
- Location: tests\country-world.spec.ts:43:1

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  getByRole('button', { name: '确认并保存', exact: true }).visible()
Expected: enabled
Received: disabled
Timeout:  5000ms

Call log:
  - Expect "toBeEnabled" getByRole('button', { name: '确认并保存', exact: true }).visible() with timeout 5000ms
  - waiting for getByRole('button', { name: '确认并保存', exact: true }).visible()
    13 × locator resolved to <button disabled class="country-primary">确认并保存</button>
       - unexpected value "disabled"

```

```yaml
- button "确认并保存" [disabled]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { createHash } from 'node:crypto';
  3   | import { metrics, saved } from './helpers/atlas-shape-readonly';
  4   | import { persistedCountry as persisted } from './helpers/country-readonly';
  5   | 
  6   | test.describe.configure({ retries: 0 });
  7   | const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
  8   | const country = (p: Page) => p.getByTestId('country-studio');
  9   | const ready = (p: Page) => expect(country(p)).toHaveAttribute('data-country-state', 'ready', { timeout: 120000 });
  10  | async function press(p: Page, name: string, touch: boolean) { if (touch) await button(p, name).tap(); else await button(p, name).click(); }
  11  | async function tab(p: Page, name: string, touch: boolean) {
  12  |   const target = p.getByRole('navigation', { name: '建国世界工具' }).getByRole('button', { name, exact: true });
  13  |   if (touch) await target.tap(); else await target.click();
  14  | }
  15  | type Point = { x: number; y: number };
  16  | async function screen(p: Page, point: Point) {
  17  |   const box = (await p.getByTestId('atlas-canvas').boundingBox())!, view = await metrics(p);
  18  |   return { x: box.x + view.camera.x + point.x * view.camera.scale, y: box.y + view.camera.y + point.y * view.camera.scale };
  19  | }
  20  | async function pick(p: Page, point: Point, touch: boolean) {
  21  |   const q = await screen(p, point);
  22  |   expect(await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), q)).toBe('atlas-canvas');
  23  |   if (touch) await p.touchscreen.tap(q.x, q.y); else await p.mouse.click(q.x, q.y);
  24  | }
  25  | async function draw(p: Page, touch: boolean, contour = [[650,1300],[950,1120],[1200,1260],[1440,1590],[1310,1850],[1010,1980],[760,1790],[580,1580],[650,1300]]) {
  26  |   const points = await Promise.all(contour.map(([x,y])=>screen(p,{x,y})));
  27  |   expect(await p.evaluate(ps=>ps.every(q=>document.elementFromPoint(q.x,q.y)?.getAttribute('data-testid')==='atlas-canvas'),points)).toBe(true);
  28  |   if (touch) {
  29  |     const cdp = await p.context().newCDPSession(p);
  30  |     try { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
  31  |       for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
  32  |       await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  33  |     } finally { await cdp.detach(); }
  34  |   } else { await p.mouse.move(points[0].x,points[0].y); await p.mouse.down(); try { for(const point of points.slice(1)) await p.mouse.move(point.x,point.y); } finally { await p.mouse.up(); } }
  35  | }
  36  | async function confirm(p: Page,touch:boolean) { await expect(p.getByRole('region',{name:'建国操作预览'})).toBeVisible(); await press(p,'确认并保存',touch); await ready(p); await expect(country(p)).toHaveAttribute('data-country-display','committed'); }
  37  | async function territory(p:Page,a:Point,b:Point,touch:boolean) { await press(p,'在地图上选择国土',touch); await pick(p,a,touch); await pick(p,b,touch); }
  38  | async function createCity(p:Page,name:string,point:Point,touch:boolean) {
  39  |   await tab(p,'城市',touch); await press(p,'新建城市',touch); await p.getByLabel('城市名称',{exact:true}).fill(name);
  40  |   await press(p,'在地图上选择城市位置',touch); await pick(p,point,touch); await press(p,'预览建城',touch); await confirm(p,touch);
  41  | }
  42  | 
  43  | test('[country-world] native nations, two cities, capital, cancellation, conflict and independent reload',async({page},info)=>{
  44  |   test.setTimeout(450000);
  45  |   const touch=!!info.project.use.hasTouch, errors:string[]=[];
  46  |   page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  47  |   const build=await page.request.get('/build.json'); expect(build.ok()).toBe(true); const bytes=await build.body();
  48  |   await info.attach('actual-build.json',{body:bytes,contentType:'application/json'});
  49  |   if(process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(bytes).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  50  |   await page.goto('/?atlas=new&atlas-format=4'); const atlas=page.getByTestId('atlas-studio');
  51  |   await expect(atlas).toHaveAttribute('data-atlas-state','empty',{timeout:120000});
  52  |   await page.getByLabel('大世界草稿名称',{exact:true}).fill('山海与两国 · 原生验收');
  53  |   await page.getByLabel('大世界生成种子',{exact:true}).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模',{exact:true}).selectOption('128');
  54  |   await press(page,'新建空白海洋草稿',touch); await expect(atlas).toHaveAttribute('data-atlas-state','ready',{timeout:120000});
  55  |   const sourceId=(await atlas.getAttribute('data-atlas-id'))!;
  56  |   const creation=page.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name:'创世',exact:true}); if(touch)await creation.tap();else await creation.click();
  57  |   await page.getByLabel('地貌种子',{exact:true}).fill('hydrology-native-128'); await page.getByLabel('近岸岛链',{exact:true}).selectOption('0');
  58  |   await press(page,'画大陆',touch); await press(page,'全图',touch); await draw(page,touch);
  59  |   await expect(page.getByRole('region',{name:'大陆生成预览'})).toBeVisible({timeout:120000}); await press(page,'确认生成并保存',touch);
  60  |   await expect(atlas).toHaveAttribute('data-atlas-revision','1',{timeout:120000}); await expect(atlas).toHaveAttribute('data-atlas-state','ready');
  61  |   const sourceBefore=await saved(page,sourceId,4);
  62  |   const drafts=page.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name:'草稿',exact:true}); if(touch)await drafts.tap();else await drafts.click();
  63  |   await press(page,'在这片地形上建国',touch); await expect(country(page)).toHaveAttribute('data-country-state','empty',{timeout:120000});
  64  |   await page.getByLabel('建国世界名称',{exact:true}).fill('岚川与海岬'); await press(page,'创建独立建国副本',touch); await ready(page);
  65  |   const countryUrl=page.url(), worldId=(await country(page).getAttribute('data-country-world-id'))!; expect(worldId).toMatch(/^country-/);
  66  |   const created=await persisted(page,worldId);expect(created.document.nations).toEqual([]);expect(created.geoManifestHash).toBe(sourceBefore.root.currentManifest);expect(created.geoBytes).toBeGreaterThan(0);
  67  |   await expect(country(page)).toHaveAttribute('data-country-revision','0');
  68  |   await tab(page,'国家',touch); await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('岚川');
  69  |   await territory(page,{x:800,y:1300},{x:1060,y:1660},touch); await press(page,'预览建国',touch);
> 70  |   await expect(country(page)).toHaveAttribute('data-country-display','preview'); await expect(button(page,'确认并保存')).toBeEnabled(); await page.screenshot({path:info.outputPath('nation-preview.png'),fullPage:true});
      |                                                                                                                     ^ Error: expect(locator).toBeEnabled() failed
  71  |   await press(page,'取消预览',touch); await ready(page); await expect(country(page)).toHaveAttribute('data-country-nation-count','0'); await expect(country(page)).toHaveAttribute('data-country-revision','0');
  72  |   expect(await persisted(page,worldId)).toEqual(created);
  73  |   await press(page,'预览建国',touch); await confirm(page,touch); await expect(country(page)).toHaveAttribute('data-country-nation-count','1');
  74  |   const firstNation=(await button(page,'国家 岚川').getAttribute('data-nation-id'))!; expect(firstNation).toMatch(/^nation-/);
  75  |   await createCity(page,'岚川城',{x:950,y:1450},touch); await press(page,'城市 岚川城',touch); const firstCity=(await button(page,'城市 岚川城').getAttribute('data-city-id'))!;
  76  |   await press(page,'设为首都',touch); await confirm(page,touch);
  77  |   await createCity(page,'南津',{x:1000,y:1550},touch); await press(page,'城市 南津',touch); const secondCity=(await button(page,'城市 南津').getAttribute('data-city-id'))!; expect(firstCity).not.toBe(secondCity);
  78  |   await press(page,'设为首都',touch); await confirm(page,touch); await page.screenshot({path:info.outputPath('capital-relocation.png'),fullPage:true});
  79  |   expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(secondCity);
  80  |   await press(page,'撤销上次操作',touch); await ready(page);
  81  |   expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(firstCity);
  82  |   await tab(page,'国家',touch); await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('海岬');
  83  |   await territory(page,{x:1130,y:1430},{x:1260,y:1710},touch); await press(page,'预览建国',touch); await confirm(page,touch);
  84  |   await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); const secondNation=(await button(page,'国家 海岬').getAttribute('data-nation-id'))!; expect(secondNation).not.toBe(firstNation);
  85  |   const beforeConflict=(await country(page).getAttribute('data-country-revision'))!;
  86  |   const settled=await persisted(page,worldId);
  87  |   await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('冲突应拒绝');
  88  |   await territory(page,{x:950,y:1450},{x:970,y:1470},touch); await press(page,'预览建国',touch);
  89  |   await expect(page.getByRole('alert')).toContainText(/领土|归属|占有|国家|冲突/); await expect(country(page)).toHaveAttribute('data-country-revision',beforeConflict);
  90  |   await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); expect(await saved(page,sourceId,4)).toEqual(sourceBefore);
  91  |   expect(await persisted(page,worldId)).toEqual(settled);
  92  |   await page.goto(countryUrl); await ready(page); await expect(country(page)).toHaveAttribute('data-country-city-count','2'); await expect(country(page)).toHaveAttribute('data-country-nation-count','2');
  93  |   await tab(page,'地图',touch); await pick(page,{x:950,y:1450},touch); await expect(country(page)).toHaveAttribute('data-country-selected-city',firstCity);
  94  |   await expect(button(page,'城市 岚川城')).toHaveAttribute('data-city-id',firstCity); await page.screenshot({path:info.outputPath('saved-capital-selected.png'),fullPage:true});
  95  |   await tab(page,'国家',touch); await expect(button(page,'国家 岚川')).toHaveAttribute('data-nation-id',firstNation); await expect(button(page,'国家 海岬')).toHaveAttribute('data-nation-id',secondNation);
  96  |   await tab(page,'地图',touch); await page.screenshot({path:info.outputPath('two-nations-restored.png'),fullPage:true});
  97  |   expect(await saved(page,sourceId,4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  98  |   const restored=await persisted(page,worldId);expect(restored).toEqual(settled);expect(restored.geoSha256).toBe(created.geoSha256);expect(restored.geoSource).toEqual(created.geoSource);
  99  |   await info.attach('native-country-result.json',{body:Buffer.from(JSON.stringify({worldId,sourceId,firstNation,secondNation,firstCity,secondCity,revision:beforeConflict,restored,sourcePreserved:true,errors,touch,physicalDevice:false},null,2)),contentType:'application/json'});
  100 | });
  101 | 
  102 | test('[country-shape] native concave outline, cancelled candidate, chunk persistence and restored city', async ({ page }, info) => {
  103 |   test.setTimeout(450000);
  104 |   const touch = !!info.project.use.hasTouch, errors: string[] = [];
  105 |   page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  106 |   const response = await page.request.get('/build.json'), build = await response.body(); expect(response.ok()).toBe(true);
  107 |   if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(build).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  108 |   await info.attach('actual-build.json', { body: build, contentType: 'application/json' });
  109 |   await page.goto('/?atlas=new&atlas-format=4'); const atlas = page.getByTestId('atlas-studio');
  110 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'empty', { timeout: 120000 });
  111 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('自由国土 · 原生验收');
  112 |   await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  113 |   await press(page, '新建空白海洋草稿', touch); await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 });
  114 |   const sourceId = (await atlas.getAttribute('data-atlas-id'))!;
  115 |   const creation = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }); if (touch) await creation.tap(); else await creation.click();
  116 |   await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  117 |   await press(page, '画大陆', touch); await press(page, '全图', touch); await draw(page, touch);
  118 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await press(page, '确认生成并保存', touch);
  119 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 }); const sourceBefore = await saved(page, sourceId, 4);
  120 |   const drafts = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '草稿', exact: true }); if (touch) await drafts.tap(); else await drafts.click();
  121 |   await press(page, '在这片地形上建国', touch); await expect(country(page)).toHaveAttribute('data-country-state', 'empty', { timeout: 120000 });
  122 |   await page.getByLabel('建国世界名称', { exact: true }).fill('岚海 · 自由圈地'); await press(page, '创建独立建国副本', touch); await ready(page);
  123 |   const worldId = (await country(page).getAttribute('data-country-world-id'))!, url = page.url(), before = await persisted(page, worldId);
  124 |   expect(before.document.version).toBe(2);
  125 |   await tab(page, '国家', touch); await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('岚海');
  126 |   await press(page, '手绘国土', touch);
  127 |   await draw(page, touch, [[700,1300],[1000,1600],[700,1600],[1000,1300],[700,1300]]); await press(page, '闭合并预览', touch);
  128 |   await expect(page.getByRole('alert')).toContainText(/自交|退化|轮廓/); await ready(page);
  129 |   expect(await persisted(page, worldId)).toEqual(before);
  130 |   await press(page, '手绘国土', touch);
  131 |   const outline = [[550,1300],[920,1100],[1260,1270],[1160,1460],[1010,1440],[1060,1760],[760,1880],[550,1600],[550,1300]];
  132 |   await draw(page, touch, outline); await press(page, '闭合并预览', touch);
  133 |   await expect(button(page, '确认并保存')).toBeEnabled({ timeout: 120000 });
  134 |   expect(await persisted(page, worldId)).toEqual(before);
  135 |   await page.screenshot({ path: info.outputPath('free-outline-preview.png'), fullPage: true });
  136 |   await press(page, '取消预览', touch); await ready(page); expect(await persisted(page, worldId)).toEqual(before);
  137 |   await press(page, '预览建国', touch); await confirm(page, touch);
  138 |   const savedNation = await persisted(page, worldId); expect(savedNation.document.nations).toHaveLength(1); expect(savedNation.document.territories.length).toBeGreaterThan(100);
  139 |   expect(savedNation.storage.pages).toBeGreaterThan(0); expect(savedNation.storage.manifestBytes).toBeLessThan(256 * 1024);
  140 |   const political = page.getByTestId('country-overlay');
  141 |   expect(Number(await political.getAttribute('data-render-chunks'))).toBeLessThan(savedNation.document.territories.length);
  142 |   await createCity(page, '岚海城', { x: 900, y: 1400 }, touch); await press(page, '城市 岚海城', touch);
  143 |   const cityId = (await button(page, '城市 岚海城').getAttribute('data-city-id'))!; await press(page, '设为首都', touch); await confirm(page, touch);
  144 |   const settled = await persisted(page, worldId);
  145 |   await page.goto(url); await ready(page); expect(await persisted(page, worldId)).toEqual(settled);
  146 |   await tab(page, '地图', touch); await pick(page, { x: 900, y: 1400 }, touch); await expect(country(page)).toHaveAttribute('data-country-selected-city', cityId);
  147 |   await tab(page, '地图', touch); await press(page, '全图', touch); await page.screenshot({ path: info.outputPath('free-country-restored.png'), fullPage: true });
  148 |   expect(await saved(page, sourceId, 4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  149 |   await info.attach('native-shape-result.json', { body: Buffer.from(JSON.stringify({ worldId, sourceId, cityId, settled, sourcePreserved: true, input: touch ? 'native-touch' : 'native-mouse', errors, physicalDevice: false }, null, 2)), contentType: 'application/json' });
  150 | });
  151 | 
```