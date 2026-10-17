import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const [port,label,ax,ay]=process.argv.slice(2),out=`.autopilot/fms-coastline47/zoom-${label}`;fs.mkdirSync(out,{recursive:true});
const revive=(_k,v)=>v?.$typed?new ({Uint32Array,Int32Array,Uint8Array}[v.$typed])(v.values):v;
const storage=JSON.parse(fs.readFileSync('.autopilot/fms-map-typography47-browser/desktop/fixture.json','utf8'),revive).filter(d=>d.name==='lieguoji-fms-web-v1');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${port}/?fms=1&fmsDiagnostics=1`);await page.waitForLoadState('networkidle');
 await page.evaluate(async storage=>{for(const {name,store,rows}of storage){const db=await new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});await new Promise((ok,no)=>{const t=db.transaction(store,'readwrite');for(const [k,v]of rows)t.objectStore(store).put(v,k);t.oncomplete=ok;t.onerror=()=>no(t.error);});db.close();}},storage);
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();await page.getByTestId('culture47-map').waitFor({timeout:120000});
 const map=page.getByTestId('culture47-map');await page.waitForTimeout(800);
 await page.getByRole('button',{name:'显示全图',exact:true}).click();await page.waitForTimeout(300);
 const read=()=>map.evaluate(node=>({projection:JSON.parse(node.dataset.projection),tick:document.querySelector('[data-testid=culture47-app]')?.dataset.tick,coastline:node.dataset.coastline?JSON.parse(node.dataset.coastline):null}));
 const initial=await read(),fit=initial.projection.zoom,bounds=await map.boundingBox();
 const anchor={x:Number(ax??bounds.width/2),y:Number(ay??bounds.height/2)};
 await page.mouse.move(bounds.x+anchor.x,bounds.y+anchor.y);const views=[];let current=1;
 for(const factor of [1,4,16,40]){let remaining=Math.log(factor/current);while(remaining>1e-8){const delta=Math.min(1,remaining);await page.mouse.wheel(0,-delta/.002);await page.waitForTimeout(150);remaining-=delta;}current=factor;await page.waitForTimeout(300);const view=await read();assert.ok(Math.abs(view.projection.zoom/fit-factor)<.01);assert.equal(view.tick,initial.tick);views.push({factor,projection:view.projection,tick:view.tick});await page.screenshot({path:out+`/zoom-${factor}.png`});}
 assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/results.json',JSON.stringify({port,label,build:await page.evaluate(()=>fetch('/build.json').then(r=>r.json()).then(b=>({commit:b.commit,engine:b.culture47Fingerprint}))),anchor,coastline:initial.coastline,views,errors},null,2));
 console.log(JSON.stringify({label,coastline:initial.coastline,views:views.map(v=>[v.factor,v.projection.zoom.toFixed(4),v.projection.x.toFixed(1),v.projection.y.toFixed(1),v.tick])}));
}finally{await browser.close();}
