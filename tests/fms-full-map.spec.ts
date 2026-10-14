import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect,test} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('FMS full-world terrain stays a cancellable edit and survives undo, redo, and reload',async({page},info)=>{
  test.setTimeout(300000);
  const errors:string[]=[],failed:string[]=[],workers:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push(request.url()));
  page.on('worker',worker=>workers.push(worker.url()));

  const evidence=resolve('.autopilot/fms-full-map-browser',info.project.name);
  await mkdir(evidence,{recursive:true});
  const screenshot=async(name:string)=>page.screenshot({path:resolve(evidence,`${name}.png`),fullPage:true});
  const response=await page.goto('/?fms=1');
  expect(response?.status()).toBe(200);
  const app=page.getByTestId('fms-app');
  await expect(app).toHaveAttribute('data-land-cells','0');
  const initialRevision=await app.getAttribute('data-revision');

  // Fix the same seed for both previews. The seed is a generation input; only
  // the confirmed height field, not this control's session value, is persisted.
  await page.getByLabel('整图种子',{exact:true}).fill('421730');
  await page.getByLabel('整图版图').selectOption('pangea');
  await screenshot('01-empty-ocean');

  // Cancel during computation, not only once a completed candidate is visible.
  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('region',{name:'整图地形预览'}).getByRole('button',{name:'取消',exact:true}).click();
  await expect(app).toHaveAttribute('data-terrain-phase','idle');
  await expect(app).toHaveAttribute('data-land-cells','0');

  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  const preview=page.getByRole('region',{name:'整图地形预览'});
  await expect(preview.getByRole('button',{name:'确认整图',exact:true})).toBeVisible({timeout:120000});
  await expect(preview).toContainText('联合大陆');
  await expect(preview).toContainText('陆地点');
  await expect(app).toHaveAttribute('data-land-cells','0');
  await expect(app).toHaveAttribute('data-revision',initialRevision!);
  await screenshot('02-candidate-before-cancel');
  await preview.getByRole('button',{name:'取消',exact:true}).click();
  await expect(app).toHaveAttribute('data-terrain-phase','idle');
  await expect(app).toHaveAttribute('data-land-cells','0');
  await expect(app).toHaveAttribute('data-revision',initialRevision!);
  await screenshot('03-cancel-restores-ocean');

  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await expect(preview.getByRole('button',{name:'确认整图',exact:true})).toBeVisible({timeout:120000});
  await preview.getByRole('button',{name:'查看原图',exact:true}).click();
  await expect(app).toHaveAttribute('data-show-original','true');
  await preview.getByRole('button',{name:'查看地形',exact:true}).click();
  await expect(app).toHaveAttribute('data-show-original','false');
  await preview.getByRole('button',{name:'确认整图',exact:true}).click();
  await expect(app).toHaveAttribute('data-terrain-phase','idle');
  const land=await expect.poll(async()=>Number(await app.getAttribute('data-land-cells')),{timeout:30000}).toBeGreaterThan(1000);
  void land;
  const confirmedLand=Number(await app.getAttribute('data-land-cells'));
  expect(Number(await app.getAttribute('data-revision'))).toBeGreaterThan(Number(initialRevision));
  await screenshot('04-confirmed-world');

  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(app).toHaveAttribute('data-land-cells','0');
  await page.getByRole('button',{name:'重做',exact:true}).click();
  await expect(app).toHaveAttribute('data-land-cells',String(confirmedLand));
  await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await expect(app).toHaveAttribute('data-dirty','false',{timeout:30000});
  const savedDigest=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((ok,no)=>{const request=indexedDB.open('lieguoji-fms-web-v1',1);request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});
    const stored=await new Promise<{checksum:string}>((ok,no)=>{const request=db.transaction('saves').objectStore('saves').get('current');request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});db.close();return stored.checksum;
  });
  await page.reload();
  await expect(app).toHaveAttribute('data-land-cells',String(confirmedLand),{timeout:60000});
  await expect(app).toHaveAttribute('data-dirty','false');
  await screenshot('05-restored-world');

  const restoredDigest=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((ok,no)=>{const request=indexedDB.open('lieguoji-fms-web-v1',1);request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});
    const stored=await new Promise<{checksum:string}>((ok,no)=>{const request=db.transaction('saves').objectStore('saves').get('current');request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});db.close();return stored.checksum;
  });
  expect(restoredDigest).toBe(savedDigest);
  const result={seed:'421730',template:'pangea',initialRevision,confirmedLand,savedDigest,restoredDigest,workers,errors,failed,project:info.project.name,
    scope:info.project.name==='mobile-chromium'?'mobile Chromium emulation, not iPhone or Safari':'desktop Chromium'};
  await writeFile(resolve(evidence,'result.json'),JSON.stringify(result,null,2),'utf8');
  await info.attach('fms-full-map-flow',{body:JSON.stringify(result),contentType:'application/json'});
  expect(workers.some(url=>/terrain\.worker/.test(url))).toBe(true);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('a default full-world map can found countries and advance live simulation',async({page},info)=>{
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?fms=1');
  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});
  const editor=page.getByTestId('fms-app');
  const landCells=Number(await editor.getAttribute('data-land-cells'));
  expect(landCells).toBeGreaterThan(1000);
  await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await expect(editor).toHaveAttribute('data-dirty','false',{timeout:30000});
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
  await page.getByLabel('战乱开局').check();
  await create(page,60);
  const app=page.getByTestId('culture47-app'),map=page.getByTestId('culture47-map');
  const countries=JSON.parse((await map.getAttribute('data-countries'))!);
  const cities=JSON.parse((await map.getAttribute('data-cities'))!);
  expect(countries).toHaveLength(6);
  expect(cities).toHaveLength(60);
  const initialPositions=await map.getAttribute('data-force-positions');
  await page.getByRole('button',{name:'继续时间',exact:true}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:90000}).toBeGreaterThanOrEqual(4);
  await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  await expect(app).toHaveAttribute('data-advancing','false');
  const positions=await map.getAttribute('data-force-positions'),tick=(await app.getAttribute('data-tick'))!;
  expect(positions).not.toBe(initialPositions);
  const result={seed:'1337',template:'continents',landCells,countryCount:countries.length,cityCount:cities.length,day:Number(await app.getAttribute('data-day')),tick,positions,errors,project:info.project.name};
  const evidence=resolve('.autopilot/fms-full-map-browser',info.project.name);
  await mkdir(evidence,{recursive:true});
  await page.screenshot({path:resolve(evidence,'06-full-world-playable.png'),fullPage:true});
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();
  await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
  await page.reload();
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
  await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(app).toHaveAttribute('data-tick',tick,{timeout:120000});
  await expect(map).toHaveAttribute('data-force-positions',positions!);
  await page.screenshot({path:resolve(evidence,'07-restored-live-world.png'),fullPage:true});
  await writeFile(resolve(evidence,'playable-result.json'),JSON.stringify(result,null,2),'utf8');
  expect(errors).toEqual([]);
});
