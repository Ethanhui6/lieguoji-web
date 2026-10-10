import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('seeded natural ruler death, visible accession and family history survive save and the next month',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // A deterministic synthetic map chosen for a naturally occurring first-month
 // roll. No probability, age, live state or game clock is injected or modified.
 await enter(page,'00000000-0000-4000-8000-00000000065b');await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('战乱开局').uncheck();await create(page,24);
 const app=page.getByTestId('culture47-app');await page.getByRole('button',{name:'查看大事记',exact:true}).click();const history=page.getByRole('region',{name:'文化世界史书'});
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:90000}).toBeGreaterThanOrEqual(32);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');
 const death=history.locator('li').filter({hasText:'橘秀忠去世，享年'});await expect(death).toHaveCount(1);await expect(death.locator('.c47-history-meta')).toContainText('领袖去世');await expect(history).toContainText('橘赖朝继任天皇');
 await death.locator('summary').click();await expect(death.locator('details')).toContainText('领袖自然去世');
 const records=await history.locator('li article>p').allTextContents(),tick=await app.getAttribute('data-tick');await page.screenshot({path:info.outputPath('natural-succession-history.png')});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:60000});
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();expect(await history.locator('li article>p').allTextContents()).toEqual(records);
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:90000}).toBeGreaterThanOrEqual(62);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');await expect(death).toHaveCount(1);expect(errors).toEqual([]);
 await info.attach('natural-lifecycle',{body:JSON.stringify({seed:'00000000-0000-4000-8000-00000000065b',syntheticTerrain:true,realMonthlyRoll:true,savedTick:tick,continuedTick:await app.getAttribute('data-tick'),records,errors,physicalIphone:false}),contentType:'application/json'});
});
