import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {enter,create} from './fms-culture47-fixture';

test('played culture world exposes original cell border contacts',async({page},info)=>{
 test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await enter(page);await create(page,24);
 const app=page.getByTestId('culture47-app'),canvas=page.getByTestId('culture47-map');
 await expect(canvas).toHaveAttribute('data-border-cells',/"source":"cells"/,{timeout:30000});
 const digest=JSON.parse(await canvas.getAttribute('data-border-cells')??'null');
 expect(digest.source).toBe('cells');expect(digest.contacts).toBeGreaterThan(0);expect(digest.provinces.length).toBeGreaterThan(0);
 expect(digest.contacts).toBe(digest.provinces.reduce((n:number,p:{contacts:number})=>n+p.contacts,0));
 for(const p of digest.provinces){expect(p.contacts).toBeGreaterThanOrEqual(0);expect(Array.isArray(p.neighbors)).toBe(true);expect(typeof p.sea).toBe('boolean');expect(typeof p.feature).toBe('number');expect(typeof p.connected).toBe('boolean');}
 const day=await app.getAttribute('data-day');
 await page.getByRole('button',{name:'推进一天',exact:true}).click();
 await expect(app).toHaveAttribute('data-day',String(Number(day)+1),{timeout:90000});
 await expect(canvas).toHaveAttribute('data-border-cells',/"source":"cells"/);
 const dir='docs/evidence/fms-celldata-projection55-2026-10-19';mkdirSync(dir,{recursive:true});
 const shot=dir+'/border-cells.png';await canvas.screenshot({path:shot});await canvas.screenshot({path:info.outputPath('border-cells.png')});
 writeFileSync(dir+'/browser-log.json',JSON.stringify({dayBefore:Number(day),dayAfter:Number(day)+1,errors,digest:{source:digest.source,contacts:digest.contacts,provinces:digest.provinces.length,sample:digest.provinces[0]}},null,2));
 expect(errors).toEqual([]);
});
