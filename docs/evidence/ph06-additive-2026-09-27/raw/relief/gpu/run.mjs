import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),stage=path.resolve('.autopilot/ph06/v4-relief-staging'),folder=path.join(stage,'gpu'),name=process.argv[2]??'first';
if(!/^[a-z0-9-]+$/.test(name))throw new Error('Invalid evidence name');
const out=path.join(folder,name);if(fs.existsSync(out))throw new Error('Evidence exists; choose a new explicit repair name');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const owned=JSON.parse(fs.readFileSync(path.join(stage,'ready-manifest.json'),'utf8'));
for(const file of owned.files)if(hash(file.target)!==file.baselineSha256||hash(path.join(stage,file.target))!==file.stagedSha256)throw new Error(`Frozen shader baseline mismatch: ${file.target}`);
const files=['src/world/detail-terrain-pages.ts','src/world/detail-terrain-shader.ts','src/world/detail-coast-geometry.ts','src/world/detail-coast-types.ts','src/world/detail-coast-field.ts','src/world/terrain-mesh.ts','src/world/terrain-material.ts',...owned.files.map(x=>path.join(stage,x.target)),path.join(folder,'harness.ts'),path.join(folder,'run.mjs'),'.autopilot/ph06/detail-shader-checks/harness.ts'];
function snapshot(){const dist=fs.readdirSync('dist',{withFileTypes:true}).flatMap(e=>e.isDirectory()?fs.readdirSync(path.join('dist',e.name)).map(n=>path.join('dist',e.name,n)):[path.join('dist',e.name)]);return [...files,...dist].map(p=>({path:path.relative(root,path.resolve(p)).replaceAll('\\','/'),sha256:hash(p)}));}
const before=snapshot(),startedAt=new Date().toISOString(),events=[],modes=['full','supplement','relief'];let server,browser,error;const results=[];
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(before,null,2));
try{
  const stagingWorld=path.join(stage,'src/world');
  server=await createServer({configFile:false,root,cacheDir:path.join(folder,'vite-cache'),logLevel:'warn',
    resolve:{alias:[{find:'/src/world/detail-terrain-shader.ts',replacement:path.join(stagingWorld,'detail-terrain-shader.ts')}]},
    plugins:[{name:'frozen-relief-local-imports',enforce:'pre',resolveId(source,importer){
      if(!importer||!path.resolve(importer).startsWith(stagingWorld)||!source.startsWith('.'))return;
      const local=path.resolve(path.dirname(importer),source)+'.ts';if(fs.existsSync(local))return local;
      const original=path.resolve('src/world',source)+'.ts';if(fs.existsSync(original))return original;
    }}],server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/*']}}});
  await server.listen();const address=server.httpServer.address(),url=`http://127.0.0.1:${address.port}/.autopilot/ph06/v4-relief-staging/gpu/harness.html`;
  console.log(`Isolated relief correctness harness: ${url}`);browser=await chromium.launch({headless:true});
  for(const mode of modes){
    const context=await browser.newContext(),page=await context.newPage(),consoleEvents=[];
    page.on('console',m=>consoleEvents.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>consoleEvents.push({type:'pageerror',text:e.stack??e.message}));
    const start=performance.now();await page.goto(url);await page.waitForFunction(()=>typeof window.detailShaderRun==='function',{timeout:30000});
    const raw=await page.evaluate(mode=>window.detailShaderRun(mode),mode);await page.screenshot({path:path.join(out,`${mode}.png`)});
    const row={...raw,url,browserVersion:browser.version(),runnerElapsedMs:performance.now()-start,console:consoleEvents};
    fs.writeFileSync(path.join(out,`${mode}.json`),JSON.stringify(row,null,2));results.push({mode,passed:row.passed,patterns:row.patterns.length,probes:row.probes,colorProbes:row.relief.probes.length,pixiColorProbes:row.pixi?.colorProbes?.length??0,maxHeightError:row.maxHeightError,exception:row.exception,gpu:row.gpu,aliasVersion:row.relief.aliasVersion,fragmentSha256:row.relief.fragmentSha256,elapsedMs:row.elapsedMs});
    console.log(JSON.stringify(results.at(-1)));await context.close();
    if(!row.passed)throw new Error(`${mode} GPU contract failed; raw failure preserved`);
    if(mode==='full'&&(row.patterns.length!==625||row.probes!==55330))throw new Error('Original full diagnostic probe count changed');
    if(mode==='supplement'&&row.probes!==103)throw new Error('Original supplementary diagnostic probe count changed');
    if(mode==='relief'&&(row.relief.probes.length<20||row.pixi?.colorProbes?.length!==4))throw new Error('Missing actual raw/Pixi GPU color controls');
  }
}catch(e){error={message:String(e),stack:e.stack};console.error(e);}
finally{await browser?.close();await server?.close();const after=snapshot(),stable=JSON.stringify(before)===JSON.stringify(after),result={startedAt,finishedAt:new Date().toISOString(),modes:results,error,sourceAndDistStable:stable,before,after,events,scope:'Real WebGL2 correctness only; record actual renderer; no hardware, performance or natural visual acceptance',passed:!error&&stable&&results.length===3&&results.every(x=>x.passed)};fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,sourceAndDistStable:stable,error,checks:results.length}));process.exitCode=result.passed?0:1;}
