import {tool} from './fms-culture47-fixture';
import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('normal war world records real opening goals and monthly mobilization while history remains open',async({page},info)=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app');await tool(page,'查看大事记');
 const history=page.getByRole('region',{name:'文化世界史书'});await expect(history).toBeVisible();await expect(page.getByRole('combobox',{name:'大事记范围'})).toHaveValue('important');await page.getByRole('combobox',{name:'大事记范围'}).selectOption('all');await expect(page.getByRole('combobox',{name:'大事记范围'})).toHaveValue('all');await page.getByRole('combobox',{name:'大事记范围'}).selectOption('important');const opening=await history.locator('li article>p').allTextContents();expect(opening.some(t=>t.includes('宣战'))).toBe(true);
 const war=history.locator('li').filter({hasText:'宣战'}).first();await war.locator('summary').click();await expect(war.locator('details')).toContainText('进攻阵营');await expect(war.locator('details')).toContainText('目标：');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:180000,intervals:[500]}).toBeGreaterThanOrEqual(35);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 const records=await history.locator('li article>p').allTextContents();expect(records.some(t=>/紧急动员|补充常备|新编|征募/.test(t))).toBe(true);expect(records.length).toBeGreaterThan(opening.length);expect(records.some(t=>t.includes('取得'))).toBe(false);
 const muster=history.locator('li').filter({hasText:/新编\d+支常备军|紧急动员，征召\d+支军队/}).first();await expect(muster.locator('.c47-history-meta')).toContainText(/征募|紧急动员/);await muster.locator('summary').click();await expect(muster.locator('details')).not.toContainText(/内部人口|真实位置|网页|原月检/);
 const tick=await app.getAttribute('data-tick');await page.screenshot({path:info.outputPath('live-major-history.png')});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:90000});
 await tool(page,'查看大事记');expect(await history.locator('li article>p').allTextContents()).toEqual(records);expect(errors).toEqual([]);
 await info.attach('major-history',{body:JSON.stringify({tick,opening,records,errors,normalMap:true,historyOpenWhilePlaying:true,exactRestore:true,physicalIphone:false}),contentType:'application/json'});
});
