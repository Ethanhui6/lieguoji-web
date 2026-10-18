import {test,expect,type Page} from '@playwright/test';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import frozen from '../src/fms/play/culture47-frozen.json' with {type:'json'};
import {grid} from '../src/fms/play/fixture.test-support';
import {enter,create} from './fms-culture47-fixture';
import type {Culture47Journal} from '../src/fms/play/culture47-session';

const ORIGINAL_DATABASE='lieguoji-fms-culture47-zh-journal-v2';
const CURRENT_DATABASE='lieguoji-fms-culture47-generations-v1';
type StoredCulture={revision:number;journal:Culture47Journal};
const bootstrapRules=[
  ['enable-retirement','retired-roster-web-v1'],
  ['enable-recovery','wounded-army-recovery-web-v1'],
  ['enable-generations','known-couples-birth-household-web-v1'],
  ['enable-frame-loop','original-frame-loop-v1'],['enable-army-batch','native-five-army-orders-web-v1'],
] as const;
function expectNewJournal(journal:Culture47Journal,tail:Culture47Journal['actions']=[]){
  expect(journal.actions).toHaveLength(bootstrapRules.length+tail.length);
  expect(journal.actions.slice(0,bootstrapRules.length).map(action=>'rule'in action?[action.kind,action.rule]:[action.kind])).toEqual(bootstrapRules);
  for(const action of journal.actions.slice(0,bootstrapRules.length)){
    if(!('expected'in action))throw Error('New-world rule is missing its creation stamp');
    expect(Object.keys(action).sort()).toEqual(['expected','kind','rule']);
    expect(Object.keys(action.expected).sort()).toEqual(['civilization','day','id','kin','nextEntryId','nextEventId','people','sovereignty','tick']);
    expect(action.expected).toMatchObject({id:journal.id,day:0,tick:0});
  }
  expect(journal.actions.slice(bootstrapRules.length)).toEqual(tail);
}

async function installOriginal(page:Page,entry:typeof frozen[number]){
  await enter(page);
  if(process.env.GAME_BASE_URL&&!process.env.GAME_BUILD_DIR)throw Error('External preview requires GAME_BUILD_DIR to bind its reviewed frozen engines');
  const buildDir=resolve(process.env.GAME_BUILD_DIR??'dist');
  const servedBuild=await page.request.get('/build.json');expect(servedBuild.ok()).toBe(true);
  expect(await servedBuild.body()).toEqual(readFileSync(resolve(buildDir,'build.json')));
  const filename=readdirSync(resolve(buildDir,'assets')).find(f=>f.startsWith(entry.file.replace('.js','-'))&&f.endsWith('.js'));
  if(!filename)throw Error('Missing reviewed frozen worker');
  const terrain=grid((x,y)=>x>0&&x<250&&y>0&&y<250?45:0);
  return page.evaluate(async({filename,terrain})=>{
    const worker=new Worker('/assets/'+filename,{type:'module'});let id=0,lastJournal:Culture47Journal|undefined;
    const send=(command:unknown)=>new Promise<{journal:Culture47Journal}>((resolve,reject)=>{worker.onmessage=e=>{if(e.data.progress)return;if(e.data.error){reject(Error(e.data.error));return;}const s=e.data.snapshot??e.data.display?.snapshot??e.data.display;lastJournal={...lastJournal,...s.journal};resolve({journal:lastJournal!});};worker.onerror=()=>reject(Error('Original worker failed'));worker.postMessage({id:++id,command});});
    const t={...terrain,triangles:new Uint32Array(terrain.triangles),elevations:new Int32Array(terrain.elevations)};
    await send({type:'create',opening:{terrain:t,count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}});
    const {journal}=await send({type:'action',sequence:0,action:{kind:'advance',ticks:5}});worker.terminate();
    const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as ArrayLike<number>):x);
    const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialize(journal)))),n=>n.toString(16).padStart(2,'0')).join('');
    const db=await new Promise<IDBDatabase>((ok,no)=>{const r=indexedDB.open('lieguoji-fms-culture47-zh-journal-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('slots');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
    await new Promise<void>((ok,no)=>{const tx=db.transaction('slots','readwrite'),s=tx.objectStore('slots');s.put({version:1,revision:1,checksum,journal},'current');s.put(1,'revision');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);});db.close();
    return {id:journal.id,engine:journal.engine,actions:journal.actions,filename};
  },{filename,terrain:{...terrain,triangles:[...terrain.triangles],elevations:[...terrain.elevations]}});
}
async function stored(page:Page,database=CURRENT_DATABASE){return page.evaluate(async database=>{const db=await new Promise<IDBDatabase>((ok,no)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});try{return await new Promise<StoredCulture|undefined>((ok,no)=>{const r=db.transaction('slots').objectStore('slots').get('current');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}finally{db.close();}},database);}
async function requiredStored(page:Page,database=CURRENT_DATABASE){const value=await stored(page,database);expect(value,`Expected a real saved world in ${database}`).toBeDefined();if(!value)throw Error('Saved world is missing');return value;}

for(const entry of frozen)test(`registered original ${entry.file} continues without changing history or engine`,async({page},info)=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const original=await installOriginal(page,entry);
  expect(original.engine).toBe(entry.engine);await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:40000});
  const app=page.getByTestId('culture47-app');await expect(app).toHaveAttribute('data-tick','5',{timeout:40000});
  await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-tick'))).toBeGreaterThan(5);await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:40000});const tick=await app.getAttribute('data-tick'),save=await requiredStored(page,ORIGINAL_DATABASE);
  expect(save.journal.engine).toBe(original.engine);expect(save.journal.id).toBe(original.id);expect(save.journal.actions.slice(0,original.actions.length)).toEqual(original.actions);expect(save.revision).toBe(2);
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:40000});await expect(app).toHaveAttribute('data-tick',tick!,{timeout:40000});expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('original-world-continued.png')});await info.attach('compatibility',{body:JSON.stringify({engine:entry.engine,workerHash:entry.sha256,tick,errors,syntheticWorld:true,physicalIphone:false}),contentType:'application/json'});
});

