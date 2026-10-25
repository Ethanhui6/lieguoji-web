import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

test('original cell boundaries stay attached across colour views and zoom',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1&fmsDiagnostics=1');
 await page.getByLabel('整图种子',{exact:true}).fill('421730');
 await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await create(page);
 const map=page.getByTestId('culture47-map');
 await expect(map).toHaveAttribute('data-state-lines',/rendered-voronoi-edges/);
 const read=()=>map.evaluate(el=>JSON.parse(el.getAttribute('data-state-lines')!));
 const initial=await read();expect(initial.lines).toBeGreaterThan(0);expect(initial.provinceEdges).toBeGreaterThan(100);
 const relief=await map.evaluate(el=>JSON.parse(el.getAttribute('data-relief')!));expect(relief.mountains+relief.forests).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('integrated-state-overview.png')});
 const box=(await map.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-300);
 for(const [key,view]of [['3','culture'],['5','religion'],['4','family'],['2','alliance'],['1','state']]){
  await page.keyboard.press(key);await expect(map).toHaveAttribute('data-color-view',view);
  expect((await read()).geometry).toBe('rendered-voronoi-edges');
  expect((await read()).provinceEdges).toBe(initial.provinceEdges);
  await page.screenshot({path:info.outputPath(`integrated-${view}-close.png`)});
 }
 expect((await read()).lines).toBe(initial.lines);
 await page.getByRole('button',{name:'地图样式',exact:true}).click();
 await page.getByRole('button',{name:'地形',exact:true}).click();
 await expect(map).toHaveAttribute('data-original-land','biome');
 expect((await read()).geometry).toBe('rendered-voronoi-edges');
 expect((await read()).lines).toBe(initial.lines);
 await page.getByRole('button',{name:'政区',exact:true}).click();
 await page.getByRole('button',{name:'地图样式',exact:true}).click();
 expect(errors).toEqual([]);
});
