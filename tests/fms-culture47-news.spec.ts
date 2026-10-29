import {tool} from './fms-culture47-fixture';
import {test,expect} from '@playwright/test';
import {create} from './fms-culture47-fixture';

type NewsChange={text:string;at:number};
test('real monthly news uses one-second normal and eight-second major dwell without losing history',async({page},info)=>{
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Normal generated war map. All news is produced by the real Worker;
 // no history, recruitment vacancy or timer is injected.
 await page.goto('/?fms=1');await page.getByRole('button',{name:'生成大陆',exact:true}).click();await page.getByRole('button',{name:'确认原作地形',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'保存地图',exact:true}).click();
 await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByLabel('战乱开局').check();
 await page.evaluate(()=>{
  const changes:{text:string;at:number}[]=[],read=()=>{const text=document.querySelector('.c47-news strong')?.textContent??'';if(changes.at(-1)?.text!==text)changes.push({text,at:performance.now()});};
  (window as typeof window&{newsChanges:typeof changes}).newsChanges=changes;read();new MutationObserver(read).observe(document.body,{childList:true,subtree:true,characterData:true});
 });
 await create(page);
 const changes=()=>page.evaluate(()=>(window as typeof window&{newsChanges:NewsChange[]}).newsChanges);
 const app=page.getByTestId('culture47-app');await tool(page,'查看大事记');const history=page.getByRole('region',{name:'文化世界史书'});
 await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:60000}).toBeGreaterThanOrEqual(35);
 await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false');
 const records=await history.locator('li article>p').allTextContents();expect(records.some(t=>t.includes('宣战：'))).toBe(true);expect(records.some(t=>/新编\d+支常备军$/.test(t))).toBe(true);
 await expect.poll(async()=>{const items=await changes();return items.slice(0,-1).some(i=>/新编\d+支常备军$/.test(i.text));},{timeout:80000,intervals:[100]}).toBe(true);
 const observed=await changes(),durations=observed.slice(0,-1).map((i,n)=>({...i,ms:observed[n+1].at-i.at}));
 const normal=durations.find(i=>/新编\d+支常备军$/.test(i.text))!;expect(normal.ms).toBeGreaterThanOrEqual(900);expect(normal.ms).toBeLessThan(4000);
 const major=durations.find(i=>/宣战：|紧急动员/.test(i.text))!;expect(major).toBeDefined();expect(major.ms).toBeGreaterThanOrEqual(7900);expect(major.ms).toBeLessThan(14000);
 expect(await history.locator('li article>p').allTextContents()).toEqual(records);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath('real-monthly-news.png')});await info.attach('real-news-timing',{body:JSON.stringify({durations,records,errors,normalGeneratedTerrain:true,realWorkerEvents:true,physicalIphone:false}),contentType:'application/json'});
});
