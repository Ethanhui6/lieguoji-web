import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('即时战略模式: select a state\'s armies and send them to a province',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  await page.getByRole('button',{name:'即时战略模式',exact:true}).click();
  const bar=page.getByRole('toolbar',{name:'即时战略模式'});await expect(bar).toBeVisible();
  await expect(page.locator('.c47-app')).toContainText('进入了RTS指挥模式');
  await bar.getByRole('button',{name:'全选',exact:true}).click();
  await expect(bar).toContainText(/已选 ([1-9]\d*)\/\1/);
  await bar.getByRole('tab',{name:'防御模式'}).click();
  await page.keyboard.press('a');await expect(bar.getByRole('tab',{name:'攻击模式'})).toHaveAttribute('aria-selected','true');
  await map.click({position:{x:b.width*.42,y:b.height*.55}});
  await expect(page.locator('.c47-app')).toContainText(/个军团以攻击模式前往|都无法前往/,{timeout:20000});
  await page.screenshot({path:info.outputPath('rts.png')});
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();await expect(page.locator('.c47-app')).toContainText('退出了RTS指挥模式');
});
