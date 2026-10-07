import fs from 'node:fs';
import {chromium} from '@playwright/test';
const report={scope:'Isolated candidate v28 Worker and browser IndexedDB; not game UI/visual/mobile acceptance',origin:'http://127.0.0.1:5210',errors:[],workerResponses:[],success:false};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/war28/play.worker.ts'))report.workerResponses.push({url:r.url(),status:r.status()});});
 await page.goto(report.origin+'/?fms=1',{waitUntil:'networkidle',timeout:60000});
 report.before=await page.evaluate(async()=>{
  const [{PlayClient},{grid},{saveRun}]=await Promise.all([import('/src/fms/play/war28-client.ts'),import('/src/fms/play/fixture.test-support.ts'),import('/src/fms/play/war28-stores.ts')]);
  const client=new PlayClient(),stamp=r=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
  let r=(await client.send({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'})).run;
  const [b,a]=r.world.nations.map(n=>n.id).sort();r=(await client.send({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(r)})).run;
  const armies=[a,b].map(id=>r.world.armies.find(v=>v.nationId===id)),place=armies[0].provinceId;
  for(const army of r.world.armies)Object.assign(army,armies.includes(army)?{provinceId:place,troops:10000,morale:100,supplies:100,status:'idle',route:[],progress:0}:{troops:0,status:'destroyed',route:[],progress:0});
  await client.send({type:'load',run:r});r=(await client.send({type:'tick',ticks:100,expected:stamp(r)})).run;await saveRun(r,null);client.close();
  return {version:r.version,id:r.id,engine:r.engine,tick:r.clock.tick,wars:r.nativeWars,losses:r.losses};
 });
 if(report.before.version!==28||!report.before.wars.campaigns[0]?.kills.length)throw Error('Real Worker did not produce raw damage');
 await page.reload({waitUntil:'networkidle',timeout:60000});
 report.after=await page.evaluate(async()=>{
  const [{PlayClient},{loadRun,saveRun}]=await Promise.all([import('/src/fms/play/war28-client.ts'),import('/src/fms/play/war28-stores.ts')]);
  const saved=await loadRun(),restored={id:saved.run.id,tick:saved.run.clock.tick,wars:structuredClone(saved.run.nativeWars),losses:structuredClone(saved.run.losses)};
  const client=new PlayClient();await client.send({type:'load',run:saved.run});
  const r=(await client.send({type:'tick',ticks:10,expected:{day:saved.run.world.day,nextEventId:saved.run.world.nextEventId,tick:saved.run.clock.tick}})).run;
  const revision=await saveRun(r,saved.revision);client.close();return {restored,nextTick:r.clock.tick,revision};
 });
 if(report.after.restored.id!==report.before.id||report.after.restored.tick!==100||JSON.stringify(report.after.restored.wars)!==JSON.stringify(report.before.wars)||JSON.stringify(report.after.restored.losses)!==JSON.stringify(report.before.losses)||report.after.nextTick!==110)throw Error('Refresh/resume mismatch');
 if(report.errors.length||!report.workerResponses.length||report.workerResponses.some(r=>r.status!==200))throw Error('Browser/Worker errors');
 report.success=true;await context.close();
}catch(e){report.failure=String(e);process.exitCode=1;}finally{await browser.close();fs.writeFileSync('.autopilot/war28-browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,scope:report.scope,errors:report.errors,failure:report.failure,workers:report.workerResponses.length,tick:report.after?.nextTick}));}
