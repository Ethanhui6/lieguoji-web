import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const out='docs/evidence/fms-live-observation-v5-2026-10-08',fixture=JSON.parse(fs.readFileSync('.autopilot/live-ui46-created-test-save.json','utf8'));
const browser=await chromium.launch({headless:true});const results=[];
try{for(const [port,label] of [[5248,'before'],[5250,'after']]){
 const context=await browser.newContext({viewport:{width:428,height:926}}),page=await context.newPage();
 await page.goto(`http://127.0.0.1:${port}/?fms=1`,{waitUntil:'networkidle'});
 // The fixture was created through normal UI in a disposable context; never read user storage.
 await page.evaluate(value=>new Promise((resolve,reject)=>{value.run.terrain.triangles=new Uint32Array(Object.values(value.run.terrain.triangles));value.run.terrain.elevations=new Int32Array(Object.values(value.run.terrain.elevations));if(value.run.terrain.terrainLocks)value.run.terrain.terrainLocks=new Uint8Array(Object.values(value.run.terrain.terrainLocks));const req=indexedDB.open('lieguoji-fms-war-v46',1);req.onupgradeneeded=()=>req.result.createObjectStore('saves');req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(value,'current');tx.objectStore('saves').put(value.revision,'revision');tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);}),fixture);
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:/继续远征接应新版/}).click();await expect(page.getByTestId('fms-play')).toHaveAttribute('data-run-id',fixture.run.id);
 if(await page.getByRole('button',{name:'收起面板',exact:true}).isVisible())await page.getByRole('button',{name:'收起面板',exact:true}).click();
 await expect(page.locator('.play-panel')).toHaveCount(0);if(label==='after')await page.getByRole('button',{name:/^地图工具/}).click();await page.getByRole('button',{name:'全图',exact:true}).click();if(label==='after')await page.getByRole('button',{name:/^地图工具/}).click();
 if(label==='after'&&await page.getByRole('button',{name:'收起提示',exact:true}).isVisible())await page.getByRole('button',{name:'收起提示',exact:true}).click();
 await page.screenshot({path:`${out}/same-world-${label}.png`});
 const rects=await page.locator('.play-header,.play-news,.play-controls,.play-map-options,.play-zoom,.play-notice').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {class:e.className,x:r.x,y:r.y,w:r.width,h:r.height};}));
 results.push({label,port,runId:fixture.run.id,day:fixture.run.world.day,viewport:{width:428,height:926},rects,chromeAreaFraction:rects.reduce((s,r)=>s+r.w*r.h,0)/(428*926)});
 await context.close();
}}finally{await browser.close();}
fs.writeFileSync(out+'/same-world-comparison.json',JSON.stringify({scope:'Same saved world, same fit camera, desktop portrait emulation. Bounding-box area estimate, not original-game visual equivalence or GPU timing.',results},null,2));console.log(JSON.stringify(results.map(({label,chromeAreaFraction})=>({label,chromeAreaFraction}))));

