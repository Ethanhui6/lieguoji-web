import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {create} from './fms-culture47-fixture';

const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {PNG:{sync:{read:(bytes:Buffer)=>{width:number;height:number;data:Buffer}}}};

test('paper sea belongs to the playable world while editor geometry and save remain unchanged',async({page},info)=>{
 test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/?fms=1');
 await page.getByRole('button',{name:'生成大陆',exact:true}).click();
 await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});
 const editor=page.getByTestId('fms-canvas');
 await expect(editor).toHaveAttribute('data-ocean-appearance','source');
 const originalOcean=await editor.evaluate(el=>({algorithm:(el as HTMLCanvasElement).dataset.oceanAlgorithm,segments:(el as HTMLCanvasElement).dataset.oceanSegments,landArea:(el as HTMLCanvasElement).dataset.landArea}));
 await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await create(page);
 const app=page.getByTestId('culture47-app'),canvas=page.getByTestId('culture47-map');
 await expect(canvas).toHaveAttribute('data-ocean-appearance','paper');
 const playedOcean=await canvas.evaluate(el=>({algorithm:(el as HTMLCanvasElement).dataset.oceanAlgorithm,segments:(el as HTMLCanvasElement).dataset.oceanSegments,landArea:(el as HTMLCanvasElement).dataset.landArea}));
 expect(playedOcean).toEqual(originalOcean);
 const screenshot=await canvas.screenshot({path:info.outputPath('paper-ocean-canvas.png')}),png=PNG.sync.read(screenshot);
 const x=Math.round(png.width*.03),y=Math.round(png.height*.58),index=(y*png.width+x)*4,sea=[...png.data.subarray(index,index+3)];
 // The upper-left corner is covered by the HTML toolbar. This side channel at
 // 58% canvas height is open ocean in both fixed desktop and portrait viewports.
 // Its red-over-blue paper color distinguishes the playable preset from source blue.
 expect(png.width).toBeGreaterThan(300);expect(png.height).toBeGreaterThan(300);
 expect(sea[0]).toBeGreaterThan(sea[2]+25);
 const tick=await app.getAttribute('data-tick');
 await page.getByRole('button',{name:'保存文化世界',exact:true}).click();
 await expect(page.locator('.c47-notice')).toContainText('已保存');
 await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByRole('button',{name:'继续文化世界',exact:true}).click();
 await expect(app).toHaveAttribute('data-tick',tick!);
 await expect(canvas).toHaveAttribute('data-ocean-appearance','paper');
 expect(errors).toEqual([]);
 await info.attach('paper-ocean',{body:JSON.stringify({originalOcean,playedOcean,seaPixel:sea,tick,errors,physicalIphone:false,originalVisualAccepted:false}),contentType:'application/json'});
});
