# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fms-culture47-houses.spec.ts >> opening history, real branch appointment and continuous calendar survive ordinary save/reload
- Location: tests\fms-culture47-houses.spec.ts:4:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 3
Received: 4
```

# Page snapshot

```yaml
- generic:
  - main [ref=f2e1]:
    - generic "创世地图画布" [ref=f2e3]
    - button "进入世界 →" [ref=f2e4] [cursor=pointer]:
      - generic [ref=f2e5]: 进入世界
    - generic:
      - generic:
        - text: 列国纪 · 创世
        - heading "地图编辑" [level=1]
      - generic:
        - button "原作地形" [ref=f2e8] [cursor=pointer]:
          - generic [ref=f2e11]: 地形
        - button "保存地图" [ref=f2e12] [cursor=pointer]:
          - generic "已保存" [ref=f2e15]
    - generic "地图视角" [ref=f2e16]:
      - button "放大" [ref=f2e17] [cursor=pointer]
      - button "查看全图" [ref=f2e20] [cursor=pointer]
      - button "缩小" [ref=f2e23] [cursor=pointer]
      - status [ref=f2e25]: 1.0×
    - generic [ref=f2e26]:
      - status: 已恢复本机地图，可以继续绘制。
      - generic [ref=f2e27]:
        - navigation "地图工具" [ref=f2e28]:
          - button "浏览" [ref=f2e29] [cursor=pointer]
          - button "轮廓" [pressed] [ref=f2e33] [cursor=pointer]
          - button "陆地" [ref=f2e37] [cursor=pointer]
          - button "海洋" [ref=f2e41] [cursor=pointer]
        - generic [ref=f2e45]:
          - button "撤销" [disabled] [ref=f2e46]
          - button "重做" [disabled] [ref=f2e49]
          - button "绘图设置" [ref=f2e52] [cursor=pointer]
  - main [ref=f2e55]:
    - generic "真实文化世界地图" [ref=f2e57]
    - generic [ref=f2e58]:
      - button "返回绘图" [ref=f2e59] [cursor=pointer]
      - generic [ref=f2e62]:
        - strong [ref=f2e63]: 列国纪
        - generic [ref=f2e64]: 真实文化世界
      - time [ref=f2e65]: 公元1年4月18日
      - button "切换地形地图" [ref=f2e66] [cursor=pointer]
      - button "军事模式" [ref=f2e69] [cursor=pointer]
      - button "保存文化世界" [ref=f2e72] [cursor=pointer]
    - button "顶部重要事件" [ref=f2e75] [cursor=pointer]:
      - generic [ref=f2e78]:
        - generic [ref=f2e79]: 1年1月1日
        - strong [ref=f2e80]: 安宁帝国分封东阳，许子衡建立许氏支系
      - generic [ref=f2e81]: "+7"
    - generic "国家列表" [ref=f2e84]:
      - button "安宁帝国" [pressed] [ref=f2e85] [cursor=pointer]
      - button "朝川帝国" [ref=f2e87] [cursor=pointer]
    - generic [ref=f2e89]:
      - button "放大地图" [ref=f2e90] [cursor=pointer]
      - button "缩小地图" [ref=f2e93] [cursor=pointer]
      - button "显示全图" [ref=f2e95] [cursor=pointer]
    - complementary "文化与国家详情" [ref=f2e98]:
      - button "收起详情" [ref=f2e99] [cursor=pointer]: ×
      - generic [ref=f2e102]:
        - generic [ref=f2e103]: 中华文化 · 帝国
        - heading "安宁帝国" [level=2] [ref=f2e104]
        - paragraph [ref=f2e105]: 中国民间信仰
      - generic [ref=f2e109]:
        - generic [ref=f2e110]: 女皇 · 本局记载第 1 任
        - strong [ref=f2e111]: 许晓梦
        - generic [ref=f2e112]: 晓梦 1 世 · 44 岁 · 在位24年
      - region "国家实况" [ref=f2e113]:
        - generic [ref=f2e114]:
          - generic [ref=f2e117]:
            - generic [ref=f2e118]: 首都
            - strong [ref=f2e119]: 丹关
          - generic [ref=f2e120]: 本国控制
        - generic [ref=f2e121]:
          - generic [ref=f2e122]:
            - term [ref=f2e123]: 实控人口
            - definition [ref=f2e124]: 189,574
            - generic [ref=f2e125]: 容量 270,200
          - generic [ref=f2e126]:
            - term [ref=f2e127]: 国库
            - definition [ref=f2e128]: 1,882
            - generic [ref=f2e129]: 已结账金币
          - generic [ref=f2e130]:
            - term [ref=f2e131]: 军团
            - definition [ref=f2e132]: "15"
            - generic [ref=f2e133]: 40,900 人
          - generic [ref=f2e134]:
            - term [ref=f2e135]: 舰队
            - definition [ref=f2e136]: "0"
            - generic [ref=f2e137]: 0 艘编制舰
          - generic [ref=f2e138]:
            - term [ref=f2e139]: 实控地区
            - definition [ref=f2e140]: "13"
            - generic [ref=f2e141]: 13 座城市
          - generic [ref=f2e142]:
            - term [ref=f2e143]: 建国至今
            - definition [ref=f2e144]: 78 年
            - generic [ref=f2e145]: 始于开篇之前
        - group [ref=f2e146]:
          - generic "当前动向 · 15 支行军 · 0 支出航" [ref=f2e147] [cursor=pointer]
      - group [ref=f2e148]:
        - generic "外交 · 1 场战争" [ref=f2e149] [cursor=pointer]
        - generic [ref=f2e150]:
          - text: 往来国家
          - combobox "外交目标国家" [ref=f2e151]:
            - option "朝川帝国" [selected]
        - button "暂停并预览停战" [ref=f2e152] [cursor=pointer]
        - generic [ref=f2e153]: 自主外交按各国的月度日程与原作宣战门槛评估，并非每天随机开战。
        - article [ref=f2e154]:
          - strong [ref=f2e155]: 安宁帝国 — 朝川帝国
          - generic [ref=f2e156]: 第 38 日宣战 · 2 项目标
      - group [ref=f2e157]:
        - generic "国家制度与名称" [ref=f2e158] [cursor=pointer]
        - option "王国"
        - option "帝国" [selected]
        - option "联邦"
        - option "共和国"
        - option "部族"
        - option "神权国"
        - option "无指定宗教"
        - option "中国民间信仰" [selected]
        - option "道教"
        - option "佛教"
        - option "神道"
        - option "伊斯兰教"
        - option "天主教"
        - option "东正教"
        - option "新教"
        - option "犹太教"
        - option "印度教"
        - option "祆教"
        - option "希腊罗马多神信仰"
        - option "北欧传统信仰"
      - group [ref=f2e159]:
        - generic "城市 · 13" [ref=f2e160] [cursor=pointer]
      - group [ref=f2e161]:
        - generic "家族与分封 · 4 家" [active] [ref=f2e162] [cursor=pointer]
        - generic [ref=f2e163]:
          - button "自主分封：开" [pressed] [ref=f2e164] [cursor=pointer]
          - generic [ref=f2e165]: 每月审议 · 同国每半年最多新封一家 · 保留主家领地
        - list [ref=f2e166]:
          - listitem [ref=f2e167]:
            - strong [ref=f2e168]: 许氏 · 主家
            - generic [ref=f2e169]: 族长 许晓梦 · 3 位在世
            - generic [ref=f2e170]: 10 处实控封地 · 人口 151,929
          - listitem [ref=f2e171]:
            - strong [ref=f2e172]: 许氏 · 松津支系
            - generic [ref=f2e173]: 族长 许子期 · 1 位在世
            - generic [ref=f2e174]: 1 处实控封地 · 人口 13,541
          - listitem [ref=f2e175]:
            - strong [ref=f2e176]: 许氏 · 东阳支系
            - generic [ref=f2e177]: 族长 许子衡 · 2 位在世
            - generic [ref=f2e178]: 1 处实控封地 · 人口 18,773
          - listitem [ref=f2e179]:
            - strong [ref=f2e180]: 许氏 · 高浦支系
            - generic [ref=f2e181]: 族长 许景明 · 1 位在世
            - generic [ref=f2e182]: 1 处实控封地 · 人口 5,331
        - generic [ref=f2e183]:
          - generic [ref=f2e184]:
            - text: 支系家主
            - combobox "支系家主" [ref=f2e185]:
              - option "许紫阳 · 46 岁" [selected]
          - generic [ref=f2e186]:
            - text: 分封辖区
            - combobox "分封辖区" [ref=f2e187]:
              - option "锦江" [selected]
              - option "玉安"
              - option "石浦"
              - option "山溪"
              - option "北平"
              - option "金关"
              - option "南溪"
              - option "江阳"
              - option "安津"
          - button "预览分封" [ref=f2e188] [cursor=pointer]
      - group [ref=f2e189]:
        - generic "宗族 · 许" [ref=f2e190] [cursor=pointer]
    - status: 已暂停
    - generic [ref=f2e191]:
      - button "继续时间" [ref=f2e192] [cursor=pointer]
      - button "切换推演速度" [ref=f2e195] [cursor=pointer]: 1×
      - button "推进一天" [ref=f2e196] [cursor=pointer]
      - button "查看大事记" [ref=f2e199] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {enter,create} from './fms-culture47-fixture';
  3  | 
  4  | test('opening history, real branch appointment and continuous calendar survive ordinary save/reload',async({page},info)=>{
  5  |  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  6  |  await enter(page,'00000000-0000-4000-8000-00000000065b');await page.getByLabel('国家数量',{exact:true}).selectOption('2');await create(page,24);
  7  |  const app=page.getByTestId('culture47-app'),clock=page.getByLabel('当前日期',{exact:true});await expect(clock).toHaveText('公元1年1月1日');
  8  |  await page.getByRole('button',{name:'查看大事记',exact:true}).click();const history=page.getByRole('region',{name:'文化世界史书'});await expect(history).toContainText('开篇：建国已');await expect(history).not.toContainText('开国就任');
  9  |  await history.locator('.c47-history-nations button').last().click();await expect(page.getByRole('region',{name:'国家实况'})).toContainText('始于开篇之前');
  10 |  const houses=page.locator('.c47-houses');await houses.locator('summary').click();
  11 |  // Try actual registered adults; no synthetic person IDs are inserted.
  12 |  const form=async()=>{const candidates=await page.getByLabel('支系家主',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));
  13 |   for(const id of candidates){await page.getByLabel('支系家主',{exact:true}).selectOption(id);await page.getByRole('button',{name:'预览分封',exact:true}).click();if(await page.getByRole('group',{name:'确认家族分封'}).isVisible())return;}
  14 |   throw Error('No actual eligible household');
  15 |  };
  16 |  const oldCount=await houses.locator('[data-family-id]').count();await form();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount);
  17 |  await form();await page.getByRole('button',{name:'确认分封',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount+1);
  18 |  await form();await page.getByRole('button',{name:'确认分封',exact:true}).click();await expect(houses.locator('[data-family-id]')).toHaveCount(oldCount+2);
  19 |  const familyRows=await houses.locator('[data-family-id]').allTextContents();await page.screenshot({path:info.outputPath('existing-country-family-branches.png')});
  20 |  await page.getByRole('button',{name:'继续时间',exact:true}).click();await expect.poll(async()=>Number(await app.getAttribute('data-day')),{timeout:60000}).toBeGreaterThan(2);
  21 |  const timeline=await page.evaluate(async()=>{const rows:{day:number;tick:number;endpoint:number;text:string}[]=[];const end=performance.now()+4000;while(performance.now()<end){const n=document.querySelector<HTMLElement>('.c47-calendar')!,app=document.querySelector<HTMLElement>('[data-testid="culture47-app"]')!;rows.push({day:Number(n.dataset.day),tick:Number(n.dataset.displayTick),endpoint:Number(app.dataset.tick),text:n.textContent!});await new Promise(r=>setTimeout(r,25));}return rows;});
  22 |  expect(timeline.length).toBeGreaterThan(20);expect(timeline.every(v=>v.day===Math.floor(v.tick/120)&&v.tick<=v.endpoint)).toBe(true);expect(timeline.at(-1)!.tick).toBeGreaterThan(timeline[0].tick);expect(timeline.some(v=>v.tick<v.endpoint)).toBe(true);
  23 |  await page.getByRole('button',{name:'暂停时间',exact:true}).click();await expect(app).toHaveAttribute('data-advancing','false',{timeout:30000});await page.waitForTimeout(100);const pause=await clock.textContent();await page.waitForTimeout(350);await expect(clock).toHaveText(pause!);
  24 |  await page.getByRole('button',{name:'保存文化世界',exact:true}).click();await expect(page.locator('.c47-notice')).toContainText('已保存',{timeout:60000});const savedTick=await app.getAttribute('data-tick');
  25 |  await page.reload();await page.getByRole('button',{name:'进入世界 →',exact:true}).click();await page.getByRole('button',{name:'继续文化世界',exact:true}).click();await expect(app).toHaveAttribute('data-tick',savedTick!,{timeout:60000});
  26 |  await page.getByRole('button',{name:'查看大事记',exact:true}).click();await expect(history).toContainText('建立');await history.locator('.c47-history-nations button').last().click();await houses.locator('summary').click();
> 27 |  const restored=await houses.locator('[data-family-id]').allTextContents();expect(restored.length).toBe(familyRows.length);expect(restored.map(s=>s.split('人口')[0])).toEqual(familyRows.map(s=>s.split('人口')[0]));expect(errors).toEqual([]);
     |                                                                                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  28 |  await info.attach('branch-and-clock',{body:JSON.stringify({familyRows,restored,savedTick,timeline,errors,physicalIphone:false}),contentType:'application/json'});
  29 | });
  30 | 
```