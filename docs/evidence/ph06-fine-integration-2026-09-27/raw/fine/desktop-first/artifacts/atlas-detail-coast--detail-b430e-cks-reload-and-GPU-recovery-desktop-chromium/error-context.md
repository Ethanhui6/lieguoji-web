# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: atlas-detail-coast.spec.ts >> [detail-v4] native contour, private preview, exact saved coast, zoom picks, reload and GPU recovery
- Location: tests\atlas-detail-coast.spec.ts:45:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByTestId('atlas-picked-surface')
Expected: "land"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" getByTestId('atlas-picked-surface') with timeout 5000ms
  - waiting for getByTestId('atlas-picked-surface')

```

```yaml
- main:
  - heading "细山海 · 实际绘制" [level=1]
  - text: 地理创作
  - button "撤销大世界编辑": 撤销
  - button "返回原世界工坊": 工坊
  - button "放大大世界地图": ＋
  - button "缩小大世界地图": −
  - button "全图"
  - text: 1185%
  - toolbar "地图创作工具":
    - button "浏览地图" [pressed]: 浏览
    - button "画大陆" [disabled]
    - button "显示地块网格": 网格
  - status: 大陆已保存。可以缩放探索、刷新恢复，或撤销后重新绘制。
  - navigation "大世界草稿工具":
    - button "地图" [pressed]
    - button "创世"
    - button "编辑"
    - button "草稿"
