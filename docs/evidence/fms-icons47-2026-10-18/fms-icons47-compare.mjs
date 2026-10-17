import {chromium} from '@playwright/test';
import fs from 'node:fs';
const [port,tag,w='1440',h='900',ax,ay]=process.argv.slice(2),out='.autopilot/fms-icons47/'+tag;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:+w,height:+h}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${port}/?fms=1&fmsDiagnostics=1`);
 await page.getByRole('button',{name:'预览整张地图'}).click({timeout:60000});
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});
 await page.waitForTimeout(2500);const ed=page.getByTestId('fms-canvas');const editor=await ed.evaluate(n=>({renderer:n.dataset.editorRenderer??null,stats:n.dataset.originalEditor?JSON.parse(n.dataset.originalEditor):null}));await page.screenshot({path:out+'/editor.png'});console.log(tag,'editor',JSON.stringify(editor));
 await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.waitForTimeout(800);
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByLabel('城市数量',{exact:true}).selectOption('60');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 const map=page.getByTestId('culture47-map');await map.waitFor({timeout:120000});
 await page.waitForFunction(()=>document.querySelector('[data-testid=culture47-map]')?.dataset.renderer==='original',{},{timeout:60000});
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'显示全图',exact:true}).click();await page.waitForTimeout(400);
 const read=()=>map.evaluate(n=>({projection:JSON.parse(n.dataset.projection),rivers:n.dataset.originalRivers?JSON.parse(n.dataset.originalRivers):null,tick:document.querySelector('[data-testid=culture47-app]')?.dataset.tick}));
 const views=[];views.push({factor:1,...await read()});await page.screenshot({path:out+'/zoom-1.png'});
 const box=await map.boundingBox(),anchor={x:Number(ax??box.width*.5),y:Number(ay??box.height*.5)};await page.mouse.move(box.x+anchor.x,box.y+anchor.y);
 let current=1;for(const factor of [4,12]){let remaining=Math.log(factor/current);while(remaining>1e-8){const d=Math.min(1,remaining);await page.mouse.wheel(0,-d/.002);await page.waitForTimeout(150);remaining-=d;}current=factor;await page.waitForTimeout(500);views.push({factor,...await read()});await page.screenshot({path:out+`/zoom-${factor}.png`});}
 fs.writeFileSync(out+'/results.json',JSON.stringify({port,tag,build:await page.evaluate(()=>fetch('/build.json').then(r=>r.json()).then(b=>({commit:b.commit,engine:b.culture47Fingerprint}))),anchor,views,errors},null,2));
 console.log(tag,JSON.stringify(views.map(v=>[v.factor,v.projection.zoom.toFixed(4),v.projection.x.toFixed(1),v.projection.y.toFixed(1),v.tick])),JSON.stringify(views[0].rivers),'errors',errors.length);
}catch(e){console.log(tag,'FAIL',e.message.split('\n')[0]);await page.screenshot({path:out+'/fail.png'});}finally{await browser.close();}
