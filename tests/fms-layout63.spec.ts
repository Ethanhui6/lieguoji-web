import {expect,test,type Page} from '@playwright/test';

const layout=async(page:Page)=>JSON.parse((await page.getByTestId('c47-layout-map').getAttribute('data-layout'))!) as {nations:number;sizes:number[];seeds:number[];regions:number};
async function tapRegion(page:Page,predicate:(info:{sizes:number[]})=>boolean){
  // Scan a coarse grid of taps until the layout changes as the predicate expects.
  const map=page.getByTestId('c47-layout-map'),box=(await map.boundingBox())!;
  for(let y=.15;y<.9;y+=.07)for(let x=.1;x<.9;x+=.05){await map.click({position:{x:box.width*x,y:box.height*y}});if(predicate(await layout(page)))return;}
  throw Error('no region changed');
}

test('original-style country editor: draw, place, capital and remove before the world is created',async({page},info)=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fms=1');
  await page.getByLabel('整图种子',{exact:true}).fill('421730');await page.getByRole('button',{name:'预览整张地图',exact:true}).click();
  await page.getByRole('button',{name:'确认整图',exact:true}).click({timeout:90000});
  await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
  await page.getByText('编辑国家与领土').click();
  await expect(page.getByTestId('c47-layout-map')).toBeVisible({timeout:60000});
  const start=await layout(page);expect(start.nations).toBe(6);expect(start.regions).toBe(60);
  // Draw: paint other provinces into country 1.
  await tapRegion(page,l=>l.sizes[0]>start.sizes[0]+1);
  const drawn=await layout(page);expect(drawn.sizes.reduce((a,b)=>a+b,0)).toBe(60);
  await expect(page.getByText('编辑国家与领土 · 已自定义')).toBeVisible();
  // Place: found a seventh country.
  await page.getByRole('button',{name:'放置国家',exact:true}).click();
  await tapRegion(page,l=>l.sizes.length===7);
  expect((await layout(page)).nations).toBe(7);await expect(page.getByLabel('国家数量')).toHaveValue('7');
  // Remove country 3; its provinces return to neighbours.
  await page.getByRole('group',{name:'选择要编辑的国家'}).getByRole('button').nth(2).click();
  await page.getByRole('button',{name:'删除国家 3',exact:true}).click();
  const final=await layout(page);expect(final.nations).toBe(6);expect(final.sizes.every(n=>n>0)).toBe(true);
  await page.screenshot({path:info.outputPath('layout-editor.png'),fullPage:true});
  await page.getByRole('button',{name:'从当前地图创建文化世界',exact:true}).click();
  await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});
  // The created world uses the edited territory: country 1 holds exactly its painted provinces.
  await page.locator('.c47-nations button').first().click();
  await expect(page.getByRole('complementary',{name:'文化与国家详情'})).toContainText(`实控地区${final.sizes[0]}${final.sizes[0]} 座城市`);
  await expect(page.locator('.c47-nations button')).toHaveCount(6);
  await page.screenshot({path:info.outputPath('created-world.png')});
  expect(errors).toEqual([]);
  await info.attach('layouts',{body:JSON.stringify({start,drawn,final}),contentType:'application/json'});
});
