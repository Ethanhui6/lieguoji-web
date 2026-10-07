# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fms-cartography.spec.ts >> drawn diagonal world keeps map labels anchored and the chronicle focused on major events
- Location: tests\fms-cartography.spec.ts:6:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '收起面板', exact: true })

```

# Page snapshot

```yaml
- generic:
  - main [ref=e1]:
    - generic "创世地图画布" [ref=e3]
    - button "进入世界 →" [ref=e4] [cursor=pointer]
    - generic:
      - generic:
        - text: 列国纪 · 创世
        - heading "地图编辑" [level=1]
      - generic:
        - button "原作地形" [ref=e5] [cursor=pointer]
        - button "保存 已保存" [ref=e6] [cursor=pointer]:
          - text: 保存
          - generic "已保存" [ref=e7]
    - generic "地图视角" [ref=e8]:
      - button "放大" [ref=e9] [cursor=pointer]: ＋
      - button "查看全图" [ref=e10] [cursor=pointer]: ⌖
      - button "缩小" [ref=e11] [cursor=pointer]: −
      - status [ref=e12]: 1.0×
    - generic [ref=e13]:
      - status: 已保存到此浏览器，刷新后可以继续。
      - generic [ref=e14]:
        - navigation "地图工具" [ref=e15]:
          - button "浏览" [ref=e16] [cursor=pointer]:
            - generic [aria-hidden] [ref=e17]: ✥
            - text: 浏览
          - button "轮廓" [pressed] [ref=e18] [cursor=pointer]:
            - generic [aria-hidden] [ref=e19]: ◇
            - text: 轮廓
          - button "陆地" [ref=e20] [cursor=pointer]:
            - generic [aria-hidden] [ref=e21]: ▲
            - text: 陆地
          - button "海洋" [ref=e22] [cursor=pointer]:
            - generic [aria-hidden] [ref=e23]: ≈
            - text: 海洋
        - generic [ref=e24]:
          - button "撤销" [ref=e25] [cursor=pointer]: ↶
          - button "重做" [disabled] [ref=e26]: ↷
          - button "绘图设置" [ref=e27] [cursor=pointer]: ☷
  - generic [ref=e28]:
    - generic:
      - generic "诸国推演地图" [ref=e30]
      - button "顶部大事记" [ref=e31] [cursor=pointer]:
        - generic [ref=e32]: 大事记
        - generic [ref=e33]:
          - generic [ref=e34]: 世界史
          - strong [ref=e35]: 天下尚无要闻 · 点击查看记录
        - generic [ref=e36]: 查看 ›
      - generic:
        - button "‹ 绘图" [ref=e37] [cursor=pointer]
        - generic [ref=e38]:
          - generic [ref=e39]: 列国纪 · 诸国沙盒
          - strong [ref=e40]: 第 0 日 · 00:00
        - button "保存进度" [ref=e41] [cursor=pointer]
      - status: 政治浏览：点击国土查看国家与城市。
      - generic [ref=e43]:
        - button "政区" [pressed] [ref=e44] [cursor=pointer]
        - button "地形" [ref=e45] [cursor=pointer]
        - button "国家图例" [ref=e46] [cursor=pointer]
      - complementary [ref=e47]:
        - button "放大推演地图" [ref=e48] [cursor=pointer]: ＋
        - button "缩小推演地图" [ref=e49] [cursor=pointer]: −
        - button "全图" [ref=e50] [cursor=pointer]
      - generic [ref=e51]:
        - generic [ref=e52]:
          - button "开始时间" [ref=e53] [cursor=pointer]
          - button "＋1日" [ref=e54] [cursor=pointer]
          - combobox "推演速度" [ref=e55] [cursor=pointer]:
            - option "慢速 · 6秒/日"
            - option "常速 · 3秒/日" [selected]
            - option "快进 · 1.5秒/日"
            - option "疾速 · 0.75秒/日"
        - generic [ref=e56] [cursor=pointer]:
          - checkbox "遇交战暂停" [ref=e57]
          - text: 遇交战暂停
        - navigation [ref=e58]:
          - button "政治" [active] [ref=e59] [cursor=pointer]
          - button "军事" [ref=e60] [cursor=pointer]
          - button "海军" [ref=e61] [cursor=pointer]
          - button "战争" [ref=e62] [cursor=pointer]
          - button "大事记" [ref=e63] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect,type Page} from '@playwright/test';
  2  | import type {Dynasty23Run} from '../src/fms/play/dynasty23-model';
  3  | type Box={x:number;y:number;width:number;height:number};
  4  | type Layout={detail:string;countries:Box[];capitals:Box[];towns:{id:string;x:number;y:number}[]};
  5  | async function save(page:Page){await page.getByRole('button',{name:'保存进度',exact:true}).click();await expect(page.locator('.play-notice')).toContainText('已保存');return page.evaluate(()=>new Promise<{run:Dynasty23Run;checksum:string}>(resolve=>{const q=indexedDB.open('lieguoji-fms-dynasty-v23');q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),g=t.objectStore('saves').get('current');g.onsuccess=()=>resolve(g.result);t.oncomplete=()=>d.close();};}));}
  6  | test('drawn diagonal world keeps map labels anchored and the chronicle focused on major events',async({page},info)=>{
  7  |  test.setTimeout(90000);const errors:string[]=[],failed:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));
  8  |  await page.goto('/campaign/cartography?fms=1');await expect(page.getByRole('button',{name:'进入世界 →',exact:true})).toBeEnabled();const draw=page.getByTestId('fms-canvas'),b=(await draw.boundingBox())!,cx=b.x+b.width*.5,cy=b.y+b.height*.45,r=Math.min(b.width,b.height)*.19;
  9  |  const points=[[-1,-.8],[-.6,-1],[1,.5],[.7,1],[-1,-.8]].map(([x,y])=>[cx+x*r,cy+y*r]);await page.mouse.move(points[0][0],points[0][1]);await page.mouse.down();for(const [x,y]of points.slice(1))await page.mouse.move(x,y,{steps:20});await page.mouse.up();
  10 |  await expect.poll(async()=>Number(await page.getByTestId('fms-app').getAttribute('data-land-cells'))).toBeGreaterThan(0);await page.locator('.fms-save').click();await expect(page.getByTestId('fms-app')).toHaveAttribute('data-dirty','false');await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByLabel('战乱开局').uncheck();await page.getByRole('button',{name:'从当前地图开新局',exact:true}).click();await expect(page.getByTestId('fms-play')).toHaveAttribute('data-run-version','23',{timeout:30000});const before=await save(page);
  11 |  const canvas=page.getByTestId('fms-play-canvas'),layout=async()=>JSON.parse(await canvas.getAttribute('data-map-label-layout')??'null') as Layout,anchors=async()=>JSON.parse(await canvas.getAttribute('data-country-labels')??'[]') as {angle:number;x:number;y:number}[];
  12 |  const at=await anchors();expect(at.length).toBeGreaterThanOrEqual(2);expect(at.some(a=>Math.abs(a.angle)>.15)).toBe(true);
