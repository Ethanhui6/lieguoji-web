import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('normal continent has measured authoritative throughput at 1x and 4x with details open',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app');
 // Both rates start from the SAME saved opening, not successive war stages.
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 const samples:{speed:number;fromTick:number;toTick:number;ms:number;daysPerSecond:number}[]=[];
 for(const speed of [1,4]){
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
  await expect(app).toHaveAttribute('data-tick','0',{timeout:90000});await page.locator('.c47-nations button').first().click();
  const button=page.getByRole('button',{name:'切换推演速度',exact:true});for(let i=0;i<4&&(await button.textContent())!==speed+'×';i++)await button.click();await expect(button).toHaveText(speed+'×');
  const fromTick=Number(await app.getAttribute('data-tick')),start=Date.now();await page.getByRole('button',{name:'继续时间',exact:true}).click();
  await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:70000,intervals:[100]}).toBeGreaterThanOrEqual(fromTick+1200);
  await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:20000});
  const toTick=Number(await app.getAttribute('data-tick')),ms=Date.now()-start;expect(toTick%120).toBe(0);samples.push({speed,fromTick,toTick,ms,daysPerSecond:(toTick-fromTick)/120/(ms/1000)});
 }
 await page.screenshot({path:info.outputPath('normal-world-throughput.png')});
 const tick=await app.getAttribute('data-tick'),positions=await page.getByTestId('culture47-map').getAttribute('data-force-positions');
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick',tick!,{timeout:90000});expect(await page.getByTestId('culture47-map').getAttribute('data-force-positions')).toBe(positions);expect(errors).toEqual([]);
 console.log(JSON.stringify({samples,errors}));await info.attach('measured-throughput',{body:JSON.stringify({samples,errors,normalMap:true,sameOpening:true,detailsOpen:true,exactRestore:true,physicalIphone:false}),contentType:'application/json'});
});
