import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import type {EditorDraft} from '../src/worldgen/types';
import type {World} from '../src/sim/types';
async function panel(page:Page,name:string){const nav=page.getByRole('navigation',{name:'世界工坊工具'});if(await nav.isVisible())await nav.getByRole('button',{name,exact:true}).click();else if(name==='城市'||name==='国家')await page.locator('.studio-panel-tabs').getByRole('button',{name,exact:true}).click();}
async function closePanel(page:Page){const close=page.getByRole('button',{name:'关闭工坊面板'});if(await close.isVisible())await close.click();}
async function button(page:Page,name:string){await page.getByRole('button',{name,exact:true}).filter({visible:true}).click();}
async function confirm(page:Page){await page.getByRole('alertdialog').getByRole('button',{name:'确认执行'}).click();}
async function ready(page:Page){await page.goto('/');await expect(page.getByTestId('studio-canvas')).toBeVisible();}
async function saveDraft(page:Page){await panel(page,'世界');await button(page,'保存草稿');await expect(page.locator('.studio-save-status').filter({visible:true})).toHaveText('草稿已保存');await closePanel(page);}
async function draftData(page:Page):Promise<EditorDraft>{return page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('lieguoji-world-studio-v1',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('records','readonly'),r=tx.objectStore('records').get('current');tx.oncomplete=()=>{resolve(r.result.data.draft);db.close();};tx.onerror=()=>reject(tx.error);};}));}
async function gameSave(page:Page){const nav=page.getByRole('navigation',{name:'游戏工具'});if(await nav.isVisible())await nav.getByRole('button',{name:'存档',exact:true}).click();await button(page,'保存');await expect(page.getByText(/已保存 · 第/).filter({visible:true})).toBeVisible();}

