import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const out='docs/evidence/fms-live-observation-v5-2026-10-08';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out+'/video',size:{width:1440,height:1000}}});
const page=await context.newPage(),origin='http://127.0.0.1:5250';
const result={origin,scope:'Disposable Chromium context, fresh ordinary UI world. No user save or user tab touched.',passed:false,errors:[],consoleErrors:[],httpFailures:[],observations:[]};
page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});page.on('response',r=>{if(r.status()>=400)result.httpFailures.push({url:r.url(),status:r.status()});});
const play=page.getByTestId('fms-play'),canvas=page.getByTestId('fms-play-canvas');
const tick=async()=>Number(await canvas.getAttribute('data-sim-tick')??0);
const live=async(name,act)=>{await act();await expect(play).toHaveAttribute('data-playing','true');const before=await tick();await expect.poll(tick,{timeout:10000}).toBeGreaterThan(before+12);result.observations.push({name,before,after:await tick()});};
const save=async()=>{await page.getByRole('button',{name:'保存进度',exact:true}).click();await expect(page.locator('.play-notice')).toContainText('已保存第');};
const readTestSave=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('lieguoji-fms-war-v46');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('saves','readonly'),r=tx.objectStore('saves').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();};req.onerror=()=>reject(req.error);}));
try{
 await page.goto(origin+'/?fms=1',{waitUntil:'networkidle'});result.build=await(await page.request.get(origin+'/build.json')).json();
 await page.getByRole('button',{name:'绘图设置',exact:true}).click();await page.getByRole('checkbox',{name:'保留已画海岸',exact:true}).uncheck();await page.getByRole('button',{name:'放置原作地形',exact:true}).click();await page.locator('.fms-map canvas').click({position:{x:720,y:410}});
 await expect(page.getByRole('button',{name:'确认原作地形',exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'确认原作地形',exact:true}).click();await expect(page.getByTestId('fms-app')).toHaveAttribute('data-terrain-phase','idle');await page.locator('.fms-save').click();await expect(page.getByTestId('fms-app')).toHaveAttribute('data-dirty','false');
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('国家数量',{exact:true}).selectOption('6');await page.getByLabel('城市数量',{exact:true}).selectOption('60');await page.getByRole('button',{name:'从当前地图开新局',exact:true}).click();await expect(play).toHaveAttribute('data-run-version','46',{timeout:60000});
 await expect(page.locator('.play-panel')).toHaveCount(0);await expect(page.getByRole('button',{name:'顶部大事记'})).toContainText('本局开篇');
 await page.getByRole('button',{name:'大事记',exact:true}).click();await expect(page.locator('.play-opening-history article')).toHaveCount(6);await expect(page.locator('.play-opening-history')).toContainText('国名采用现名');
 await page.getByRole('button',{name:'收起面板',exact:true}).click();await save();const initial=await readTestSave();result.initialSaveKeys=Object.keys(initial);fs.writeFileSync('.autopilot/live-ui46-created-test-save.json',JSON.stringify(initial));
 await page.getByRole('button',{name:'开始时间',exact:true}).click();
 await live('political-details',()=>page.getByRole('button',{name:'政治',exact:true}).click());
 await live('country-select',async()=>{await page.getByLabel('查看国家',{exact:true}).selectOption({index:1});});
 await live('army-details',()=>page.getByRole('button',{name:'军事',exact:true}).click());
 await live('naval-details',()=>page.getByRole('button',{name:'海军',exact:true}).click());
 await live('war-details',()=>page.getByRole('button',{name:'战争',exact:true}).click());
 await live('history-details',()=>page.getByRole('button',{name:'大事记',exact:true}).click());
 await live('top-history',()=>page.getByRole('button',{name:'顶部大事记',exact:true}).click());
 await page.getByRole('button',{name:'收起面板',exact:true}).click();
 await live('layers',async()=>{await page.getByRole('button',{name:/^地图工具/}).click();await page.getByRole('button',{name:'地形',exact:true}).click();await page.getByRole('button',{name:'政区',exact:true}).click();});
 await page.getByRole('button',{name:/^地图工具/}).click();if(await page.locator('.play-panel').isVisible())await page.getByRole('button',{name:'收起面板',exact:true}).click();
 await live('map-tap',()=>canvas.click({position:{x:690,y:480}}));
 await page.getByRole('button',{name:'政治',exact:true}).click();if(!await page.getByLabel('查看国家',{exact:true}).isVisible())await page.getByRole('button',{name:'政治',exact:true}).click();
 await page.getByRole('button',{name:'✎ 自定义国家与地名',exact:true}).click();await expect(page.getByRole('button',{name:'取消编辑',exact:true})).toBeVisible();await expect(play).toHaveAttribute('data-playing','false');const frozen=await tick();await page.waitForTimeout(600);expect(await tick()).toBe(frozen);result.editPauses=true;
 await page.getByRole('button',{name:'取消编辑',exact:true}).click();
 const policyBefore=await page.getByLabel('国家政策',{exact:true}).inputValue();await page.getByRole('button',{name:'开始时间',exact:true}).click();await page.getByLabel('国家政策',{exact:true}).selectOption(policyBefore==='military'?'civilian':'military');await expect(page.getByRole('dialog',{name:'命令确认'})).toBeVisible();const previewTick=await tick();await page.waitForTimeout(500);expect(await tick()).toBe(previewTick);await page.getByRole('button',{name:'取消',exact:true}).click();expect(await page.getByLabel('国家政策',{exact:true}).inputValue()).toBe(policyBefore);result.livePreviewCancel=true;
 await page.getByRole('button',{name:'收起面板',exact:true}).click();await page.getByRole('button',{name:'政治',exact:true}).click();await expect(play).toHaveAttribute('data-playing','false');await page.getByRole('button',{name:'收起面板',exact:true}).click();
 // Reversal and repeated tabs do not remount the outer sheet or start time.
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'政治',exact:true}).click();await page.getByRole('button',{name:'收起面板',exact:true}).click();}
 await expect(page.locator('.play-panel')).toHaveCount(0);await expect(play).toHaveAttribute('data-playing','false');
 await page.screenshot({path:out+'/desktop-map.png'});
 await save();const savedDay=await play.getAttribute('data-day');await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:/继续远征接应新版/}).click();await expect(play).toHaveAttribute('data-day',savedDay);await expect(play).toHaveAttribute('data-playing','false');result.saveRefresh=true;
 await page.getByRole('button',{name:'大事记',exact:true}).click();await expect(page.locator('.play-opening-history article')).toHaveCount(6);result.noDuplicatedOpening=true;
 await page.setViewportSize({width:428,height:926});await page.screenshot({path:out+'/portrait-history.png'});result.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.getByRole('button',{name:'收起面板',exact:true}).click();await expect(page.locator('.play-panel')).toHaveCount(0);await page.getByRole('button',{name:'收起提示'}).click().catch(()=>{});await page.screenshot({path:out+'/portrait-map.png'});
 const rects=await page.locator('.play-header,.play-news,.play-controls,.play-map-options,.play-zoom').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {class:e.className,x:r.x,y:r.y,w:r.width,h:r.height};}));result.chrome=rects;result.chromeAreaFraction=rects.reduce((s,r)=>s+r.w*r.h,0)/(428*926);
 await expect(page.locator('.play-zoom')).toBeHidden();await page.getByRole('button',{name:/^地图工具/}).click();await expect(page.getByRole('button',{name:'放大推演地图'})).toBeVisible();await page.getByRole('button',{name:/^地图工具/}).click();await expect(page.locator('.play-zoom')).toBeHidden();result.mobileToolsCollapse=true;
 await page.getByRole('button',{name:'大事记',exact:true}).click();let box=await page.locator('.play-panel-title').boundingBox();const x=box.x+box.width/2,y=box.y+22;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+12,{steps:4});await page.mouse.up();await expect(page.locator('.play-panel')).toBeVisible();await expect.poll(()=>page.locator('.play-panel').evaluate(e=>getComputedStyle(e).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');result.shortDragReturns=true;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+105,{steps:12});await page.mouse.up();await expect(page.locator('.play-panel')).toHaveCount(0);result.swipeDismiss=true;
 await page.getByRole('button',{name:'大事记',exact:true}).focus();await page.keyboard.press('Enter');result.keyboardMotion=await page.locator('.play-panel').evaluate(e=>getComputedStyle(e).transitionDuration);expect(result.keyboardMotion).toBe('0s');await page.getByRole('button',{name:'收起面板',exact:true}).click();await expect(page.locator('.play-panel')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'大事记',exact:true}).click();result.reducedMotion=await page.locator('.play-panel').evaluate(e=>({animation:getComputedStyle(e).animationName,transition:getComputedStyle(e).transitionDuration}));
 await page.getByRole('button',{name:'收起面板',exact:true}).click();await expect(page.locator('.play-panel')).toHaveCount(0);
 if(result.errors.length||result.consoleErrors.length||result.httpFailures.length||result.mobileOverflow)throw Error('Browser errors or overflow');result.passed=true;
}catch(e){result.failure=String(e);process.exitCode=1;await page.screenshot({path:out+'/browser-failure.png'}).catch(()=>{});}
finally{await context.close();await browser.close();result.video=await page.video()?.path();fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
