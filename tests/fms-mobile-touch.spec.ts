import {test,expect,type CDPSession} from '@playwright/test';
import {create} from './fms-culture47-fixture';
test.use({hasTouch:true});

async function touch(c:CDPSession,type:'touchStart'|'touchMove'|'touchEnd',points:{x:number;y:number;id:number}[]){
 await c.send('Input.dispatchTouchEvent',{type,touchPoints:points});
}
test('real touch pinch repeats and secondary menus scroll without changing settings',async({page,context},info)=>{
 test.setTimeout(120000);
 await page.goto('/?fms=1&fmsDiagnostics=1');
 await page.getByLabel('整图种子',{exact:true}).fill('421730');
 await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
 const map=page.getByTestId('culture47-map');
 if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 const c=await context.newCDPSession(page);
 const camera=async()=>JSON.parse((await map.getAttribute('data-projection'))!);
 const b=(await map.boundingBox())!,x=b.width*.5,y=b.height*.4;
 const pinch=async(from:number,to:number)=>{
  await touch(c,'touchStart',[{id:1,x:x-from,y},{id:2,x:x+from,y}]);
  for(let i=1;i<=8;i++){const d=from+(to-from)*i/8;await touch(c,'touchMove',[{id:1,x:x-d,y},{id:2,x:x+d,y}]);}
  await touch(c,'touchEnd',[]);
 };
 const initial=await camera();await pinch(35,70);const enlarged=await camera();
 expect(enlarged.zoom/initial.zoom).toBeCloseTo(2,1);
 await pinch(70,35);expect((await camera()).zoom/initial.zoom).toBeCloseTo(1,1);
 await pinch(35,60);expect((await camera()).zoom/initial.zoom).toBeCloseTo(60/35,1);
 // The OS can cancel both pointers (app switching / browser interruption).
 await touch(c,'touchStart',[{id:1,x:x-30,y},{id:2,x:x+30,y}]);
 await c.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 const cancelled=await camera();await pinch(35,70);
 expect((await camera()).zoom/cancelled.zoom).toBeCloseTo(2,1);
 expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
 await page.getByRole('button',{name:'AI全局配置',exact:true}).tap();
 const panel=page.locator('.c47-ai-global');await expect(panel).toBeVisible();
 // Measure after the sheet's opening animation has settled.
 await panel.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));
 const box=(await panel.boundingBox())!;
 const checks=await panel.locator('input[type=checkbox]').evaluateAll(es=>es.map(e=>(e as HTMLInputElement).checked));
 const label=(await panel.locator('.c47-check').nth(2).boundingBox())!;
 await touch(c,'touchStart',[{id:1,x:label.x+70,y:label.y+20}]);
 for(let i=1;i<=5;i++)await touch(c,'touchMove',[{id:1,x:label.x+70,y:label.y+20-i*16}]);
 await touch(c,'touchEnd',[]);
 expect(await panel.locator('input[type=checkbox]').evaluateAll(es=>es.map(e=>(e as HTMLInputElement).checked))).toEqual(checks);
 const start=await panel.evaluate(e=>e.scrollTop);
 const px=box.x+box.width*.4,py=box.y+box.height-35;
 await touch(c,'touchStart',[{id:1,x:px,y:py}]);
 for(let i=1;i<=12;i++)await touch(c,'touchMove',[{id:1,x:px,y:py-i*18}]);
 await touch(c,'touchEnd',[]);
 const extent=await panel.evaluate(e=>e.scrollHeight-e.clientHeight);
 if(extent>70)await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(Math.min(extent,start+70)-1);
 expect(await panel.locator('input[type=checkbox]').evaluateAll(es=>es.map(e=>(e as HTMLInputElement).checked))).toEqual(checks);
 await page.screenshot({path:info.outputPath('mobile-touch-menu.png')});
 // A native fling consumes the first touch to stop its momentum (Chromium suppresses
 // that tap's click even after scrollTop settles at the end). Stop it on the inert title.
 await expect(async()=>{const top=await panel.evaluate(e=>e.scrollTop);await page.waitForTimeout(150);expect(await panel.evaluate(e=>e.scrollTop)).toBe(top);}).toPass({timeout:5000});
 const close=(await page.getByRole('button',{name:'关闭AI全局配置',exact:true}).boundingBox())!;
 await touch(c,'touchStart',[{id:1,x:box.x+20,y:close.y+close.height/2}]);await touch(c,'touchEnd',[]);
 await touch(c,'touchStart',[{id:1,x:close.x+close.width/2,y:close.y+close.height/2}]);await touch(c,'touchEnd',[]);await expect(panel).toBeHidden();
 await page.getByRole('button',{name:'国家',exact:true}).tap();
 const details=page.getByRole('complementary',{name:'文化与国家详情'});
 await expect(details).toBeVisible();await details.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));
 const db=(await details.boundingBox())!,cy=db.y+db.height-28,cx=db.x+db.width*.45;
 const before=await camera();
 await touch(c,'touchStart',[{id:1,x:cx,y:cy}]);
 for(let i=1;i<=10;i++)await touch(c,'touchMove',[{id:1,x:cx,y:cy-i*12}]);
 await touch(c,'touchEnd',[]);
 await expect.poll(()=>details.evaluate(e=>e.scrollTop)).toBeGreaterThan(40);
 expect(await camera()).toEqual(before);
 await page.screenshot({path:info.outputPath('mobile-touch-details.png')});await c.detach();
});
