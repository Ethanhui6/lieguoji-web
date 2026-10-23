import {test,expect,type Page} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

type Injection='preview'|'save-and-pause';
type RequestRow={worker:number;id:number;type:string;advance:boolean;at:number};
type AckRow=RequestRow&{tick:number|null};
type ClickRow={kind:Injection;worker:number;id:number;pendingAdvance:boolean;buttons:string[]};
type Probe={armed:Injection|null;pending:number;maxPending:number;posts:RequestRow[];acks:AckRow[];clicks:ClickRow[];errors:string[]};
type ProbeWindow=Window&{culture47PipelineProbe:Probe};

async function probe(page:Page){return page.evaluate(()=>structuredClone((window as unknown as ProbeWindow).culture47PipelineProbe));}
async function arm(page:Page,kind:Injection){await page.evaluate(value=>{(window as unknown as ProbeWindow).culture47PipelineProbe.armed=value;},kind);}
async function expectPaused(page:Page){
 await expect(page.getByRole('button',{name:'继续时间',exact:true})).toBeVisible();
 await expect(page.getByTestId('culture47-app')).toHaveAttribute('data-advancing','false');
 await expect.poll(async()=>(await probe(page)).pending,{timeout:30000}).toBe(0);
}
async function expectNoNewAdvance(page:Page){
 const before=(await probe(page)).posts.filter(row=>row.advance).length;
 // Longer than several browser paints: a paused ACK continuation must not post.
 await page.waitForTimeout(500);
 expect((await probe(page)).posts.filter(row=>row.advance)).toHaveLength(before);
}