test('unavailable original engine blocks reading without overwriting its valid journal',async({page})=>{
  test.setTimeout(90000);const original=await installOriginal(page,frozen[1]),before=await requiredStored(page,ORIGINAL_DATABASE);
  await page.route('**/assets/'+original.filename,route=>route.fulfill({status:200,contentType:'text/javascript',body:'invalid worker bytes'}));
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('完整性校验失败',{timeout:40000});await expect(page.getByRole('button',{name:'继续文化世界',exact:true})).toHaveCount(0);expect(await requiredStored(page,ORIGINAL_DATABASE)).toEqual(before);
});

test('normal repeated saves use the executed journal witness and still restore by actual replay',async({page},info)=>{
  test.setTimeout(90000);
  await page.addInitScript(()=>{const Real=window.Worker,acks:string[]=[],commands:string[]=[];Object.defineProperty(window,'verificationSources',{value:acks});Object.defineProperty(window,'restorationCommands',{value:commands});window.Worker=class extends Real{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',e=>{if(e.data.verified)acks.push(e.data.verified.source);});}postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){commands.push((message as {command:{type:string}}).command.type);if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}};});
  await enter(page);await create(page);await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1',{timeout:30000});
  const start=Date.now();for(let i=0;i<3;i++){await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect.poll(async()=>(await stored(page))?.revision).toBe(i+1);}
  expectNewJournal((await requiredStored(page)).journal,[{kind:'advance',ticks:120}]);
  const ms=Date.now()-start,acks=await page.evaluate(()=>(window as unknown as {verificationSources:string[]}).verificationSources);expect(acks).toEqual(Array(6).fill('witness'));
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1',{timeout:30000});expect(await page.evaluate(()=>(window as unknown as {verificationSources:string[]}).verificationSources)).toEqual(['witness']);expect(await page.evaluate(()=>(window as unknown as {restorationCommands:string[]}).restorationCommands)).toEqual(['load','verify']);
  await info.attach('verification-cost',{body:JSON.stringify({threeSavesMs:ms,witnessAcks:acks,fixture:'676 sample synthetic geography',physicalIphone:false}),contentType:'application/json'});
});

test('initial saved-world verification can be cancelled and retried without losing the slot',async({page})=>{
  test.setTimeout(90000);await enter(page);await create(page);await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');const before=await requiredStored(page);expectNewJournal(before.journal);expect(before.revision).toBe(1);
  await page.addInitScript(()=>{const Real=window.Worker;let delayed=false;window.Worker=class extends Real{postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){const type=(message as {command?:{type:string}})?.command?.type;if(type==='load'&&!delayed){delayed=true;setTimeout(()=>super.postMessage(message),5000);return;}if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}};});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'取消处理',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已取消恢复');expect(await requiredStored(page)).toEqual(before);
  await page.getByRole('button',{name:'重新读取存档',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:30000});await expect(page.getByTestId('culture47-map')).toBeVisible();expect(await requiredStored(page)).toEqual(before);
});

test('cancelling a queued save clears the pending action and never writes later',async({page})=>{
  test.setTimeout(90000);
  await page.addInitScript(()=>{const Real=window.Worker;let delayed=false;window.Worker=class extends Real{postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){const c=(message as {command?:{type:string;action?:{kind:string}}})?.command;if((c?.type==='advance-batch'||c?.type==='action'&&c.action?.kind==='advance')&&!delayed){delayed=true;setTimeout(()=>super.postMessage(message),1500);return;}if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}};});
  await enter(page);await create(page);await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');const before=await requiredStored(page);expectNewJournal(before.journal);expect(before.revision).toBe(1);
  await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-advancing','true');await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await page.getByRole('button',{name:'取消处理',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-advancing','false');
  await page.waitForTimeout(2000);expect(await requiredStored(page)).toEqual(before);await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-tick','0');
});

