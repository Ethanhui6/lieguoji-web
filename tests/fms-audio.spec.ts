import {test,expect,type Page} from '@playwright/test';
import {create,enter} from './fms-culture47-fixture';

type AudioState={context:string|null;started:boolean;track:string|null;playing:boolean;settings:{music:number;sfx:number}};
const audio=(page:Page)=>page.evaluate(()=>(window as unknown as {__audio47:{state():AudioState}}).__audio47.state());

test('original music starts on the first tap and the menu volume controls it',async({page},info)=>{
  test.setTimeout(120000);
  await enter(page);await create(page);
  if(await page.getByRole('button',{name:'暂停时间',exact:true}).isVisible())await page.getByRole('button',{name:'暂停时间',exact:true}).click();
  await expect.poll(async()=>(await audio(page)).started).toBe(true);
  // RandomMusicPlayer.firstTrackToPlay.
  expect((await audio(page)).track).toMatch(/^land-of-heroes-/);
  await page.getByRole('button',{name:'菜单选项',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'菜单选项'});await expect(menu).toBeVisible();
  const music=menu.getByLabel('音乐音量',{exact:true}),sfx=menu.getByLabel('音效音量',{exact:true});
  await expect(music).toHaveValue('100');await expect(sfx).toHaveValue('60');
  await page.waitForTimeout(450);await page.screenshot({path:info.outputPath('audio-menu.png')});
  await music.fill('0');
  await expect.poll(async()=>(await audio(page)).playing).toBe(false);
  await music.fill('40');
  await expect.poll(async()=>(await audio(page)).settings.music).toBe(.4);
  await expect.poll(async()=>(await audio(page)).playing).toBe(true);
  await sfx.fill('0');
  // Settings are kept per browser.
  await page.reload();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('lieguoji-audio-v1')!))).toMatchObject({music:.4,sfx:0});
});
