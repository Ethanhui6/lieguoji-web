import {expect,test} from '@playwright/test';

test('map generation panel closes, reopens and previews the selected density without committing',async({page},info)=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');
 const panel=page.getByRole('region',{name:'生成地图设置'}),app=page.getByTestId('fms-app');
 await expect(panel).toBeVisible();await expect(app).toHaveAttribute('data-land-cells','0');
 await panel.getByRole('radio',{name:'3 万格'}).check();
 await panel.getByLabel('整图种子',{exact:true}).fill('bad');
 await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.getByRole('button',{name:'预览整张地图'})).toBeDisabled();
 await panel.getByLabel('整图种子',{exact:true}).fill('421730');
 await panel.getByLabel('整图版图').selectOption('pangea');
 await panel.getByRole('button',{name:'关闭生成地图'}).click();await expect(panel).toHaveCount(0);
 await page.getByRole('button',{name:'生成地图',exact:true}).click();
 await expect(panel.getByRole('radio',{name:'3 万格'})).toBeChecked();
 const box=await panel.boundingBox(),view=page.viewportSize()!;expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(view.width);expect(box!.y+box!.height).toBeLessThan(view.height);
 await page.screenshot({path:info.outputPath('generation-panel.png'),fullPage:true});
 const revision=await app.getAttribute('data-revision');
 await panel.getByRole('button',{name:'预览整张地图'}).click();
 const preview=page.getByRole('region',{name:'整图地形预览'});
 await expect(preview.getByRole('button',{name:'确认整图'})).toBeVisible({timeout:120000});
 await page.screenshot({path:info.outputPath('generation-preview.png'),fullPage:true});
 await preview.getByRole('button',{name:'取消',exact:true}).click();
 await expect(app).toHaveAttribute('data-land-cells','0');await expect(app).toHaveAttribute('data-revision',revision!);
 await expect(panel.getByRole('radio',{name:'3 万格'})).toBeChecked();
 expect(errors).toEqual([]);
});
