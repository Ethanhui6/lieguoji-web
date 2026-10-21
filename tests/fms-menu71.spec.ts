import {expect,test,type Page} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

const menu=(page:Page)=>page.getByRole('dialog',{name:/菜单选项|存档管理/});
async function openMenu(page:Page){await page.getByRole('button',{name:'菜单选项',exact:true}).click();await expect(menu(page)).toBeVisible();}
async function idle(page:Page){await expect(page.locator('.c47-playback-status')).not.toContainText('正在处理',{timeout:60000});}
test('original 菜单选项: named saves, overwrite, load, delete, export and autosave settings',async({page})=>{
  test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);await create(page,24);
  // 保存游戏 → New Save (default yyyyMMddHHmmss) → named save
  await openMenu(page);await menu(page).getByRole('button',{name:'保存游戏',exact:true}).click();
  await menu(page).getByRole('listitem').filter({hasText:'New Save'}).click();
  const input=menu(page).getByLabel('存档名称');await expect(input).toHaveValue(/^\d{14}$/);
  await input.fill('试玩存档');await menu(page).getByRole('button',{name:'保存游戏',exact:true}).click();
  await expect(page.locator('.c47-notice')).toContainText('已保存游戏：试玩存档',{timeout:60000});await expect(menu(page)).toHaveCount(0);
  const day=await page.getByTestId('culture47-map').getAttribute('data-day');
  await page.getByRole('button',{name:'推进一天',exact:true}).click();await idle(page);
  await expect(page.getByTestId('culture47-map')).not.toHaveAttribute('data-day',day!);
  // Overwrite asks the original question
  await openMenu(page);await menu(page).getByRole('button',{name:'保存游戏',exact:true}).click();
  await menu(page).getByRole('listitem').filter({hasText:'试玩存档'}).click();
  await expect(page.getByRole('alertdialog',{name:'是否覆盖该存档？存档：试玩存档'})).toBeVisible();
  await page.getByRole('button',{name:'否',exact:true}).click();await menu(page).getByRole('button',{name:'关闭',exact:true}).click();await menu(page).getByRole('button',{name:'关闭',exact:true}).click();
  // 加载游戏 → 加载或删除存档 → 加载存档 restores the saved day
  await openMenu(page);await menu(page).getByRole('button',{name:'加载游戏',exact:true}).click();
  await menu(page).getByRole('listitem').filter({hasText:'试玩存档'}).click();
  await menu(page).getByRole('button',{name:'加载存档',exact:true}).click();
  await page.getByRole('button',{name:'是',exact:true}).click();
  await expect(page.locator('.c47-notice')).toContainText('已加载存档：试玩存档',{timeout:90000});
  await expect(page.getByTestId('culture47-map')).toHaveAttribute('data-day',day!,{timeout:30000});
  // 导出 → 导出历史记录 / 导出图片
  await openMenu(page);await menu(page).getByRole('button',{name:'导出',exact:true}).click();
  await menu(page).getByRole('button',{name:'导出历史记录',exact:true}).click();
  const [history]=await Promise.all([page.waitForEvent('download'),menu(page).getByRole('button',{name:'开始导出',exact:true}).click()]);
  expect(history.suggestedFilename()).toBe('HistoryEvents.txt');
  const text=(await (await history.createReadStream()).toArray()).map(b=>b.toString('utf8')).join('');expect(text).toMatch(/========== \d+年 ==========/);
  await menu(page).getByRole('button',{name:'关闭',exact:true}).click();await menu(page).getByRole('button',{name:'导出图片',exact:true}).click();
  const [image]=await Promise.all([page.waitForEvent('download'),menu(page).getByRole('button',{name:'开始导出',exact:true}).click()]);
  expect(image.suggestedFilename()).toMatch(/\.png$/);expect((await (await image.createReadStream()).toArray()).reduce((n,b)=>n+b.length,0)).toBeGreaterThan(1000);
  await page.getByRole('button',{name:'关闭菜单选项',exact:true}).click();
  // 自动保存设置 persists per browser (original default off, 10 minutes)
  await openMenu(page);await menu(page).getByRole('button',{name:'自动保存',exact:true}).click();
  await expect(menu(page).getByLabel('自动保存开关')).not.toBeChecked();await expect(menu(page).getByRole('slider',{name:'自动保存间隔(分钟)'})).toHaveValue('10');
  await menu(page).getByLabel('自动保存开关').click();await expect(menu(page).getByLabel('自动保存开关')).toBeChecked();
  await page.getByRole('button',{name:'关闭菜单选项',exact:true}).click();
  // A fresh visit loads the save from the start screen, then deletes it.
  await page.evaluate(()=>{localStorage.setItem('lieguoji-fms-config-v1',JSON.stringify({autoSave:false,autoSaveMinutes:10}));});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
  await page.getByRole('button',{name:'加载游戏',exact:true}).click();
  await menu(page).getByRole('listitem').filter({hasText:'试玩存档'}).click();await menu(page).getByRole('button',{name:'加载存档',exact:true}).click();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:120000});await expect(page.getByTestId('culture47-map')).toHaveAttribute('data-day',day!,{timeout:30000});
  await openMenu(page);await menu(page).getByRole('button',{name:'加载游戏',exact:true}).click();
  await menu(page).getByRole('listitem').filter({hasText:'试玩存档'}).click();await menu(page).getByRole('button',{name:'删除存档',exact:true}).click();
  await expect(page.getByRole('alertdialog',{name:'删除当前存档，是否继续？'})).toBeVisible();await page.getByRole('button',{name:'是',exact:true}).click();
  await expect(menu(page).getByRole('listitem').filter({hasText:'试玩存档'})).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('original AutoSaveManager: countdown, ESC restarts the interval, then autosave appears in the list',async({page})=>{
  test.setTimeout(300000);
  await enter(page);await create(page,24);
  // The autosave timer is (re)started when the setting changes, so it runs on the installed clock.
  await page.clock.install();
  await openMenu(page);await menu(page).getByRole('button',{name:'自动保存',exact:true}).click();
  await menu(page).getByRole('slider',{name:'自动保存间隔(分钟)'}).fill('5');await menu(page).getByLabel('自动保存开关').click();
  await page.getByRole('button',{name:'关闭菜单选项',exact:true}).click();
  await page.clock.fastForward(296000);
  await expect(page.locator('.c47-autosave')).toContainText('秒后将自动保存，按 ESC 取消');
  await page.keyboard.press('Escape');await expect(page.locator('.c47-autosave')).toHaveCount(0);
  await page.clock.fastForward(200000);await expect(page.locator('.c47-autosave')).toHaveCount(0);
  await page.clock.fastForward(101000);
  await expect(page.locator('.c47-notice')).toContainText('已保存游戏：autosave',{timeout:60000});
  await openMenu(page);await menu(page).getByRole('button',{name:'加载游戏',exact:true}).click();
  await expect(menu(page).getByRole('listitem').filter({hasText:'autosave'})).toBeVisible();
});
