import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('family actions: promote a member to patriarch from the nation panel',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  const panel=page.getByRole('complementary',{name:'文化与国家详情'});await expect(panel).toBeVisible();
  const family=panel.locator('details').filter({has:page.locator('.c47-family-people')}).first();
  await family.locator('summary').click();
  const people=family.locator('.c47-family-people > li');
  const candidate=people.filter({hasNot:page.locator('.c47-person-badge')}).first();
  const name=(await candidate.locator('.c47-person-pick strong').textContent())!.replace(/(成年|未成年|现任领袖|已故).*$/,'').trim();
  await candidate.locator('.c47-person-pick').click();
  await candidate.getByRole('button',{name:'设为族长',exact:true}).click();
  await expect(family.locator('.c47-family-summary')).toContainText(`族长 · ${name}`,{timeout:20000});
  await expect(people.filter({hasText:name}).locator('.c47-person-badge',{hasText:'族长'})).toBeVisible();
  await page.screenshot({path:info.outputPath('family.png')});
});
