import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('a zero-sized app panel can open and become visible without breaking the map or Continue controls',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.id='test-collapsed-panel';style.textContent='.fms-map,.c47-map{width:0!important;height:0!important;visibility:hidden!important}';document.head.append(style);}));
 await enter(page);await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 await expect(page.getByTestId('culture47-map')).toBeAttached({timeout:30000});
 await page.evaluate(()=>document.getElementById('test-collapsed-panel')?.remove());await expect(page.getByTestId('culture47-map')).toBeVisible();
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await page.getByTestId('culture47-app').getAttribute('data-tick')),{timeout:30000}).toBeGreaterThan(0);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();expect(errors).toEqual([]);await expect(page.locator('.c47-notice').filter({hasText:'有限正数'})).toHaveCount(0);
});

for(const cancelRecovery of [false,true])test(`Continue recovers a terminated Worker from the acknowledged journal; cancel automatic resume=${cancelRecovery}`,async({page},info)=>{
 test.setTimeout(90000);
 // Fault injection only in this isolated browser. The replacement still runs
 // the actual built Worker and its complete journal validation/replay.
 await page.addInitScript(({delayRecovery})=>{
  const RealWorker=window.Worker;let failed=false;
  const evidence:{type:string;actions?:number}[]=[];Object.defineProperty(window,'resumeWorkerEvidence',{value:evidence});
  window.Worker=class extends RealWorker{
   postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){
    const c=(message as {command?:{type:string;action?:{kind:string};journal:{actions:unknown[]}}})?.command;
    if(c?.type==='load'){evidence.push({type:'load',actions:c.journal.actions.length});if(delayRecovery){setTimeout(()=>super.postMessage(message),1000);return;}}
    if(!failed&&c?.type==='action'&&c.action?.kind==='advance'){failed=true;evidence.push({type:'injected-error'});setTimeout(()=>this.dispatchEvent(new Event('error')),0);return;}
    if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);
   }
  };
 },{delayRecovery:cancelRecovery});
 await enter(page);await create(page,60);const app=page.getByTestId('culture47-app');await expect(app).toHaveAttribute('data-tick','0');
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('点击继续可恢复');await expect(app).toHaveAttribute('data-tick','0');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();
 if(cancelRecovery){await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('推演已恢复',{timeout:30000});await page.waitForTimeout(600);await expect(app).toHaveAttribute('data-tick','0');await expect(page.getByRole('button',{name:'继续时间',exact:true})).toBeVisible();}
 else{await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:30000}).toBeGreaterThan(0);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');}
 const tick=Number(await app.getAttribute('data-tick'));expect(tick).toBeLessThan(120);
 const evidence=await page.evaluate(()=>(window as unknown as {resumeWorkerEvidence:unknown}).resumeWorkerEvidence);expect(evidence).toEqual([{type:'injected-error'},{type:'load',actions:0}]);
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await info.attach('worker-recovery',{body:JSON.stringify({fault:'synthetic worker error before first advance; real Worker restart and zero-action journal replay',cancelRecovery,tick,evidence,physicalIphone:false}),contentType:'application/json'});
});

test('the saved-world Continue button retries after its loading Worker fails, without replacing the save',async({page})=>{
 test.setTimeout(90000);await enter(page);await create(page,60);
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 await page.addInitScript(()=>{const RealWorker=window.Worker;let failed=false;window.Worker=class extends RealWorker{postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){const type=(message as {command?:{type:string}})?.command?.type;if(type==='load'&&!failed){failed=true;setTimeout(()=>this.dispatchEvent(new Event('error')),0);return;}if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}};});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('可以重新点击');
 await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:30000});await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-tick','0');
 await page.getByRole('button',{name:'返回绘图',exact:true}).click();await expect(page.getByRole('dialog',{name:'保存后离开'})).not.toBeVisible();await expect(page.getByRole('button',{name:'进入世界 →',exact:true})).toBeVisible();
});

test('normal generated continent resumes, acknowledges busy controls and restores the exact saved tick',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();
 await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByLabel('城市数量',{exact:true}).selectOption('120');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 const app=page.getByTestId('culture47-app');await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});
 await page.getByRole('button',{name:'切换推演速度',exact:true}).click();await page.getByRole('button',{name:'切换推演速度',exact:true}).click();
 const started=Date.now();await page.getByRole('button',{name:'继续时间',exact:true}).click();
 await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:30000}).toBeGreaterThanOrEqual(120);
 const firstDayMs=Date.now()-started;
 await expect(app).toHaveAttribute('data-advancing','true');const before=Number(await app.getAttribute('data-tick'));
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:30000}).toBeGreaterThanOrEqual(before+120);
 await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 const paused=await app.getAttribute('data-tick');await page.waitForTimeout(600);await expect(app).toHaveAttribute('data-tick',paused!);
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','true');
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:90000});const saved=await app.getAttribute('data-tick');
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick',saved!,{timeout:90000});
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','true');
 await page.getByRole('button',{name:'返回绘图',exact:true}).click();await expect(page.getByRole('dialog',{name:'保存后离开'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'继续查看',exact:true}).click();await expect(page.getByRole('button',{name:'继续时间',exact:true})).toBeVisible();
 expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('normal-world-resumed.png')});
 await info.attach('resume-evidence',{body:JSON.stringify({fixture:'normal Generate Continent UI, seed 1337, 36864 points, 6 nations, 120 cities; no private save',firstDayMs,savedTick:saved,errors,physicalIphone:false}),contentType:'application/json'});
});
