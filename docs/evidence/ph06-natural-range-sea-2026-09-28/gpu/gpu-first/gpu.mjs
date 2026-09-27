import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const base='.autopilot/ph06/natural-range-sea-checks',label=process.argv[2],round=process.argv[3];
if(![label,round].every(s=>typeof s==='string'&&/^[a-z0-9-]+$/.test(s)))throw Error('Provide fresh GPU and passed unit round labels');
const dir=`${base}/${label}`,check=`${base}/${round}`,read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Unexpected source link');const p=`${d}/${e.name}`;return e.isDirectory()?walk(p):[{path:p,sha256:hash(p)}];});
const source=()=>[...walk('src'),...walk('tests'),...walk('scripts'),...['package.json','package-lock.json','vite.config.ts','tsconfig.json'].map(path=>({path,sha256:hash(path)}))];
const sort=rows=>[...rows].sort((a,b)=>a.path.localeCompare(b.path)),same=(a,b)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
const prior=read(`${check}/verification.json`),before=source(),dist=walk('dist');
if(!prior.passed||!same(before,read(`${check}/source-after.json`))||!same(dist,prior.dist))throw Error('GPU source/dist is not the checked production round');
if(fs.existsSync(dir))throw Error('Evidence exists');fs.mkdirSync(dir);
const save=(n,v)=>fs.writeFileSync(`${dir}/${n}`,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const harness=['gpu.mjs','gpu-harness.ts','gpu-harness.html'].map(p=>({path:`${base}/${p}`,sha256:hash(`${base}/${p}`)}));
save('before.json',{source:before,dist,harness,prerequisiteSha256:hash(`${check}/verification.json`)});
for(const p of harness)fs.copyFileSync(p.path,`${dir}/${path.basename(p.path)}`,fs.constants.COPYFILE_EXCL);
let server,browser,result=null,error=null;const events=[],start=Date.now();
try{
 server=await createServer({configFile:false,root:process.cwd(),cacheDir:`${base}/gpu-vite-cache`,logLevel:'warn',server:{host:'127.0.0.1',port:0,watch:{ignored:['**/*']}}});await server.listen();
 const url=`http://127.0.0.1:${server.httpServer.address().port}/${base}/gpu-harness.html`;
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 page.on('console',m=>events.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>events.push({type:'pageerror',text:e.stack??e.message}));
 await page.goto(url);await page.waitForFunction(()=>typeof window.continuousLightRun==='function',null,{timeout:30000});
 result=await page.evaluate(()=>window.continuousLightRun());save('gpu.raw.json',{...result,url,browser:browser.version(),events});
 await page.screenshot({path:`${dir}/gpu-harness.png`});
}catch(e){error=e.stack??String(e);save('runner-error.json',{error,events});}
finally{await browser?.close();await server?.close();}
const after=source(),afterDist=walk('dist'),harnessStable=harness.every(p=>hash(p.path)===p.sha256),stable=same(before,after)&&same(dist,afterDist)&&harnessStable;
save('after.json',{source:after,dist:afterDist,harnessStable});
const passed=!!result?.passed&&!error&&!events.some(e=>['error','pageerror'].includes(e.type))&&stable;
save('verification.json',{passed,sourceAndDistStable:stable,harnessStable,error,elapsedMs:Date.now()-start,probes:result?.probes.length,seams:result?.seams.length,heightToleranceMeters:1/128,colorToleranceBytes:2,seamToleranceBytes:1,prerequisiteSha256:hash(`${check}/verification.json`),scope:'Actual production shader and material in isolated WebGL2 probes; not full game appearance, performance or physical device acceptance.',cloudWrites:false});
console.log(JSON.stringify({passed,stable,probes:result?.probes.length,failures:result?.failures.length,error}));process.exitCode=passed?0:1;
