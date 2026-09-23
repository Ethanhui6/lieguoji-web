import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { World } from '../src/sim/types';

const legacyPath=resolve('tests/fixtures/legacy-custom-0.1.json');
const fixture=JSON.parse(readFileSync(legacyPath,'utf8')) as {world:World};

async function drawer(page:Page,name:string){
 await expect(page.locator('.game-layout')).toBeVisible();
 const nav=page.getByRole('navigation',{name:'游戏工具'});
 if(await nav.isVisible())await nav.getByRole('button',{name,exact:true}).click();
 else if(name==='国家')await page.getByRole('button',{name,exact:true}).filter({visible:true}).click();
}
async function slots(page:Page,run:string):Promise<{bytes:string;world:World}>{
 return page.evaluate(id=>new Promise((resolve,reject)=>{
  const request=indexedDB.open(`lieguoji-custom-${id}-v1`,1);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('saves','readonly'),store=tx.objectStore('saves');
   const current=store.get('current'),backup=store.get('backup'),revision=store.get('revision');
   tx.oncomplete=()=>{db.close();resolve({bytes:JSON.stringify({current:current.result,backup:backup.result,revision:revision.result}),world:current.result.world});};
   tx.onerror=()=>{db.close();reject(tx.error);};
  };request.onerror=()=>reject(request.error);
 }),run);
}

test('真实旧规则自建档创建经营副本，原历史和在途军令完整保留',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByTestId('studio-canvas')).toBeVisible();
 await page.getByLabel('选择世界草稿文件').setInputFiles(legacyPath);
 await page.getByRole('alertdialog').getByRole('button',{name:'确认执行'}).click();
 await expect(page.getByRole('button',{name:'推进一日'})).toBeEnabled();
 await expect(page.getByTestId('day-number')).toHaveText('7');
 const oldUrl=page.url(),oldId=new URL(oldUrl).searchParams.get('world')!;
 const original=await slots(page,oldId);
 expect(original.world.schemaVersion).toBe(1);expect(original.world.rulesVersion).toBe('0.1.0');
 expect(original.world.armies).toEqual(fixture.world.armies);expect(original.world.events).toEqual(fixture.world.events);
 expect(original.world.armies.some(army=>army.status==='marching')).toBeTruthy();
 await drawer(page,'国家');
 await page.getByRole('button',{name:'创建经营推演副本',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
 expect(page.url()).toBe(oldUrl);expect((await slots(page,oldId)).bytes).toBe(original.bytes);
 await page.getByRole('button',{name:'创建经营推演副本',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'确认创建副本',exact:true}).click();
 await expect(page).not.toHaveURL(oldUrl);
 await expect(page.getByRole('button',{name:'推进一日'})).toBeEnabled();
 await expect(page.getByTestId('day-number')).toHaveText('7');
 const newId=new URL(page.url()).searchParams.get('world')!;
 expect(newId).not.toBe(oldId);
 const upgraded=await slots(page,newId);
 expect(upgraded.world.schemaVersion).toBe(2);expect(upgraded.world.rulesVersion).toBe('0.2.0');
 expect(upgraded.world.custom?.id).toBe(newId);
 expect(upgraded.world.provinces).toEqual(original.world.provinces);
 expect(upgraded.world.cities).toEqual(original.world.cities);
 expect(upgraded.world.nations).toEqual(original.world.nations);
 expect(upgraded.world.armies).toEqual(original.world.armies);
 expect(upgraded.world.events.slice(0,original.world.events.length)).toEqual(original.world.events);
 expect(upgraded.world.statecraft?.relations.length).toBe(3);
 expect(upgraded.world.statecraft?.relations.every(relation=>relation.status==='war')).toBeTruthy();
 expect((await slots(page,oldId)).bytes).toBe(original.bytes);
 await page.getByRole('button',{name:'推进一日'}).click();await expect(page.getByTestId('day-number')).toHaveText('8');
 await drawer(page,'存档');await page.getByRole('button',{name:'保存',exact:true}).filter({visible:true}).click();
 await expect(page.getByText(/已保存 · 第/).filter({visible:true})).toBeVisible();
 const saved=await slots(page,newId);expect(saved.world.statecraft?.nations.every(n=>n.lastLedger?.day===8)).toBeTruthy();
 await page.reload();await expect(page.getByTestId('day-number')).toHaveText('8');await drawer(page,'国家');
 await expect(page.getByTestId('government-panel')).toBeVisible();
 await expect(page.getByRole('button',{name:'创建经营推演副本',exact:true})).toHaveCount(0);
 expect((await slots(page,newId)).bytes).toBe(saved.bytes);expect((await slots(page,oldId)).bytes).toBe(original.bytes);
 await page.screenshot({path:info.outputPath('legacy-world-safe-copy.png'),fullPage:true});
 await page.goto(oldUrl);await expect(page.getByTestId('day-number')).toHaveText('7');await drawer(page,'国家');
 await expect(page.getByRole('button',{name:'创建经营推演副本',exact:true})).toBeVisible();
 expect((await slots(page,oldId)).bytes).toBe(original.bytes);expect(errors).toEqual([]);
});
