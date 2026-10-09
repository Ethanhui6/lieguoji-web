import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('peaceful normal world autonomously declares actual wars with live goals and persistent history',async({page},info)=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').uncheck();await create(page);
 const app=page.getByTestId('culture47-app');await page.getByRole('button',{name:'查看大事记',exact:true}).click();const history=page.getByRole('region',{name:'文化世界史书'});
 const opening=await history.locator('li article>p').allTextContents();expect(opening.some(t=>t.includes('宣战'))).toBe(false);
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:180000,intervals:[500]}).toBeGreaterThanOrEqual(65);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 // A peaceful opening can retain its full regular force and need no emergency
 // muster in 65 days. Verify the actual autonomous declaration and live war,
 // rather than require recruitment without a vacancy or a threatened core.
 const records=await history.locator('li article>p').allTextContents();expect(records.some(t=>t.includes('宣战'))).toBe(true);expect(records.length).toBeGreaterThan(opening.length);
 const war=history.locator('li').filter({hasText:'宣战'}).first();await war.locator('summary').click();await expect(war.locator('details')).toContainText('目标：');
 await war.getByRole('button').first().click();await expect(page.locator('.c47-diplomacy')).toContainText(/第 [1-9]\d* 日宣战/);await expect(page.locator('.c47-diplomacy')).toContainText(/[1-9]\d* 项目标/);
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();
 const tick=await app.getAttribute('data-tick');await page.screenshot({path:info.outputPath('autonomous-peaceful-history.png')});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:120000});
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();expect(await history.locator('li article>p').allTextContents()).toEqual(records);expect(errors).toEqual([]);
 await info.attach('autonomous-history',{body:JSON.stringify({tick,opening,records,errors,normalMap:true,peacefulOpening:true,noScriptedWar:true,exactRestore:true,physicalIphone:false}),contentType:'application/json'});
});
