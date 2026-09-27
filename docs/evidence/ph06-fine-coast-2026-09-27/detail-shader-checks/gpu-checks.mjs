import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.cwd(), folder = `${root}/.autopilot/ph06/detail-shader-checks`, name = process.argv[2] || 'gpu-first';
mkdirSync(folder,{recursive:true});
const files = ['src/world/detail-terrain-pages.ts','src/world/detail-terrain-pages.test.ts','src/world/detail-terrain-shader.ts','src/world/detail-terrain-shader.test.ts','src/world/detail-coast-geometry.ts','src/world/detail-coast-types.ts','src/world/detail-coast-field.ts','src/world/terrain-mesh.ts'];
const fingerprint = () => files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const before = fingerprint(), events = [], startedAt=new Date().toISOString(); let server,browser,result;
try {
 server=await createServer({configFile:false,root,cacheDir:`${folder}/vite-cache`,logLevel:'warn',server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/*']}}});await server.listen();
 const address=server.httpServer.address(),url=`http://127.0.0.1:${address.port}/.autopilot/ph06/detail-shader-checks/harness.html`;
 console.log(`Isolated correctness harness: ${url}`);browser=await chromium.launch({headless:true});
 const page=await browser.newPage();page.on('console',message=>events.push({type:message.type(),text:message.text()}));page.on('pageerror',error=>events.push({type:'pageerror',text:error.stack||error.message}));
 await page.goto(url);await page.waitForFunction(()=>typeof window.detailShaderRun==='function',{timeout:30000});
 result=await page.evaluate(mode=>window.detailShaderRun(mode),process.argv[3]||'full');await page.screenshot({path:`${folder}/${name}.png`});
 result={...result,url,browserVersion:browser.version(),startedAt,finishedAt:new Date().toISOString(),before,after:fingerprint(),console:events};
 result.sourceStable=JSON.stringify(result.before)===JSON.stringify(result.after);writeFileSync(`${folder}/${name}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:result.passed,patterns:result.patterns.length,probes:result.probes,maxHeightError:result.maxHeightError,exception:result.exception,failures:result.failures.slice(0,8),gpu:result.gpu,pixi:result.pixi&&{sourcePixels:result.pixi.sourcePixels,borrowedSourcesSurviveShaderDestroy:result.pixi.borrowedSourcesSurviveShaderDestroy},sourceStable:result.sourceStable},null,2));
 process.exitCode=result.passed&&result.sourceStable?0:1;
}catch(error){writeFileSync(`${folder}/${name}.runner-error.json`,JSON.stringify({error:String(error),stack:error.stack,events,startedAt,before,after:fingerprint()},null,2));console.error(error);process.exitCode=1;}
finally{await browser?.close();await server?.close();}
