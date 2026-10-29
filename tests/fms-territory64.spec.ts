import {tool} from './fms-culture47-fixture';
import {expect,test} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('pause and edit countries in a running world: taps redraw territory, persist and resume',async({page},info)=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');
  await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
  const app=page.getByTestId('culture47-app'),map=page.getByTestId('culture47-map');
  await page.getByRole('button',{name:'继续时间',exact:true}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:60000}).toBeGreaterThan(600);
  await tool(page,'编辑国家');
  const banner=page.getByRole('region',{name:'编辑国家'});await expect(banner).toBeVisible();
  await expect(page.getByRole('button',{name:'继续时间',exact:true})).toBeVisible();
  await expect(app).toHaveAttribute('data-advancing','false',{timeout:20000});
  const pausedTick=await app.getAttribute('data-tick'),before=Number(await banner.getAttribute('data-owned'));
  const cities=JSON.parse((await map.getAttribute('data-cities'))!) as {x:number;y:number}[];
  const box=(await map.boundingBox())!,cover=(await banner.boundingBox())!,visible=cities.filter(c=>c.x>40&&c.x<box.width-40&&c.y>230&&c.y<box.height-120&&!(c.x>=cover.x-8&&c.x<=cover.x+cover.width+8&&c.y>=cover.y-8&&c.y<=cover.y+cover.height+8));
  let gained=0;
  const idle=()=>expect(page.locator('.c47-playback-status')).not.toContainText('正在处理',{timeout:30000});
  for(const c of visible){await map.click({position:{x:c.x,y:c.y}});await idle();
    const now=Number(await banner.getAttribute('data-owned'));if(now>before){gained=now-before;if(gained>=2)break;}}
  expect(gained).toBeGreaterThanOrEqual(2);
  await expect(app).toHaveAttribute('data-tick',pausedTick!);
  await page.screenshot({path:info.outputPath('territory-edit.png')});
  await idle();const owned=await banner.getAttribute('data-owned');
  await tool(page,'查看大事记');await page.getByLabel('大事记范围').selectOption({label:'全部记录（含领土易手）'});
  await expect(page.getByRole('complementary',{name:'大事记'})).toContainText('地图编辑');
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(app).toHaveAttribute('data-tick',pausedTick!,{timeout:120000});
  await tool(page,'编辑国家');
  await expect(page.getByRole('region',{name:'编辑国家'})).toHaveAttribute('data-owned',owned!);
  // Resuming leaves edit mode (original: editing pauses the game).
  await page.getByRole('button',{name:'继续时间',exact:true}).click();
  await expect(page.getByRole('region',{name:'编辑国家'})).toHaveCount(0);
  await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:60000}).toBeGreaterThan(Number(pausedTick)+240);
  expect(errors).toEqual([]);
});
