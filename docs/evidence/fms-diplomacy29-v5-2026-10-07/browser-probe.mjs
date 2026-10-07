import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const production=process.argv.includes('--production');
const out='.autopilot/war29-playable'+(production?'/production-check':'');fs.mkdirSync(out,{recursive:true});
const report={origin:production?'http://127.0.0.1:5214':'http://127.0.0.1:5213',scope:`real Chromium ${production?'production build':'dev'} UI and Worker on isolated synthetic test world; not native or phone acceptance`,errors:[],success:false};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(report.origin+'/?fms=1',{waitUntil:'networkidle',timeout:60000});
 const setup=production?await context.newPage():page;if(production)await setup.goto('http://127.0.0.1:5213/?fms=1',{waitUntil:'networkidle'});
 report.initial=await setup.evaluate(async()=>{
  const base='http://127.0.0.1:5213';
  const [{PlayClient},{grid},{saveRun},{saveFmsDocument}]=await Promise.all([import(base+'/src/fms/play/war29-client.ts'),import(base+'/src/fms/play/fixture.test-support.ts'),import(base+'/src/fms/play/war29-stores.ts'),import(base+'/src/fms/persistence.ts')]);
  const terrain=grid((x,y)=>{const d=((x-123)/98)**2+((y-120)/94)**2;return d<.94+.09*Math.sin(x/17)*Math.cos(y/24)?Math.round(35+23*Math.max(0,Math.sin(x/42)*Math.cos(y/38))):0;});
  const client=new PlayClient();
  const stamp=r=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});let r=(await client.send({type:'create',terrain,count:3,cityCount:24,relations:'peace'})).run;
  const [a,b]=r.world.nations.map(n=>n.id);r=(await client.send({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(r)})).run;
  await saveRun(r,null);await saveFmsDocument(terrain,null);client.close();return {version:r.version,engine:r.engine,id:r.id,goals:r.nativeWars.campaigns[0].goals};
 });
 if(production){
  // Export only the two synthetic databases from this fresh browser context.
  // No cross-origin script imports or relaxed browser security are needed.
  const fixture=await setup.evaluate(async()=>{
   const rows=[];for(const name of ['lieguoji-fms-web-v1','lieguoji-fms-war-v29'])rows.push(await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onerror=()=>reject(q.error);q.onsuccess=async()=>{const db=q.result,stores=[];for(const key of db.objectStoreNames)stores.push(await new Promise(done=>{const t=db.transaction(key),s=t.objectStore(key),keys=s.getAllKeys(),values=s.getAll();t.oncomplete=()=>done({name:key,keys:keys.result,values:values.result});}));const row={name,version:db.version,stores};db.close();resolve(row);};}));
   return JSON.stringify(rows,(_k,v)=>ArrayBuffer.isView(v)?{__testTypedArray:v.constructor.name,values:Array.from(v)}:v);
  });
  await page.evaluate(async fixture=>{const rows=JSON.parse(fixture,(_k,v)=>v?.__testTypedArray?new ({Int32Array,Uint32Array,Float32Array,Float64Array,Uint8Array,Uint16Array,Int16Array})[v.__testTypedArray](v.values):v);for(const row of rows){if(!row.stores.length)throw Error('Synthetic fixture database has no stores: '+row.name);}for(const row of rows)await new Promise((resolve,reject)=>{const q=indexedDB.open(row.name,row.version);q.onupgradeneeded=()=>{for(const s of row.stores)q.result.createObjectStore(s.name);};q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction(row.stores.map(s=>s.name),'readwrite');for(const s of row.stores)s.values.forEach((v,i)=>t.objectStore(s.name).put(v,s.keys[i]));t.oncomplete=()=>{d.close();resolve();};t.onabort=()=>reject(t.error);};});},fixture);await setup.close();
 }
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:/继续外交规则版/}).click();
 await expect(page.getByTestId('fms-play')).toHaveAttribute('data-run-version','29');
 await page.getByRole('button',{name:'战争',exact:true}).click();await expect(page.getByTestId('native-war-overview')).toBeVisible();
 const controls=page.getByTestId('diplomacy-settings');await controls.locator('summary').click();
 const worldToggle=controls.getByRole('checkbox',{name:'世界自动外交',exact:true});await expect(worldToggle).toBeChecked();await worldToggle.click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('关闭世界自动外交');await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(worldToggle).toBeChecked();
 await worldToggle.click();await dialog.getByRole('button',{name:'确认执行',exact:true}).click();
 await controls.locator('summary').click();await expect(worldToggle).not.toBeChecked();
 await controls.getByRole('spinbutton',{name:'最长战争期限（月）'}).fill('12');await controls.getByRole('button',{name:'预览战争期限'}).click();await expect(dialog).toContainText('12 个月');await dialog.getByRole('button',{name:'确认执行',exact:true}).click();
 await controls.locator('summary').click();await expect(controls.getByRole('spinbutton',{name:'最长战争期限（月）'})).toHaveValue('12');
 const nationToggle=controls.getByRole('checkbox').nth(1);report.changedNation=await nationToggle.getAttribute('aria-label');await nationToggle.click();await dialog.getByRole('button',{name:'确认执行',exact:true}).click();await controls.locator('summary').click();await expect(controls.getByRole('checkbox').nth(1)).not.toBeChecked();
 report.diplomacyUi={cancel:true,worldAuto:false,maximumMonths:12,nationAuto:false};
 await page.screenshot({path:out+'/war29-desktop.png'});report.goalPanel=await page.getByTestId('native-war-overview').innerText();
 await page.getByRole('button',{name:'＋1日',exact:true}).click();await expect(page.getByTestId('fms-play')).toHaveAttribute('data-day','1');
 const save=page.getByRole('button',{name:'保存进度',exact:true});await save.click();await expect(page.locator('.play-notice')).toContainText('已保存第 1 日');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:/继续外交规则版/}).click();await expect(page.getByTestId('fms-play')).toHaveAttribute('data-day','1');
 await page.getByRole('button',{name:'战争',exact:true}).click();await controls.locator('summary').click();await expect(worldToggle).not.toBeChecked();await expect(controls.getByRole('spinbutton',{name:'最长战争期限（月）'})).toHaveValue('12');await expect(controls.getByRole('checkbox').nth(1)).not.toBeChecked();report.settingsRestored=true;

 await expect(page.getByTestId('native-war-overview')).toBeVisible();report.restored=await page.getByTestId('native-war-overview').innerText();
 await page.setViewportSize({width:428,height:926});await expect(controls.getByRole('spinbutton',{name:'最长战争期限（月）'})).toBeVisible();await page.screenshot({path:out+'/war29-portrait.png'});report.portraitOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.getByRole('button',{name:'政治',exact:true}).click();await page.getByRole('button',{name:'讲和',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'讲和',exact:true}).click();await page.getByRole('button',{name:'确认执行',exact:true}).click();await expect(page.getByRole('button',{name:'讲和',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'战争',exact:true}).click();await expect(page.getByTestId('native-war-overview')).toContainText('上帝干预停战');await page.getByRole('button',{name:'保存进度',exact:true}).click();await expect(page.locator('.play-notice')).toContainText('已保存第 1 日');report.manualPeace=await page.getByTestId('native-war-overview').innerText();
 await page.screenshot({path:out+'/war29-peace-portrait.png'});
 await page.getByRole('button',{name:'‹ 绘图',exact:true}).click();await page.getByRole('button',{name:'退出推演',exact:true}).click();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('国家数量',{exact:true}).selectOption('3');await page.getByLabel('城市数量',{exact:true}).selectOption('24');await page.getByRole('button',{name:'从当前地图开新局',exact:true}).click();await expect(page.getByTestId('fms-play')).toHaveAttribute('data-run-version','29');await expect(page.getByTestId('fms-play')).toHaveAttribute('data-day','0');report.newWorldFromDrawing=true;
 if(report.errors.length||report.portraitOverflow)throw Error('UI errors or portrait overflow');report.success=true;await context.close();
}catch(e){report.failure=String(e);process.exitCode=1;}finally{await browser.close();fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
