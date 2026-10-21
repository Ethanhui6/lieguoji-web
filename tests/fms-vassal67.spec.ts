import {expect,test,type Page} from '@playwright/test';
import {create} from './fms-culture47-fixture';

async function clickTargets(page:Page,done:()=>Promise<boolean>){
  const map=page.getByTestId('culture47-map'),box=(await map.boundingBox())!,region=page.getByRole('region',{name:'国家行为选择'}),cover=await region.boundingBox();
  const cities=(JSON.parse((await map.getAttribute('data-cities'))!) as {x:number;y:number}[]).filter(c=>c.x>40&&c.x<box.width-40&&c.y>230&&c.y<box.height-120&&!(cover&&c.x>=cover.x-8&&c.x<=cover.x+cover.width+8&&c.y>=cover.y-8&&c.y<=cover.y+cover.height+8));
  for(const c of cities){if(await region.count()===0)break;await map.click({position:{x:c.x,y:c.y}});await expect(page.locator('.c47-playback-status')).not.toContainText('正在处理',{timeout:30000});}
  expect(await done()).toBe(true);
}
test('vassal shows original tribute terms; 允许附庸叛乱 is a saved world switch',async({page})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');
  await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
  await page.locator('.c47-nations button').first().click();
  const panel=page.getByRole('complementary',{name:'文化与国家详情'});
  await panel.getByRole('group',{name:'国家行为'}).getByRole('button',{name:'收为附庸',exact:true}).click();
  await clickTargets(page,async()=>(await panel.textContent())!.includes('附庸：'));
  const text=(await panel.textContent())!,vassal=(await page.locator('.c47-nations button').allTextContents()).map(n=>n.trim()).find(n=>text.includes('附庸：'+n))!;expect(vassal).toBeTruthy();
  await page.locator('.c47-nations button',{hasText:vassal}).click();
  await expect(panel).toContainText('贡金约');await expect(panel).toContainText('年12月');
  await page.getByRole('button',{name:'AI全局配置',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'AI全局配置'});
  await expect(dialog.getByLabel('允许附庸叛乱')).toBeChecked();
  await dialog.getByLabel('允许附庸叛乱').click();await expect(dialog.getByLabel('允许附庸叛乱')).not.toBeChecked({timeout:30000});
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:120000});
  await page.getByRole('button',{name:'AI全局配置',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'AI全局配置'}).getByLabel('允许附庸叛乱')).not.toBeChecked();
  expect(errors).toEqual([]);
});
