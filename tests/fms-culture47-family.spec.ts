import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('folded family does not build a succession preview and opening still supports real confirmed succession',async({page},info)=>{
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);await create(page);await page.locator('.c47-nations button').first().click();
 const panel=page.getByRole('complementary',{name:'文化与国家详情'}),family=panel.locator('details').filter({has:page.locator('.c47-family')});
 const previous=await panel.locator('.c47-ruler strong').textContent();
 await expect(panel.getByText(/继承候选：/)).toHaveCount(0);
 await family.locator('summary').click();await expect(panel.getByText(/继承候选：/)).toBeVisible();
 await page.getByRole('button',{name:'安排传位',exact:true}).click();await expect(page.getByRole('group',{name:'确认传位'})).toBeVisible();
 await page.getByRole('group',{name:'确认传位'}).getByRole('button',{name:'取消',exact:true}).click();expect(await panel.locator('.c47-ruler strong').textContent()).toBe(previous);
 await page.getByRole('button',{name:'安排传位',exact:true}).click();await page.getByRole('button',{name:'确认传位',exact:true}).click();
 await expect(panel.locator('.c47-ruler')).toContainText('第 2 任');const successor=await panel.locator('.c47-ruler strong').textContent();expect(successor).not.toBe(previous);
 await family.locator('summary').click();await expect(panel.getByText(/继承候选：/)).toHaveCount(0);
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await page.locator('.c47-nations button').first().click();
 await expect(panel.locator('.c47-ruler strong')).toHaveText(successor!);await expect(panel.locator('.c47-ruler')).toContainText('第 2 任');expect(errors).toEqual([]);
 await info.attach('scope',{body:JSON.stringify({manualSuccession:true,naturalSuccession:false,savedRestored:true,errors,physicalIphone:false}),contentType:'application/json'});
});
