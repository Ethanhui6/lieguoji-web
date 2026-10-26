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

test('family actions: set age and add a generated spouse',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  const panel=page.getByRole('complementary',{name:'文化与国家详情'});await expect(panel).toBeVisible();
  const family=panel.locator('details').filter({has:page.locator('.c47-family-people')}).first();
  await family.locator('summary').click();
  const first=family.locator('.c47-family-people > li').first(),id=(await first.getAttribute('data-person-id'))!;
  const person=family.locator(`.c47-family-people > li[data-person-id="${id}"]`);
  await person.locator('.c47-person-pick').click();
  await person.getByRole('button',{name:'设置年龄',exact:true}).click();
  const input=person.getByRole('textbox',{name:'年龄'});
  await input.fill('abc');await person.getByRole('button',{name:'确定'}).click();
  await expect(person.getByRole('alert')).toHaveText('年龄输入无效，请输入整数');
  await input.fill('300');await person.getByRole('button',{name:'确定'}).click();
  await expect(person.getByRole('alert')).toHaveText('年龄超出范围（0-200）');
  await input.fill('33');await person.getByRole('button',{name:'确定'}).click();
  await expect(person.locator('.c47-person-pick strong small')).toContainText('33 岁',{timeout:20000});
  // An unmarried living member gets a generated spouse.
  const single=family.locator('.c47-family-people > li').filter({hasNotText:'配偶 ·'}).filter({hasNotText:'已故'}).first(),sid=(await single.getAttribute('data-person-id'))!;
  const target=family.locator(`.c47-family-people > li[data-person-id="${sid}"]`);
  await target.locator('.c47-person-pick').click();
  await target.getByRole('button',{name:'添加配偶',exact:true}).click();
  await target.getByRole('button',{name:'生成新配偶（随机）'}).click();
  await expect(target).toContainText('配偶 ·',{timeout:20000});
  await page.screenshot({path:info.outputPath('family-edit.png')});
});
