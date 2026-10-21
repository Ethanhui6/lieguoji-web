import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

// Original GlobalTimeScaleManager levels; 1x = 10 days/s (secondsPerDay 0.1).
test('original speed levels: steady-state days per second at 1x, 3x and 5x',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app'),button=page.getByRole('button',{name:'切换推演速度',exact:true});
 await expect(button).toHaveText('1倍速');
 const labels=[];for(let i=0;i<7;i++){labels.push(await button.textContent());await button.click();}
 expect(labels).toEqual(['1倍速','2倍速','3倍速','4倍速','5倍速','0.1倍速','0.5倍速']);
 for(let i=0;i<8&&(await button.textContent())!=='1倍速';i++)await button.click();
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.waitForTimeout(3000);
 const samples:{speed:number;daysPerSecond:number}[]=[];
 for(const speed of [1,3,5]){
  for(let i=0;i<8&&(await button.textContent())!==speed+'倍速';i++)await button.click();await expect(button).toHaveText(speed+'倍速');
  await page.waitForTimeout(1000);const from=Number(await app.getAttribute('data-tick')),start=Date.now();await page.waitForTimeout(5000);
  samples.push({speed,daysPerSecond:(Number(await app.getAttribute('data-tick'))-from)/120/((Date.now()-start)/1000)});
 }
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await page.screenshot({path:info.outputPath('speed-levels.png')});
 console.log(JSON.stringify({samples,pipeline:await app.getAttribute('data-pipeline')}));
 await info.attach('speed-levels',{body:JSON.stringify({samples,original:{1:10,3:30,5:50}}),contentType:'application/json'});
 expect(samples[0].daysPerSecond).toBeGreaterThan(5);expect(errors).toEqual([]);
});
