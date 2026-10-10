import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {enter,create} from './fms-culture47-fixture';
import {grid} from '../src/fms/play/fixture.test-support';
import type {Culture47Request,Culture47Response} from '../src/fms/play/culture47.worker';

test('normal play births appear in the family and chronicle, continue while inspected, then cold restore',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await enter(page,'00000000-0000-4000-8000-00000000065b');await create(page,24);
 const app=page.getByTestId('culture47-app');await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.getByRole('button',{name:'查看大事记',exact:true}).click();
 const history=page.getByRole('region',{name:'文化世界史书'});await expect(history.locator('.c47-history-meta').filter({hasText:'出生'}).first()).toBeVisible({timeout:160000});
 await expect(page.getByRole('button',{name:'暂停时间',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');
 const row=history.locator('article').filter({has:page.locator('.c47-history-meta').filter({hasText:'出生'})}).first(),text=await row.locator('p').first().innerText();await row.locator('.c47-history-nations button').click();
 const houses=page.locator('.c47-houses');await houses.locator(':scope > summary').click();await expect(page.getByLabel('世代记录')).toContainText('位新生');
 const panels=houses.locator('[data-family-id] details');for(const panel of await panels.all())await panel.locator('summary').click();await expect(houses).toContainText('生于');
 const day=await app.getAttribute('data-day'),tick=await app.getAttribute('data-tick'),people=await houses.locator('.c47-family-people').allTextContents();await page.screenshot({path:info.outputPath('generations-desktop.png')});
 await page.setViewportSize({width:428,height:926});await page.screenshot({path:info.outputPath('generations-portrait.png')});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:90000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:90000});
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();await expect(history).toContainText(text);
 await history.locator('article').filter({hasText:text}).locator('.c47-history-nations button').click();await houses.locator(':scope > summary').click();expect(await houses.locator('.c47-family-people').allTextContents()).toEqual(people);
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(app).toHaveAttribute('data-day',String(Number(day)+1));expect(errors).toEqual([]);
 await info.attach('generations-play',{body:JSON.stringify({day,tick,birth:text,people,coldRestored:true,errors,physicalIphone:false}),contentType:'application/json'});
});

test('frozen fe7 keeps original families and no birth-rule upgrade when loaded in the new UI',async({page},info)=>{
 test.setTimeout(150000);await enter(page);const root=process.env.GAME_ARTIFACT_ROOT??'dist',asset=fs.readdirSync(root+'/assets').find(n=>/^engine-fe7a-.*\.js$/.test(n))!;expect(asset).toBeTruthy();
 const terrain=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),data={...terrain,triangles:[...terrain.triangles],elevations:[...terrain.elevations]};
 await page.evaluate(async({asset,data})=>{
  const worker=new Worker('/assets/'+asset,{type:'module'});let seq=0;const send=(command:Culture47Request)=>new Promise<Culture47Response>((ok,no)=>{const id=++seq;worker.onmessage=e=>{if(e.data.id===id&&!e.data.progress){if(e.data.error)no(Error(e.data.error));else ok(e.data);}};worker.onerror=e=>no(Error(e.message));worker.postMessage({id,command});});
  try{const result=await send({type:'create',opening:{terrain:{...data,triangles:new Uint32Array(data.triangles),elevations:new Int32Array(data.elevations)},count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}});if(result.display?.kind!=='full')throw Error('No complete frozen result');const journal=result.display.snapshot.journal;
   const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(journal,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as ArrayLike<number>):v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
   const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open('lieguoji-fms-culture47-newworld-v3',1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});await new Promise<void>((ok,no)=>{const tx=db.transaction('slots','readwrite'),s=tx.objectStore('slots');s.put({version:1,revision:1,checksum,journal},'current');s.put(1,'revision');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);});db.close();
  }finally{worker.terminate();}
 },{asset,data});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await page.getByRole('button',{name:'查看大事记',exact:true}).click();await page.locator('.c47-history-nations button').last().click();
 const houses=page.locator('.c47-houses');await houses.locator(':scope > summary').click();await expect(page.getByRole('button',{name:'自主分封：开',exact:true})).toBeVisible();await expect(page.getByLabel('世代记录')).toHaveCount(0);
 await page.getByRole('button',{name:'自主分封：开',exact:true}).click();await expect(page.getByRole('button',{name:'自主分封：关',exact:true})).toBeVisible();await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1');
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');
 await page.screenshot({path:info.outputPath('frozen-fe7-family-controls.png')});
});
