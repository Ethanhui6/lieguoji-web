import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

test('a tab reloaded while a world is open returns to that world by itself',async({page})=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存文化世界',exact:true})).toBeEnabled({timeout:30000});
  const day=await page.locator('.c47-app time').first().textContent();
  page.on('dialog',d=>void d.accept());
  await page.reload();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});
  await expect(page.locator('.c47-app time').first()).toHaveText(day!);
  // The reopened world is remembered again for the next reload.
  expect(await page.evaluate(()=>sessionStorage.getItem('lieguoji-world-open'))).toBe('1');
});
