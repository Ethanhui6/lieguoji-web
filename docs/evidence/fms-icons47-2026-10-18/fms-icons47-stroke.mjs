import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true}),page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5356/?fms=1');
await page.getByRole('button',{name:'预览整张地图'}).click({timeout:60000});await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});await page.waitForTimeout(2500);
const c=page.getByTestId('fms-canvas'),b=await c.boundingBox();const read=()=>c.evaluate(n=>JSON.parse(n.dataset.originalEditor));
await page.getByRole('button',{name:'陆地'}).click();const results=[];
for(let k=0;k<3;k++){const prev=await c.evaluate(n=>n.dataset.originalEditor);await page.mouse.move(b.x+300+k*60,b.y+700);await page.mouse.down();for(let i=0;i<10;i++)await page.mouse.move(b.x+300+k*60+i*12,b.y+700-i*6);const t=Date.now();await page.mouse.up();
 await page.waitForFunction(prev=>document.querySelector('[data-testid=fms-canvas]').dataset.originalEditor!==prev,prev,{timeout:20000,polling:'raf'});results.push({wallMs:Date.now()-t,...await read()});await page.waitForTimeout(500);}
await page.screenshot({path:'.autopilot/fms-icons47/editor-stroke.png'});
console.log(JSON.stringify(results.map(r=>({wallMs:r.wallMs,buildMs:Math.round(r.buildMs),landCells:r.landCells,rivers:r.rivers}))),'errors',errors.length);await browser.close();
