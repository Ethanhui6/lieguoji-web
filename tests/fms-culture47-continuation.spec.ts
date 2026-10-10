import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {enter} from './fms-culture47-fixture';
import {grid} from '../src/fms/play/fixture.test-support';

test('original frozen 998-day world forks through UI, crosses 1000, cold restores and leaves original intact',async({page},info)=>{
 test.setTimeout(1200000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);const d=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),data={...d,triangles:[...d.triangles],elevations:[...d.elevations]};
 const asset=fs.readdirSync(process.env.GAME_ARTIFACT_ROOT??'dist').includes('assets')?fs.readdirSync((process.env.GAME_ARTIFACT_ROOT??'dist')+'/assets').find(n=>/^engine-dfd9-.*\.js$/.test(n)):undefined;expect(asset).toBeTruthy();
 await page.evaluate(async({data,asset})=>{
  const worker=new Worker('/assets/'+asset,{type:'module'});let id=0;
  const send=(command:unknown)=>new Promise<Record<string,unknown>>((resolve,reject)=>{const request=++id;worker.onmessage=e=>{if(e.data.id!==request||e.data.progress)return;if(e.data.error)reject(Error(e.data.error));else resolve(e.data);};worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:request,command});});
  try{
   const created=await send({type:'create',opening:{terrain:{...data,triangles:new Uint32Array(data.triangles),elevations:new Int32Array(data.elevations)},count:2,cityCount:6,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}});
   const packet=created.display as {snapshot:{journal:Record<string,unknown>}};let journal=packet.snapshot.journal,sequence=0;
   for(let day=0;day<998;){const take=Math.min(4,998-day),r=await send({type:'advance-batch',ticks:take*120,sequence});journal={...(r.display as {journal:Record<string,unknown>}).journal,opening:journal.opening};sequence+=take;day+=take;}
   const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(journal,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as ArrayLike<number>):v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
   const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open('lieguoji-fms-culture47-zh-journal-v2',1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
   await new Promise<void>((ok,no)=>{const t=db.transaction('slots','readwrite');t.objectStore('slots').put({version:1,revision:1,checksum,journal},'current');t.objectStore('slots').put(1,'revision');t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});db.close();
  }finally{worker.terminate();}
 },{data,asset});
 const read=()=>page.evaluate(async()=>{const result:Record<string,unknown>={};for(const name of ['lieguoji-fms-culture47-zh-journal-v2','lieguoji-fms-culture47-longplay-v1']){const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});result[name]=await new Promise((ok,no)=>{const t=db.transaction('slots','readonly'),q=t.objectStore('slots').getAll();t.oncomplete=()=>ok(JSON.stringify(q.result,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as ArrayLike<number>):v));t.onerror=()=>no(t.error);});db.close();}return result;});
 const before=await read();await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:360000});
 const app=page.getByTestId('culture47-app');await expect(app).toHaveAttribute('data-day','998',{timeout:360000});
 await page.getByRole('button',{name:'建立续玩副本',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('续玩副本已保存',{timeout:360000});
 for(let day=999;day<=1001;day++){await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(app).toHaveAttribute('data-day',String(day),{timeout:60000});}
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});
 await page.screenshot({path:info.outputPath('old-world-continued-day1001.png')});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:360000});await expect(app).toHaveAttribute('data-day','1001',{timeout:360000});
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(app).toHaveAttribute('data-day','1002',{timeout:60000});await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});
 const after=await read();expect(after['lieguoji-fms-culture47-zh-journal-v2']).toEqual(before['lieguoji-fms-culture47-zh-journal-v2']);
 const rows=JSON.parse(after['lieguoji-fms-culture47-longplay-v1'] as string);expect(rows.filter((r:{journal?:{version:number}})=>r.journal?.version===1)).toHaveLength(1);expect(errors).toEqual([]);
 await info.attach('continuation-evidence',{body:JSON.stringify({originalDays:998,restoredDays:1001,continuedDays:1002,originalUnchanged:true,archivedSource:true,errors,physicalIphone:false}),contentType:'application/json'});
});
