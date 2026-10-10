import {expect,type Page} from '@playwright/test';
import {grid} from '../src/fms/play/fixture.test-support';
export async function enter(page:Page,worldId?:string){
 await page.goto('/campaign/culture?fms=1');
 const d=grid((x,y)=>x>0&&x<250&&y>0&&y<250?45:0);if(worldId)d.worldId=worldId;const data={...d,triangles:[...d.triangles],elevations:[...d.elevations]};
 await page.evaluate(async data=>{
  const document={...data,triangles:new Uint32Array(data.triangles),elevations:new Int32Array(data.elevations)},base={format:'lieguoji-fms-document',version:1,storedRevision:1,storedAt:'2026-10-08T00:00:00.000Z',document:data};
  const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(base))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open('lieguoji-fms-web-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('saves');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
  await new Promise<void>((ok,no)=>{const t=db.transaction('saves','readwrite');t.objectStore('saves').put({...base,document,checksum},'current');t.objectStore('saves').put(1,'revision');t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});db.close();
 },data);
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await expect(page.getByRole('heading',{name:'让文明从你的地图诞生'})).toBeVisible();
}
export async function create(page:Page,cities=60){await page.getByLabel('城市数量',{exact:true}).selectOption(String(cities));await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});}
