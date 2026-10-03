import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { metrics, saved } from './helpers/atlas-shape-readonly';
import { persistedCountry as persisted } from './helpers/country-readonly';

test.describe.configure({ retries: 0 });
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true });
const country = (p: Page) => p.getByTestId('country-studio');
const ready = (p: Page) => expect(country(p)).toHaveAttribute('data-country-state', 'ready', { timeout: 120000 });
async function press(p: Page, name: string, touch: boolean) { if (touch) await button(p, name).tap(); else await button(p, name).click(); }
async function tab(p: Page, name: string, touch: boolean) {
  const target = p.getByRole('navigation', { name: '建国世界工具' }).getByRole('button', { name, exact: true });
  if (touch) await target.tap(); else await target.click();
}
type Point = { x: number; y: number };
async function screen(p: Page, point: Point) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, view = await metrics(p);
  return { x: box.x + view.camera.x + point.x * view.camera.scale, y: box.y + view.camera.y + point.y * view.camera.scale };
}
async function pick(p: Page, point: Point, touch: boolean) {
  const q = await screen(p, point);
  expect(await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), q)).toBe('atlas-canvas');
  if (touch) await p.touchscreen.tap(q.x, q.y); else await p.mouse.click(q.x, q.y);
}
async function draw(p: Page, touch: boolean, contour = [[650,1300],[950,1120],[1200,1260],[1440,1590],[1310,1850],[1010,1980],[760,1790],[580,1580],[650,1300]]) {
  const points = await Promise.all(contour.map(([x,y])=>screen(p,{x,y})));
  expect(await p.evaluate(ps=>ps.every(q=>document.elementFromPoint(q.x,q.y)?.getAttribute('data-testid')==='atlas-canvas'),points)).toBe(true);
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    try { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
      for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } finally { await cdp.detach(); }
  } else { await p.mouse.move(points[0].x,points[0].y); await p.mouse.down(); try { for(const point of points.slice(1)) await p.mouse.move(point.x,point.y); } finally { await p.mouse.up(); } }
}
async function confirm(p: Page,touch:boolean) { await ready(p); await expect(p.getByRole('region',{name:'建国操作预览'})).toBeVisible(); await expect(button(p,'确认并保存')).toBeEnabled(); await press(p,'确认并保存',touch); await ready(p); await expect(country(p)).toHaveAttribute('data-country-display','committed'); }
async function territory(p:Page,a:Point,b:Point,touch:boolean) { await press(p,'在地图上选择国土',touch); await pick(p,a,touch); await pick(p,b,touch); }
async function createCity(p:Page,name:string,point:Point,touch:boolean) {
  await tab(p,'城市',touch); await press(p,'新建城市',touch); await p.getByLabel('城市名称',{exact:true}).fill(name);
  await press(p,'在地图上选择城市位置',touch); await pick(p,point,touch); await press(p,'预览建城',touch); await confirm(p,touch);
}

