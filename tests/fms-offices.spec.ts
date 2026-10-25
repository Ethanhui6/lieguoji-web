import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('官员任用: fill vacancies and appoint a chosen candidate',async({page},info)=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  const map=page.getByTestId('culture47-map'),b=(await map.boundingBox())!;
  await map.click({position:{x:b.width*.5,y:b.height*.45}});
  await page.getByRole('button',{name:'官员任用',exact:true}).click();
  const panel=page.getByRole('region',{name:'官职与将领'});await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'关闭 AI 自动任命'}).click();
  await expect(panel.getByRole('button',{name:'启用 AI 自动任命'})).toBeVisible({timeout:20000});
  await expect(panel).toContainText('官职称谓：');
  await panel.getByRole('button',{name:'补齐空缺'}).click();
  await expect(panel).toContainText(/已任命 [1-9]\d*\//,{timeout:20000});
  const first=panel.locator('.c47-office-row').first();
  await first.getByRole('button',{name:/^(更换|任命)$/}).click();
  const pick=page.getByRole('region',{name:'选择任职人选'});await expect(pick).toBeVisible();
  const candidate=pick.locator('.c47-candidates button').nth(1);
  const name=(await candidate.locator('span').first().evaluate(e=>e.firstChild?.textContent??''))!.trim();
  await candidate.click();await expect(pick).toContainText(`已选择：${name}`);
  await pick.getByRole('button',{name:'确认任命'}).click();
  await expect(panel.locator('.c47-office-row').first()).toContainText(name,{timeout:20000});
  await expect(panel.locator('.c47-office-row').first()).toContainText('任命来源：玩家');
  await page.screenshot({path:info.outputPath('offices.png')});
});
