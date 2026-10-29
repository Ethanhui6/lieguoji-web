import {tool} from './fms-culture47-fixture';
import {test,expect,type Locator} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test.use({launchOptions:{args:['--use-angle=swiftshader']}});

test('all primary surfaces share bounded aligned panels',async({page},info)=>{
 test.setTimeout(180000);
 if(process.env.VISUAL_REDUCED)await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const capture=async(name:string,root:Locator)=>{
  await expect(root).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
  const box=await root.boundingBox(),viewport=page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x,name+' left').toBeGreaterThanOrEqual(-1);expect(box!.x+box!.width,name+' right').toBeLessThanOrEqual(viewport.width+1);
  expect(box!.y,name+' top').toBeGreaterThanOrEqual(-1);expect(box!.y+box!.height,name+' bottom').toBeLessThanOrEqual(viewport.height+1);
  expect(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1),name+' horizontal overflow').toBe(true);
 };
 await page.goto('/?fms=1');await capture('01-generation',page.locator('.fms-generation'));
 await enter(page);await capture('02-world-setup',page.locator('.c47-setup'));
 await create(page);
 const saveIcon=page.getByRole('button',{name:'保存文化世界',exact:true});
 const buttonBox=(await saveIcon.boundingBox())!,iconBox=(await saveIcon.locator('.play-icon').boundingBox())!;
 expect(Math.abs(buttonBox.x+buttonBox.width/2-iconBox.x-iconBox.width/2)).toBeLessThanOrEqual(1);
 expect(Math.abs(buttonBox.y+buttonBox.height/2-iconBox.y-iconBox.height/2)).toBeLessThanOrEqual(1);
 if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await tool(page,'国家');
 const panel=page.locator('.c47-panel');await capture('03-nation',panel);
 const family=panel.locator('details').filter({has:page.locator('.c47-family-people')}).first();await family.locator('summary').click();
 await family.locator('.c47-person-pick').first().click();await family.getByRole('region',{name:'人物属性明细'}).scrollIntoViewIfNeeded();await capture('04-person',panel);
 await page.getByRole('button',{name:'官员任用',exact:true}).click();await capture('05-offices',panel);
 await tool(page,'军事模式');
 const select=page.getByRole('combobox',{name:'选择部队'}),army=await select.locator('optgroup[label="陆军"] option').first().getAttribute('value');await select.selectOption(army!);await capture('06-army',panel);
 const fleet=await select.locator('optgroup[label="海军"] option').first().getAttribute('value');if(fleet){await select.selectOption(fleet);await capture('07-fleet',panel);}
 await tool(page,'查看大事记');await capture('08-history',panel);
 await tool(page,'统计');await capture('09-statistics',panel);
 await page.getByRole('button',{name:'收起详情',exact:true}).click();
 await page.getByRole('button',{name:'地图样式',exact:true}).click();await capture('10-layers',page.locator('.c47-map-menu'));await page.getByRole('button',{name:'关闭地图样式',exact:true}).click();
 await tool(page,'AI全局配置');await capture('11-ai',page.locator('.c47-ai-global'));await page.getByRole('button',{name:'关闭AI全局配置',exact:true}).click();await expect(page.locator('.c47-ai-global')).toHaveCount(0);
 await tool(page,'编辑国家');await capture('12-territory',page.locator('.c47-territory'));await page.getByRole('button',{name:'完成编辑',exact:true}).click();
 await page.getByRole('button',{name:'菜单选项',exact:true}).click();const menu=page.locator('.c47-menu');await capture('13-menu',menu);
 for(const [button,name] of [['地图外观','14-display'],['自动保存','15-autosave'],['云存档','16-cloud'],['加载游戏','17-load'],['保存游戏','18-save'],['导出','19-export']]){
  await menu.getByRole('button',{name:new RegExp('^'+button)}).click();await capture(name,menu);
  if(name==='18-save'){
   await menu.getByText('新建存档',{exact:true}).click();await capture('18a-save-form',menu);
   const input=(await menu.getByRole('textbox',{name:'存档名称'}).boundingBox())!,submit=(await menu.getByRole('button',{name:'保存游戏',exact:true}).boundingBox())!;
   expect(Math.abs(input.x-submit.x)).toBeLessThanOrEqual(1);expect(Math.abs(input.width-submit.width)).toBeLessThanOrEqual(1);
   await menu.getByRole('button',{name:'关闭',exact:true}).click();
  }
  await menu.getByRole('button',{name:'关闭',exact:true}).click();
 }
 await menu.getByRole('button',{name:'关闭菜单选项',exact:true}).click();
 await tool(page,'生成地图');await capture('20-confirm',page.locator('.c47-confirm'));await page.getByRole('button',{name:'否',exact:true}).click();
 expect(errors).toEqual([]);
});