test('手画大陆可撤销，地形保留海岸，国家与首都进入真实推演并刷新恢复',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await ready(page);await panel(page,'世界');await page.getByLabel('世界名称',{exact:true}).filter({visible:true}).fill('云海诸国');await button(page,'空白海洋');await confirm(page);await closePanel(page);
 await expect(page.locator('.studio-map-readout')).toContainText('0 陆地区域');
 const canvas=page.getByTestId('studio-canvas'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.42);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.6,{steps:18});await page.mouse.up();
 await expect(page.locator('.studio-map-readout > span').first()).not.toHaveText('0 陆地区域');await page.getByRole('button',{name:'撤销编辑'}).click();await expect(page.locator('.studio-map-readout')).toContainText('0 陆地区域');await page.getByRole('button',{name:'重做编辑'}).click();
 await saveDraft(page);const painted=await draftData(page);expect(painted.cells.filter(c=>c.land).length).toBeGreaterThan(10);
 await panel(page,'画笔');await button(page,'自动生成地形 ↗');await confirm(page);await closePanel(page);await saveDraft(page);const terrain=await draftData(page);expect(terrain.cells.map(c=>c.land)).toEqual(painted.cells.map(c=>c.land));
 await panel(page,'国家');await page.getByLabel('新国家名称').filter({visible:true}).fill('云国');await button(page,'建国');await button(page,'分配剩余土地 '+terrain.cells.filter(c=>c.land).length+' 块未归属');await closePanel(page);
 await panel(page,'城市');await button(page,'自动城池与首都');await confirm(page);await closePanel(page);await saveDraft(page);const draft=await draftData(page);expect(draft.nations[0].name).toBe('云国');expect(draft.cities.filter(c=>c.capital)).toHaveLength(1);
 await page.reload();await expect(page.getByTestId('world-studio')).toBeVisible();await expect(page.locator('.studio-map-readout')).toContainText(`${draft.cells.filter(c=>c.land).length} 陆地区域`);await page.screenshot({path:info.outputPath('created-world.png'),fullPage:true});
 await button(page,'开始推演 ▶');await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible();await expect(page.getByTestId('day-number')).toHaveText('0');expect(page.url()).toContain('?world=run-');
 for(let day=1;day<=3;day++){await page.getByRole('button',{name:'推进一日'}).click();await expect(page.getByTestId('day-number')).toHaveText(String(day));}
 await gameSave(page);const download=page.waitForEvent('download');await button(page,'导出');const file=await download;const target=info.outputPath('custom.save.json');await file.saveAs(target);const saved=JSON.parse(await fs.readFile(target,'utf8')) as {world:World};expect(saved.world.scenario).toBe('custom-world');expect(saved.world.provinces.map(p=>p.polygon)).toEqual(draft.cells.filter(c=>c.land).map(c=>c.polygon));expect(saved.world.nations.map(n=>n.name)).toEqual(['云国']);
 await page.reload();await expect(page.getByTestId('day-number')).toHaveText('3');await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible();expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('自动列国自主行动，草稿导入校验，缺失历史链接不会生成战役',async({page},info)=>{
 await ready(page);await panel(page,'国家');await button(page,'自动分国');await confirm(page);await closePanel(page);await panel(page,'城市');await button(page,'自动城池与首都');await confirm(page);await closePanel(page);await saveDraft(page);const initial=await draftData(page);expect(initial.nations).toHaveLength(5);expect(initial.cities.filter(c=>c.capital)).toHaveLength(5);
 await panel(page,'世界');const download=page.waitForEvent('download');await button(page,'导出草稿');const file=await download;const target=info.outputPath('world.json');await file.saveAs(target);await closePanel(page);
 await page.getByLabel('选择世界草稿文件').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from('{"format":"lieguoji-studio","version":1}')});await confirm(page);await expect(page.locator('.studio-notice')).toBeVisible();expect((await draftData(page)).id).toBe(initial.id);
 await page.getByLabel('选择世界草稿文件').setInputFiles(target);await confirm(page);await expect(page.locator('.studio-notice')).toContainText('草稿已导入');await button(page,'开始推演 ▶');await expect(page.getByRole('button',{name:'推进一日'})).toBeEnabled();
 await page.getByRole('button',{name:'12×',exact:true}).click();await page.getByRole('button',{name:'继续推演'}).click();await expect.poll(async()=>Number(await page.getByTestId('day-number').innerText()),{timeout:20000}).toBeGreaterThanOrEqual(30);await page.getByRole('button',{name:'暂停推演'}).click();await gameSave(page);
 const runUrl=page.url();const runId=new URL(runUrl).searchParams.get('world')!;const world:World=await page.evaluate(id=>new Promise((resolve,reject)=>{const req=indexedDB.open(`lieguoji-custom-${id}-v1`,1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readonly'),r=tx.objectStore('saves').get('current');tx.oncomplete=()=>{resolve(r.result.world);db.close();};tx.onerror=()=>reject(tx.error);};}),runId);
 expect(world.events.some(e=>e.kind==='order')).toBeTruthy();expect(world.events.some(e=>e.kind==='march'||e.kind==='occupation'||e.kind==='battle')).toBeTruthy();await page.screenshot({path:info.outputPath('autonomous-world.png'),fullPage:true});
 await page.goto('/?world=run-missing-history');await expect(page.getByRole('alert')).toContainText('存档不在当前浏览器');await expect(page.getByRole('button',{name:'推进一日'})).toBeDisabled();await button(page,'世界工坊');await expect(page.getByTestId('world-studio')).toBeVisible();await page.goto(runUrl);await expect(page.getByTestId('day-number')).toHaveText(String(world.day));
});

test('双岛手绘、手工疆域、山地与首都城市保持有效引用',async({page,context},info)=>{
 await ready(page);await panel(page,'世界');await button(page,'空白海洋');await confirm(page);await closePanel(page);
 const box=(await page.getByTestId('studio-canvas').boundingBox())!,scale=Math.min(box.width/1000,box.height/700)*.98;
 const point=(x:number,y:number)=>({x:box.x+(box.width-1000*scale)/2+x*scale,y:box.y+(box.height-700*scale)/2+y*scale});
 const islands=[point(250,300),point(750,400)];
 async function tap(p:{x:number;y:number}){if(info.project.name==='desktop-chromium')await page.mouse.click(p.x,p.y);else{const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}}
 for(const p of islands)await tap(p);
 await panel(page,'国家');await page.getByLabel('新国家名称').filter({visible:true}).fill('双岛国');await button(page,'建国');await closePanel(page);for(const p of islands)await tap(p);
 await panel(page,'画笔');await page.getByTestId('tool-mountain').filter({visible:true}).click();await closePanel(page);await tap(islands[1]);
 await panel(page,'城市');await page.getByLabel('新城市名称').filter({visible:true}).fill('西都');await button(page,'点选设置首都');await closePanel(page);await tap(islands[0]);
 await panel(page,'城市');await page.getByLabel('新城市名称').filter({visible:true}).fill('东山城');await button(page,'点选放置城市');await closePanel(page);await tap(islands[1]);
 await saveDraft(page);const before=await draftData(page);expect(before.nations.map(n=>n.name)).toEqual(['双岛国']);expect(before.cells.filter(c=>c.land).every(c=>c.ownerId===before.nations[0].id)).toBeTruthy();expect(before.cities.map(c=>c.name)).toEqual(['西都','东山城']);expect(before.cities.filter(c=>c.capital).map(c=>c.name)).toEqual(['西都']);expect(before.cells.filter(c=>c.land).some(c=>c.terrain==='mountain')).toBeTruthy();
 await page.reload();await expect(page.getByTestId('world-studio')).toBeVisible();expect(await draftData(page)).toEqual(before);await page.screenshot({path:info.outputPath('hand-drawn-islands.png'),fullPage:true});
});


