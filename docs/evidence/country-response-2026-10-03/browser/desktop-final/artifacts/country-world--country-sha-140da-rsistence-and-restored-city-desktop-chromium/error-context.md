# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: country-world.spec.ts >> [country-shape] native concave outline, cancelled candidate, chunk persistence and restored city
- Location: tests\country-world.spec.ts:120:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('status')
Expected substring: "这片陆地尚未划入国家。"
Received string:    "这里是海域。"
Timeout: 5000ms

Call log:
  - Expect "toContainText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')
    - locator resolved to <div role="status" class="country-feedback">…</div>
    - unexpected value "正在处理，请稍候…"
    13 × locator resolved to <div role="status" class="country-feedback">…</div>
       - unexpected value "这里是海域。"

```

```yaml
- status: 这里是海域。
```

# Test source

```ts
  83  |   const firstNation=(await button(page,'国家 岚川').getAttribute('data-nation-id'))!; expect(firstNation).toMatch(/^nation-/);
  84  |   await createCity(page,'岚川城',{x:950,y:1450},touch); await press(page,'城市 岚川城',touch); const firstCity=(await button(page,'城市 岚川城').getAttribute('data-city-id'))!;
  85  |   await press(page,'设为首都',touch); await confirm(page,touch);
  86  |   await createCity(page,'南津',{x:1000,y:1550},touch); await press(page,'城市 南津',touch); const secondCity=(await button(page,'城市 南津').getAttribute('data-city-id'))!; expect(firstCity).not.toBe(secondCity);
  87  |   await press(page,'设为首都',touch); await confirm(page,touch); await page.screenshot({path:info.outputPath('capital-relocation.png'),fullPage:true});
  88  |   expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(secondCity);
  89  |   await press(page,'撤销上次操作',touch); await ready(page);
  90  |   expect((await persisted(page,worldId)).document.nations.find(n=>n.id===firstNation)?.capitalCityId).toBe(firstCity);
  91  |   await tab(page,'国家',touch); await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('海岬');
  92  |   await territory(page,{x:1130,y:1430},{x:1260,y:1710},touch); await press(page,'预览建国',touch); await confirm(page,touch);
  93  |   await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); const secondNation=(await button(page,'国家 海岬').getAttribute('data-nation-id'))!; expect(secondNation).not.toBe(firstNation);
  94  |   const beforeConflict=(await country(page).getAttribute('data-country-revision'))!;
  95  |   const settled=await persisted(page,worldId);
  96  |   await press(page,'新建国家',touch); await page.getByLabel('国家名称',{exact:true}).fill('冲突应拒绝');
  97  |   await territory(page,{x:950,y:1450},{x:970,y:1470},touch); await press(page,'预览建国',touch);
  98  |   await expect(page.getByRole('alert')).toContainText(/领土|归属|占有|国家|冲突/); await expect(country(page)).toHaveAttribute('data-country-revision',beforeConflict);
  99  |   await expect(country(page)).toHaveAttribute('data-country-nation-count','2'); expect(await saved(page,sourceId,4)).toEqual(sourceBefore);
  100 |   expect(await persisted(page,worldId)).toEqual(settled);
  101 |   await page.goto(countryUrl); await ready(page); await expect(country(page)).toHaveAttribute('data-country-city-count','2'); await expect(country(page)).toHaveAttribute('data-country-nation-count','2');
  102 |   await tab(page,'地图',touch); await pick(page,{x:950,y:1450},touch); await expect(country(page)).toHaveAttribute('data-country-selected-city',firstCity);
  103 |   await expect(button(page,'城市 岚川城')).toHaveAttribute('data-city-id',firstCity); await page.screenshot({path:info.outputPath('saved-capital-selected.png'),fullPage:true});
  104 |   await tab(page,'国家',touch); await expect(button(page,'国家 岚川')).toHaveAttribute('data-nation-id',firstNation); await expect(button(page,'国家 海岬')).toHaveAttribute('data-nation-id',secondNation);
  105 |   await tab(page,'地图',touch); await page.screenshot({path:info.outputPath('two-nations-restored.png'),fullPage:true});
  106 |   expect(await saved(page,sourceId,4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  107 |   const restored=await persisted(page,worldId);expect(restored).toEqual(settled);expect(restored.geoSha256).toBe(created.geoSha256);expect(restored.geoSource).toEqual(created.geoSource); await assertPoliticalLabels(page, 2);
  108 |   // Abandon one country's removal outline, then select another country's city.
  109 |   await tab(page,'国家',touch); await press(page,'国家 海岬',touch); await press(page,'手绘移除领土',touch); await press(page,'全图',touch);
  110 |   await draw(page,touch,[[1150,1500],[1230,1500],[1230,1600],[1150,1600],[1150,1500]]);
  111 |   await tab(page,'城市',touch); await page.getByLabel('城市所属国家',{exact:true}).selectOption(firstNation); await press(page,'城市 岚川城',touch); await tab(page,'国家',touch);
  112 |   await expect(country(page)).toHaveAttribute('data-country-selected-nation',firstNation);
  113 |   await expect(country(page)).toHaveAttribute('data-country-territory-action','create');
  114 |   await expect(country(page)).toHaveAttribute('data-country-outline-points','0');
  115 |   await expect(page.getByLabel('国家名称',{exact:true})).toHaveValue('岚川');
  116 |   await expect(button(page,'预览移除领土')).toHaveCount(0); expect(await persisted(page,worldId)).toEqual(settled); expect(errors).toEqual([]);
  117 |   await info.attach('native-country-result.json',{body:Buffer.from(JSON.stringify({worldId,sourceId,firstNation,secondNation,firstCity,secondCity,revision:beforeConflict,restored,sourcePreserved:true,errors,touch,physicalDevice:false},null,2)),contentType:'application/json'});
  118 | });
  119 | 
  120 | test('[country-shape] native concave outline, cancelled candidate, chunk persistence and restored city', async ({ page }, info) => {
  121 |   test.setTimeout(450000);
  122 |   const touch = !!info.project.use.hasTouch, errors: string[] = [];
  123 |   page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  124 |   const response = await page.request.get('/build.json'), build = await response.body(); expect(response.ok()).toBe(true);
  125 |   if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(build).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  126 |   await info.attach('actual-build.json', { body: build, contentType: 'application/json' });
  127 |   await page.goto('/?atlas=new&atlas-format=4'); const atlas = page.getByTestId('atlas-studio');
  128 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'empty', { timeout: 120000 });
  129 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('自由国土 · 原生验收');
  130 |   await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  131 |   await press(page, '新建空白海洋草稿', touch); await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 });
  132 |   const sourceId = (await atlas.getAttribute('data-atlas-id'))!;
  133 |   const creation = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }); if (touch) await creation.tap(); else await creation.click();
  134 |   await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  135 |   await press(page, '画大陆', touch); await press(page, '全图', touch); await draw(page, touch);
  136 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await press(page, '确认生成并保存', touch);
  137 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 }); const sourceBefore = await saved(page, sourceId, 4);
  138 |   const drafts = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '草稿', exact: true }); if (touch) await drafts.tap(); else await drafts.click();
  139 |   await press(page, '在这片地形上建国', touch); await expect(country(page)).toHaveAttribute('data-country-state', 'empty', { timeout: 120000 });
  140 |   await page.getByLabel('建国世界名称', { exact: true }).fill('岚海 · 自由圈地'); await press(page, '创建独立建国副本', touch); await ready(page);
  141 |   const worldId = (await country(page).getAttribute('data-country-world-id'))!, url = page.url(), before = await persisted(page, worldId);
  142 |   expect(before.document.version).toBe(3);
  143 |   await tab(page, '国家', touch); await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('岚海');
  144 |   await press(page, '手绘国土', touch);
  145 |   await draw(page, touch, [[700,1300],[1000,1600],[700,1600],[1000,1300],[700,1300]]); await press(page, '闭合并预览', touch);
  146 |   await expect(page.getByRole('alert')).toContainText(/自交|退化|轮廓/); await ready(page);
  147 |   expect(await persisted(page, worldId)).toEqual(before);
  148 |   await press(page, '手绘国土', touch);
  149 |   const outline = [[550,1300],[920,1100],[1260,1270],[1160,1460],[1010,1440],[1060,1760],[760,1880],[550,1600],[550,1300]];
  150 |   await draw(page, touch, outline); await press(page, '闭合并预览', touch);
  151 |   await expect(button(page, '确认并保存')).toBeEnabled({ timeout: 120000 });
  152 |   expect(await persisted(page, worldId)).toEqual(before);
  153 |   await page.screenshot({ path: info.outputPath('free-outline-preview.png'), fullPage: true });
  154 |   await press(page, '取消预览', touch); await ready(page); expect(await persisted(page, worldId)).toEqual(before);
  155 |   await press(page, '预览建国', touch); await confirm(page, touch);
  156 |   const savedNation = await persisted(page, worldId); expect(savedNation.document.nations).toHaveLength(1); expect(savedNation.document.territories.length).toBeGreaterThan(100);
  157 |   expect(savedNation.storage.pages).toBeGreaterThan(0); expect(savedNation.storage.manifestBytes).toBeLessThan(256 * 1024);
  158 |   const political = page.getByTestId('country-overlay');
  159 |   expect(Number(await political.getAttribute('data-render-chunks'))).toBeLessThan(savedNation.document.territories.length);
  160 |   await createCity(page, '岚海城', { x: 900, y: 1400 }, touch); await press(page, '城市 岚海城', touch);
  161 |   const cityId = (await button(page, '城市 岚海城').getAttribute('data-city-id'))!; await press(page, '设为首都', touch); await confirm(page, touch);
  162 |   const settled = await persisted(page, worldId);
  163 |   await page.goto(url); await ready(page); expect(await persisted(page, worldId)).toEqual(settled);
  164 |   await tab(page, '地图', touch); await pick(page, { x: 900, y: 1400 }, touch); await expect(country(page)).toHaveAttribute('data-country-selected-city', cityId);
  165 |   await tab(page, '地图', touch); await press(page, '全图', touch); await page.screenshot({ path: info.outputPath('free-country-restored.png'), fullPage: true });
  166 |   // A stored country can shrink through the same real outline/preview pipeline.
  167 |   // A capital in the selected area must stop the whole command before writing.
  168 |   await tab(page, '国家', touch); await press(page, '国家 岚海', touch); await press(page, '手绘移除领土', touch); await press(page, '全图', touch);
  169 |   await draw(page, touch, [[850,1350],[950,1350],[950,1450],[850,1450],[850,1350]]); await press(page, '闭合并预览', touch); await ready(page);
  170 |   await expect(page.getByRole('alert')).toContainText(/城市|首都/); expect(await persisted(page, worldId)).toEqual(settled);
  171 |   await press(page, '手绘移除领土', touch); await press(page, '全图', touch);
  172 |   await draw(page, touch, [[700,1620],[850,1620],[850,1780],[700,1780],[700,1620]]); await press(page, '闭合并预览', touch); await ready(page);
  173 |   await expect(page.getByRole('region', { name: '建国操作预览' })).toContainText(/移除.+恢复为未分配/);
  174 |   expect(await persisted(page, worldId)).toEqual(settled);
  175 |   await page.screenshot({ path: info.outputPath('release-territory-preview.png'), fullPage: true });
  176 |   await press(page, '取消预览', touch); await ready(page); expect(await persisted(page, worldId)).toEqual(settled);
  177 |   await press(page, '预览移除领土', touch); await confirm(page, touch);
  178 |   const reduced = await persisted(page, worldId);
  179 |   expect(reduced.document.territories.length).toBeLessThan(settled.document.territories.length);
  180 |   expect(reduced.document.cities).toEqual(settled.document.cities); expect(reduced.document.nations).toEqual(settled.document.nations);
  181 |   await page.reload(); await ready(page); expect(await persisted(page, worldId)).toEqual(reduced);
  182 |   await tab(page, '地图', touch); await press(page, '全图', touch); await pick(page, { x: 775, y: 1700 }, touch);