```

# Test source

```ts
  1  | import { test, expect, type Page } from '@playwright/test';
  2  | import { audit, metrics, saved, databaseDigest } from './helpers/atlas-shape-readonly';
  3  | import type { AtlasRenderer } from '../src/world/renderer';
  4  | const studio=(p:Page)=>p.getByTestId('atlas-studio');
  5  | const ready=(p:Page,state='ready')=>expect(studio(p)).toHaveAttribute('data-atlas-state',state,{timeout:120000});
  6  | const click=(p:Page,name:string)=>p.getByRole('button',{name,exact:true}).filter({visible:true}).click();
  7  | const panel=(p:Page,name:string)=>p.getByRole('navigation',{name:'大世界草稿工具'}).getByRole('button',{name,exact:true}).click();
  8  | async function frameReady(p:Page){await expect.poll(async()=>{const m=await metrics(p) as ReturnType<AtlasRenderer['metrics']>;return m.completedFrameSequence===m.frameSequence&&m.gpu.state==='ready';},{timeout:120000}).toBe(true);}
  9  | type XY={x:number;y:number};
  10 | const contour=[[860,1050],[1260,810],[2020,980],[2440,1300],[2890,1460],[3070,1890],[2620,2260],[2240,2050],[1990,2420],[1460,2580],[1210,2020],[780,1840],[650,1480]].map(([x,y])=>({x,y}));
  11 | async function screen(p:Page,points:XY[]){const box=(await p.getByTestId('atlas-canvas').boundingBox())!,frame=await metrics(p);return points.map(q=>({x:box.x+frame.camera.x+q.x*frame.camera.scale,y:box.y+frame.camera.y+q.y*frame.camera.scale}));}
  12 | async function draw(p:Page,touch:boolean){
  13 |   await click(p,'画大陆');await click(p,'全图');const points=await screen(p,[...contour,contour[0]]);
  14 |   expect(await p.evaluate(ps=>ps.every(q=>document.elementFromPoint(q.x,q.y)?.getAttribute('data-testid')==='atlas-canvas'),points)).toBe(true);
  15 |   if(touch){const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});for(const q of points.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...q,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  16 |   else{await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();for(const q of points.slice(1))await p.mouse.move(q.x,q.y);await p.mouse.up();}
  17 |   await expect(p.getByRole('region',{name:'大陆生成预览'})).toBeVisible({timeout:120000});await ready(p);
  18 | }
  19 | /** Independent LGDC observer. No app generator/geometry imports or state writes. */
  20 | async function storedFine(p:Page,id:string){return p.evaluate(async id=>{
  21 |   const rows=await new Promise<{manifest:{version:number;spec:{columns:number};detailCoast:{refs:{bx:number;by:number;hash:string}[]}};records:{bx:number;by:number;hash:string;bytes:Uint8Array}[]}>((resolve,reject)=>{
  22 |     const req=indexedDB.open('lieguoji-atlas-drafts-v4',1);req.onupgradeneeded=()=>req.transaction!.abort();req.onerror=()=>reject(req.error);req.onsuccess=()=>{
  23 |       const db=req.result,tx=db.transaction(['roots','manifests','blocks'],'readonly');let manifest:{version:number;spec:{columns:number};detailCoast:{refs:{bx:number;by:number;hash:string}[]}};const records:{bx:number;by:number;hash:string;bytes:Uint8Array}[]=[];
  24 |       const r=tx.objectStore('roots').get(id);r.onsuccess=()=>{const root=JSON.parse(new TextDecoder().decode(r.result));const m=tx.objectStore('manifests').get(root.currentManifest);m.onsuccess=()=>{manifest=JSON.parse(new TextDecoder().decode(m.result.bytes));for(const ref of manifest.detailCoast.refs){const b=tx.objectStore('blocks').get(ref.hash);b.onsuccess=()=>records.push({...ref,bytes:b.result.bytes});}};};
  25 |       tx.oncomplete=()=>{db.close();resolve({manifest,records});};tx.onabort=()=>{db.close();reject(tx.error);};
  26 |     };
  27 |   });
  28 |   const tiles=new Map<string,{bx:number;by:number;mode:number;values:number[]}>();let samples=0,landTiles=0;
  29 |   for(const r of rows.records){const b=r.bytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength),n=v.getUint16(8,true),expected=(r.bx===0?33:32)*(r.by===0?33:32);
  30 |     const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
  31 |     if(hash!==r.hash||[76,71,68,67,1].some((x,i)=>b[i]!==x)||b[6]!==r.bx||b[7]!==r.by||b.slice(10,16).some(Boolean)||b[5]>1||b.length!==16+n*4||n!==(b[5]?expected:0))throw new Error('Saved LGDC content/owner/hash mismatch');
  32 |     const values=Array.from({length:n},(_,i)=>v.getInt16(16+i*2,true));for(let i=0;i<n;i++){const h=v.getInt16(16+n*2+i*2,true),c=values[i];if(c===-32768||h < -12000||h>12000||c>0&&h<0||c<0&&h>=0||c===0&&h!==0)throw new Error('Saved coast height/sign mismatch');}
  33 |     tiles.set(`${r.bx}:${r.by}`,{bx:r.bx,by:r.by,mode:b[5],values});if(b[5])samples++;else landTiles++;
  34 |   }
  35 |   const sample=(x:number,y:number)=>{const bx=Math.floor(Math.max(0,x-1)/32),by=Math.floor(Math.max(0,y-1)/32),t=tiles.get(`${bx}:${by}`);return !t?-32767:!t.mode?32767:t.values[(y-(by*32+(by?1:0)))*(bx?32:33)+x-(bx*32+(bx?1:0))];};
  36 |   const groups=new Map<number,{land?:XY;sea?:XY}>(),step=4096/rows.manifest.spec.columns;
  37 |   for(const t of tiles.values())if(t.mode)for(let y=t.by*32;y<Math.min(2048,t.by*32+32);y++)for(let x=t.bx*32;x<Math.min(2048,t.bx*32+32);x++){
  38 |     const q=[sample(x,y),sample(x+1,y),sample(x+1,y+1),sample(x,y+1)],land=q.every(v=>v>256),sea=q.every(v=>v < -256);if(!land&&!sea)continue;
  39 |     const point={x:x*2+1,y:y*2+1},cell=Math.floor(point.y/step)*rows.manifest.spec.columns+Math.floor(point.x/step),g=groups.get(cell)??{};if(land)g.land??=point;else g.sea??=point;groups.set(cell,g);
  40 |   }
  41 |   const pair=[...groups].find(([,g])=>g.land&&g.sea);if(!pair)throw new Error('Generated map lacks independently observable fine coast within a coarse cell');
  42 |   return {samples,landTiles,refs:rows.manifest.detailCoast.refs,probe:{cellId:pair[0],land:pair[1].land!,sea:pair[1].sea!}};
  43 | },id);}
  44 | 
  45 | test('[detail-v4] native contour, private preview, exact saved coast, zoom picks, reload and GPU recovery',async({page},info)=>{
  46 |   test.setTimeout(360000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  47 |   await page.goto('/?atlas=new&atlas-format=4');await ready(page,'empty');await page.getByLabel('大世界草稿名称',{exact:true}).fill('细山海 · 实际绘制');await page.getByLabel('大世界生成种子',{exact:true}).fill('fine-ui-original');await page.getByLabel('大世界地理规模',{exact:true}).selectOption('256');await click(page,'新建空白海洋草稿');await ready(page);
  48 |   const id=(await studio(page).getAttribute('data-atlas-id'))!,blank=await saved(page,id,4),digest=await databaseDigest(page,4);
  49 |   await draw(page,info.project.name!=='desktop-chromium');const candidate=await audit(page);expect(candidate.display.version).toBe(4);expect(await databaseDigest(page,4)).toEqual(digest);expect(await saved(page,id,4)).toEqual(blank);
  50 |   await panel(page,'地图');await frameReady(page);await page.screenshot({path:info.outputPath('fine-first-preview.png'),fullPage:true});await panel(page,'创世');
  51 |   await click(page,'取消生成');await ready(page);expect(await databaseDigest(page,4)).toEqual(digest);
  52 |   await draw(page,info.project.name!=='desktop-chromium');expect((await audit(page)).display.manifestDigest).toBe(candidate.display.manifestDigest);await click(page,'确认生成并保存');await ready(page);
  53 |   const committed=await saved(page,id,4),fine=await storedFine(page,id),build=await(await page.request.get('/build.json')).json();
  54 |   expect(committed.root).toMatchObject({domain:'atlas-draft-v4',revision:1,currentManifest:candidate.display.manifestDigest,backupManifest:blank.root.currentManifest});expect(committed.manifest.generation.lastApplied?.recipe.generator).toMatchObject({id:'shape-detail-landmass',version:1,fingerprint:build.detailShapeGenerator.sha256});expect(fine.samples).toBeGreaterThan(10);
  55 |   await panel(page,'地图');await click(page,'全图');await page.screenshot({path:info.outputPath('fine-world.png'),fullPage:true});
  56 |   await panel(page,'编辑');await page.getByLabel('定位地块编号',{exact:true}).fill(String(fine.probe.cellId));await click(page,'定位');await panel(page,'地图');
  57 |   while((await metrics(page)).camera.scale<8){await click(page,'放大大世界地图');await frameReady(page);}
> 58 |   for(const kind of ['land','sea'] as const){await panel(page,'地图');const [q]=await screen(page,[fine.probe[kind]]);if(info.project.name==='desktop-chromium')await page.mouse.click(q.x,q.y);else await page.touchscreen.tap(q.x,q.y);await expect(page.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land',kind);}
     |                                                                                                                                                                                                                                                                                               ^ Error: expect(locator).toHaveAttribute(expected) failed
  59 |   await panel(page,'地图');await page.screenshot({path:info.outputPath('fine-shore.png'),fullPage:true});
  60 |   const frame=await metrics(page) as ReturnType<AtlasRenderer['metrics']>;expect(frame.cache.pixels).toBeLessThanOrEqual(32*1024*1024);expect(frame.labels.visibleCount).toBe(0);
  61 |   await page.getByTestId('atlas-canvas').evaluate(element=>{const gl=(element as HTMLCanvasElement).getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');if(!ext)throw new Error('No actual WebGL2 loss extension');ext.loseContext();setTimeout(()=>ext.restoreContext(),200);});
  62 |   await expect(studio(page)).toHaveAttribute('data-atlas-gpu','lost');await expect(studio(page)).toHaveAttribute('data-atlas-gpu','ready',{timeout:120000});await ready(page);expect((await audit(page)).display.manifestDigest).toBe(candidate.display.manifestDigest);expect(await saved(page,id,4)).toEqual(committed);
  63 |   await page.reload();await ready(page);expect(await saved(page,id,4)).toEqual(committed);expect(await storedFine(page,id)).toEqual(fine);expect((await audit(page)).display).toMatchObject({version:4,revision:1,manifestDigest:candidate.display.manifestDigest});
  64 |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  65 |   await info.attach('fine-persistence-observation.json',{contentType:'application/json',body:JSON.stringify({candidate,refs:fine.refs,sampleTiles:fine.samples,probe:fine.probe,frame,build:build.detailShapeGenerator,scope:'Browser emulation; no physical-device/user visual acceptance'},null,2)});
  66 | });
  67 | 
```