async function allSlots(page:Page,database=CURRENT_DATABASE){return page.evaluate(async database=>{const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open(database,1);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});try{return await new Promise<string>((ok,no)=>{const tx=db.transaction('slots'),store=tx.objectStore('slots'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>ok(JSON.stringify(keys.result.map((key,i)=>[key,values.result[i]]),(_,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as ArrayLike<number>):x));tx.onerror=()=>no(tx.error);});}finally{db.close();}},database);}

test('cancel after the current slot loaded discards its candidate while backup validation is pending',async({page})=>{
  test.setTimeout(90000);await enter(page);await create(page,24);
  for(let i=1;i<=2;i++){await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect.poll(async()=>(await stored(page))?.revision).toBe(i);}
  const initial=await requiredStored(page);expect(initial.revision).toBe(2);expectNewJournal(initial.journal);const before=await allSlots(page);
  await page.addInitScript(()=>{const Real=window.Worker,state={delayed:false,holding:false,terminations:0};Object.defineProperty(window,'coldCancelProbe',{value:state});window.Worker=class extends Real{
    postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){const type=(message as {command?:{type:string}})?.command?.type;if(type==='verify'&&!state.delayed){state.delayed=true;state.holding=true;setTimeout(()=>super.postMessage(message),3000);return;}if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}
    terminate(){state.terminations++;super.terminate();}
  };});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {coldCancelProbe:{holding:boolean}}).coldCancelProbe.holding)).toBe(true);
  await page.getByRole('button',{name:'取消处理',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已取消恢复');await expect(page.getByRole('button',{name:'继续文化世界',exact:true})).toHaveCount(0);expect(await allSlots(page)).toBe(before);
  await page.getByRole('button',{name:'重新读取存档',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible();
  await page.waitForTimeout(3200);await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-tick','0');expect(await allSlots(page)).toBe(before);expect(await page.evaluate(()=>(window as unknown as {coldCancelProbe:{terminations:number}}).coldCancelProbe.terminations)).toBeGreaterThanOrEqual(2);
});

test('losing the fully loaded candidate before Continue triggers real reload and subsequent live save',async({page})=>{
  test.setTimeout(90000);await enter(page);await create(page,24);await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');const before=await requiredStored(page);expectNewJournal(before.journal);expect(before.revision).toBe(1);
  await page.addInitScript(()=>{const Real=window.Worker,state:{worker:Worker|null;loads:number}={worker:null,loads:0};Object.defineProperty(window,'coldLossProbe',{value:state});window.Worker=class extends Real{
    postMessage(message:unknown,transfer:Transferable[]|StructuredSerializeOptions=[]){if((message as {command?:{type:string}})?.command?.type==='load'){state.loads++;state.worker=this;}if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);}
  };});
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await expect(page.getByRole('button',{name:'继续文化世界',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as unknown as {coldLossProbe:{worker:Worker}}).coldLossProbe.worker.dispatchEvent(new Event('error')));
  await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible();expect(await page.evaluate(()=>(window as unknown as {coldLossProbe:{loads:number}}).coldLossProbe.loads)).toBe(2);expect(await requiredStored(page)).toEqual(before);
  await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1');await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect.poll(async()=>(await stored(page))?.revision).toBe(2);const after=await requiredStored(page);expect(after.journal.id).toBe(before.journal.id);expect(after.journal.actions).toEqual([...before.journal.actions,{kind:'advance',ticks:120}]);
});

test('creating a new world discards the ready save candidate without writing the old slots',async({page})=>{
  test.setTimeout(90000);await enter(page);await create(page,24);await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存');const before=await requiredStored(page),bytes=await allSlots(page);expect(before.revision).toBe(1);expectNewJournal(before.journal);
  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await expect(page.getByRole('button',{name:'继续文化世界',exact:true})).toBeVisible();await create(page,60);
  await page.getByRole('button',{name:'推进一天',exact:true}).click();await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-day','1');expect(await allSlots(page)).toBe(bytes);
  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect.poll(async()=>(await stored(page))?.revision).toBe(2);const after=await requiredStored(page);expect(after.journal.id).not.toBe(before.journal.id);expect(after.journal.opening.cityCount).toBe(60);expectNewJournal(after.journal,[{kind:'advance',ticks:120}]);
});
