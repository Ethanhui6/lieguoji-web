import { test,expect,type Page } from '@playwright/test';
async function drawer(page:Page,name:string){await expect(page.locator('.game-layout')).toBeVisible();const tools=page.getByRole('navigation',{name:'游戏工具'});if(await tools.isVisible())await tools.getByRole('button',{name,exact:true}).click();}
// Public previews load the renderer dynamically after page load; bound only initial map readiness.
async function mapReady(page:Page){await expect(page.getByTestId('map-canvas').locator('canvas')).toBeVisible({timeout:15_000});}
async function ready(page:Page){await page.goto('/?demo=1');await mapReady(page);await expect(page.getByRole('button',{name:'推进一日'})).toBeEnabled();}
async function selectArmy(page:Page){await drawer(page,'军情');await page.getByTestId('army-lie-main').click();}
async function march(page:Page){await selectArmy(page);await page.getByLabel('目的地').selectOption('ming-border');await page.getByRole('button',{name:'预览命令'}).click();await expect(page.getByTestId('order-preview')).toContainText('3 日');await page.getByRole('button',{name:'确认军令'}).click();}
async function days(page:Page,count:number){for(let i=0;i<count;i++){const before=Number(await page.getByTestId('day-number').innerText());await page.getByRole('button',{name:'推进一日'}).click();await expect(page.getByTestId('day-number')).toHaveText(String(before+1));}}
async function save(page:Page){await drawer(page,'存档');await page.getByRole('button',{name:'保存',exact:true}).filter({visible:true}).click();await expect(page.getByText(/已保存 · 第/).filter({visible:true})).toBeVisible();}
test('地图、命令取消、真实行军交战占领、原因与刷新恢复',async({page},info)=>{
 const errors:string[]=[];const failed:string[]=[];const workerUrls:string[]=[];
 const mimeErrors:string[]=[];const verifiedJsMime=new Map<string,string>();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>failed.push(r.url()));page.on('worker',w=>workerUrls.push(w.url()));
 page.on('response',response=>{
  const url=response.url();if(!/\/assets\/.*\.js$/.test(url))return;
  const status=response.status(),mime=response.headers()['content-type']??'';
  // A cache revalidation may omit representation headers; require a verified prior 200.
  if(status===304){if(!verifiedJsMime.has(url)||(mime&&!/javascript/i.test(mime)))mimeErrors.push(`${url} [status=304,mime=${mime||'<missing>'},previous=${verifiedJsMime.get(url)||'<unverified>'}]`);return;}
  if(status!==200||!/javascript/i.test(mime)){mimeErrors.push(`${url} [status=${status},mime=${mime||'<missing>'}]`);return;}
  verifiedJsMime.set(url,mime);
 });
 await ready(page);expect(workerUrls.some(url=>url.includes('sim.worker'))).toBeTruthy();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await selectArmy(page);await page.getByLabel('目的地').selectOption('ming-border');await page.getByRole('button',{name:'预览命令'}).click();
 await expect(page.getByTestId('order-preview')).toContainText('620');await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByTestId('order-preview')).toHaveCount(0);await expect(page.getByTestId('day-number')).toHaveText('0');
 await march(page);await days(page,3);await expect(page.locator('.orders-panel .army-status')).toHaveText('交战');
 await days(page,15);await expect(page.locator('.orders-panel .army-status')).toHaveText('驻防');
 const armyCount=await page.locator('.army-strength strong').innerText();expect(Number(armyCount.replace(/\D/g,''))).toBeLessThan(1250);
 await expect(page.locator('.province-info')).toContainText('实际控制烈帝国');await expect(page.locator('.province-info')).toContainText('法理所属明反帝国');
 await drawer(page,'纪事');const occupation=page.locator('.event-occupation').first();await expect(occupation).toBeVisible();await occupation.locator('summary').click();await expect(occupation.locator('p')).not.toBeEmpty();
 await save(page);await page.reload();await expect(page.getByTestId('day-number')).toHaveText('18');await selectArmy(page);await expect(page.locator('.army-strength strong')).toHaveText(armyCount);
 await drawer(page,'舆图');await page.screenshot({path:info.outputPath('playable-map.png'),fullPage:true});
 expect(errors).toEqual([]);expect(failed).toEqual([]);expect(mimeErrors).toEqual([]);
});
test('主动撤退、调速与暂停、坏档不覆盖、导出导入',async({page},info)=>{
 await ready(page);await march(page);await days(page,3);
 await page.getByRole('button',{name:'主动撤退'}).click();await page.getByLabel('目的地').selectOption('lie-heart');await page.getByRole('button',{name:'预览命令'}).click();await expect(page.getByTestId('order-preview')).toContainText('追击');await page.getByRole('button',{name:'确认军令'}).click();await days(page,2);
 await expect(page.locator('.stationed')).toContainText('烈城辖区');
 await page.getByRole('button',{name:'12×',exact:true}).click();await page.getByRole('button',{name:'继续推演'}).click();await expect.poll(async()=>Number(await page.getByTestId('day-number').innerText())).toBeGreaterThan(7);await page.getByRole('button',{name:'暂停推演'}).click();
 await expect(page.getByRole('button',{name:'继续推演'})).toBeEnabled();const day=await page.getByTestId('day-number').innerText();await page.waitForTimeout(400);await expect(page.getByTestId('day-number')).toHaveText(day);await save(page);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).filter({visible:true}).click();const file=await downloaded;const exportPath=info.outputPath('test-export.save.json');await file.saveAs(exportPath);
 await page.getByLabel('选择导入存档').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from('{"format":"lieguoji-save","version":1}')});await page.getByRole('button',{name:'确认导入'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('存档已载入。',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('day-number')).toHaveText(day);await drawer(page,'存档');
 await page.getByLabel('选择导入存档').setInputFiles(exportPath);await page.getByRole('button',{name:'确认导入'}).click();await expect(page.getByText('存档已载入。',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
});
test('深链接、产物版本、地图手势和布局',async({page,context},info)=>{
 const response=await page.goto('/campaign/test');expect(response?.status()).toBe(200);await mapReady(page);await page.reload();await mapReady(page);
 const build=await page.request.get('/build.json');expect(build.ok()).toBeTruthy();const metadata=await build.json();expect(metadata.entry).toBe('world-studio');expect(metadata.scenarios).toContain('test-continent');if(process.env.GAME_EXPECTED_SHA)expect(metadata.commit).toBe(process.env.GAME_EXPECTED_SHA);
 await expect(page.getByRole('button',{name:'放大地图'})).toBeVisible();await page.getByRole('button',{name:'放大地图'}).click();await expect(page.locator('.map-tools')).toContainText('125%');await page.getByRole('button',{name:'归位',exact:true}).click();await expect(page.locator('.map-tools')).toContainText('100%');
 const box=(await page.getByTestId('map-canvas').boundingBox())!;
 const before=await page.getByTestId('map-canvas').screenshot();
 if(info.project.name==='desktop-chromium'){
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+75,box.y+box.height/2+35,{steps:8});await page.mouse.up();
 }else{
  const cdp=await context.newCDPSession(page);const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+50,y:y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40,y},{x:x+40,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-75,y},{x:x+75,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.map-tools')).not.toContainText('100%');await cdp.detach();
 }
 const after=await page.getByTestId('map-canvas').screenshot();expect(before.equals(after)).toBeFalsy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:info.outputPath('layout-gestures.png'),fullPage:true});
});
test('未来版本本地存档锁写，不能被默认新局覆盖',async({page})=>{
 await ready(page);await days(page,2);await save(page);
 const before=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const req=indexedDB.open('lieguoji-test-continent-v1',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('saves','readwrite');const store=tx.objectStore('saves');const current=store.get('current');let value:string;current.onsuccess=()=>{current.result.version=99;value=JSON.stringify(current.result);store.put(current.result,'current');};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>reject(tx.error);};}));
 await page.reload();await expect(page.getByRole('alert')).toContainText('版本不兼容');await drawer(page,'存档');
 await page.getByRole('button',{name:'保存',exact:true}).filter({visible:true}).click();await expect(page.getByRole('alert')).toContainText('锁定');await expect(page.getByText('当前推演已保存到此浏览器。',{exact:true})).toHaveCount(0);
 const after=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const req=indexedDB.open('lieguoji-test-continent-v1',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('saves','readonly');const r=tx.objectStore('saves').get('current');tx.oncomplete=()=>{db.close();resolve(JSON.stringify(r.result));};tx.onerror=()=>reject(tx.error);};}));expect(after).toBe(before);
});
test('另一标签的新存档不会被旧标签覆盖',async({page,context})=>{
 await ready(page);await days(page,2);await save(page);
 const stale=await context.newPage();await ready(stale);await expect(stale.getByTestId('day-number')).toHaveText('2');
 await days(page,3);await save(page);
 await drawer(stale,'存档');await stale.getByRole('button',{name:'保存',exact:true}).filter({visible:true}).click();await expect(stale.getByRole('alert')).toContainText('另一窗口');
 await stale.reload();await expect(stale.getByTestId('day-number')).toHaveText('5');await stale.close();
});