test('acknowledged pipeline installs every result and drains pending preview/save through real controls',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  type Packet={id?:number;command?:{type?:string;action?:{kind?:string}};progress?:unknown;error?:unknown;display?:{kind?:string;snapshot?:{run:{clock:{tick:number}}};tick?:number};snapshot?:{run:{clock:{tick:number}}}};
  const state:Probe={armed:null,pending:0,maxPending:0,posts:[],acks:[],clicks:[],errors:[]},pending=new Map<string,RequestRow>();
  (window as unknown as ProbeWindow).culture47PipelineProbe=state;
  const NativeWorker=Worker;let workers=0;
  window.Worker=class extends NativeWorker{
   private probeWorker=++workers;
   constructor(url:string|URL,options?:WorkerOptions){
    super(url,options);
    this.addEventListener('message',event=>{
     const data=event.data as Packet;if(data.progress||typeof data.id!=='number')return;
     const token=this.probeWorker+'/'+data.id,row=pending.get(token);if(!row)return;
     pending.delete(token);state.pending=pending.size;
     if(data.error){state.errors.push(String(data.error));return;}
     const tick=data.display?.kind==='full'?data.display.snapshot?.run.clock.tick:data.display?.tick??data.snapshot?.run.clock.tick;
     state.acks.push({...row,at:performance.now(),tick:tick??null});
    });
   }
   postMessage(message:unknown,options?:Transferable[]|StructuredSerializeOptions){
    const packet=message as Packet,command=packet?.command;
    const tracked=typeof packet?.id==='number'&&typeof command?.type==='string';
    const row=tracked?{worker:this.probeWorker,id:packet.id!,type:command!.type!,advance:command!.type==='advance-batch'||command!.type==='action'&&command!.action?.kind==='advance',at:performance.now()}:null;
    if(row){pending.set(row.worker+'/'+row.id,row);state.posts.push(row);state.pending=pending.size;state.maxPending=Math.max(state.maxPending,state.pending);}
    try{if(Array.isArray(options))super.postMessage(message,options);else super.postMessage(message,options);}
    catch(error){if(row){pending.delete(row.worker+'/'+row.id);state.pending=pending.size;}throw error;}
    if(!row?.advance||!state.armed)return;
    const kind=state.armed;state.armed=null;
    // Deterministic timing injection ONLY: after posting to the real Worker,
    // click existing enabled DOM buttons in a microtask while that request is
    // pending. Do not replace/delay responses or call internal game handlers.
    queueMicrotask(()=>{
     const click:ClickRow={kind,worker:row.worker,id:row.id,pendingAdvance:pending.has(row.worker+'/'+row.id),buttons:[]};state.clicks.push(click);
     const press=(name:string|RegExp)=>{
      const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>typeof name==='string'?node.getAttribute('aria-label')===name:name.test(node.textContent?.trim()??''));
      if(!button||button.disabled){state.errors.push('Injection button unavailable: '+String(name));return;}
      click.buttons.push(button.getAttribute('aria-label')??button.textContent?.trim()??'');button.click();
     };
     if(kind==='preview')press(/^暂停并预览(?:停战|宣战)$/);
     else {press('保存文化世界');press('暂停时间');}
    });
   }
  };
 });
 await enter(page);
 // The map renderer reads this flag when the real world is created below.
 await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set('fmsDiagnostics','1');history.replaceState(history.state,'',url);});
 await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('战乱开局').check();await create(page,24);
 const app=page.getByTestId('culture47-app'),map=page.getByTestId('culture47-map');
 await expect(map).toHaveAttribute('data-motion-revision',/^\d+$/);
 const initialRevision=Number(await map.getAttribute('data-motion-revision')),initial=await probe(page);
 const speed=page.getByRole('button',{name:'切换推演速度',exact:true});
 for(let i=0;i<8&&(await speed.textContent())!=='4倍速';i++)await speed.click();await expect(speed).toHaveText('4倍速');
 await page.getByRole('button',{name:'继续时间',exact:true}).click();
 await expect.poll(async()=>(await probe(page)).acks.filter(row=>row.advance).length,{timeout:30000,intervals:[50]}).toBeGreaterThanOrEqual(4);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expectPaused(page);
 const continuous=await probe(page),accepted=continuous.acks.filter(row=>row.advance),acceptedTick=accepted.at(-1)!.tick!;
 await expect(app).toHaveAttribute('data-tick',String(acceptedTick));
 await expect(map).toHaveAttribute('data-motion-revision',String(initialRevision+accepted.length-initial.acks.filter(row=>row.advance).length));
 expect(continuous.maxPending).toBe(1);expect(accepted.length).toBe(continuous.posts.filter(row=>row.advance).length);
 await expectNoNewAdvance(page);
 await info.attach('pipeline-continuous',{body:JSON.stringify({initialRevision,acceptedTick,probe:continuous,physicalIphone:false}),contentType:'application/json'});

 await page.locator('.c47-nations button').first().click();
 await expect(page.getByRole('button',{name:/^暂停并预览(?:停战|宣战)$/})).toBeEnabled();
 const beforePreview=await probe(page);await arm(page,'preview');await page.getByRole('button',{name:'继续时间',exact:true}).click();
 await expect(page.getByRole('group',{name:'外交预览',exact:true})).toBeVisible({timeout:30000});await expectPaused(page);
 const preview=await probe(page),previewClick=preview.clicks.find(row=>row.kind==='preview')!;
 expect(previewClick).toMatchObject({pendingAdvance:true});expect(previewClick.buttons).toHaveLength(1);
 expect(preview.posts.filter(row=>row.advance)).toHaveLength(beforePreview.posts.filter(row=>row.advance).length+1);
 const previewAdvance=preview.acks.find(row=>row.worker===previewClick.worker&&row.id===previewClick.id)!;
 expect(previewAdvance.advance).toBe(true);
 const previewPost=preview.posts.find(row=>row.type==='political-preview'),previewAck=preview.acks.find(row=>row.type==='political-preview');
 expect(previewPost).toBeDefined();expect(previewAck).toBeDefined();expect(previewPost!.at).toBeGreaterThanOrEqual(previewAdvance.at);
 await expectNoNewAdvance(page);
 await page.getByRole('button',{name:'取消外交操作',exact:true}).click();await expect(page.getByRole('group',{name:'外交预览',exact:true})).toHaveCount(0);
 await info.attach('pipeline-pending-preview',{body:JSON.stringify({probe:preview,deterministicDomClickInjection:true,realWorker:true}),contentType:'application/json'});

 const beforeSave=await probe(page);await arm(page,'save-and-pause');await page.getByRole('button',{name:'继续时间',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('文化世界已保存',{timeout:30000});await expectPaused(page);
 const saved=await probe(page),saveClick=saved.clicks.find(row=>row.kind==='save-and-pause')!;
 expect(saveClick).toMatchObject({pendingAdvance:true,buttons:['保存文化世界','暂停时间']});
 expect(saved.posts.filter(row=>row.advance)).toHaveLength(beforeSave.posts.filter(row=>row.advance).length+1);
 const saveAdvance=saved.acks.find(row=>row.worker===saveClick.worker&&row.id===saveClick.id)!;
 expect(saveAdvance.advance).toBe(true);expect(saveAdvance.tick).not.toBeNull();
 const verifyPost=saved.posts.find(row=>row.type==='verify'&&row.at>=saveAdvance.at);
 expect(verifyPost).toBeDefined();expect(saved.acks.some(row=>row.worker===verifyPost!.worker&&row.id===verifyPost!.id)).toBe(true);
 await expect(app).toHaveAttribute('data-tick',String(saveAdvance.tick));await expectNoNewAdvance(page);
 const positions=await map.getAttribute('data-force-positions');expect(positions).not.toBeNull();
 expect(saved.maxPending).toBe(1);expect(saved.errors).toEqual([]);expect(errors).toEqual([]);
 await info.attach('pipeline-pending-save',{body:JSON.stringify({probe:saved,savedTick:saveAdvance.tick,positions,deterministicDomClickInjection:true,physicalIphone:false}),contentType:'application/json'});

 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick',String(saveAdvance.tick),{timeout:90000});await expect(map).toHaveAttribute('data-force-positions',positions!);
 await expectPaused(page);await expectNoNewAdvance(page);expect((await probe(page)).errors).toEqual([]);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath('pipeline-cold-restored.png')});
 await info.attach('pipeline-restored',{body:JSON.stringify({tick:saveAdvance.tick,sameForcePositions:true,input:{gridSamples:676,nations:2,cities:24,warOpening:true,speed:4},physicalIphone:false,visualEquivalence:false,errors}),contentType:'application/json'});
});
