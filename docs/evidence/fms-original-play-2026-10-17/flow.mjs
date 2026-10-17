import {chromium} from '@playwright/test';
import fs from 'node:fs';
const [w,h,tag]=process.argv.slice(2),out='.autopilot/fms-original-play/'+tag;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:+w,height:+h}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const t0=Date.now(),log=(m)=>console.log(tag,((Date.now()-t0)/1000).toFixed(1)+'s',m);
try{
 await page.goto('http://127.0.0.1:5352/?fms=1');
 await page.getByRole('button',{name:'预览整张地图'}).click({timeout:60000});
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});log('full map confirmed');
 const editor=page.getByTestId('fms-canvas');log('editor points '+await editor.getAttribute('data-point-count'));
 await page.screenshot({path:out+'/editor.png'});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.waitForTimeout(800);
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByLabel('城市数量',{exact:true}).selectOption('60');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
 const map=page.getByTestId('culture47-map');await map.waitFor({timeout:120000});
 await page.waitForFunction(()=>document.querySelector('[data-testid=culture47-map]')?.dataset.renderer==='original',{},{timeout:60000});log('world created, renderer original, cells '+await map.getAttribute('data-original-cells'));
 await page.waitForTimeout(1500);await page.screenshot({path:out+'/world-start.png'});
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.waitForTimeout(8000);await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 const app=page.getByTestId('culture47-app');await page.waitForFunction(()=>document.querySelector('[data-testid=culture47-app]')?.dataset.advancing==='false',{},{timeout:60000});
 const tick=await app.getAttribute('data-tick');log('advanced to tick '+tick);
 await page.waitForTimeout(800);await page.screenshot({path:out+'/world-run.png'});
 const box=await map.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
 for(const [n,steps] of [['4x',3],['zoom',4]]){for(let i=0;i<steps;i++){await page.mouse.wheel(0,-347);await page.waitForTimeout(120);}await page.waitForTimeout(700);await page.screenshot({path:out+`/world-${n}.png`});}
 await page.getByRole('button',{name:'切换地形地图'}).click();await page.waitForTimeout(700);await page.screenshot({path:out+'/world-terrain.png'});await page.getByRole('button',{name:'切换地形地图'}).click();
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await page.locator('.c47-notice').filter({hasText:'已保存'}).waitFor({timeout:40000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:40000});
 await page.waitForFunction(t=>document.querySelector('[data-testid=culture47-app]')?.dataset.tick===t&&document.querySelector('[data-testid=culture47-map]')?.dataset.renderer==='original',tick,{timeout:60000});
 log('cold restore tick '+tick+' renderer original');await page.waitForTimeout(1000);await page.screenshot({path:out+'/restored.png'});
 log('errors '+JSON.stringify(errors));
}catch(e){log('FAIL '+e.message.split('\n')[0]);await page.screenshot({path:out+'/fail.png'});log('errors '+JSON.stringify(errors));}finally{await browser.close();}