> 13 |  await page.getByRole('button',{name:'政治',exact:true}).click();await page.getByRole('button',{name:'收起面板',exact:true}).click();for(let i=0;i<4&&(await layout()).detail==='overview';i++)await page.getByRole('button',{name:'放大推演地图',exact:true}).click();await expect.poll(async()=>(await layout()).detail).not.toBe('overview');
     |                                                                                                                        ^ Error: locator.click: Test timeout of 90000ms exceeded.
  14 |  const a=await layout();await page.screenshot({path:info.outputPath('map-before-pan.png')});const box=(await canvas.boundingBox())!,x=box.x+box.width*.65,y=box.y+box.height*.53;
  15 |  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+42,y+31,{steps:16});await page.mouse.up();await expect.poll(async()=>(await layout()).countries[0].x-a.countries[0].x).toBeCloseTo(42,1);const z=await layout();
  16 |  expect(await anchors()).toEqual(at);for(let i=0;i<a.countries.length;i++){expect(z.countries[i].x-a.countries[i].x).toBeCloseTo(42,1);expect(z.countries[i].y-a.countries[i].y).toBeCloseTo(31,1);expect(z.countries[i].width).toBeCloseTo(a.countries[i].width,5);expect(z.countries[i].height).toBeCloseTo(a.countries[i].height,5);}
  17 |  expect(z.capitals.length).toBe(a.capitals.length);for(let i=0;i<a.capitals.length;i++){expect(z.capitals[i].x-a.capitals[i].x).toBeCloseTo(42,1);expect(z.capitals[i].y-a.capitals[i].y).toBeCloseTo(31,1);}
  18 |  let common=0;for(const t of a.towns){const next=z.towns.find(n=>n.id===t.id);if(next){common++;expect(next.x-t.x).toBeCloseTo(42,1);expect(next.y-t.y).toBeCloseTo(31,1);}}expect(common).toBeGreaterThan(0);await page.screenshot({path:info.outputPath('map-after-pan.png')});
  19 |  // Produce a real major event through the production preview/confirm path.
  20 |  await page.getByRole('button',{name:'政治',exact:true}).click();await page.getByRole('button',{name:'预览传位',exact:true}).click();await page.getByRole('dialog',{name:'命令确认'}).getByRole('button',{name:'确认执行',exact:true}).click();const after=await save(page);expect(after.run.chronicle.entries.some(e=>e.kind==='accession')).toBe(true);
  21 |  await page.getByRole('button',{name:'大事记',exact:true}).click();await expect(page.getByLabel('史书类别',{exact:true})).toHaveValue('important');await expect(page.locator('.play-chronicle')).toContainText('君主传位');await expect(page.locator('.play-recent-reports')).not.toHaveAttribute('open','');await page.screenshot({path:info.outputPath('important-history.png')});
  22 |  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续家族继承新版第 '+after.run.world.day+' 日',exact:true}).click();const loaded=await save(page);expect(loaded).toEqual(after);expect(loaded.run.engine).toBe(before.run.engine);expect(await anchors()).toEqual(at);expect(errors).toEqual([]);expect(failed).toEqual([]);
  23 |  await info.attach('cartography-evidence',{body:JSON.stringify({anchors:at,pan:{dx:42,dy:31,commonCityNames:common},before:a,after:z,engine:loaded.run.engine,checksum:loaded.checksum,scope:'Normal UI drawing, real Worker succession/save/reload; Chromium emulation, no native iPhone or original visual acceptance.'}),contentType:'application/json'});
  24 | });
  25 | 
```