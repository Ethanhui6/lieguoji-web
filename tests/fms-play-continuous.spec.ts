import {test,expect} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

// Regression (0.5.30): a render carrying an older snapshot stepped the accepted world back,
// so the next background batch was refused with "世界已经推进" a few days after pressing play.
test('pressing play keeps the world advancing without a stale-sequence stop',async({page})=>{
  test.setTimeout(150000);
  await enter(page);await create(page);
  const play=page.getByRole('button',{name:'继续时间',exact:true});if(await play.isVisible())await play.click();
  await page.waitForTimeout(12000);
  await expect(page.locator('.c47-app')).not.toContainText('世界已经推进');
  expect(Number(await page.locator('.c47-app time').first().getAttribute('data-day'))).toBeGreaterThan(40);
  await expect(page.getByRole('button',{name:'暂停时间',exact:true})).toBeVisible();
});
