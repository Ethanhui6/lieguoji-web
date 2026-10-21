import {expect,test,type Page} from '@playwright/test';
import {create} from './fms-culture47-fixture';

async function clickTargets(page:Page,done:()=>Promise<boolean>){
  const map=page.getByTestId('culture47-map'),box=(await map.boundingBox())!,region=page.getByRole('region',{name:'国家行为选择'}),cover=await region.boundingBox();
  const cities=(JSON.parse((await map.getAttribute('data-cities'))!) as {x:number;y:number}[]).filter(c=>c.x>40&&c.x<box.width-40&&c.y>230&&c.y<box.height-120&&!(cover&&c.x>=cover.x-8&&c.x<=cover.x+cover.width+8&&c.y>=cover.y-8&&c.y<=cover.y+cover.height+8));
  for(const c of cities){if(await region.count()===0)break;await map.click({position:{x:c.x,y:c.y}});await expect(page.locator('.c47-playback-status')).not.toContainText('正在处理',{timeout:30000});}
  expect(await done()).toBe(true);
}
test('original vassalize and annex from the nation panel by clicking target states',async({page},info)=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');
  await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
  await page.locator('.c47-nations button').first().click();
  const panel=page.getByRole('complementary',{name:'文化与国家详情'}),actions=panel.getByRole('group',{name:'国家行为'});
  await actions.getByRole('button',{name:'收为附庸',exact:true}).click();
  await expect(page.getByRole('region',{name:'国家行为选择'})).toContainText('点击其他国家，收为附庸');
  await clickTargets(page,async()=>(await panel.textContent())!.includes('附庸：'));
  await page.screenshot({path:info.outputPath('vassal.png')});
  const before=Number((await panel.textContent())!.match(/实控地区(\d+)/)![1]);
  await actions.getByRole('button',{name:'吞并',exact:true}).click();
  await expect(page.getByRole('region',{name:'国家行为选择'})).toContainText('点击敌对国家，直接吞并');
  await clickTargets(page,async()=>Number((await panel.textContent())!.match(/实控地区(\d+)/)![1])>before);
  await page.getByRole('button',{name:'查看大事记',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'大事记'})).toContainText('灭亡');
  await page.screenshot({path:info.outputPath('annex.png')});
  expect(errors).toEqual([]);
});
