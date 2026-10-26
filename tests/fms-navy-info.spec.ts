import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('舰队信息: original fleet status lines and 舰队跟随',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await page.evaluate(()=>history.replaceState(null,'',location.pathname+'?fms=1&fmsDiagnostics=1'));await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  await page.getByRole('button',{name:/军事|军队/}).first().click();
  const select=page.getByRole('combobox',{name:'选择部队'});await expect(select).toBeVisible();
  const fleet=await select.locator('optgroup[label="海军"] option').first().getAttribute('value');
  expect(fleet,'test world must have a fleet').toBeTruthy();
  await select.selectOption(fleet!);
  const stats=page.locator('.c47-military-stats');
  await expect(stats).toContainText('母港');
  await expect(stats).toContainText(/当前状态(海战|进攻（|待命（|玩家指挥)/);
  await expect(stats).toContainText(/任务概览(海上交战中|进攻态：|待命|执行玩家军令)/);
  const follow=page.getByRole('checkbox',{name:'舰队跟随'});
  await follow.check();await expect(follow).toBeChecked();
  const map=page.getByTestId('culture47-map'),id=fleet!.slice('fleet/'.length);
  await expect.poll(async()=>map.evaluate((el,id)=>{const p=JSON.parse(el.getAttribute('data-projection')!),units=JSON.parse(el.getAttribute('data-force-positions')!),at=units.fleets.find(([key]:[string])=>key===id)?.[1];if(!at)return 9999;const rect=el.getBoundingClientRect();return Math.hypot(at.x/p.scale*p.zoom+p.x-rect.width/2,at.y/p.scale*p.zoom+p.y-rect.height/2);},id)).toBeLessThan(2);
  await follow.uncheck();await expect(follow).not.toBeChecked();
  await page.getByRole('complementary',{name:'军队与舰队'}).evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:info.outputPath('navy.png'),animations:'disabled'});
  await page.getByRole('button',{name:'收起详情',exact:true}).click();
  await page.screenshot({path:info.outputPath('follow-map.png'),animations:'disabled'});
});
