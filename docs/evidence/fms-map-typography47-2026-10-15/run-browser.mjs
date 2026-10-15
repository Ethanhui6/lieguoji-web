import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const stage=process.env.TYPO_STAGE??'before',url=process.env.TYPO_URL??'http://127.0.0.1:5330',root='.autopilot/fms-map-typography47-browser';
const browser=await chromium.launch({headless:true});
const encoded=(key,value)=>ArrayBuffer.isView(value)?{$typed:value.constructor.name,values:[...value]}:value;
const revive=(key,value)=>value?.$typed?new ({Uint32Array,Int32Array,Uint8Array}[value.$typed])(value.values):value;
try{for(const [device,viewport] of [['desktop',{width:1440,height:960}],['portrait',{width:428,height:926}]] ){
 const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const dir=`${root}/${device}/${stage}`;await mkdir(dir,{recursive:true});
 const goto=await page.goto(url+'/?fms=1&fmsDiagnostics=1');assert.equal(goto.status(),200);
 if(stage==='before'){
  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});
  await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
  await page.getByLabel('战乱开局').uncheck();await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
  await page.getByTestId('culture47-map').waitFor({timeout:120000});await page.getByRole('button',{name:'保存文化世界',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.c47-notice')?.textContent.includes('已保存'),{},{timeout:30000});
  const storage=await page.evaluate(async()=>{
   const result=[];for(const name of ['lieguoji-fms-web-v1','lieguoji-fms-culture47-generations-v1']){
    const db=await new Promise((ok,no)=>{const r=indexedDB.open(name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
    const store=db.objectStoreNames[0],rows=await new Promise((ok,no)=>{const tx=db.transaction(store),s=tx.objectStore(store),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>ok(keys.result.map((key,i)=>[key,values.result[i]]));tx.onerror=()=>no(tx.error);});db.close();result.push({name,store,rows});
   }return result;
  });await writeFile(`${root}/${device}/fixture.json`,JSON.stringify(storage,encoded));
 }else{
  const storage=JSON.parse(await readFile(`${root}/${device}/fixture.json`,'utf8'),revive);
  await page.evaluate(async storage=>{for(const {name,store,rows}of storage){const db=await new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store);};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});await new Promise((ok,no)=>{const t=db.transaction(store,'readwrite');for(const [key,value]of rows)t.objectStore(store).put(value,key);t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});db.close();}},storage);
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:120000});await page.getByTestId('culture47-map').waitFor({timeout:120000});
 }
 const map=page.getByTestId('culture47-map'),app=page.getByTestId('culture47-app');
 const state=async()=>page.evaluate(()=>{const map=document.querySelector('[data-testid=culture47-map]'),app=document.querySelector('[data-testid=culture47-app]');return{tick:app.dataset.tick,projection:JSON.parse(map.dataset.projection),cities:JSON.parse(map.dataset.cities),countries:JSON.parse(map.dataset.countries),forces:map.dataset.forcePositions,anchors:map.dataset.countryLabels?JSON.parse(map.dataset.countryLabels):null,layout:map.dataset.mapLabelLayout?JSON.parse(map.dataset.mapLabelLayout):null};});
 await page.getByRole('button',{name:'显示全图',exact:true}).click();await page.waitForTimeout(300);const full=await state();await page.screenshot({path:`${dir}/01-full.png`});
 const target=full.cities.find(c=>c.capital),b=await map.boundingBox(),centre={x:b.width/2,y:b.height/2};
 // Move the same actual capital to the same viewport centre via the UI gesture.
 const dx=centre.x-target.x,dy=centre.y-target.y,start={x:b.x+b.width*.67,y:b.y+b.height*.60};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:18});await page.mouse.up();await page.waitForTimeout(200);
 const fit=full.projection.zoom,views=[];let current=1;
 for(const factor of [4,16,40]){
  await page.mouse.move(b.x+centre.x,b.y+centre.y);let remaining=Math.log(factor/current);
  while(remaining>1e-8){const delta=Math.min(1,remaining);await page.mouse.wheel(0,-delta/.002);await page.waitForTimeout(150);remaining-=delta;}
  current=factor;await page.waitForTimeout(250);const s=await state();assert.ok(Math.abs(s.projection.zoom/fit-factor)<.01);views.push({factor,...s});await page.screenshot({path:`${dir}/zoom-${factor}.png`});
 }
 // Pan does not move any world's label anchor or replace city/territory data.
 let pan=null,selected=null,reloaded=null;
 if(stage==='after'){
  await page.getByRole('button',{name:'显示全图',exact:true}).click();await page.waitForTimeout(200);const a=await state();
  const px=b.x+b.width*.62,py=b.y+b.height*.59;await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+24,py+17,{steps:12});await page.mouse.up();await page.waitForTimeout(250);const z=await state();
  assert.deepEqual(z.anchors,a.anchors);assert.equal(z.tick,a.tick);assert.equal(z.forces,a.forces);
  assert.ok(a.layout.countries.length>0);assert.equal(z.layout.countries.length,a.layout.countries.length);
  for(let i=0;i<a.layout.countries.length;i++){assert.ok(Math.abs(z.layout.countries[i].x-a.layout.countries[i].x-24)<.05);assert.ok(Math.abs(z.layout.countries[i].y-a.layout.countries[i].y-17)<.05);}
  pan={dx:24,dy:17,stableAnchors:a.anchors.length,countryBoxes:a.layout.countries.length};
  const city=z.cities.find(c=>c.x>30&&c.x<b.width-50&&c.y>150&&c.y<b.height-140);
  assert.ok(city,'Need a real clickable city');await page.mouse.click(b.x+city.x,b.y+city.y);await page.getByRole('complementary',{name:'文化与国家详情'}).waitFor();
  assert.ok((await page.getByRole('complementary',{name:'文化与国家详情'}).textContent()).includes(city.name));selected={id:city.id,name:city.name};await page.getByRole('button',{name:'收起详情',exact:true}).click();
  // Two view switches must rebuild only the visual style, not simulation.
  const terrain=page.getByRole('button',{name:'切换地形地图',exact:true});await terrain.click();assert.equal(await terrain.getAttribute('aria-pressed'),'true');await page.screenshot({path:`${dir}/terrain.png`});await terrain.click();assert.equal(await terrain.getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[data-testid=culture47-app]')?.dataset.tick)>0,{},{timeout:60000});
  await page.getByRole('button',{name:'暂停时间',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=culture47-app]')?.dataset.advancing==='false',{},{timeout:30000});await page.waitForTimeout(400);const saved=await state();
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.c47-notice')?.textContent.includes('已保存'),{},{timeout:30000});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:120000});await map.waitFor({timeout:120000});const restored=await state();assert.equal(restored.tick,saved.tick);assert.equal(restored.forces,saved.forces);reloaded={tick:saved.tick,exactForces:true};
 }
 assert.deepEqual(errors,[]);const result={stage,device,viewport,full,views,pan,selected,reloaded,errors,scope:'Fresh isolated Chromium context, synthetic default1337/continents world; portrait is emulation, not iPhone or original visual equivalence.'};await writeFile(`${dir}/result.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({stage,device,tick:full.tick,cityCount:full.cities.length,pan,selected,reloaded,errors}));await context.close();
}}finally{await browser.close();}
