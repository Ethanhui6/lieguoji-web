import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';
test.use({video:{mode:'on',size:{width:960,height:720}}});
test('actual army display changes continuously between slow Worker replies and keeps paused picking aligned',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await create(page);
 const app=page.getByTestId('culture47-app'),map=page.getByTestId('culture47-map'),speed=page.getByRole('button',{name:'切换推演速度',exact:true});await speed.click();await speed.click();await expect(speed).toHaveText('4×');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-tick')),{timeout:30000}).toBeGreaterThan(120);
 const frames=await page.evaluate(async()=>{const rows:{at:number;tick:string;display:number;armies:[string,{x:number;y:number}][]}[]=[],start=performance.now();await new Promise<void>(resolve=>{const frame=()=>{const map=document.querySelector<HTMLElement>('[data-testid="culture47-map"]'),app=document.querySelector<HTMLElement>('[data-testid="culture47-app"]');if(map?.dataset.displayPositions)rows.push({at:performance.now()-start,tick:app!.dataset.tick!,display:Number(map.dataset.displayTick),armies:JSON.parse(map.dataset.displayPositions).armies});if(performance.now()-start<12000)setTimeout(frame,50);else resolve();};frame();});return rows;});
 const groups=new Map<string,typeof frames>();for(const f of frames){const rows=groups.get(f.tick)??[];rows.push(f);groups.set(f.tick,rows);}
 const motion=[...groups.values()].flatMap(rows=>{if(rows.length<3)return[];return rows[0].armies.map(([id])=>{const points=rows.flatMap(r=>{const p=r.armies.find(a=>a[0]===id)?.[1];return p?[{...p,at:r.at}]:[];});const later=points.filter(p=>p.at-points[0].at>800);return{id,ms:rows.at(-1)!.at-rows[0].at,distinct:new Set(points.map(p=>`${p.x}/${p.y}`)).size,after800:new Set(later.map(p=>`${p.x}/${p.y}`)).size};});});
 expect(motion.some(m=>m.ms>1000&&m.distinct>=10&&m.after800>=3)).toBe(true);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});
 const paused=await map.getAttribute('data-display-positions');await page.waitForTimeout(400);expect(await map.getAttribute('data-display-positions')).toBe(paused);
 await page.getByRole('button',{name:'军事模式',exact:true}).click();const dismiss=page.getByRole('button',{name:'收起详情',exact:true});if(await dismiss.isVisible())await dismiss.click();
 const units=JSON.parse((await map.getAttribute('data-display-units'))!) as {id:string;kind:string;x:number;y:number}[],box=await map.boundingBox();const target=units.find(u=>u.kind==='army'&&u.x>70&&u.y>180&&u.x<box!.width-70&&u.y<box!.height-150&&units.every(v=>v.id===u.id||Math.hypot(u.x-v.x,u.y-v.y)>22));expect(target).toBeDefined();
 await map.click({position:{x:target!.x,y:target!.y}});await expect(page.getByRole('complementary',{name:'军队与舰队'})).toBeVisible();
 await page.screenshot({path:info.outputPath('continuous-army-selected.png')});expect(errors).toEqual([]);
 await info.attach('continuous-motion',{body:JSON.stringify({frames:frames.length,movingIntervals:motion.filter(m=>m.distinct>=10),selected:target,errors,physicalIphone:false}),contentType:'application/json'});
});