test('[country-world] native nations, two cities, capital, cancellation, conflict and independent reload',async({page},info)=>{
  test.setTimeout(450000);
  const touch=!!info.project.use.hasTouch, errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const build=await page.request.get('/build.json'); expect(build.ok()).toBe(true); const bytes=await build.body();
  await info.attach('actual-build.json',{body:bytes,contentType:'application/json'});
  if(process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(bytes).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  await page.goto('/?atlas=new&atlas-format=4'); const atlas=page.getByTestId('atlas-studio');
  await expect(atlas).toHaveAttribute('data-atlas-state','empty',{timeout:120000});
  await page.getByLabel('大世界草稿名称',{exact:true}).fill('山海与两国 · 原生验收');
  await page.getByLabel('大世界生成种子',{exact:true}).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模',{exact:true}).selectOption('128');
  await press(page,'新建空白海洋草稿',touch); await expect(atlas).toHaveAttribute('data-atlas-state','ready',{timeout:120000});
  const sourceId=(await atlas.getAttribute('data-atlas-id'))!;
  const creation=page.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name:'创世',exact:true}); if(touch)await creation.tap();else await creation.click();
  await page.getByLabel('地貌种子',{exact:true}).fill('hydrology-native-128'); await page.getByLabel('近岸岛链',{exact:true}).selectOption('0');
  await press(page,'画大陆',touch); await press(page,'全图',touch); await draw(page,touch);
  await expect(page.getByRole('region',{name:'大陆生成预览'})).toBeVisible({timeout:120000}); await press(page,'确认生成并保存',touch);
  await expect(atlas).toHaveAttribute('data-atlas-revision','1',{timeout:120000}); await expect(atlas).toHaveAttribute('data-atlas-state','ready');
  const sourceBefore=await saved(page,sourceId,4);
  const drafts=page.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name:'草稿',exact:true}); if(touch)await drafts.tap();else await drafts.click();
  await press(page,'在这片地形上建国',touch); await expect(country(page)).toHaveAttribute('data-country-state','empty',{timeout:120000});
  await page.getByLabel('建国世界名称',{exact:true}).fill('岚川与海岬'); await press(page,'创建独立建国副本',touch); await ready(page);
  const countryUrl=page.url(), worldId=(await country(page).getAttribute('data-country-world-id'))!; expect(worldId).toMatch(/^country-/);
  const created=await persisted(page,worldId);expect(created.document.nations).toEqual([]);expect(created.geoManifestHash).toBe(sourceBefore.root.currentManifest);expect(created.geoBytes).toBeGreaterThan(0);
  await expect(country(page)).toHaveAttribute('data-country-revision','0');
  await tab(page,'国家',touch); await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('岚川');
  await territory(page,{x:800,y:1300},{x:1060,y:1660},touch); await press(page,'预览建国',touch);
  await ready(page); await expect(country(page)).toHaveAttribute('data-country-display','preview'); await expect(button(page,'确认并保存')).toBeEnabled(); await page.screenshot({path:info.outputPath('nation-preview.png'),fullPage:true});
  await press(page,'取消预览',touch); await ready(page); await expect(country(page)).toHaveAttribute('data-country-nation-count','0'); await expect(country(page)).toHaveAttribute('data-country-revision','0');
  expect(await persisted(page,worldId)).toEqual(created);
  await press(page,'预览建国',touch); await confirm(page,touch); await expect(country(page)).toHaveAttribute('data-country-nation-count','1');
  const firstNation=(await button(page,'国家 岚川').getAttribute('data-nation-id'))!; expect(firstNation).toMatch(/^nation-/);
  await createCity(page,'岚川城',{x:950,y:1450},touch); await press(page,'城市 岚川城',touch); const firstCity=(await button(page,'城市 岚川城').getAttribute('data-city-id'))!;
  await press(page,'设为首都',touch); await confirm(page,touch);
  await createCity(page,'南津',{x:1000,y:1550},touch); await press(page,'城市 南津',touch); const secondCity=(await button(page,'城市 南津').getAttribute('data-city-id'))!; expect(firstCity).not.toBe(secondCity);
  await press(page,'设为首都',touch); await confirm(page,touch); await page.screenshot({path:info.outputPath('capital-relocation.png'),fullPage:true});
  expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(secondCity);
  await press(page,'撤销上次操作',touch); await ready(page);
  expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(firstCity);
  await tab(page,'国家',touch); await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('海岬');
  await territory(page,{x:1130,y:1430},{x:1260,y:1710},touch); await press(page,'预览建国',touch); await confirm(page,touch);
  await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); const secondNation=(await button(page,'国家 海岬').getAttribute('data-nation-id'))!; expect(secondNation).not.toBe(firstNation);
  const beforeConflict=(await country(page).getAttribute('data-country-revision'))!;
  const settled=await persisted(page,worldId);
  await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('冲突应拒绝');
  await territory(page,{x:950,y:1450},{x:970,y:1470},touch); await press(page,'预览建国',touch);
  await expect(page.getByRole('alert')).toContainText(/领土|归属|占有|国家|冲突/); await expect(country(page)).toHaveAttribute('data-country-revision',beforeConflict);
  await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); expect(await saved(page,sourceId,4)).toEqual(sourceBefore);
  expect(await persisted(page,worldId)).toEqual(settled);
  await page.goto(countryUrl); await ready(page); await expect(country(page)).toHaveAttribute('data-country-city-count','2'); await expect(country(page)).toHaveAttribute('data-country-nation-count','2');
  await tab(page,'地图',touch); await pick(page,{x:950,y:1450},touch); await expect(country(page)).toHaveAttribute('data-country-selected-city',firstCity);
  await expect(button(page,'城市 岚川城')).toHaveAttribute('data-city-id',firstCity); await page.screenshot({path:info.outputPath('saved-capital-selected.png'),fullPage:true});
  await tab(page,'国家',touch); await expect(button(page,'国家 岚川')).toHaveAttribute('data-nation-id',firstNation); await expect(button(page,'国家 海岬')).toHaveAttribute('data-nation-id',secondNation);
  await tab(page,'地图',touch); await page.screenshot({path:info.outputPath('two-nations-restored.png'),fullPage:true});
  expect(await saved(page,sourceId,4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  const restored=await persisted(page,worldId);expect(restored).toEqual(settled);expect(restored.geoSha256).toBe(created.geoSha256);expect(restored.geoSource).toEqual(created.geoSource);
  await info.attach('native-country-result.json',{body:Buffer.from(JSON.stringify({worldId,sourceId,firstNation,secondNation,firstCity,secondCity,revision:beforeConflict,restored,sourcePreserved:true,errors,touch,physicalDevice:false},null,2)),contentType:'application/json'});
});

