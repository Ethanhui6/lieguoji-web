import {expect,test} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('random seeds change real terrain, manual seeds reproduce it',async({page})=>{
 test.setTimeout(180000);await page.goto('/?fms=1');
 const input=page.getByLabel('整图种子',{exact:true}),random=page.getByLabel('每次随机');
 await expect(random).toBeChecked();
 const initial=await input.inputValue();
 const generate=async()=>{
  await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
  await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await expect(page.getByTestId('fms-app')).toHaveAttribute('data-dirty','false');
  const heights=await page.evaluate(async()=>{
   const db=await new Promise<IDBDatabase>((ok,no)=>{const r=indexedDB.open('lieguoji-fms-web-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
   const heights=await new Promise<number[]>((ok,no)=>{const r=db.transaction('saves').objectStore('saves').get('current');r.onsuccess=()=>ok(Array.from(r.result.document.elevations));r.onerror=()=>no(r.error);});db.close();return heights;
  });
  await page.getByRole('button',{name:'撤销',exact:true}).click();return heights;
 };
 const first=await generate(),firstSeed=await input.inputValue();expect(firstSeed).not.toBe(initial);
 const second=await generate();expect(await input.inputValue()).not.toBe(firstSeed);expect(second).not.toEqual(first);
 await input.fill(firstSeed);await expect(random).not.toBeChecked();expect(await generate()).toEqual(first);
 await page.getByRole('button',{name:'换一个种子',exact:true}).click();expect(await input.inputValue()).not.toBe(firstSeed);await expect(random).not.toBeChecked();
});

test('current culture world shows real marching attack arrows without legacy combat state',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);await create(page);
 await page.getByRole('button',{name:'继续时间',exact:true}).click();
 const canvas=page.getByTestId('culture47-map');
 await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-attack-arrows')??'[]').length,{timeout:90000}).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('attack-arrows.png'),fullPage:true});expect(errors).toEqual([]);
});
