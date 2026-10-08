import {expect,type Page} from '@playwright/test';
/** Compact mobile controls must be opened through the same public UI as play. */
export async function ensureLegacyMapTools(page:Page){
 const zoom=page.getByRole('button',{name:'放大推演地图',exact:true});
 if(!await zoom.isVisible())await page.getByRole('button',{name:'地图工具',exact:true}).click();
 await expect(zoom).toBeVisible();
}
/** Exercise the real frozen-rule entrance, including after a browser reload. */
export async function enterLegacyWorld(page:Page,version:number){
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();
 await page.getByRole('button',{name:'继续旧世界 / 原版本功能',exact:true}).click();
 await page.getByText('旧规则兼容',{exact:true}).click();
 const selector=page.getByLabel('创建规则版本',{exact:true});
 await selector.selectOption(String(version));await expect(selector).toHaveValue(String(version));
}
/** Follow the compact inspector's public navigation rather than reaching into
 * panels that used to be mounted together in the old long inspector. */
export async function legacyNationTab(page:Page,name:'概览'|'地方'|'宫廷'|'外交'){
 if(!await page.getByLabel('查看国家',{exact:true}).isVisible())await page.getByRole('button',{name:'政治',exact:true}).click();
 const tab=page.getByRole('tab',{name,exact:true});
 if(await tab.getAttribute('aria-selected')!=='true')await tab.click();
 await expect(tab).toHaveAttribute('aria-selected','true');
}
export async function selectLegacyNation(page:Page,id:string){
 await legacyNationTab(page,'概览');await page.getByLabel('查看国家',{exact:true}).selectOption(id);
 await expect(page.getByLabel('查看国家',{exact:true})).toHaveValue(id);
}
export async function expandLegacyGroup(page:Page,name:string){
 const summary=page.locator('.play-inspector-group > summary').filter({hasText:name});
 await expect(summary).toHaveCount(1);
 if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();
 await expect(summary.locator('..')).toHaveAttribute('open','');
}
export async function closeLegacyPanel(page:Page){
 const close=page.getByRole('button',{name:'收起面板',exact:true});
 if(await close.isVisible())await close.click();
 await expect(page.getByRole('complementary',{name:'世界详情',exact:true})).toBeHidden();
 await expect(page.locator('.fms-play-map canvas')).toBeVisible();
}
export async function saveLegacyProgress(page:Page,database:string){
 const revision=()=>page.evaluate(name=>new Promise<number>((resolve,reject)=>{
  const q=indexedDB.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{
   const db=q.result;if(!db.objectStoreNames.contains('saves')){db.close();resolve(0);return;}
   const tx=db.transaction('saves'),get=tx.objectStore('saves').get('current');
   get.onsuccess=()=>resolve(get.result?.revision??0);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();
  };
 }),database);
 const before=await revision();await page.getByRole('button',{name:'保存进度',exact:true}).click();
 // Old success text may remain while the in-flight tick settles. Wait for the
 // actual new committed record, never accept the previous save's toast.
 await expect.poll(revision).toBe(before+1);
 await expect(page.locator('.play-notice')).toContainText('已保存');
}
