import {test,expect,type Locator,type Page} from '@playwright/test';
import {create} from './fms-culture47-fixture';
test.use({video:{mode:'on',size:{width:960,height:720}}});
type MapUnit={id:string;kind:string;x:number;y:number};
type MapCity={id:string;name:string;nationId:string;x:number;y:number};
async function issueReachableMarch(page:Page,map:Locator){
 await page.getByRole('button',{name:'军事模式',exact:true}).click();
 const chooser=page.getByLabel('选择部队'),army=await chooser.locator('option').evaluateAll(options=>{const option=options.find(v=>v instanceof HTMLOptionElement&&v.value.startsWith('army/')) as HTMLOptionElement|undefined;return option?{value:option.value,label:option.textContent??''}:null;});
 expect(army).not.toBeNull();const selected=army!;
 const nation=await map.evaluate((node:HTMLElement,label:string)=>{const countries=JSON.parse(node.dataset.countries??'[]') as {id:string;name:string}[];return countries.filter(v=>label.startsWith(v.name+'第')).sort((a,b)=>b.name.length-a.name.length)[0]?.id??null;},selected.label);
 expect(nation).not.toBeNull();
 const forceId=selected.value.slice('army/'.length),unit=await map.evaluate((node:HTMLElement,id:string)=>{const positions=JSON.parse(node.dataset.displayPositions??'{"armies":[]}') as {armies:[string,{x:number;y:number}][]};const point=positions.armies.find(([forceId])=>forceId===id)?.[1];return point?{id,kind:'army',...point}:null;},forceId) as MapUnit|null;
 expect(unit).not.toBeNull();
 const target=await map.evaluate((node:HTMLElement,{nation,unit}:{nation:string;unit:MapUnit})=>{const cities=JSON.parse(node.dataset.cities??'[]') as MapCity[];return cities.filter(city=>city.nationId===nation&&Math.hypot(city.x-unit.x,city.y-unit.y)>12).sort((a,b)=>Math.hypot(b.x-unit.x,b.y-unit.y)-Math.hypot(a.x-unit.x,a.y-unit.y))[0]??null;},{nation:nation!,unit:unit!});
 expect(target).not.toBeNull();
 await chooser.selectOption(selected.value);await page.getByRole('button',{name:'调遣',exact:true}).click();
 await map.click({position:{x:target!.x,y:target!.y}});const confirm=page.getByRole('button',{name:'确认军令',exact:true});await expect(confirm).toBeVisible();await confirm.click();await expect(confirm).toHaveCount(0);
 return {forceId,target};
}
test('actual army display changes continuously between slow Worker replies and keeps paused picking aligned',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // RAF may present an accepted reply before React commits its date attribute.
 // Use the independent Worker ACK as the authority, keeping both display and
 // React dates bounded by it rather than treating React's older render as truth.
 await page.addInitScript(()=>{const W=Worker;window.Worker=class extends W{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{const display=event.data.display;if(display){(window as unknown as {motionAckTick:number}).motionAckTick=display.kind==='full'?display.snapshot.run.clock.tick:display.tick;}});}};});
 await page.goto('/?fms=1&fmsDiagnostics=1');await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app'),map=page.getByTestId('culture47-map'),march=await issueReachableMarch(page,map),speed=page.getByRole('button',{name:'切换推演速度',exact:true});await speed.click();await speed.click();await expect(speed).toHaveText('3倍速');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:30000}).toBeGreaterThan(120);
 const frames=await page.evaluate(async()=>{const rows:{at:number;tick:string;accepted:number;worker:number;display:number;armies:[string,{x:number;y:number}][]}[]=[],start=performance.now();await new Promise<void>(resolve=>{const frame=()=>{const map=document.querySelector<HTMLElement>('[data-testid="culture47-map"]'),app=document.querySelector<HTMLElement>('[data-testid="culture47-app"]');if(map?.dataset.displayPositions)rows.push({at:performance.now()-start,tick:app!.dataset.tick!,accepted:Number(map.dataset.acceptedTick),worker:(window as unknown as {motionAckTick:number}).motionAckTick,display:Number(map.dataset.displayTick),armies:JSON.parse(map.dataset.displayPositions).armies});if(performance.now()-start<6000)setTimeout(frame,16);else resolve();};frame();});return rows;});
 const groups=new Map<string,typeof frames>();for(const f of frames){const rows=groups.get(f.tick)??[];rows.push(f);groups.set(f.tick,rows);}
 const motion=[...groups.values()].flatMap(rows=>{if(rows.length<2)return[];const points=rows.flatMap(r=>{const p=r.armies.find(a=>a[0]===march.forceId)?.[1];return p?[{...p,at:r.at}]:[];});if(points.length<2)return[];const moved=points.filter(p=>Math.hypot(p.x-points[0].x,p.y-points[0].y)>1e-4),changes=points.filter((p,index)=>index===0||Math.hypot(p.x-points[index-1].x,p.y-points[index-1].y)>1e-4),gaps=changes.slice(1).map((p,index)=>p.at-changes[index].at);return[{tick:rows[0].tick,ms:rows.at(-1)!.at-rows[0].at,distinct:new Set(points.map(p=>`${p.x}/${p.y}`)).size,movingMs:moved.length?moved.at(-1)!.at-points[0].at:0,changes,gaps}];});
 await info.attach('continuous-motion-samples',{body:JSON.stringify({frames:frames.length,motion,march,errors,physicalIphone:false}),contentType:'application/json'});
 expect(frames.every(frame=>Number.isFinite(frame.accepted)&&frame.display<=frame.accepted+.001&&frame.accepted<=frame.worker&&Number(frame.tick)<=frame.worker)).toBe(true);expect(motion.some(m=>m.distinct>=3&&m.changes.length>=3&&m.gaps.every(gap=>gap>0&&gap<=750))).toBe(true);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 // Pause settles the already accepted tail; compare actual coordinates
 // after its terminal paint, not incidental trace metadata
 // (endpoint points carry a tick while interpolated points contain x/y only).
 await expect(map).toHaveAttribute('data-display-tick',(await app.getAttribute('data-tick'))!);
 await expect(map).toHaveAttribute('data-accepted-tick',(await app.getAttribute('data-tick'))!);
 expect(Number(await app.getAttribute('data-tick'))).toBe(await page.evaluate(()=>(window as unknown as {motionAckTick:number}).motionAckTick));
 const pose=async()=>{const value=JSON.parse((await map.getAttribute('data-display-positions'))!) as Record<'armies'|'fleets',[string,{x:number;y:number}][]>;return {armies:value.armies.map(([id,{x,y}])=>[id,x,y]),fleets:value.fleets.map(([id,{x,y}])=>[id,x,y])};};
 const paused=await pose(),pausedTick=await map.getAttribute('data-display-tick');await page.waitForTimeout(400);expect(await pose()).toEqual(paused);expect(await map.getAttribute('data-display-tick')).toBe(pausedTick);
 const militaryMode=page.getByRole('button',{name:'军事模式',exact:true});if(await militaryMode.getAttribute('aria-pressed')!=='true')await militaryMode.click();const dismiss=page.getByRole('button',{name:'收起详情',exact:true});if(await dismiss.isVisible())await dismiss.click();
 const units=JSON.parse((await map.getAttribute('data-display-units'))!) as {id:string;kind:string;x:number;y:number}[],box=await map.boundingBox();const target=units.find(u=>u.kind==='army'&&u.x>70&&u.y>180&&u.x<box!.width-70&&u.y<box!.height-150&&units.every(v=>v.id===u.id||Math.hypot(u.x-v.x,u.y-v.y)>22));expect(target).toBeDefined();
 await map.click({position:{x:target!.x,y:target!.y}});await expect(page.getByRole('complementary',{name:'军队与舰队'})).toBeVisible();
 await page.screenshot({path:info.outputPath('continuous-army-selected.png')});expect(errors).toEqual([]);
 await info.attach('continuous-motion',{body:JSON.stringify({frames:frames.length,movingIntervals:motion,march,selected:target,errors,physicalIphone:false}),contentType:'application/json'});
});