> 183 |   await expect(page.getByRole('status')).toContainText('这片陆地尚未划入国家。');
      |                                          ^ Error: expect(locator).toContainText(expected) failed
  184 |   await pick(page, { x: 900, y: 1400 }, touch); await expect(country(page)).toHaveAttribute('data-country-selected-city', cityId);
  185 |   await expect(page.getByRole('status')).toContainText('已选择城市「岚海城」。');
  186 |   await press(page, '撤销上次操作', touch); await ready(page);
  187 |   const restored = await persisted(page, worldId);
  188 |   expect(restored.document.territories).toEqual(settled.document.territories); expect(restored.document.cities).toEqual(settled.document.cities);
  189 |   expect(restored.document.nations).toEqual(settled.document.nations); expect(restored.document.revision).toBe(settled.document.revision + 2);
  190 |   await page.reload(); await ready(page); expect(await persisted(page, worldId)).toEqual(restored);
  191 |   await tab(page, '地图', touch); await press(page, '全图', touch); await page.screenshot({ path: info.outputPath('release-undone-restored.png'), fullPage: true });
  192 |   expect(await saved(page, sourceId, 4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  193 |   await info.attach('native-shape-result.json', { body: Buffer.from(JSON.stringify({ worldId, sourceId, cityId, settled, sourcePreserved: true, input: touch ? 'native-touch' : 'native-mouse', errors, physicalDevice: false }, null, 2)), contentType: 'application/json' });
  194 | });
  195 | 
```