test('[country-shape] native concave outline, cancelled candidate, chunk persistence and restored city', async ({ page }, info) => {
  test.setTimeout(450000);
  const touch = !!info.project.use.hasTouch, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const response = await page.request.get('/build.json'), build = await response.body(); expect(response.ok()).toBe(true);
  if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(build).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  await info.attach('actual-build.json', { body: build, contentType: 'application/json' });
  await page.goto('/?atlas=new&atlas-format=4'); const atlas = page.getByTestId('atlas-studio');
  await expect(atlas).toHaveAttribute('data-atlas-state', 'empty', { timeout: 120000 });
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('自由国土 · 原生验收');
  await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  await press(page, '新建空白海洋草稿', touch); await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 });
  const sourceId = (await atlas.getAttribute('data-atlas-id'))!;
  const creation = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }); if (touch) await creation.tap(); else await creation.click();
  await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await press(page, '画大陆', touch); await press(page, '全图', touch); await draw(page, touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await press(page, '确认生成并保存', touch);
  await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 }); const sourceBefore = await saved(page, sourceId, 4);
  const drafts = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '草稿', exact: true }); if (touch) await drafts.tap(); else await drafts.click();
  await press(page, '在这片地形上建国', touch); await expect(country(page)).toHaveAttribute('data-country-state', 'empty', { timeout: 120000 });
  await page.getByLabel('建国世界名称', { exact: true }).fill('岚海 · 自由圈地'); await press(page, '创建独立建国副本', touch); await ready(page);
  const worldId = (await country(page).getAttribute('data-country-world-id'))!, url = page.url(), before = await persisted(page, worldId);
  expect(before.document.version).toBe(2);
  await tab(page, '国家', touch); await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('岚海');
  await press(page, '手绘国土', touch);
  await draw(page, touch, [[700,1300],[1000,1600],[700,1600],[1000,1300],[700,1300]]); await press(page, '闭合并预览', touch);
  await expect(page.getByRole('alert')).toContainText(/自交|退化|轮廓/); await ready(page);
  expect(await persisted(page, worldId)).toEqual(before);
  await press(page, '手绘国土', touch);
  const outline = [[550,1300],[920,1100],[1260,1270],[1160,1460],[1010,1440],[1060,1760],[760,1880],[550,1600],[550,1300]];
  await draw(page, touch, outline); await press(page, '闭合并预览', touch);
  await expect(button(page, '确认并保存')).toBeEnabled({ timeout: 120000 });
  expect(await persisted(page, worldId)).toEqual(before);
  await page.screenshot({ path: info.outputPath('free-outline-preview.png'), fullPage: true });
  await press(page, '取消预览', touch); await ready(page); expect(await persisted(page, worldId)).toEqual(before);
  await press(page, '预览建国', touch); await confirm(page, touch);
  const savedNation = await persisted(page, worldId); expect(savedNation.document.nations).toHaveLength(1); expect(savedNation.document.territories.length).toBeGreaterThan(100);
  expect(savedNation.storage.pages).toBeGreaterThan(0); expect(savedNation.storage.manifestBytes).toBeLessThan(256 * 1024);
  const political = page.getByTestId('country-overlay');
  expect(Number(await political.getAttribute('data-render-chunks'))).toBeLessThan(savedNation.document.territories.length);
  await createCity(page, '岚海城', { x: 900, y: 1400 }, touch); await press(page, '城市 岚海城', touch);
  const cityId = (await button(page, '城市 岚海城').getAttribute('data-city-id'))!; await press(page, '设为首都', touch); await confirm(page, touch);
  const settled = await persisted(page, worldId);
  await page.goto(url); await ready(page); expect(await persisted(page, worldId)).toEqual(settled);
  await tab(page, '地图', touch); await pick(page, { x: 900, y: 1400 }, touch); await expect(country(page)).toHaveAttribute('data-country-selected-city', cityId);
  await tab(page, '地图', touch); await press(page, '全图', touch); await page.screenshot({ path: info.outputPath('free-country-restored.png'), fullPage: true });
  expect(await saved(page, sourceId, 4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  await info.attach('native-shape-result.json', { body: Buffer.from(JSON.stringify({ worldId, sourceId, cityId, settled, sourcePreserved: true, input: touch ? 'native-touch' : 'native-mouse', errors, physicalDevice: false }, null, 2)), contentType: 'application/json' });
});
