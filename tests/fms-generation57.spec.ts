import {expect,test} from '@playwright/test';

test('a new blank editor saves the original rectangular grid and restores it unchanged',async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?fms=1');
  const app=page.getByTestId('fms-app');
  await expect(page.getByRole('region',{name:'生成地图设置'})).toBeVisible();
  await expect(app).toHaveAttribute('data-land-cells','0');
  await page.getByRole('button',{name:'保存地图',exact:true}).click();
  await expect(app).toHaveAttribute('data-dirty','false');
  const saved=()=>page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('lieguoji-fms-web-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const value=await new Promise<{checksum:string;document:{width:number;height:number;points:unknown[];worldId:string}}>((resolve,reject)=>{const r=db.transaction('saves').objectStore('saves').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
    return {checksum:value.checksum,width:value.document.width,height:value.document.height,points:value.document.points.length,worldId:value.document.worldId};
  });
  const before=await saved();expect(before).toMatchObject({width:1600,height:900,points:19928});
  await page.reload();
  await expect(app).toHaveAttribute('data-dirty','false');
  await expect(page.getByRole('region',{name:'生成地图设置'})).toHaveCSS('opacity','1');
  expect(await saved()).toEqual(before);
  await page.screenshot({path:info.outputPath('original-blank.png'),fullPage:true});
  await page.getByRole('button',{name:'关闭生成地图'}).click();
  const box=(await page.getByTestId('fms-canvas').boundingBox())!;
  const cx=box.x+box.width*.5,cy=box.y+box.height*.5,r=Math.min(box.width*.16,box.height*.12);
  await page.mouse.move(cx-r,cy-r);await page.mouse.down();
  for(const [x,y] of [[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r],[cx-r,cy-r]])await page.mouse.move(x,y,{steps:12});
  await page.mouse.up();
  await expect.poll(async()=>Number(await app.getAttribute('data-land-cells'))).toBeGreaterThan(0);
  const land=await app.getAttribute('data-land-cells');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(app).toHaveAttribute('data-land-cells','0');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(app).toHaveAttribute('data-land-cells',land!);
  await page.getByRole('button',{name:'保存地图',exact:true}).click();await expect(app).toHaveAttribute('data-dirty','false');
  const drawn=await saved();expect(drawn.worldId).toBe(before.worldId);expect(drawn.checksum).not.toBe(before.checksum);
  await page.reload();await expect(app).toHaveAttribute('data-land-cells',land!);expect(await saved()).toEqual(drawn);
  await page.screenshot({path:info.outputPath('original-drawn.png'),fullPage:true});
  expect(errors).toEqual([]);
});
