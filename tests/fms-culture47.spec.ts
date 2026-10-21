import {test,expect,type Page} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

const countries=async(page:Page)=>JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-countries'))!) as {id:string;name:string}[];
const position=async(page:Page,id:string)=>{const data=JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-force-positions'))!) as {armies:[string,{x:number;y:number}][]};return data.armies.find(([key])=>key===id)![1];};
async function saved(page:Page){await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toHaveText('文化世界已保存，刷新后可继续。',{timeout:90000});}

test('Chinese culture world: actual diplomacy, hidden idle news, military preview/cancel, time and durable reload',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await enter(page);await create(page);const nations=await countries(page);expect(nations.every(n=>!/[a-z]/i.test(n.name))).toBe(true);
 await expect(page.getByRole('button',{name:'顶部事件',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'顶部事件',exact:true})).toHaveCount(0,{timeout:12000});
 await page.locator('.c47-nations').getByRole('button',{name:nations[2].name,exact:true}).click();await expect(page.getByRole('complementary',{name:'文化与国家详情'})).toContainText('英格兰文化');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect(page.getByTestId('culture47-app')).not.toHaveAttribute('data-tick','0');
 await page.getByLabel('外交目标国家').selectOption(nations[3].id);await page.getByRole('button',{name:'暂停并预览宣战',exact:true}).click();await expect(page.getByRole('group',{name:'外交预览'})).toBeVisible();await expect(page.getByRole('button',{name:'继续时间',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'取消外交操作'}).click();await expect(page.getByRole('group',{name:'外交预览'})).toHaveCount(0);
 await page.getByRole('button',{name:'暂停并预览宣战',exact:true}).click();await page.getByRole('button',{name:'确认宣战',exact:true}).click();await expect(page.getByRole('button',{name:'顶部事件',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'查看大事记'}).click();await expect(page.locator('.c47-history')).toContainText('宣战');await page.screenshot({path:info.outputPath('chinese-important-events.png')});
 await page.locator('.c47-nations').getByRole('button',{name:nations[2].name,exact:true}).click();await page.getByLabel('外交目标国家').selectOption(nations[3].id);await page.getByRole('button',{name:'暂停并预览停战',exact:true}).click();await page.getByRole('button',{name:'确认停战',exact:true}).click();
 await page.getByRole('button',{name:'军事模式'}).click();const options=page.getByLabel('选择部队').locator('option[value^="army/"]');expect(await options.count()).toBeGreaterThan(0);await page.getByLabel('选择部队').selectOption((await options.first().getAttribute('value'))!);await expect(page.getByRole('button',{name:'调遣',exact:true})).toBeVisible();
 const armyId=(await page.getByLabel('选择部队').inputValue()).slice(5);
 await page.getByRole('button',{name:'调遣',exact:true}).click();await expect(page.locator('.c47-order-hint')).toContainText('点击行军目的地');
 const hits=JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-cities'))!) as {x:number;y:number;nationId:string}[],units=JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-units'))!) as {id:string;kind:string;x:number;y:number;nationId:string}[],box=(await page.getByTestId('culture47-map').boundingBox())!,unit=units.find(u=>u.kind==='army'&&u.id===armyId)!,hit=hits.filter(p=>p.nationId===unit.nationId&&p.x>30&&p.x<box.width-30&&p.y>200&&p.y<box.height-130).sort((a,b)=>Math.hypot(b.x-unit.x,b.y-unit.y)-Math.hypot(a.x-unit.x,a.y-unit.y))[0]!;expect(hit).toBeDefined();await page.mouse.click(box.x+hit.x,box.y+hit.y);await expect(page.getByRole('group',{name:'确认军令'})).toBeVisible();
 const before=await position(page,armyId),beforeTick=await page.getByTestId('culture47-app').getAttribute('data-tick');
 await page.screenshot({path:info.outputPath('military-route-preview.png')});await page.getByRole('button',{name:'取消军令'}).click();await expect(page.getByRole('group',{name:'确认军令'})).toHaveCount(0);expect(await position(page,armyId)).toEqual(before);await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-tick',beforeTick!);
 await page.getByRole('button',{name:'调遣',exact:true}).click();await page.mouse.click(box.x+hit.x,box.y+hit.y);await page.getByRole('button',{name:'确认军令',exact:true}).click();await expect(page.getByRole('group',{name:'确认军令'})).toHaveCount(0);
 await page.getByRole('button',{name:'切换地形地图'}).click();await expect(page.getByRole('button',{name:'切换地形地图'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'切换推演速度'}).click();await expect(page.getByRole('button',{name:'切换推演速度'})).toHaveText('2倍速');
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect.poll(async()=>Number(await page.getByTestId('culture47-app').getAttribute('data-day')),{timeout:90000}).toBeGreaterThanOrEqual(1);await saved(page);
 const moved=await position(page,armyId);expect(Math.hypot(moved.x-before.x,moved.y-before.y)).toBeGreaterThan(.01);
 const tick=(await page.getByTestId('culture47-app').getAttribute('data-tick'))!;await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-tick',tick,{timeout:90000});expect(await position(page,armyId)).toEqual(moved);await page.getByRole('button',{name:'查看大事记'}).click();await expect(page.locator('.c47-history')).toContainText('宣战');await expect(page.locator('.c47-history')).toContainText('停战');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.use.viewport!.width);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('restored-culture-world.png')});await info.attach('scope',{body:JSON.stringify({fixture:'fixed synthetic terrain, not a private save',tick,nations,errors,scope:'Chromium browser; not iPhone hardware or desktop-original visual parity'}),contentType:'application/json'});
});

test('historical Chinese names create and persist every city in the full 480-city world',async({page},info)=>{
 test.setTimeout(240000);await enter(page);await page.getByRole('button',{name:'历史名称',exact:true}).click();await page.getByLabel('国家数量',{exact:true}).selectOption('24');await create(page,480);
 const hits=JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-cities'))!) as {id:string;name:string}[];
 expect(hits).toHaveLength(480);expect(hits.every(c=>!/[a-z0-9]/i.test(c.name))).toBe(true);expect(await countries(page)).toHaveLength(24);await saved(page);await page.screenshot({path:info.outputPath('480-chinese-cities.png')});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});expect(await countries(page)).toHaveLength(24);
 const restored=JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-cities'))!) as {id:string;name:string}[];expect(restored.map(c=>({id:c.id,name:c.name}))).toEqual(hits.map(c=>({id:c.id,name:c.name})));
});
