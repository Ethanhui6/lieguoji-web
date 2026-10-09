import {test,expect,type Page} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

async function watchSimulation(page:Page){
 await page.addInitScript(()=>{
  const Real=window.Worker,evidence:{day:number;wars:number;history:number;armyOrders:number;fleetOrders:number;contacts:number}[]=[];
  Object.defineProperty(window,'activeWorldEvidence',{value:evidence});
  window.Worker=class extends Real{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{
   const r=event.data.snapshot?.run;if(!r?.armyAutonomy)return;
   evidence.push({day:r.world.day,wars:r.nativeWars.campaigns.length,history:r.chronicle.entries.length,armyOrders:(Object.values(r.armyAutonomy.armies) as {decision:string}[]).filter(a=>a.decision==='attacking').length,fleetOrders:(Object.values(r.navalAutonomy.fleets) as {decision:string}[]).filter(a=>a.decision==='attacking').length,contacts:r.forceContacts.pairs.length});
  });}};
 });
}
const readEvidence=(page:Page)=>page.evaluate(()=>(window as unknown as {activeWorldEvidence:{day:number;wars:number;history:number;armyOrders:number;fleetOrders:number;contacts:number}[]}).activeWorldEvidence);
const positions=async(page:Page)=>JSON.parse((await page.getByTestId('culture47-map').getAttribute('data-force-positions'))!) as {armies:[string,{x:number;y:number}][];fleets:[string,{x:number;y:number}][]};
const moved=(before:[string,{x:number;y:number}][],after:[string,{x:number;y:number}][])=>Math.max(0,...after.map(([id,p])=>{const q=before.find(([k])=>k===id)?.[1]??p;return Math.hypot(p.x-q.x,p.y-q.y);}));

test('peaceful founding makes autonomous decisions and declares a real war in its first month',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await watchSimulation(page);await enter(page);await create(page);
 const app=page.getByTestId('culture47-app');await page.locator('.c47-nations button').first().click();await page.getByRole('button',{name:'继续时间',exact:true}).click();
 await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:140000}).toBeGreaterThanOrEqual(30);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 const evidence=await readEvidence(page);expect(evidence.some(e=>e.wars>evidence[0].wars&&e.armyOrders>0)).toBe(true);expect(evidence.at(-1)!.history).toBeGreaterThan(evidence[0].history);
 await page.getByRole('button',{name:'查看大事记',exact:true}).click();await expect(page.locator('.c47-history')).toContainText('宣战');expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath('autonomous-first-month.png')});await info.attach('actual-simulation',{body:JSON.stringify({fixture:'synthetic terrain; unchanged founding countries, resources, RNG and positions; no manual declaration',evidence,errors,physicalIphone:false}),contentType:'application/json'});
});

test('normal generated war world visibly moves armies and fleets while country details stay open, then restores',async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await watchSimulation(page);
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app'),before=await positions(page);await page.screenshot({path:info.outputPath('normal-war-day-zero.png')});
 await page.locator('.c47-nations button').first().click();await page.locator('.c47-activity summary').click();await page.getByRole('button',{name:'继续时间',exact:true}).click();const start=Date.now();
 await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:120000}).toBeGreaterThanOrEqual(8);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 const elapsedMs=Date.now()-start,after=await positions(page),armyDistance=moved(before.armies,after.armies),fleetDistance=moved(before.fleets,after.fleets),tick=await app.getAttribute('data-tick');
 // Recovered native 240-wide world, not the superseded 100x speed trial.
 expect(armyDistance).toBeGreaterThan(1);expect(fleetDistance).toBeGreaterThan(4);expect(fleetDistance).toBeLessThanOrEqual((Number(tick)/120)*(11/12)+.001);
 await page.screenshot({path:info.outputPath('normal-war-active.png')});await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:30000});
 const evidence=await readEvidence(page);await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',tick!,{timeout:90000});expect(await positions(page)).toEqual(after);expect(errors).toEqual([]);
 await info.attach('normal-world-movement',{body:JSON.stringify({fixture:'Generate Continent UI, default seed 1337, 6 countries, 60 cities, war opening; no position/food edits',tick,elapsedMs,armyDistance,fleetDistance,evidence,errors,physicalIphone:false}),contentType:'application/json'});
});

test('lost graphics context stops time and rebuilds the same world before Continue can resume',async({page},info)=>{
 test.setTimeout(90000);await enter(page);await create(page);const app=page.getByTestId('culture47-app');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect(app).not.toHaveAttribute('data-tick','0');
 await page.getByTestId('culture47-map').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await expect(page.getByRole('alert')).toContainText('推演已暂停');await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});const stopped=await app.getAttribute('data-tick'),countries=await page.getByTestId('culture47-map').getAttribute('data-countries');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.waitForTimeout(600);await expect(app).toHaveAttribute('data-tick',stopped!);
 await page.getByRole('button',{name:'重新显示地图',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('culture47-map')).toHaveAttribute('data-countries',countries!);await expect(app).toHaveAttribute('data-tick',stopped!);
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-tick'))).toBeGreaterThan(Number(stopped));await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await info.attach('graphics-recovery',{body:JSON.stringify({injected:'context loss event; real renderer reconstruction',stopped,physicalGpuLoss:false}),contentType:'application/json'});
});
