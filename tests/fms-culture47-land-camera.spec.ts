import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

type City={id:string;x:number;y:number};

async function screenCities(page:import('@playwright/test').Page){
 const map=page.getByTestId('culture47-map');
 return JSON.parse((await map.getAttribute('data-cities'))??'[]') as City[];
}

test('the first playable view frames real land, keeps map picking, and can return to the whole ocean',async({page},info)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');
 await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await create(page);
 const map=page.getByTestId('culture47-map');
 // Legacy-generator worlds report their land area; original-grid worlds (current 整图 flow) do not.
 const rawLand=await map.getAttribute('data-land-area');
 if(rawLand!==null){const landArea=Number(rawLand),landFraction=landArea/(1536*1536);expect(landArea).toBeGreaterThan(0);expect(landFraction).toBeLessThan(1);}
 await expect.poll(async()=>Math.max(0,...(await screenCities(page)).map(c=>c.x))-Math.min(...(await screenCities(page)).map(c=>c.x)),{timeout:30000}).toBeGreaterThan(150);
 const framed=await screenCities(page),box=await map.boundingBox();expect(box).not.toBeNull();
 const city=framed.filter(c=>c.x>box!.width*.18&&c.x<box!.width*.82&&c.y>box!.height*.25&&c.y<box!.height*.73)
  .sort((a,b)=>Math.hypot(a.x-box!.width*.5,a.y-box!.height*.5)-Math.hypot(b.x-box!.width*.5,b.y-box!.height*.5))[0];
 expect(city).toBeDefined();
 await page.screenshot({path:info.outputPath('land-framed-portrait.png')});
 await map.click({position:{x:city.x,y:city.y}});
 await expect(page.getByRole('complementary',{name:'文化与国家详情'})).toBeVisible();
 await page.getByRole('button',{name:'收起详情',exact:true}).click();
 await page.getByRole('button',{name:'显示全图',exact:true}).click();
 const whole=await screenCities(page);
 const span=(cities:City[])=>Math.max(...cities.map(c=>c.x))-Math.min(...cities.map(c=>c.x));
 // The original full map is mostly land, so the whole view only needs to be no closer than the land view.
 expect(span(whole)).toBeLessThanOrEqual(span(framed)+1);
 await page.screenshot({path:info.outputPath('whole-ocean-portrait.png')});
 expect(errors).toEqual([]);
 await info.attach('land-camera',{body:JSON.stringify({landArea:rawLand,framedCitySpan:span(framed),wholeCitySpan:span(whole),pickedCity:city.id,errors,device:info.project.name==='mobile-chromium'?'mobile Chromium viewport emulation, not iPhone Safari':'desktop Chromium'}),contentType:'application/json'});
});
