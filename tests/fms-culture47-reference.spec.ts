import {test,expect} from '@playwright/test';
import {enter,create} from './fms-culture47-fixture';

test('native screenshot reference: real national accounts, retained family and dated focused chronicle',async({page},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);await create(page,60);
 const nations=page.locator('.c47-nations button');await nations.first().click();
 const details=page.getByRole('complementary',{name:'文化与国家详情'}),overview=page.getByRole('region',{name:'国家实况'});
 await expect(overview).toBeVisible();await expect(overview).toContainText('本国控制');expect(Number(await overview.getAttribute('data-population'))).toBeGreaterThan(0);expect(Number(await overview.getAttribute('data-regions'))).toBeGreaterThan(0);
 const news=page.getByRole('button',{name:'顶部重要事件'});if(await news.isVisible()){const a=(await news.boundingBox())!,b=(await details.boundingBox())!;expect(Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))).toBe(0);}
 await expect(overview).toContainText('军团');await expect(overview).toContainText('舰队');await page.screenshot({path:info.outputPath('native-reference-nation.png')});
 const family=details.locator('details').filter({has:page.locator('.c47-family')});await family.locator('summary').first().click();await expect(family.locator('.c47-family-summary')).toContainText('族长');expect(await family.locator('li').count()).toBeGreaterThan(1);await family.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('native-reference-family.png')});
 await page.getByRole('button',{name:'暂停并预览宣战',exact:true}).click();await page.getByRole('button',{name:'确认宣战',exact:true}).click();await expect(page.getByRole('button',{name:'顶部重要事件'})).toContainText('宣战',{timeout:12000});await page.getByRole('button',{name:'顶部重要事件'}).click();
 const history=page.getByRole('region',{name:'文化世界史书'}),focused=history.locator('[data-focused=true]');await expect(focused).toHaveCount(1);await expect(focused).toContainText('宣战');await expect(focused.locator('details')).toHaveAttribute('open','');await expect(focused.locator('time')).toHaveAttribute('datetime',/^0001-01-01$/);await expect(focused.locator('[aria-label="相关国家（现名）"] button')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'收起详情',exact:true})).toBeInViewport();
 await page.screenshot({path:info.outputPath('native-reference-chronicle.png')});
 await page.getByRole('button',{name:'收起详情',exact:true}).click();await expect(history).not.toBeVisible();await page.getByRole('button',{name:'顶部重要事件'}).click();await expect(focused).toContainText('宣战');
 const text=await focused.locator('article > p').innerText();await focused.getByRole('button').first().click();await expect(details).toBeVisible();const naming=details.getByRole('group',{name:'自定义命名'});await naming.locator('summary').first().click();await naming.getByLabel('国家名',{exact:true}).fill('临时新国名');await naming.getByLabel('全名模板',{exact:true}).fill('{Name}');await naming.getByRole('button',{name:'启用自定义命名',exact:true}).click();await expect(details.locator('h2')).toHaveText('临时新国名');
 await page.getByRole('button',{name:'查看大事记'}).click();await expect(history).toContainText(text);await expect(history.getByRole('button',{name:'临时新国名',exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'保存文化世界'}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:90000});await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(page.getByTestId('culture47-map')).toBeVisible({timeout:90000});await page.getByRole('button',{name:'查看大事记'}).click();await expect(page.locator('.c47-history')).toContainText(text);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.use.viewport!.width);
 await info.attach('reference-scope',{body:JSON.stringify({reference:'10 user-attached desktop screenshots, 2026-10-09',observed:'national accounts, family list, dated important history with country colors',syntheticFixture:true,physicalIphone:false,originalAnimationEquivalence:false,errors}),contentType:'application/json'});
});
