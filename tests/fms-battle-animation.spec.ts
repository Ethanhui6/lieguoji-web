import {test,expect,type Page} from '@playwright/test';

type Frame={id:string;frame:number;width:number;observedAt?:number};
async function frames(page:Page){return page.locator('.fms-play-map canvas').evaluate(canvas=>JSON.parse((canvas as HTMLCanvasElement).dataset.battleFrames??'[]') as Frame[]);}
async function confirm(page:Page){await page.getByRole('button',{name:'确认执行',exact:true}).click();await expect(page.getByRole('dialog',{name:'命令确认'})).toBeHidden();}

test('FMS: original battle clip follows a real naval contact, pauses and respects reduced motion',async({page},info)=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');await expect(page.getByRole('button',{name:'进入世界 →',exact:true})).toBeEnabled();
  const canvas=page.getByTestId('fms-canvas'),b=(await canvas.boundingBox())!,size=Math.min(b.width*.12,85),cy=b.y+b.height*.47;
  for(const fraction of [.31,.69]){const cx=b.x+b.width*fraction;await page.mouse.move(cx-size,cy-size);await page.mouse.down();for(const [x,y]of [[cx+size,cy-size],[cx+size,cy+size],[cx-size,cy+size],[cx-size,cy-size]])await page.mouse.move(x,y,{steps:8});await page.mouse.up();}
  await expect.poll(async()=>Number(await page.getByTestId('fms-app').getAttribute('data-land-cells'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByRole('button',{name:'从当前地图开新局',exact:true}).click();await expect(page.locator('.play-header')).toContainText('第 0 日',{timeout:30000});
  await page.getByRole('button',{name:'保存进度',exact:true}).click();await expect(page.locator('.play-notice')).toContainText('已保存');
  // Read only the generated fleet IDs/ports; never inject combat or a fixture save.
  const fleets=await page.evaluate(async()=>new Promise<{id:string;nationId:string;dockId:string}[]>((resolve,reject)=>{const q=indexedDB.open('lieguoji-fms-campaign-v1');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,t=db.transaction('saves'),r=t.objectStore('saves').get('current');r.onsuccess=()=>resolve(r.result.run.navy.fleets.map((f:{id:string;nationId:string;dockId:string})=>({id:f.id,nationId:f.nationId,dockId:f.dockId})));t.oncomplete=()=>db.close();};}));
  expect(fleets).toHaveLength(2);const [a,bFleet]=fleets;
  await page.getByRole('button',{name:'海军',exact:true}).click();
  await page.getByLabel('海军国家',{exact:true}).selectOption(bFleet.nationId);await page.getByLabel('选择舰队',{exact:true}).selectOption(bFleet.id);await page.getByLabel('本国港口间自动巡航',{exact:true}).click();await confirm(page);await expect(page.getByLabel('本国港口间自动巡航',{exact:true})).not.toBeChecked();
  await page.getByLabel('海军国家',{exact:true}).selectOption(a.nationId);await page.getByLabel('选择舰队',{exact:true}).selectOption(a.id);await page.getByLabel('海战目标海岸',{exact:true}).selectOption(bFleet.dockId);await page.getByRole('button',{name:'预览驶向敌岸',exact:true}).click();await confirm(page);
  const status=page.locator('.play-maritime [role=status]');
  for(let day=0;day<50&&!((await status.textContent())??'').includes('交锋');day++){const before=await page.getByTestId('fms-play').getAttribute('data-day');await page.getByRole('button',{name:'＋1日',exact:true}).click();await expect(page.getByTestId('fms-play')).not.toHaveAttribute('data-day',before!);}
  await expect(status).toContainText('交锋');await page.getByRole('button',{name:'定位舰队',exact:true}).click();
  const id=`sea:${[a.id,bFleet.id].sort().join('/')}`;
  await expect.poll(async()=>(await frames(page)).some(f=>f.id===id)).toBe(true);
  const paused=(await frames(page)).find(f=>f.id===id)!;expect(paused.width).toBeLessThanOrEqual(42);expect(paused.width).toBeGreaterThan(0);
  // Observe actual sprite texture frames over rendered animation callbacks.
  const sample=async()=>page.locator('.fms-play-map canvas').evaluate(async canvas=>{const result:Frame[][]=[];const start=performance.now();while(performance.now()-start<400){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));result.push((JSON.parse((canvas as HTMLCanvasElement).dataset.battleFrames??'[]') as Frame[]).map(f=>({...f,observedAt:performance.now()})));}return result;});
  expect((await sample()).every(fs=>fs.find(f=>f.id===id)?.frame===paused.frame)).toBe(true);
  await page.getByLabel('推演速度',{exact:true}).selectOption('0.5');await page.getByRole('button',{name:'开始时间',exact:true}).click();await expect.poll(async()=>{const frame=(await frames(page)).find(f=>f.id===id);return !!frame&&frame.frame!==paused.frame;}).toBe(true);
  const politicalBuilds=await page.locator('.fms-play-map canvas').getAttribute('data-political-builds');
  const moving=await sample();expect(new Set(moving.flatMap(fs=>fs.filter(f=>f.id===id).map(f=>f.frame))).size).toBeGreaterThan(1);await info.attach('production-animation-sample',{body:JSON.stringify({scope:'Chromium emulation, not physical device',samples:moving}),contentType:'application/json'});
  await page.getByRole('button',{name:'暂停',exact:true}).click();const stopped=(await frames(page)).find(f=>f.id===id)!;expect((await sample()).every(fs=>fs.find(f=>f.id===id)?.frame===stopped.frame)).toBe(true);
  expect(await page.locator('.fms-play-map canvas').getAttribute('data-political-builds')).toBe(politicalBuilds);
  await page.getByRole('button',{name:'放大推演地图',exact:true}).click();await expect.poll(async()=>Number(await page.locator('.fms-play-map canvas').getAttribute('data-political-builds'))).toBeGreaterThan(Number(politicalBuilds));
  await page.getByRole('button',{name:'缩小推演地图',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>(await frames(page)).find(f=>f.id===id)?.frame).toBe(0);
  await page.getByRole('button',{name:'开始时间',exact:true}).click();expect((await sample()).every(fs=>fs.find(f=>f.id===id)?.frame===0)).toBe(true);await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('button',{name:'战争',exact:true}).click();await expect(page.getByRole('region',{name:'战役总览'})).toBeVisible();await page.locator('.play-war-list button').filter({hasText:'海上交锋'}).first().click();await expect(page.locator('.play-war-focus')).toContainText('2 国参战');await expect(page.locator('.play-war-country')).toHaveCount(2);await expect(page.locator('.play-war-focus')).toContainText('舰体总完整度');
  // The same visible marker opens the comparison, without issuing an order.
  await page.getByRole('button',{name:'收起面板',exact:true}).click();
  const mark=await page.locator('.fms-play-map canvas').evaluate((canvas,id)=>(JSON.parse((canvas as HTMLCanvasElement).dataset.wars??'[]') as {x:number;y:number;ids:string[]}[]).find(m=>m.ids.includes(id)),id);
  expect(mark).toBeDefined();const bounds=(await page.locator('.fms-play-map canvas').boundingBox())!;await page.mouse.click(bounds.x+mark!.x,bounds.y+mark!.y);await expect(page.locator('.play-war-focus')).toContainText('2 国参战');
  await page.screenshot({path:info.outputPath('original-naval-contact.png')});
  if(info.project.name==='mobile-chromium'){await page.setViewportSize({width:428,height:926});await expect(page.locator('.play-war-focus')).toContainText('2 国参战');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(428);await page.screenshot({path:info.outputPath('original-naval-contact-428x926.png')});}
  // Let the same real contact finish. A lost fleet leaves a short visual tombstone,
  // while its selectable ship and the resolved battle are already removed.
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Observe the real paint mutation, including a short transition between RAFs.
  // Advance actual simulation days with the UI; wall-clock playback can be slower
  // on a loaded test host and is not evidence that a fleet has already sunk.
  await page.locator('.fms-play-map canvas').evaluate(canvas=>{canvas.setAttribute('data-test-sink-observed','');const observer=new MutationObserver(()=>{const frames=JSON.parse((canvas as HTMLCanvasElement).dataset.sinkAnimations??'[]') as {id:string;scale:number;alpha:number}[];if(frames.length){canvas.setAttribute('data-test-sink-observed',JSON.stringify({frames,selectable:JSON.parse((canvas as HTMLCanvasElement).dataset.unitPositions??'[]') as {id:string}[]}));observer.disconnect();}});observer.observe(canvas,{attributes:true,attributeFilter:['data-sink-animations']});});
  for(let day=0;day<32&&!(await page.locator('.fms-play-map canvas').getAttribute('data-test-sink-observed'));day++){const tick=await page.locator('.fms-play-map canvas').getAttribute('data-sim-tick');await page.getByRole('button',{name:'＋1日',exact:true}).click();await expect(page.locator('.fms-play-map canvas')).not.toHaveAttribute('data-sim-tick',tick!);}
  const sinking=await page.locator('.fms-play-map canvas').evaluate(canvas=>JSON.parse(canvas.getAttribute('data-test-sink-observed')||'null') as {frames:{id:string;scale:number;alpha:number}[];selectable:{id:string}[]}|null);
  if(!sinking)await info.attach('missing-sink-diagnostic',{body:JSON.stringify(await page.locator('.fms-play-map canvas').evaluate(canvas=>({stats:(canvas as HTMLCanvasElement).dataset.sinkStats,day:document.querySelector('.play-header')?.textContent}))),contentType:'application/json'});
  expect(sinking).not.toBeNull();expect(sinking!.frames.every(f=>f.scale>0&&f.scale<=1&&f.alpha>0&&f.alpha<=.95)).toBe(true);expect(sinking!.frames.every(f=>!sinking!.selectable.some(unit=>unit.id===f.id))).toBe(true);
  await expect(page.getByRole('button',{name:'开始时间',exact:true})).toBeVisible();await expect.poll(()=>page.locator('.fms-play-map canvas').getAttribute('data-sink-animations')).toBe('[]');await expect.poll(async()=>(await frames(page)).some(f=>f.id===id)).toBe(false);
  expect(errors).toEqual([]);
});
