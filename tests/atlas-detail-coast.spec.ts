import { test, expect, type Page } from '@playwright/test';
import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';
const studio=(p:Page)=>p.getByTestId('atlas-studio');
const ready=(p:Page,state='ready')=>expect(studio(p)).toHaveAttribute('data-atlas-state',state,{timeout:120000});
const click=(p:Page,name:string)=>p.getByRole('button',{name,exact:true}).filter({visible:true}).click();
const panel=(p:Page,name:string)=>p.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name,exact:true}).click();
async function frameReady(p:Page){await expect.poll(async()=>{const m=await metrics(p) as ReturnType<AtlasRenderer['metrics']>;return m.completedFrameSequence===m.frameSequence&&m.gpu.state==='ready';},{timeout:120000}).toBe(true);}
type XY={x:number;y:number};
const contour=[[860,1050],[1260,810],[2020,980],[2440,1300],[2890,1460],[3070,1890],[2620,2260],[2240,2050],[1990,2420],[1460,2580],[1210,2020],[780,1840],[650,1480]].map(([x,y])=>({x,y}));
async function screen(p:Page,points:XY[]){const box=(await p.getByTestId('atlas-canvas').boundingBox())!,frame=await metrics(p);return points.map(q=>({x:box.x+frame.camera.x+q.x*frame.camera.scale,y:box.y+frame.camera.y+q.y*frame.camera.scale}));}
async function assertCanvasPoints(p:Page,points:XY[]){
  expect(await p.evaluate(ps=>ps.map(q=>({point:q,hit:document.elementFromPoint(q.x,q.y)?.getAttribute('data-testid')??null})),points)).toEqual(points.map(point=>({point,hit:'atlas-canvas'})));
}
async function locateProbe(p:Page,cellId:number){
  await panel(p,'编辑');await p.getByLabel('定位地块编号',{exact:true}).fill(String(cellId));await click(p,'定位');await panel(p,'地图');await frameReady(p);
}
async function centerProbes(p:Page,probe:{cellId:number;land:XY;sea:XY},touch:boolean){
  // Locate at the current zoom: toolbar zoom is anchored to the viewport center,
  // while the editor intentionally locates cells at 42% / 35% of the canvas.
  await locateProbe(p,probe.cellId);
  const box=(await p.getByTestId('atlas-canvas').boundingBox())!,points=await screen(p,[probe.land,probe.sea]);
  const center={x:box.x+box.width*.5,y:box.y+box.height*.55},mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
  const end={x:center.x+center.x-mid.x,y:center.y+center.y-mid.y};
  // Reframe with an actual canvas gesture; never inject a camera or selection.
  await assertCanvasPoints(p,[center,end]);
  if(touch){
    const cdp=await p.context().newCDPSession(p);
    try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...center,id:1}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+(end.x-center.x)*i/8,y:center.y+(end.y-center.y)*i/8,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    finally{await cdp.detach();}
  }else{await p.mouse.move(center.x,center.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:8});await p.mouse.up();}
  await frameReady(p);const visible=await screen(p,[probe.land,probe.sea]);await assertCanvasPoints(p,visible);return visible;
}
async function draw(p:Page,touch:boolean){
  await click(p,'画大陆');await click(p,'全图');const points=await screen(p,[...contour,contour[0]]);
  expect(await p.evaluate(ps=>ps.every(q=>document.elementFromPoint(q.x,q.y)?.getAttribute('data-testid')==='atlas-canvas'),points)).toBe(true);
  if(touch){const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});for(const q of points.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...q,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();for(const q of points.slice(1))await p.mouse.move(q.x,q.y);await p.mouse.up();}
  await expect(p.getByRole('region',{name:'大陆生成预览'})).toBeVisible({timeout:120000});await ready(p);
}
/** Independent LGDC observer. No app generator/geometry imports or state writes. */
async function storedFine(p:Page,id:string){return p.evaluate(async id=>{
  const rows=await new Promise<{manifest:{version:number;spec:{columns:number};detailCoast:{refs:{bx:number;by:number;hash:string}[]}};records:{bx:number;by:number;hash:string;bytes:Uint8Array}[]}>((resolve,reject)=>{
    const req=indexedDB.open('lieguoji-atlas-drafts-v4',1);req.onupgradeneeded=()=>req.transaction!.abort();req.onerror=()=>reject(req.error);req.onsuccess=()=>{
      const db=req.result,tx=db.transaction(['roots','manifests','blocks'],'readonly');let manifest:{version:number;spec:{columns:number};detailCoast:{refs:{bx:number;by:number;hash:string}[]}};const records:{bx:number;by:number;hash:string;bytes:Uint8Array}[]=[];
      const r=tx.objectStore('roots').get(id);r.onsuccess=()=>{const root=JSON.parse(new TextDecoder().decode(r.result));const m=tx.objectStore('manifests').get(root.currentManifest);m.onsuccess=()=>{manifest=JSON.parse(new TextDecoder().decode(m.result.bytes));for(const ref of manifest.detailCoast.refs){const b=tx.objectStore('blocks').get(ref.hash);b.onsuccess=()=>records.push({...ref,bytes:b.result.bytes});}};};
      tx.oncomplete=()=>{db.close();resolve({manifest,records});};tx.onabort=()=>{db.close();reject(tx.error);};
    };
  });
  const tiles=new Map<string,{bx:number;by:number;mode:number;values:number[]}>();let samples=0,landTiles=0;
  for(const r of rows.records){const b=r.bytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength),n=v.getUint16(8,true),expected=(r.bx===0?33:32)*(r.by===0?33:32);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==r.hash||[76,71,68,67,1].some((x,i)=>b[i]!==x)||b[6]!==r.bx||b[7]!==r.by||b.slice(10,16).some(Boolean)||b[5]>1||b.length!==16+n*4||n!==(b[5]?expected:0))throw new Error('Saved LGDC content/owner/hash mismatch');
    const values=Array.from({length:n},(_,i)=>v.getInt16(16+i*2,true));for(let i=0;i<n;i++){const h=v.getInt16(16+n*2+i*2,true),c=values[i];if(c===-32768||h < -12000||h>12000||c>0&&h<0||c<0&&h>=0||c===0&&h!==0)throw new Error('Saved coast height/sign mismatch');}
    tiles.set(`${r.bx}:${r.by}`,{bx:r.bx,by:r.by,mode:b[5],values});if(b[5])samples++;else landTiles++;
  }
  const sample=(x:number,y:number)=>{const bx=Math.floor(Math.max(0,x-1)/32),by=Math.floor(Math.max(0,y-1)/32),t=tiles.get(`${bx}:${by}`);return !t?-32767:!t.mode?32767:t.values[(y-(by*32+(by?1:0)))*(bx?32:33)+x-(bx*32+(bx?1:0))];};
  const groups=new Map<number,{land?:XY;sea?:XY}>(),step=4096/rows.manifest.spec.columns;
  for(const t of tiles.values())if(t.mode)for(let y=t.by*32;y<Math.min(2048,t.by*32+32);y++)for(let x=t.bx*32;x<Math.min(2048,t.bx*32+32);x++){
    const q=[sample(x,y),sample(x+1,y),sample(x+1,y+1),sample(x,y+1)],land=q.every(v=>v>256),sea=q.every(v=>v < -256);if(!land&&!sea)continue;
    const point={x:x*2+1,y:y*2+1},cell=Math.floor(point.y/step)*rows.manifest.spec.columns+Math.floor(point.x/step),g=groups.get(cell)??{};if(land)g.land??=point;else g.sea??=point;groups.set(cell,g);
  }
  const pair=[...groups].find(([,g])=>g.land&&g.sea);if(!pair)throw new Error('Generated map lacks independently observable fine coast within a coarse cell');
  return {samples,landTiles,refs:rows.manifest.detailCoast.refs,probe:{cellId:pair[0],land:pair[1].land!,sea:pair[1].sea!}};
},id);}

