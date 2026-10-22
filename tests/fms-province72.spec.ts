import {expect,test,type Page} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

type City={id:string;x:number;y:number;provinceId:string;nationId:string};
async function openProvince(page:Page){
  const map=page.getByTestId('culture47-map'),box=(await map.boundingBox())!,panel=page.getByRole('complementary',{name:'行省详情'});
  const countries=JSON.parse((await map.getAttribute('data-countries'))!) as {id:string}[];
  const cities=(JSON.parse((await map.getAttribute('data-cities'))!) as City[]).filter(c=>c.x>60&&c.x<box.width-60&&c.y>260&&c.y<box.height-160);
  for(const c of cities)for(const [dx,dy] of [[22,0],[-22,0],[0,22],[0,-22]]){
    await map.click({position:{x:c.x+dx,y:c.y+dy}});
    if(await panel.isVisible())return {panel,countries};
  }
  throw Error('no province tap opened the panel');
}
test('original ProvinceInfoUI: map tap opens 行省信息; 要塞化/去要塞化/设为首都 are saved world commands',async({page})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);await create(page,24);
  const {panel}=await openProvince(page);
  const info=panel.getByRole('region',{name:'行省信息'});
  for(const row of ['基本信息','人口','国家','核心省份','城市类型','主场作战效率','行省操作','战役信息'])await expect(info).toContainText(row);
  await expect(info).toContainText(/没有正在进行的战役|交战国/);
  const type=await info.getAttribute('data-city-type');
  if(type==='City'||type==='Fortress'){
    await info.getByRole('button',{name:'要塞化',exact:true}).click();
    await expect(info).toHaveAttribute('data-city-type','Fortress',{timeout:30000});await expect(info).toContainText('3.00');
    await info.getByRole('button',{name:'去要塞化',exact:true}).click();
    await expect(info).toHaveAttribute('data-city-type','City',{timeout:30000});
  }
  if(type!=='Capital'&&await info.getByRole('button',{name:'设为首都',exact:true}).isEnabled()){
    await info.getByRole('button',{name:'设为首都',exact:true}).click();
    await expect(info).toHaveAttribute('data-city-type','Capital',{timeout:30000});
  }
  await expect(info.getByRole('button',{name:'设为首都',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:120000});
  // The 国家 row opens the state panel (OnStateClicked).
  const again=await openProvince(page);
  await again.panel.getByRole('region',{name:'行省信息'}).locator('dd .c47-link').first().click();
  await expect(page.getByRole('complementary',{name:'文化与国家详情'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('original 自定义人口 / 自定义防御 dialogs validate like the original and apply as world commands',async({page})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);await create(page,24);
  const {panel}=await openProvince(page),info=panel.getByRole('region',{name:'行省信息'});
  await info.getByRole('button',{name:'自定义人口',exact:true}).click();
  const pop=info.getByRole('form',{name:'设置自定义人口'});
  await pop.getByLabel('当前人口',{exact:true}).fill('900');await pop.getByLabel('最大人口',{exact:true}).fill('800');await pop.getByRole('button',{name:'确定'}).click();
  await expect(pop.getByRole('alert')).toContainText('当前人口不能大于最大人口');
  await pop.getByLabel('当前人口',{exact:true}).fill('700');await pop.getByRole('button',{name:'确定'}).click();
  await expect(info).toContainText('700/800',{timeout:30000});
  await info.getByRole('button',{name:'自定义防御',exact:true}).click();
  const def=info.getByRole('form',{name:'设置自定义防御'});
  await def.getByLabel('主场作战效率',{exact:true}).fill('12');await def.getByRole('button',{name:'确定'}).click();
  await expect(def.getByRole('alert')).toContainText('主场作战效率必须在 1 到 10 之间');
  await def.getByLabel('主场作战效率',{exact:true}).fill('6.5');await def.getByLabel('锁定主场作战效率').check();await def.getByRole('button',{name:'确定'}).click();
  await expect(info).toContainText('6.50',{timeout:30000});
  expect(errors).toEqual([]);
});