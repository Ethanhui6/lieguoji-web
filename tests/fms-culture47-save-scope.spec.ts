import {test,expect,type Page} from '@playwright/test';
import {enter} from './fms-culture47-fixture';

const databases={
 original:'lieguoji-fms-culture47-zh-journal-v2',
 previous:'lieguoji-fms-culture47-newworld-v2',
 copy:'lieguoji-fms-culture47-retirement-copy-v1',
 fresh:'lieguoji-fms-culture47-newworld-v3',
 longplay:'lieguoji-fms-culture47-longplay-v1',
 new:'lieguoji-fms-culture47-generations-v1',
} as const;
async function slots(page:Page,database:string){return page.evaluate(async database=>{
 const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(database,1);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
 try{return await new Promise<unknown[]>((ok,no)=>{const tx=db.transaction('slots'),store=tx.objectStore('slots'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>ok(keys.result.map((key,i)=>[key,values.result[i]]));tx.onerror=()=>no(tx.error);});}finally{db.close();}
},database);}

for(const scope of Object.keys(databases) as (keyof typeof databases)[])test(`future ${scope} slot cannot leak its lock or be overwritten by new-world creation`,async({page})=>{
 test.setTimeout(120000);await enter(page);
 const database=databases[scope];
 await page.evaluate(async name=>{
  const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
  await new Promise<void>((ok,no)=>{const tx=db.transaction('slots','readwrite');tx.objectStore('slots').put({version:99},'current');tx.objectStore('slots').put(1,'revision');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);});db.close();
 },database);
 const before=await slots(page,database);expect(before).toEqual([['current',{version:99}],['revision',1]]);
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('未来格式');
 await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('城市数量',{exact:true}).selectOption('24');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 if(scope!=='new'){
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});
  await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1');
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');
  const current=await slots(page,databases.new);expect(current).toHaveLength(2);expect(current).toEqual(expect.arrayContaining([['revision',1],['current',expect.objectContaining({version:1,revision:1,journal:expect.objectContaining({actions:expect.arrayContaining([{kind:'advance',ticks:120}])})})]]));
 }else{
  await expect(page.getByRole('button',{name:'从当前地图创建文化世界',exact:true})).toBeEnabled();
  await expect(page.getByTestId('culture47-map')).toHaveCount(0);await expect(page.locator('.c47-notice')).toContainText('未来格式');
 }
 expect(await slots(page,database)).toEqual(before);
});
