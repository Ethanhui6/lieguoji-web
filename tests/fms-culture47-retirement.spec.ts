import {tool} from './fms-culture47-fixture';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {enter} from './fms-culture47-fixture';
import {grid} from '../src/fms/play/fixture.test-support';
import type {Culture47Journal} from '../src/fms/play/culture47-session';
import type {Culture47Response,Culture47Request} from '../src/fms/play/culture47.worker';

for(const previous of [false,true])test(`real frozen 9c ${previous?'forked':'native'} world safely enables retirement and cold resumes`,async({page},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await enter(page);
 const root=process.env.GAME_ARTIFACT_ROOT??'dist',assets=fs.readdirSync(root+'/assets'),sourceAsset=assets.find(n=>/^engine-9c93-.*\.js$/.test(n))!,oldAsset=assets.find(n=>/^engine-dfd9-.*\.js$/.test(n))!;
 expect(await (await page.request.get('/build.json')).text()).toEqual(fs.readFileSync(root+'/build.json','utf8'));expect(sourceAsset).toBeTruthy();expect(oldAsset).toBeTruthy();
 const d=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),data={...d,triangles:[...d.triangles],elevations:[...d.elevations]},sourceDb=previous?'lieguoji-fms-culture47-longplay-v1':'lieguoji-fms-culture47-newworld-v2',targetDb='lieguoji-fms-culture47-retirement-copy-v1';
 await page.evaluate(async({data,sourceAsset,oldAsset,previous,sourceDb})=>{
  const connect=(asset:string)=>{const worker=new Worker('/assets/'+asset,{type:'module'});let id=0;return {worker,send:(command:Culture47Request)=>new Promise<Culture47Response>((resolve,reject)=>{const request=++id;worker.onmessage=e=>{if(e.data.id!==request||e.data.progress)return;if(e.data.error)reject(Error(e.data.error));else resolve(e.data);};worker.onerror=e=>reject(Error(e.message));worker.postMessage({id:request,command});})};};
  const source=connect(sourceAsset),old=connect(oldAsset);
  const full=(v:Culture47Response)=>{if(v.display?.kind!=='full')throw Error('Expected full worker packet');return v.display.snapshot;};
  const journal=(v:Culture47Response,base:Culture47Journal)=>v.display?.kind==='full'?v.display.snapshot.journal:{...base,...(v.display?.journal??{})};
  const opening={terrain:{...data,triangles:new Uint32Array(data.triangles),elevations:new Int32Array(data.elevations)},count:2,cityCount:6,relations:'war' as const,setup:{mode:'culture-generated' as const,enabled:['chinese','japanese'] as ('chinese'|'japanese')[]}};
  let origin:Culture47Journal|undefined;
  try{
   let state=full(await source.send({type:'create',opening}));
   if(previous){
    const first=full(await old.send({type:'create',opening}));origin=journal(await old.send({type:'advance-batch',ticks:120,sequence:0}),first.journal);
    const j:Culture47Journal={...origin,version:2,engine:state.journal.engine,id:'fms-'+crypto.randomUUID(),fork:{engine:origin.engine as 'dfd9fa64839f4bed6465b13c0a320ac629b3f57d51f3e468cf184f52f764c4e8',id:origin.id,sequence:origin.actions.length}};
    state=full(await source.send({type:'load',journal:j}));
   }
   const r=state.run,expected={id:r.id,day:r.world.day,tick:r.clock.tick,nextEventId:r.world.nextEventId,civilization:r.civilization.revision,kin:r.kin.revision,people:r.people.revision,sovereignty:r.sovereignty.revision,nextEntryId:r.chronicle.nextEntryId};
   let j=journal(await source.send({type:'action',action:{kind:'family-policy',nationId:'n-0',enabled:false,expected},sequence:state.journal.actions.length}),state.journal);
   j=journal(await source.send({type:'advance-batch',ticks:120,sequence:j.actions.length}),j);
   const envelope=async(journal:Culture47Journal)=>({version:1,revision:1,journal,checksum:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(journal,(_,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as ArrayLike<number>):v))))].map(n=>n.toString(16).padStart(2,'0')).join('')});
   const current=await envelope(j),archived=origin?await envelope(origin):undefined;
   const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(sourceDb,1);q.onupgradeneeded=()=>q.result.createObjectStore('slots');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
   await new Promise<void>((ok,no)=>{const t=db.transaction('slots','readwrite'),s=t.objectStore('slots');s.put(current,'current');s.put(1,'revision');if(archived)s.put(archived,'origin');t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});db.close();
  }finally{source.worker.terminate();old.worker.terminate();}
 },{data,sourceAsset,oldAsset,previous,sourceDb});
 const read=async(name:string)=>page.evaluate(async name=>{const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});try{return await new Promise<string>((ok,no)=>{const t=db.transaction('slots','readonly'),s=t.objectStore('slots'),q=s.getAll(),k=s.getAllKeys();t.oncomplete=()=>ok(JSON.stringify({keys:k.result,values:q.result},(_,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as ArrayLike<number>):v));t.onerror=()=>no(t.error);});}finally{db.close();}},name);
 const before=await read(sourceDb),startDay=previous?2:1;
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();const app=page.getByTestId('culture47-app');await expect(app).toHaveAttribute('data-day',String(startDay));
 await page.getByRole('button',{name:'建立续玩副本',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已启用退役归档和持续补军',{timeout:90000});
 await tool(page,'军事模式');await expect(page.getByLabel('退役军队名册',{exact:true})).toBeVisible();
 for(let i=1;i<=2;i++){await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(app).toHaveAttribute('data-day',String(startDay+i));}
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');const persisted=await read(targetDb);
 const slots=JSON.parse(persisted) as {keys:string[];values:{journal?:Culture47Journal}[]};
 const forked=slots.values[slots.keys.indexOf('current')]?.journal;
 expect(forked?.fork?.engine).toBe('9c932ccbbd33bbce53e14204552186728935858e0a689c14dd994dfaadf99343');
 const forkAt=forked?.fork?.sequence??-1;expect(forkAt).toBeGreaterThanOrEqual(0);
 expect(forked?.actions.slice(forkAt,forkAt+2).map(action=>action.kind)).toEqual(['enable-retirement','enable-recovery']);
 expect(forked?.actions[forkAt+1]).toMatchObject({rule:'wounded-army-recovery-web-v1'});
 await page.screenshot({path:info.outputPath(`retirement-${previous?'fork':'native'}-desktop.png`)});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-day',String(startDay+2));expect(await read(targetDb)).toEqual(persisted);
 await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(app).toHaveAttribute('data-day',String(startDay+3));await tool(page,'军事模式');await expect(page.getByLabel('退役军队名册',{exact:true})).toBeVisible();
 await page.setViewportSize({width:428,height:926});await expect.poll(()=>page.locator('.c47-panel').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');await expect(page.getByRole('button',{name:'放大地图',exact:true})).toBeHidden();await page.screenshot({path:info.outputPath(`retirement-${previous?'fork':'native'}-portrait.png`)});
 expect(await read(sourceDb)).toEqual(before);expect(before).not.toContain('enable-recovery');expect(persisted).toContain('enable-retirement');expect(persisted).toContain('enable-recovery');expect(persisted).toContain('previous');expect(errors).toEqual([]);
 await info.attach('retirement-evidence',{body:JSON.stringify({source:previous?'dfd9 -> 9c':'native 9c',productionFrozen:true,completeStateComparedBeforeEnable:true,recoveryEnabledAfterRetirement:true,coldRestoredDay:startDay+2,continuedDay:startDay+3,allSourceSlotsUnchanged:true,errors,physicalIphone:false}),contentType:'application/json'});
});


test('pausing finishes accepted motion and calendar before save without requesting more simulation',async({page},info)=>{
 test.setTimeout(120000);await enter(page);await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('城市数量',{exact:true}).selectOption('24');await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();const app=page.getByTestId('culture47-app');await expect(page.getByTestId('culture47-map')).toBeVisible();
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day'))).toBeGreaterThanOrEqual(4);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');
 const tick=await app.getAttribute('data-tick');await expect(page.locator('.c47-calendar')).toHaveAttribute('data-display-tick',tick!);await expect(page.locator('.c47-map canvas')).toHaveAttribute('data-display-tick',tick!);await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');await expect(app).toHaveAttribute('data-tick',tick!);
 await page.screenshot({path:info.outputPath('paused-calendar-matches-save.png')});await info.attach('pause-date-evidence',{body:JSON.stringify({tick,calendarAndArmyAtCommittedTick:true,noExtraSimulation:true}),contentType:'application/json'});
});
