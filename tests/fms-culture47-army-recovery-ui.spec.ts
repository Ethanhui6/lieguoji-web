import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('a new normal continent enables army recovery and keeps it after save and reload',async({page},info)=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const observed:{rule:string;enabledTick:number;tick:number}[]=[];
  Object.defineProperty(window,'recoveryEvidence',{value:observed});
  // Live updates carry only a delta; the client announces each decoded world.
  window.addEventListener('culture47-snapshot',event=>{
   const run=(event as CustomEvent).detail.run;
   if(run?.armyRecovery)observed.push({rule:run.armyRecovery.rule,enabledTick:run.armyRecovery.enabledTick,tick:run.clock.tick});
  });
 });
 await page.goto('/?fms=1');
 await page.getByRole('button',{name:'生成大陆',exact:true}).click();
 await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app');
 const records=()=>page.evaluate(()=>(window as unknown as {recoveryEvidence:{rule:string;enabledTick:number;tick:number}[]}).recoveryEvidence);
 await expect.poll(async()=>((await records()).at(-1)?.rule),{timeout:30000}).toBe('wounded-army-recovery-web-v1');
 await page.getByRole('button',{name:'推进一天',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick','120',{timeout:30000});
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick','120',{timeout:90000});
 const after=await records();expect(after.at(-1)).toMatchObject({rule:'wounded-army-recovery-web-v1',enabledTick:0,tick:120});
 expect(errors).toEqual([]);
 await info.attach('recovery-ui-save',{body:JSON.stringify({observed:after,normalGeneratedMap:true,physicalIphone:false,errors}),contentType:'application/json'});
});
