import {chromium} from '@playwright/test';
import fs from 'node:fs';
const [port,tag,seconds='20',speedClicks='0']=process.argv.slice(2);
const browser=await chromium.launch({headless:true,args:(process.env.GPU_ARGS??'').split(' ').filter(Boolean)}),page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const W=window.Worker;window.ackLog=[];window.Worker=class extends W{constructor(u,o){super(u,o);this.addEventListener('message',e=>{const d=e.data||{};window.ackLog.push({dir:'in',at:performance.now(),keys:Object.keys(d).join(','),id:d.id??d.requestId});});}postMessage(m,t){const c=m?.command;window.ackLog.push({dir:'out',at:performance.now(),type:c?.type+(c?.action?':'+c.action.kind:'')+(c?.action?.ticks?':'+c.action.ticks:''),id:m?.id??m?.requestId});super.postMessage(m,t);}};});
try{
 await page.goto(`http://127.0.0.1:${port}/?fms=1`);
 await page.getByRole('button',{name:'预览整张地图'}).click({timeout:60000});await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:120000});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();await page.waitForTimeout(800);
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();await page.getByLabel('城市数量',{exact:true}).selectOption('60');
 await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();await page.getByTestId('culture47-map').waitFor({timeout:120000});await page.waitForTimeout(1500);
 const speed=page.getByRole('button',{name:'切换推演速度',exact:true});for(let i=0;i<+speedClicks;i++)await speed.click();const label=await speed.textContent();
 const app=page.getByTestId('culture47-app'),day=async()=>Number(await app.getAttribute('data-day')),tick=async()=>Number(await app.getAttribute('data-tick'));
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await page.waitForTimeout(3000);
 const t0=Date.now(),k0=await tick(),samples=[];for(let i=0;i<+seconds;i++){await page.waitForTimeout(1000);samples.push(await tick());}
 const k1=await tick(),wall=(Date.now()-t0)/1000;await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 const log=await page.evaluate(()=>window.ackLog.slice(-24));const r={port,tag,log:log.map(l=>[l.dir,Math.round(l.at),l.type??l.keys,l.id]),speed:label,daysPerSecond:+((k1-k0)/120/wall).toFixed(2),days:(k1-k0)/120,wall,perSecond:samples.map((s,i)=>i?+((s-samples[i-1])/120).toFixed(1):null).slice(1),errors};
 fs.mkdirSync('.autopilot/fms-speed48',{recursive:true});fs.writeFileSync(`.autopilot/fms-speed48/${tag}.json`,JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}finally{await browser.close();}
