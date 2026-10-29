import {tool} from './fms-culture47-fixture';
import {expect,test,type Page} from '@playwright/test';
import {create} from './fms-culture47-fixture';

async function pickOtherNation(page:Page,before:()=>Promise<boolean>){
  const map=page.getByTestId('culture47-map'),box=(await map.boundingBox())!,banner=await page.getByRole('region',{name:'国家行为选择'}).boundingBox();
  const cities=(JSON.parse((await map.getAttribute('data-cities'))!) as {x:number;y:number}[]).filter(c=>c.x>40&&c.x<box.width-40&&c.y>230&&c.y<box.height-120&&!(banner&&c.x>=banner.x-8&&c.x<=banner.x+banner.width+8&&c.y>=banner.y-8&&c.y<=banner.y+banner.height+8));
  for(const c of cities){if(await page.getByRole('region',{name:'国家行为选择'}).count()===0)break;await map.click({position:{x:c.x,y:c.y}});await expect(page.locator('.c47-playback-status')).not.toContainText('正在处理',{timeout:30000});}
  expect(await before()).toBe(true);
}
test('original nation actions: click-target alliance and war, AI global config toggles persist',async({page},info)=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');
  await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
  await tool(page,'国家');
  const panel=page.getByRole('complementary',{name:'文化与国家详情'}),actions=panel.getByRole('group',{name:'国家行为'});
  await expect(actions.getByRole('button',{name:'退出同盟',exact:true})).toBeDisabled();
  // 缔结盟约: click the button, then another country on the map.
  await actions.getByRole('button',{name:'缔结盟约',exact:true}).click();
  await expect(page.getByRole('region',{name:'国家行为选择'})).toContainText('点击其他国家，缔结同盟');await expect(panel).toHaveCount(0);
  await pickOtherNation(page,async()=>(await panel.textContent())!.includes('联盟信息'));
  await expect(panel).toContainText('-');await page.screenshot({path:info.outputPath('alliance.png')});
  // 宣战 against a country outside the alliance.
  await actions.getByRole('button',{name:'宣战',exact:true}).click();
  await expect(page.getByRole('region',{name:'国家行为选择'})).toContainText('点击其他国家，发动战争');
  await pickOtherNation(page,async()=>!(await actions.getByRole('button',{name:'停战',exact:true}).isDisabled()));
  // 退出同盟.
  await actions.getByRole('button',{name:'退出同盟',exact:true}).click();await expect(actions.getByRole('button',{name:'退出同盟',exact:true})).toBeDisabled({timeout:30000});
  // AI全局配置.
  await tool(page,'AI全局配置');
  const dialog=page.getByRole('dialog',{name:'AI全局配置'});
  await dialog.getByLabel('允许联盟').click();await expect(dialog.getByLabel('允许联盟')).not.toBeChecked({timeout:30000});
  await expect(dialog.getByText('允许内战')).toBeVisible();await page.screenshot({path:info.outputPath('ai-global.png')});
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
  await page.reload();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:120000});
  await tool(page,'AI全局配置');
  await expect(page.getByRole('dialog',{name:'AI全局配置'}).getByLabel('允许联盟')).not.toBeChecked();
  expect(errors).toEqual([]);
});
