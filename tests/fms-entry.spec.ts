import {test,expect} from '@playwright/test';

test('FMS: terrain confirmation stays clickable before saving and entering a new world',async({page},info)=>{
  test.setTimeout(90000);
  const errors:string[]=[],failed:string[]=[],workers:string[]=[],resources:{url:string;status:number;mime:string}[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failed.push(r.url()));
  page.on('worker',w=>workers.push(w.url()));
  page.on('response',r=>{if(/\/assets\//.test(r.url()))resources.push({url:r.url(),status:r.status(),mime:r.headers()['content-type']??''});});
  const response=await page.goto('/campaign/test?fms=1');expect(response?.status()).toBe(200);
  const entry=page.getByRole('button',{name:'进入世界 →',exact:true});await expect(entry).toBeEnabled();
  const b=(await page.getByTestId('fms-canvas').boundingBox())!,cx=b.x+b.width*.5,cy=b.y+b.height*.49,rx=b.width*.3,ry=Math.min(b.height*.22,b.width*.26);
  await page.mouse.move(cx-rx,cy-ry);await page.mouse.down();
  for(const[x,y]of[[cx+rx,cy-ry],[cx+rx,cy+ry],[cx-rx,cy+ry],[cx-rx,cy-ry]])await page.mouse.move(x,y,{steps:12});
  await page.mouse.up();await expect.poll(async()=>Number(await page.getByTestId('fms-app').getAttribute('data-land-cells'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'绘图设置',exact:true}).click();await expect(entry).toBeHidden();
  await page.getByRole('button',{name:'预览保形自然化',exact:true}).click();
  await expect(page.getByRole('button',{name:'确认地形',exact:true})).toBeVisible({timeout:30000});await expect(entry).toBeHidden();
  await page.screenshot({path:info.outputPath('terrain-confirmation-unobstructed.png')});
  // A real pointer click detects overlays; never force the confirmation.
  await page.getByRole('button',{name:'确认地形',exact:true}).click();await expect(entry).toBeVisible();
  await page.locator('.fms-save').click();await expect(page.getByTestId('fms-app')).toHaveAttribute('data-dirty','false');
  await page.reload();await expect(entry).toBeEnabled();await expect.poll(async()=>Number(await page.getByTestId('fms-app').getAttribute('data-land-cells'))).toBeGreaterThan(0);
  await entry.click();await page.getByLabel('国家数量',{exact:true}).selectOption('2');await page.getByRole('button',{name:'从当前地图开新局',exact:true}).click();
  await expect(page.getByTestId('fms-play')).toHaveAttribute('data-run-version','15',{timeout:30000});
  await page.getByRole('button',{name:'军事',exact:true}).click();await expect(page.getByRole('region',{name:'布兵与动员'})).toBeVisible();
  await info.attach('fms-entry-resources',{body:JSON.stringify({workers,resources,errors,failed,scope:'Chromium emulation; physical device and original visual acceptance pending'}),contentType:'application/json'});
  expect(workers.some(u=>/terrain\.worker/.test(u))).toBe(true);expect(workers.some(u=>/play\.worker/.test(u))).toBe(true);
  expect(errors).toEqual([]);expect(failed).toEqual([]);
  const fetched=new Map<string,string>();
  for(const resource of resources){
    if(resource.status===200)fetched.set(resource.url,resource.mime);
    else {
      // HTTPS reload may revalidate a cached asset. Require its earlier real
      // 200 response; never accept a cache miss, redirect, or failed resource.
      expect(resource.status,resource.url).toBe(304);
      expect(fetched.has(resource.url),`No prior 200 for cached ${resource.url}`).toBe(true);
    }
    const mime=resource.mime||fetched.get(resource.url)||'';
    if(/\.js$/.test(resource.url))expect(mime,resource.url).toMatch(/javascript/i);
    if(/\.css$/.test(resource.url))expect(mime,resource.url).toMatch(/text\/css/i);
  }
});
