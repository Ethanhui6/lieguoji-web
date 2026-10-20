import {expect,test} from '@playwright/test';

test('paper and blue-sea appearances change rendering without changing a generated map or its save',async({page},info)=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?fms=1');
 const app=page.getByTestId('fms-app'),canvas=page.getByTestId('fms-canvas'),appearance=page.getByLabel('地图外观',{exact:true});
 await expect(canvas).toHaveAttribute('data-ocean-appearance','paper');
 await page.getByLabel('整图种子',{exact:true}).fill('421730');
 await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
 await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'保存地图',exact:true}).click();await expect(app).toHaveAttribute('data-dirty','false');
 const revision=await app.getAttribute('data-revision'),land=await app.getAttribute('data-land-cells');
 await page.screenshot({path:info.outputPath('paper-editor.png'),fullPage:true});
 await appearance.selectOption('source');await expect(canvas).toHaveAttribute('data-ocean-appearance','source');
 await expect(app).toHaveAttribute('data-revision',revision!);await expect(app).toHaveAttribute('data-land-cells',land!);await expect(app).toHaveAttribute('data-dirty','false');
 await page.screenshot({path:info.outputPath('blue-editor.png'),fullPage:true});
 await appearance.selectOption('paper');
 const box=(await page.locator('.fms-toolbar').boundingBox())!,viewport=page.viewportSize()!;
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(app).toHaveAttribute('data-land-cells','0');
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(app).toHaveAttribute('data-land-cells',land!);
 await page.reload();await expect(app).toHaveAttribute('data-land-cells',land!);await expect(app).toHaveAttribute('data-dirty','false');
 await expect(canvas).toHaveAttribute('data-ocean-appearance','paper');expect(errors).toEqual([]);
});
