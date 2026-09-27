// Pure HTML capability matrix. No application, save, React, Pixi or injected result.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const dir = '.autopilot/ph07/touch-capture-scroll-diagnostic';
if (fs.existsSync(dir)) throw Error('Preserve earlier diagnostics');
fs.mkdirSync(dir); fs.copyFileSync('.autopilot/ph07/touch-capture-scroll-diagnostic.mjs', `${dir}/source.mjs`);
const browser = await chromium.launch(), reports = [];
try {
  for (const mode of [
    { name: 'capture-scroll', capture: true, prevent: false },
    { name: 'capture-prevent-scroll', capture: true, prevent: true },
    { name: 'scroll-only', capture: false, prevent: false },
  ]) {
    const context = await browser.newContext({ ...devices['Pixel 7'] }), page = await context.newPage();
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0}button{width:170px;height:48px;touch-action:manipulation}canvas{position:absolute;inset:0;width:412px;height:730px;background:#d8edf3;touch-action:none}
    .panel{position:absolute;top:330px;left:12px;width:388px;height:390px;display:flex;flex-direction:column;overflow:hidden;border:1px solid gray;background:white}header{height:70px;flex-shrink:0}h2{margin:0} .body{padding:16px;flex:1;min-height:0;overflow-y:auto;overscroll-behavior-y:contain;scrollbar-gutter:stable}.actions{display:flex;justify-content:flex-end}footer{height:68px;flex-shrink:0}
    </style><canvas width="412" height="730" tabindex="0"></canvas><section class="panel"><header><h2 tabindex="-1">Preview</h2><output>0</output></header><div class="body"><div style="height:205px">Actual scrolling content</div><div class="actions"><button>Normal click button</button></div></div><footer>Persistent feedback</footer></section><script>
    window.events=[];let count=0;const canvas=document.querySelector('canvas'),button=document.querySelector('button');
    button.addEventListener('click',()=>{document.querySelector('output').textContent=String(++count)});
    canvas.addEventListener('pointerdown',e=>{if(${mode.prevent})e.preventDefault();if(${mode.capture})canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener('pointerup',e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)});
    window.addEventListener('pointerup',e=>{const target=e.composedPath()[0];window.events.push({type:'window-capture-up',target:target.tagName,time:performance.now(),prevented:e.defaultPrevented})},true);
    for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','touchstart','touchend','touchcancel','mousedown','mouseup','click','scroll','scrollend'])document.addEventListener(type,e=>{window.events.push({type:e.type,target:e.target.tagName,trusted:e.isTrusted,primary:e.isPrimary,prevented:e.defaultPrevented,touches:e.touches?.length,time:performance.now()})},{passive:true,capture:true});
    document.querySelector('h2').focus({preventScroll:true});</script>`);
    const button = page.getByRole('button', { name: 'Normal click button' });
    await button.tap();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await page.evaluate(() => ({ count: document.querySelector('output').textContent, events: window.events.slice() }));
    const cdp = await context.newCDPSession(page);
    const points = [[30,110],[60,70],[120,95],[155,160],[125,205],[70,235],[35,190],[20,150],[30,110]].map(([x,y])=>({x,y}));
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart',touchPoints:[{...points[0],id:1}] });
    for(const point of points.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
    // Reset only the pure fixture scroll/focus state to reproduce a newly opened inspector.
    await page.evaluate(()=>{document.querySelector('.body').scrollTop=0;document.querySelector('h2').focus({preventScroll:true})});
    await button.tap();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ count: document.querySelector('output').textContent, events: window.events.slice() }));
    reports.push({mode,before,after}); await page.screenshot({path:`${dir}/${mode.name}.png`}); await context.close();
  }
}finally{await browser.close()}
fs.writeFileSync(`${dir}/events.json`,JSON.stringify({scope:'Pure local HTML capability diagnostic, not product acceptance',reports},null,2));
console.log(JSON.stringify(reports.map(r=>({mode:r.mode.name,before:r.before.count,after:r.after.count,finalEvents:r.after.events.slice(-10).map(e=>[e.type,e.target])}))));
