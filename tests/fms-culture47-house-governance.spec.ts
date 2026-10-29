import {tool} from './fms-culture47-fixture';
import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('ordinary play creates households monthly, keeps details running and saves the autonomy setting',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page,'00000000-0000-4000-8000-00000000065b');await page.getByLabel('国家数量',{exact:true}).selectOption('2');await create(page,24);
 const app=page.getByTestId('culture47-app');
 await tool(page,'查看大事记');const history=page.getByRole('region',{name:'文化世界史书'});
 await history.locator('.c47-history-nations button').last().click();const houses=page.locator('.c47-houses');await houses.locator(':scope > summary').click();
 await expect(houses.locator('[data-family-id]')).toHaveCount(1);await expect(page.getByRole('button',{name:'自主分封：开',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:120000}).toBeGreaterThanOrEqual(32);
 // Keeping details open must not implicitly pause the simulation.
 await expect(page.getByRole('button',{name:'暂停时间',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 await expect.poll(()=>houses.locator('[data-family-id]').count()).toBeGreaterThan(1);
 const rows=await houses.locator('[data-family-id]').allTextContents();const day=await app.getAttribute('data-day');
 await page.getByRole('button',{name:'自主分封：开',exact:true}).click();await expect(page.getByRole('button',{name:'自主分封：关',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.screenshot({path:info.outputPath('monthly-family-branches.png')});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:90000});const tick=await app.getAttribute('data-tick');
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:90000});
 await tool(page,'查看大事记');await expect(history).toContainText('分封');await history.locator('.c47-history-nations button').last().click();await houses.locator(':scope > summary').click();
 await expect(page.getByRole('button',{name:'自主分封：关',exact:true})).toHaveAttribute('aria-pressed','false');expect(await houses.locator('[data-family-id]').allTextContents()).toEqual(rows);
 expect(errors).toEqual([]);await info.attach('governance-evidence',{body:JSON.stringify({day,tick,rows,errors,physicalIphone:false}),contentType:'application/json'});
});
