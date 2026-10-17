import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('recovered B-spline coastline ink follows the played terrain without changing picking or saves',async({page},info)=>{
 test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?fms=1');
 await page.getByRole('button',{name:'生成大陆',exact:true}).click();
 await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});
 const segments=Number(await page.getByTestId('fms-canvas').getAttribute('data-ocean-segments'));
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await create(page);
 const app=page.getByTestId('culture47-app'),canvas=page.getByTestId('culture47-map');
 const coast=JSON.parse(await canvas.getAttribute('data-coastline')??'null');
 expect(coast).toMatchObject({algorithm:'recovered-curve-basis-4-v1',sourceSegments:segments,color:0x5f5f5f});
 expect(coast.width).toBeCloseTo(.25/(240/1600),6);
 expect(coast.chains).toBeGreaterThan(0);
 // Four samples per contour span, minus shared joints and 0.001 duplicates.
 expect(coast.points).toBeGreaterThan(segments*2);expect(coast.points).toBeLessThanOrEqual(segments*4+coast.chains*2);
 const tick=await app.getAttribute('data-tick');
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:40000});
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click({timeout:40000});
 await expect(app).toHaveAttribute('data-tick',tick!,{timeout:40000});
 expect(JSON.parse(await canvas.getAttribute('data-coastline')??'null')).toEqual(coast);
 await canvas.screenshot({path:info.outputPath('coastline-canvas.png')});
 expect(errors).toEqual([]);
});
