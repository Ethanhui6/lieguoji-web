import {expect,test} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('original color views: keys 1–5 and the 地图视图 selector recolor the map; 区域视图 is marked unrestored',async({page},info)=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);await create(page,24);
  const map=page.getByTestId('culture47-map'),select=page.getByLabel('地图视图',{exact:true});
  await expect(map).toHaveAttribute('data-color-view','state',{timeout:30000});
  await page.keyboard.press('3');await expect(map).toHaveAttribute('data-color-view','culture');await expect(page.locator('.c47-notice')).toContainText('文化视图');
  await page.keyboard.press('2');await expect(map).toHaveAttribute('data-color-view','alliance');
  await page.keyboard.press('6');await expect(page.locator('.c47-notice')).toContainText('区域视图尚未还原');await expect(map).toHaveAttribute('data-color-view','alliance');
  await select.selectOption('religion');await expect(map).toHaveAttribute('data-color-view','religion');
  await expect(select.locator('option[value="district"]')).toBeDisabled();
  await page.screenshot({path:info.outputPath('religion-view.png')});
  await page.keyboard.press('1');await expect(map).toHaveAttribute('data-color-view','state');
  expect(errors).toEqual([]);
});
