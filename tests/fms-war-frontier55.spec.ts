import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('diplomatic preview can be cancelled and a later confirm is rechecked',async({page},info)=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await page.getByLabel('国家数量',{exact:true}).selectOption('2');await create(page,24);
  await page.locator('.c47-nations button').first().click();
  const declare=page.getByRole('button',{name:'暂停并预览宣战',exact:true});
  await declare.click();await expect(page.getByRole('group',{name:'外交预览'})).toBeVisible();
  await page.getByRole('button',{name:'取消外交操作',exact:true}).click();
  await expect(page.getByRole('group',{name:'外交预览'})).toHaveCount(0);
  await expect(declare).toBeVisible();
  await declare.click();await expect(page.getByRole('button',{name:'确认宣战',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'推进一天',exact:true}).click();
  await expect(page.getByText('局势已变化，请重新预览。确认时仍会重验局势。')).toBeVisible();
  await expect(page.getByRole('button',{name:'确认宣战',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'重新预览',exact:true}).click();
  await expect(page.getByRole('button',{name:'确认宣战',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'确认宣战',exact:true}).click();
  await expect(page.getByRole('button',{name:'暂停并预览停战',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'暂停并预览停战',exact:true}).click();
  await page.getByRole('button',{name:'确认停战',exact:true}).click();
  await page.getByRole('button',{name:'查看大事记',exact:true}).click();
  const history=page.getByRole('region',{name:'文化世界史书'});
  await expect(history).toContainText('战争结束');await expect(history).toContainText('首都');await expect(history).toContainText(/事件 \d+/);
  await page.screenshot({path:info.outputPath('peace-chronicle.png'),fullPage:true});
  expect(errors).toEqual([]);
});
