import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('opening history, real branch appointment and continuous calendar survive ordinary save/reload',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page,'00000000-0000-4000-8000-00000000065b');await page.getByLabel('国家数量',{exact:true}).selectOption('2');await create(page,24);
 const app=page.getByTestId('culture47-app'),clock=page.getByLabel('当前日期',{exact:true});await expect(clock).toHaveText('公元1年1月1日');
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();const history=page.getByRole('region',{name:'文化世界史书'});await expect(history).toContainText('开篇：建国已');await expect(history).not.toContainText('开国就任');
 await history.locator('.c47-history-nations button').last().click();await expect(page.getByRole('region',{name:'国家实况'})).toContainText('始于开篇之前');
 const houses=page.locator('.c47-houses');await houses.locator('summary').click();
 // Try actual registered adults; no synthetic person IDs are inserted.
 const form=async()=>{const candidates=await page.getByLabel('支系家主',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));
  for(const id of candidates){await page.getByLabel('支系家主',{exact:true}).selectOption(id);await page.getByRole('button',{name:'预览分封',exact:true}).click();if(await page.getByRole('group',{name:'确认家族分封'}).isVisible())return;}
  throw Error('No actual eligible household');
 };
 const oldCount=await houses.locator('[data-family-id]').count();await form();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount);
 await form();await page.getByRole('button',{name:'确认分封',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount+1);
 await form();await page.getByRole('button',{name:'确认分封',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount+2);
 const familyRows=await houses.locator('[data-family-id]').allTextContents();await page.screenshot({path:info.outputPath('existing-country-family-branches.png')});
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:60000}).toBeGreaterThan(2);
 const timeline=await page.evaluate(async()=>{const rows:{day:number;tick:number;endpoint:number;text:string}[]=[];const end=performance.now()+4000;while(performance.now()<end){const n=document.querySelector<HTMLElement>('.c47-calendar')!,app=document.querySelector<HTMLElement>('[data-testid="culture47-app"]')!;rows.push({day:Number(n.dataset.day),tick:Number(n.dataset.displayTick),endpoint:Number(app.dataset.tick),text:n.textContent!});await new Promise(r=>setTimeout(r,25));}return rows;});
 expect(timeline.length).toBeGreaterThan(20);expect(timeline.every(v=>v.day===Math.floor(v.tick/120)&&v.tick<=v.endpoint)).toBe(true);expect(timeline.at(-1)!.tick).toBeGreaterThan(timeline[0].tick);expect(timeline.some(v=>v.tick<v.endpoint)).toBe(true);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});await expect(clock).toHaveAttribute('data-display-tick',(await app.getAttribute('data-tick'))!);const pause=await clock.textContent();await page.waitForTimeout(350);await expect(clock).toHaveText(pause!);
 // Simulation can now establish an additional branch while the clock runs.
 // Restoration must match the actual paused save point, not the earlier day-zero census.
 const savedRows=await houses.locator('[data-family-id]').allTextContents();expect(savedRows.length).toBeGreaterThanOrEqual(familyRows.length);
 for(const row of familyRows)expect(savedRows.some(s=>s.startsWith(row.split('族长')[0]))).toBe(true);
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});const savedTick=await app.getAttribute('data-tick');
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',savedTick!,{timeout:60000});
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();await expect(history).toContainText('建立');await history.locator('.c47-history-nations button').last().click();await houses.locator('summary').click();
 const restored=await houses.locator('[data-family-id]').allTextContents();expect(restored).toEqual(savedRows);expect(errors).toEqual([]);
 await info.attach('branch-and-clock',{body:JSON.stringify({familyRows,savedRows,restored,savedTick,timeline,errors,physicalIphone:false}),contentType:'application/json'});
});