test('[detail-v4] native contour, private preview, exact saved coast, zoom picks, reload and GPU recovery',async({page},info)=>{
  test.setTimeout(360000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?atlas=new&atlas-format=4');await ready(page,'empty');await page.getByLabel('大世界草稿名称',{exact:true}).fill('细山海 · 实际绘制');await page.getByLabel('大世界生成种子',{exact:true}).fill('fine-ui-original');await page.getByLabel('大世界地理规模',{exact:true}).selectOption('256');await click(page,'新建空白海洋草稿');await ready(page);
  const id=(await studio(page).getAttribute('data-atlas-id'))!,blank=await saved(page,id,4),digest=await databaseDigest(page,4);
  await draw(page,info.project.name!=='desktop-chromium');const candidate=await audit(page);expect(candidate.display.version).toBe(4);expect(await databaseDigest(page,4)).toEqual(digest);expect(await saved(page,id,4)).toEqual(blank);
  await panel(page,'地图');await frameReady(page);await page.screenshot({path:info.outputPath('fine-first-preview.png'),fullPage:true});await panel(page,'创世');
  await click(page,'取消生成');await ready(page);expect(await databaseDigest(page,4)).toEqual(digest);
  await draw(page,info.project.name!=='desktop-chromium');expect((await audit(page)).display.manifestDigest).toBe(candidate.display.manifestDigest);await click(page,'确认生成并保存');await ready(page);
  const committed=await saved(page,id,4),fine=await storedFine(page,id),build=await(await page.request.get('/build.json')).json();
  expect(committed.root).toMatchObject({domain:'atlas-draft-v4',revision:1,currentManifest:candidate.display.manifestDigest,backupManifest:blank.root.currentManifest});expect(committed.manifest.generation.lastApplied?.recipe.generator).toMatchObject({id:'shape-detail-landmass',version:1,fingerprint:build.detailShapeGenerator.sha256});expect(fine.samples).toBeGreaterThan(10);
  await panel(page,'地图');await click(page,'全图');await page.screenshot({path:info.outputPath('fine-world.png'),fullPage:true});
  await locateProbe(page,fine.probe.cellId);
  const viewport=(await page.getByTestId('atlas-canvas').boundingBox())!,zoomMaximum=Math.min(viewport.width,viewport.height)/4096*.9*80,zoomTarget=Math.min(8,zoomMaximum);
  // The fixed product limit is 80 times fit. A narrow phone cannot reach scale 8.
  // Require its actual maximum instead, and bound the loop so a stalled zoom fails.
  for(let i=0;i<16&&(await metrics(page)).camera.scale<zoomTarget-1e-9;i++){
    const before=(await metrics(page)).camera.scale;await click(page,'放大大世界地图');await frameReady(page);expect((await metrics(page)).camera.scale).toBeGreaterThan(before);
  }
  expect((await metrics(page)).camera.scale).toBeGreaterThanOrEqual(zoomTarget-1e-9);expect((await metrics(page)).camera.scale).toBeLessThanOrEqual(zoomMaximum+1e-9);
  if(info.project.name==='desktop-chromium')expect((await metrics(page)).camera.scale).toBeGreaterThanOrEqual(8);
  const pickObservations:{kind:'land'|'sea';land:XY;sea:XY;scale:number}[]=[];
  for(const kind of ['land','sea'] as const){
    const points=await centerProbes(page,fine.probe,info.project.name!=='desktop-chromium'),q=points[kind==='land'?0:1],scale=(await metrics(page)).camera.scale;
    expect(scale).toBeGreaterThanOrEqual(zoomTarget-1e-9);pickObservations.push({kind,land:points[0],sea:points[1],scale});
    if(info.project.name==='desktop-chromium')await page.mouse.click(q.x,q.y);else await page.touchscreen.tap(q.x,q.y);await expect(page.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land',kind);
  }
  await panel(page,'地图');await page.screenshot({path:info.outputPath('fine-shore.png'),fullPage:true});
  const frame=await metrics(page) as ReturnType<AtlasRenderer['metrics']>;expect(frame.cache.pixels).toBeLessThanOrEqual(32*1024*1024);expect(frame.labels.visibleCount).toBe(0);
  await page.getByTestId('atlas-canvas').evaluate(element=>{const gl=(element as HTMLCanvasElement).getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');if(!ext)throw new Error('No actual WebGL2 loss extension');ext.loseContext();setTimeout(()=>ext.restoreContext(),200);});
  await expect(studio(page)).toHaveAttribute('data-atlas-gpu','lost');await expect(studio(page)).toHaveAttribute('data-atlas-gpu','ready',{timeout:120000});await ready(page);expect((await audit(page)).display.manifestDigest).toBe(candidate.display.manifestDigest);expect(await saved(page,id,4)).toEqual(committed);
  await page.reload();await ready(page);expect(await saved(page,id,4)).toEqual(committed);expect(await storedFine(page,id)).toEqual(fine);expect((await audit(page)).display).toMatchObject({version:4,revision:1,manifestDigest:candidate.display.manifestDigest});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await info.attach('fine-persistence-observation.json',{contentType:'application/json',body:JSON.stringify({candidate,refs:fine.refs,sampleTiles:fine.samples,probe:fine.probe,nearView:{zoomTarget,zoomMaximum,pickObservations},frame,build:build.detailShapeGenerator,scope:'Browser emulation; no physical-device/user visual acceptance'},null,2)});
});
