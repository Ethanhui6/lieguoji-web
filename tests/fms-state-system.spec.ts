import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('国家系统: 国家特性, 自定义命名, 触发内战 and 地图外观',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  await page.getByRole('button',{name:/下一天|推进一天|单步/}).first().click().catch(()=>{});
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  const panel=page.getByRole('complementary',{name:'文化与国家详情'});await expect(panel).toBeVisible();
  await expect(panel.locator('.c47-state-traits')).toContainText('国家特性',{timeout:20000});
  // 自定义命名
  const naming=panel.getByRole('group',{name:'自定义命名'});await naming.locator('summary').click();
  await naming.getByLabel('全名模板',{exact:true}).fill('神圣帝国');
  await naming.getByRole('button',{name:'启用自定义命名'}).click();
  await expect(naming.getByRole('alert')).toHaveText('全名模板必须包含 {Name}');
  await naming.getByLabel('国家名',{exact:true}).fill('');
  await naming.getByLabel('全名模板',{exact:true}).fill('神圣{Name}帝国');
  await naming.getByRole('button',{name:'启用自定义命名'}).click();
  await expect(naming.getByRole('alert')).toHaveText('国家名称不能为空');
  await naming.getByLabel('国家名',{exact:true}).fill('罗马');
  await expect(naming).toContainText('当前预览：神圣罗马帝国');
  await naming.getByRole('button',{name:'启用自定义命名'}).click();
  await expect(panel.locator('h2')).toHaveText('神圣罗马帝国',{timeout:20000});
  // 触发内战 shows the original's reason when it cannot start.
  await expect(panel.getByRole('button',{name:'触发内战'})).toBeVisible();
  // 地图外观
  await page.getByRole('button',{name:/菜单/}).first().click();
  await page.getByRole('button',{name:/地图外观/}).click();
  const display=page.getByRole('dialog').getByLabel('地图外观');
  await display.getByRole('slider',{name:'国名缩放'}).fill('1.5');
  await display.getByRole('checkbox',{name:'显示完整国名'}).uncheck();
  await display.getByRole('checkbox',{name:'时间显示'}).uncheck();
  await expect(page.locator('.c47-bar')).not.toContainText('公元');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('lieguoji-display-v1')??'{}'))).toMatchObject({stateNameScale:1.5,fullName:false,timeDisplay:false});
  await page.screenshot({path:info.outputPath('state-system.png')});
});
