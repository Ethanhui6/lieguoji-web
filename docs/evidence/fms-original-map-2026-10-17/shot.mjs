import {chromium} from '@playwright/test';
import fs from 'node:fs';
const out='.autopilot/fms-original-map';const [w,h,tag,preset,landMode,grid]=process.argv.slice(2);
const browser=await chromium.launch({headless:true}),page=await (await browser.newContext({viewport:{width:+w,height:+h}})).newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:5351/?original=1');await page.getByTestId('original-map').waitFor({timeout:60000});
 if(grid)await page.getByLabel('原作格网').selectOption(grid);
 if(preset)await page.getByLabel('显示预设').selectOption(preset);
 if(landMode)await page.getByLabel('陆地显示').selectOption(landMode);
 await page.waitForFunction(()=>document.querySelector('[data-testid=original-map]')?.dataset.stats,{},{timeout:60000});await page.waitForTimeout(1500);
 await page.screenshot({path:`${out}/${tag}-full.png`});
 const box=await page.getByTestId('original-map').boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);
 for(let i=0;i<8;i++){await page.mouse.wheel(0,-347);await page.waitForTimeout(80);} await page.waitForTimeout(600);
 await page.screenshot({path:`${out}/${tag}-zoom.png`});
 console.log(tag,await page.getByTestId('original-map').getAttribute('data-stats'),JSON.stringify(errors));
}finally{await browser.close();}
