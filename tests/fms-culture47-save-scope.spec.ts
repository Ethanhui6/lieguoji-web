import {test,expect} from '@playwright/test';
import {enter} from './fms-culture47-fixture';

for(const scope of ['original','new'] as const)test(`future ${scope} slot cannot leak its lock or be overwritten by new-world creation`,async({page})=>{
 test.setTimeout(120000);await enter(page);
 const database=scope==='original'?'lieguoji-fms-culture47-zh-journal-v2':'lieguoji-fms-culture47-newworld-v2';
 await page.evaluate(async name=>{
  const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
  await new Promise<void>((ok,no)=>{const tx=db.transaction('slots','readwrite');tx.objectStore('slots').put({version:99},'current');tx.objectStore('slots').put(1,'revision');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);});db.close();
 },database);
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('未来格式');
 await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('城市数量',{exact:true}).selectOption('24');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 if(scope==='original'){
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});
  await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1');
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');
 }else{
  await expect(page.getByRole('button',{name:'从当前地图创建文化世界',exact:true})).toBeEnabled();
  await expect(page.getByTestId('culture47-map')).toHaveCount(0);await expect(page.locator('.c47-notice')).toContainText('未来格式');
 }
 expect(await page.evaluate(async name=>{
  const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
  const saved=await new Promise((ok,no)=>{const tx=db.transaction('slots','readonly'),q=tx.objectStore('slots').get('current');tx.oncomplete=()=>ok(q.result);tx.onerror=()=>no(tx.error);});db.close();return saved;
 },database)).toEqual({version:99});
});
