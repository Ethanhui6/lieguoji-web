import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';
test('map names stay anchored while selecting provinces and panning',async({page},info)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);
 await page.evaluate(()=>history.replaceState(null,'',location.pathname+'?fms=1&fmsDiagnostics=1'));
 await create(page);
 const map=page.getByTestId('culture47-map');
 if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
 await expect(map).toHaveAttribute('data-map-label-layout',/countries/);
 const read=()=>map.evaluate(el=>({layout:JSON.parse(el.getAttribute('data-map-label-layout')!),cities:JSON.parse(el.getAttribute('data-cities')!),projection:JSON.parse(el.getAttribute('data-projection')!)}));
 const bounds=(await map.boundingBox())!;
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,-450);
 await expect.poll(async()=> (await read()).projection.zoom).toBeGreaterThan(1);
 const before=await read();
 await page.screenshot({path:info.outputPath('map-before-selection.png')});
 const city=before.cities.find((c:{x:number;y:number})=>c.x>bounds.width*.1&&c.x<bounds.width*.85&&c.y>bounds.height*.25&&c.y<bounds.height*.8);
 expect(city).toBeTruthy();
 await page.keyboard.down('Shift');await page.mouse.click(bounds.x+city.x,bounds.y+city.y);await page.keyboard.up('Shift');
 await expect(page.getByRole('button',{name:'收起详情',exact:true})).toBeVisible();
 const selected=await read();expect(selected.layout).toEqual(before.layout);
 await page.screenshot({path:info.outputPath('map-selected.png')});
 await page.getByRole('button',{name:'收起详情',exact:true}).click();
 await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.5+35,bounds.y+bounds.height*.5+25,{steps:10});await page.mouse.up();
 await expect.poll(async()=> (await read()).projection.x).not.toBe(before.projection.x);
 const moved=await read(),dx=moved.projection.x-before.projection.x,dy=moved.projection.y-before.projection.y;
 for(let i=0;i<before.layout.countries.length;i++){
  expect(moved.layout.countries[i].x-before.layout.countries[i].x).toBeCloseTo(dx,4);
  expect(moved.layout.countries[i].y-before.layout.countries[i].y).toBeCloseTo(dy,4);
  expect(moved.layout.countries[i].width).toBeCloseTo(before.layout.countries[i].width,4);
 }
 for(const town of before.layout.towns){const after=moved.layout.towns.find((t:{id:string})=>t.id===town.id);if(after){expect(after.x-town.x).toBeCloseTo(dx,4);expect(after.y-town.y).toBeCloseTo(dy,4);}}
 await page.screenshot({path:info.outputPath('map-after-pan.png')});expect(errors).toEqual([]);
});

test('generated original-grid map shows label hierarchy at overview and close zoom',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1&fmsDiagnostics=1');
 await page.getByLabel('整图种子',{exact:true}).fill('421730');
 await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
 const map=page.getByTestId('culture47-map');
 await expect(map).toHaveAttribute('data-map-label-layout',/countries/);
 await page.screenshot({path:info.outputPath('original-overview.png')});
 const box=(await map.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-550);
 await expect.poll(async()=>JSON.parse(await map.getAttribute('data-map-label-layout')??'{}').towns?.length??0).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('original-close.png')});expect(errors).toEqual([]);
});
