import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('领导人历史 and 战争类型 in the nation panel',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  const panel=page.getByRole('complementary',{name:'文化与国家详情'});await expect(panel).toBeVisible();
  const history=panel.getByRole('group',{name:'领导人历史'});
  await history.locator('summary').click();
  const record=history.locator('.c47-leader-records li').first();
  await expect(record).toContainText(/第\d+[任届]/);
  await expect(record).toContainText(/在位时期: \d+ - 现在/);
  // Declare a war by hand: the war card reads 强制战争.
  const war=panel.locator('details.c47-diplomacy');
  await war.locator('summary').click();
  await war.getByRole('button',{name:'暂停并预览宣战'}).click();
  await war.getByRole('button',{name:/确认宣战/}).click();
  await expect(war.locator('.c47-campaign-card').first()).toContainText('战争类型强制战争',{timeout:20000});
  await expect(record).toContainText('主动征战1次',{timeout:20000});
  await page.screenshot({path:info.outputPath('leader-history.png')});
});
