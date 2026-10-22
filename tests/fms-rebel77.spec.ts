import {expect,test,type Page} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

type City={x:number;y:number;provinceId:string;nationId:string};
async function openNonCapitalProvince(page:Page){
  const map=page.getByTestId('culture47-map'),box=(await map.boundingBox())!,panel=page.getByRole('complementary',{name:'行省详情'});
  const cities=(JSON.parse((await map.getAttribute('data-cities'))!) as City[]).filter(c=>c.x>60&&c.x<box.width-60&&c.y>260&&c.y<box.height-160);
  for(const c of cities)for(const [dx,dy] of [[22,0],[-22,0],[0,22],[0,-22]]){
    await map.click({position:{x:c.x+dx,y:c.y+dy}});
    if(!await panel.isVisible())continue;
    const info=panel.getByRole('region',{name:'行省信息'});
    if(await info.getAttribute('data-city-type')!=='Capital'&&await info.getByRole('button',{name:'煽动叛乱',exact:true}).isEnabled())return info;
  }
  throw Error('no rebellious province found');
}
test('original 煽动叛乱: a new rebel state is founded and at war; 开启叛乱 and 行省叛乱最小间隔 are saved settings',async({page})=>{
  test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);await create(page,24);
  const nations=page.locator('.c47-nations button'),before=await nations.count();
  const info=await openNonCapitalProvince(page),province=(await info.locator('h2').textContent())!;
  await info.getByRole('button',{name:'煽动叛乱',exact:true}).click();
  await expect(nations).toHaveCount(before+1,{timeout:60000});
  await page.getByRole('button',{name:'查看大事记',exact:true}).click();
  const history=page.getByRole('complementary',{name:'大事记'});
  await expect(history).toContainText(`${province}发生叛乱`);await expect(history).toContainText(`成立于 ${province}`);
  // The new state is at war with its mother state (CB14 internal war).
  await nations.last().click();
  await expect(page.getByRole('complementary',{name:'文化与国家详情'}).getByRole('group',{name:'国家行为'}).getByRole('button',{name:'停战',exact:true})).toBeEnabled();
  // Settings
  await page.getByRole('button',{name:'AI全局配置',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI全局配置'});
  await expect(dialog.getByLabel('开启叛乱')).toBeChecked();
  await dialog.getByLabel('开启叛乱').click();await expect(dialog.getByLabel('开启叛乱')).not.toBeChecked({timeout:30000});
  const slider=dialog.getByRole('slider',{name:'行省叛乱最小间隔'});await expect(slider).toHaveValue('12');
  await slider.focus();await page.keyboard.press('ArrowRight');await expect(dialog).toContainText('13 个月',{timeout:30000});
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:120000});
  await expect(page.locator('.c47-nations button')).toHaveCount(before+1);
  await page.getByRole('button',{name:'AI全局配置',exact:true}).click();
  const again=page.getByRole('dialog',{name:'AI全局配置'});
  await expect(again.getByLabel('开启叛乱')).not.toBeChecked();await expect(again.getByRole('slider',{name:'行省叛乱最小间隔'})).toHaveValue('13');
  expect(errors).toEqual([]);
});
