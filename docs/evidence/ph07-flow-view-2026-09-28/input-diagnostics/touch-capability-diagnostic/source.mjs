// Standalone browser capability isolation: no application, React, Pixi or save.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const dir = '.autopilot/ph07/touch-capability-diagnostic';
if (fs.existsSync(dir)) throw Error('Preserve earlier diagnostics'); fs.mkdirSync(dir);
fs.copyFileSync('.autopilot/ph07/touch-capability-diagnostic.mjs', `${dir}/source.mjs`);
const browser = await chromium.launch(), reports = [];
try {
  for (const detach of [true, false]) {
    const context = await browser.newContext({ ...devices['Pixel 7'] }), page = await context.newPage();
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}button{margin:20px;width:220px;height:56px;touch-action:manipulation}canvas{display:block;margin:20px;width:340px;height:300px;background:#d8edf3;touch-action:none}</style><button id="confirm">Normal click button</button><output id="count">0</output><canvas width="340" height="300"></canvas><script>window.events=[];let count=0;document.querySelector('button').addEventListener('click',()=>{document.querySelector('output').textContent=String(++count)});for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mousedown','mouseup','click'])document.addEventListener(type,e=>{window.events.push({type:e.type,target:e.target.tagName,trusted:e.isTrusted,primary:e.isPrimary,prevented:e.defaultPrevented,touches:e.touches?.length,time:performance.now()})},{passive:true});</script>`);
    await page.getByRole('button', { name: 'Normal click button' }).tap();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await page.evaluate(() => ({ count: document.querySelector('output').textContent, events: window.events.slice() }));
    const cdp = await context.newCDPSession(page), box = await page.locator('canvas').boundingBox();
    const points = [[30, 110], [60, 70], [120, 95], [155, 160], [125, 205], [70, 235], [35, 190], [20, 150], [30, 110]].map(([x, y]) => ({ x: box.x + x, y: box.y + y }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
    for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (detach) await cdp.detach();
    await page.getByRole('button', { name: 'Normal click button' }).tap();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ count: document.querySelector('output').textContent, events: window.events.slice() }));
    reports.push({ detach, before, after });
    await page.screenshot({ path: `${dir}/${detach ? 'detached' : 'retained'}-session.png` });
    if (!detach) await cdp.detach(); await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${dir}/events.json`, JSON.stringify({ scope: 'Pure local HTML browser capability diagnostic; not product acceptance', reports }, null, 2));
console.log(JSON.stringify(reports.map(r => ({ detach: r.detach, beforeCount: r.before.count, afterCount: r.after.count, finalEvents: r.after.events.slice(-8).map(e => [e.type, e.target]) }))));
