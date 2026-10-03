# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: country-world.spec.ts >> [country-world] native nations, two cities, capital, cancellation, conflict and independent reload
- Location: tests\country-world.spec.ts:52:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('status')
Expected substring: "此地法理归属「海岬」，实际控制「岚川」。"
Received string:    "已选择城市「南津」。"
Timeout: 5000ms

Call log:
  - Expect "toContainText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')
    13 × locator resolved to <div role="status" class="country-feedback">…</div>
       - unexpected value "已选择城市「南津」。"

```

```yaml
- status: 已选择城市「南津」。
```

# Test source

```ts
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
  117 |   // Each country's institution follows the same Worker preview/commit path.
  118 |   // Reading IndexedDB is observation only; all mutations use visible controls.
  119 |   await press(page,'编辑国家制度',touch); await page.getByLabel('制度模板',{exact:true}).selectOption('central-office');
  120 |   await page.getByLabel('政权名称',{exact:true}).fill('岚川中央官署'); await press(page,'预览制度变更',touch); await ready(page);
  121 |   await expect(page.getByRole('region',{name:'建国操作预览'})).toContainText('中央官署');
  122 |   await expect(page.getByTestId('country-overlay')).toHaveAttribute('data-country-preview','true');
  123 |   expect(await persisted(page,worldId)).toEqual(settled);
  124 |   await page.screenshot({path:info.outputPath('institution-preview.png'),fullPage:true});
  125 |   await press(page,'取消预览',touch); await ready(page); expect(await persisted(page,worldId)).toEqual(settled);
  126 |   await expect(page.getByLabel('政权名称',{exact:true})).toHaveValue('岚川中央官署');
  127 |   await press(page,'预览制度变更',touch); await confirm(page,touch);
  128 |   const central=await persisted(page,worldId), firstRegime=central.document.regimes.find(r=>r.nationId===firstNation)!;
  129 |   expect(firstRegime.name).toBe('岚川中央官署'); expect(firstRegime.institution).toEqual({version:1,template:'central-office',succession:'appointment',localAppointment:'central',localRevenueBps:1500,recruitment:'standing'});
  130 |   expect(central.document.regimes.find(r=>r.nationId===secondNation)?.institution).toBeNull();
  131 |   await tab(page,'国家',touch); await press(page,'编辑国家制度',touch); await page.getByLabel('政权名称',{exact:true}).fill('不能串到别国的草稿');
  132 |   await press(page,'国家 海岬',touch); await expect(page.getByLabel('政权名称',{exact:true})).toHaveCount(0);
  133 |   await press(page,'编辑国家制度',touch); await page.getByLabel('制度模板',{exact:true}).selectOption('member-autonomy');
  134 |   await page.getByLabel('政权名称',{exact:true}).fill('海岬自治议会');
  135 |   for (const invalid of ['100.004','-0.004','37.255','']) {
  136 |     await page.getByLabel('地方留税比例',{exact:true}).fill(invalid); await expect(button(page,'预览制度变更')).toBeDisabled();
  137 |     expect(await persisted(page,worldId)).toEqual(central);
  138 |   }
  139 |   await page.getByLabel('地方留税比例',{exact:true}).fill('37.25');
  140 |   await expect(page.getByLabel('制度模板',{exact:true})).toHaveValue('custom');
  141 |   await press(page,'预览制度变更',touch); await confirm(page,touch);
  142 |   const configured=await persisted(page,worldId), secondRegime=configured.document.regimes.find(r=>r.nationId===secondNation)!;
  143 |   expect(secondRegime.institution).toEqual({version:1,template:'custom',succession:'election',localAppointment:'local',localRevenueBps:3725,recruitment:'mixed'});
  144 |   expect(configured.document.regimes.find(r=>r.nationId===firstNation)).toEqual(firstRegime);
  145 |   expect(configured.document.nations).toEqual(settled.document.nations); expect(configured.document.cities).toEqual(settled.document.cities);
  146 |   expect(configured.document.territories).toEqual(settled.document.territories); expect(configured.geoSha256).toBe(settled.geoSha256);
  147 |   await page.reload(); await ready(page); expect(await persisted(page,worldId)).toEqual(configured);
  148 |   await tab(page,'国家',touch); await expect(page.getByRole('region',{name:'国家制度设定'})).toContainText('37.25%');
  149 |   await page.screenshot({path:info.outputPath('institution-restored.png'),fullPage:true});
  150 |   await press(page,'撤销上次操作',touch); await ready(page);
  151 |   const undone=await persisted(page,worldId); expect(undone.document.regimes).toEqual(central.document.regimes);
  152 |   await page.reload(); await ready(page); expect(await persisted(page,worldId)).toEqual(undone);
  153 |   await tab(page,'国家',touch); await press(page,'国家 岚川',touch); await expect(page.getByRole('region',{name:'国家制度设定'})).toContainText('15%');
  154 |   await expect(page.getByTestId('country-overlay')).toHaveAttribute('data-country-revision',String(undone.document.revision));
  155 |   expect(await saved(page,sourceId,4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  156 |   // Observe a real rendered land point belonging to B, clear of A's cities.
  157 |   // The later click uses this visible geometry, never injected application state.
  158 |   const political=page.getByTestId('country-overlay');
  159 |   const secondLand=await political.evaluate((root,nationId)=>{
  160 |     const group=Array.from(root.querySelectorAll('.country-territory-layer > g')).find(node=>node.getAttribute('data-nation-id')===nationId);
  161 |     const paths=Array.from(group?.querySelectorAll<SVGGeometryElement>('path')??[]);
  162 |     for(let y=1560;y<=1690;y+=4)for(let x=1138;x<=1252;x+=4)
  163 |       if(paths.some(path=>path.isPointInFill(new DOMPoint(x,y))))return{x,y};
  164 |     return null;
  165 |   },secondNation);
  166 |   expect(secondLand).not.toBeNull();
  167 |   const secondCells=undone.document.territories.filter(row=>row.legalNationId===secondNation);
  168 |   expect(secondCells.length).toBeGreaterThan(1); expect(undone.document.cities.every(city=>city.nationId!==secondNation)).toBe(true);
  169 |   await press(page,'国家 海岬',touch); await press(page,'调整领土归属',touch);
  170 |   await page.getByLabel('调整归属类型',{exact:true}).selectOption('control'); await page.getByLabel('归属目标国家',{exact:true}).selectOption(firstNation);
  171 |   await press(page,'手绘调整归属',touch); await ready(page); await press(page,'全图',touch);
  172 |   await draw(page,touch,[[1105,1400],[1290,1400],[1290,1740],[1105,1740],[1105,1400]]); await press(page,'闭合并预览',touch); await ready(page);
  173 |   await expect(page.getByRole('region',{name:'建国操作预览'})).toContainText(/实际控制从「海岬」移交给「岚川」/);
  174 |   await expect(page.getByRole('region',{name:'建国操作预览'})).toContainText('手动世界编辑');
  175 |   await expect(political).toHaveAttribute('data-country-ownership-view','control');
  176 |   expect(await persisted(page,worldId)).toEqual(undone);
  177 |   await page.screenshot({path:info.outputPath('ownership-preview.png'),fullPage:true});
  178 |   await press(page,'取消预览',touch); await ready(page); expect(await persisted(page,worldId)).toEqual(undone);
  179 |   // A cancelled command retains its draft, but viewing the other map does not
  180 |   // change that command. Re-preview must return to its actual edited field.
  181 |   const cameraBeforeCancelledView=(await metrics(page)).camera;
  182 |   await press(page,'法理',touch); await ready(page); await expect(political).toHaveAttribute('data-country-ownership-view','legal');
  183 |   expect((await metrics(page)).camera).toEqual(cameraBeforeCancelledView); expect(await persisted(page,worldId)).toEqual(undone);
  184 |   await press(page,'预览归属调整',touch); await ready(page);
  185 |   await expect(country(page)).toHaveAttribute('data-country-ownership-view','control');
  186 |   await expect(political).toHaveAttribute('data-country-ownership-view','control'); await expect(political).toHaveAttribute('data-country-preview','true');
  187 |   expect(await persisted(page,worldId)).toEqual(undone); await confirm(page,touch);
  188 |   const controlled=await persisted(page,worldId);
  189 |   expect(controlled.document).toEqual({...undone.document,revision:undone.document.revision+1,territories:undone.document.territories.map(row=>row.controllingNationId===secondNation?{...row,controllingNationId:firstNation}:row)});
  190 |   expect(controlled.geoSha256).toBe(undone.geoSha256); expect(controlled.geoSource).toEqual(undone.geoSource);
  191 |   await assertPoliticalLabels(page,1); await expect(country(page)).toHaveAttribute('data-country-nation-count','2');
  192 |   await tab(page,'国家',touch); await press(page,'国家 海岬',touch);
  193 |   await expect(page.getByTestId('country-control-count')).toHaveText('0'); await expect(page.getByTestId('country-legal-count')).toHaveText(String(secondCells.length));
  194 |   await tab(page,'地图',touch); await press(page,'全图',touch); await pick(page,secondLand!,touch); await ready(page);
  195 |   await expect(country(page)).toHaveAttribute('data-country-selected-nation',firstNation);
> 196 |   await expect(page.getByRole('status')).toContainText('此地法理归属「海岬」，实际控制「岚川」。');
      |                                          ^ Error: expect(locator).toContainText(expected) failed
  197 |   await tab(page,'地图',touch); await page.screenshot({path:info.outputPath('control-view.png'),fullPage:true});
  198 |   const controlCamera=(await metrics(page)).camera;
  199 |   await press(page,'法理',touch); await ready(page); await assertPoliticalLabels(page,2);
  200 |   await expect(country(page)).toHaveAttribute('data-country-ownership-view','legal'); await expect(political).toHaveAttribute('data-country-ownership-view','legal');
  201 |   expect((await metrics(page)).camera).toEqual(controlCamera); expect(await persisted(page,worldId)).toEqual(controlled);
  202 |   await pick(page,secondLand!,touch); await ready(page); await expect(country(page)).toHaveAttribute('data-country-selected-nation',secondNation);
  203 |   await expect(page.getByRole('status')).toContainText('此地法理归属「海岬」，实际控制「岚川」。');
  204 |   await tab(page,'地图',touch); await page.screenshot({path:info.outputPath('legal-view.png'),fullPage:true});
  205 |   const legalCamera=(await metrics(page)).camera;
  206 |   await press(page,'实控',touch); await ready(page); await assertPoliticalLabels(page,1);
  207 |   expect((await metrics(page)).camera).toEqual(legalCamera); expect(await persisted(page,worldId)).toEqual(controlled);
  208 |   await press(page,'法理',touch); await ready(page); await assertPoliticalLabels(page,2);
  209 |   expect((await metrics(page)).camera).toEqual(legalCamera); expect(await persisted(page,worldId)).toEqual(controlled);
  210 |   // B retains legal land after handing over a subset; its already-transferred
  211 |   // actual control and the complete entity table must stay unchanged.
  212 |   await tab(page,'国家',touch); await press(page,'国家 海岬',touch); await press(page,'调整领土归属',touch);
  213 |   await page.getByLabel('调整归属类型',{exact:true}).selectOption('legal'); await page.getByLabel('归属目标国家',{exact:true}).selectOption(firstNation);
  214 |   await press(page,'手绘调整归属',touch); await ready(page); await press(page,'全图',touch);
  215 |   await draw(page,touch,[[1130,1430],[1260,1430],[1260,1540],[1130,1540],[1130,1430]]); await press(page,'闭合并预览',touch); await ready(page);
  216 |   await expect(page.getByRole('region',{name:'建国操作预览'})).toContainText(/法理归属从「海岬」移交给「岚川」/);
  217 |   expect(await persisted(page,worldId)).toEqual(controlled); await confirm(page,touch);
  218 |   const legallySplit=await persisted(page,worldId), transferredLegal=legallySplit.document.territories.filter((row,index)=>row.legalNationId!==controlled.document.territories[index].legalNationId);
  219 |   expect(transferredLegal.length).toBeGreaterThan(0); expect(transferredLegal.length).toBeLessThan(secondCells.length);
  220 |   expect(transferredLegal.every(row=>row.legalNationId===firstNation&&controlled.document.territories.find(before=>before.cellId===row.cellId)?.legalNationId===secondNation)).toBe(true);
  221 |   expect(legallySplit.document.territories.map(row=>[row.cellId,row.controllingNationId])).toEqual(controlled.document.territories.map(row=>[row.cellId,row.controllingNationId]));
  222 |   expect(legallySplit.document.nations).toEqual(undone.document.nations); expect(legallySplit.document.regimes).toEqual(undone.document.regimes); expect(legallySplit.document.cities).toEqual(undone.document.cities);
  223 |   expect(legallySplit.geoSha256).toBe(undone.geoSha256); expect(legallySplit.geoSource).toEqual(undone.geoSource);
  224 |   await page.reload(); await ready(page); expect(await persisted(page,worldId)).toEqual(legallySplit);
  225 |   await expect(country(page)).toHaveAttribute('data-country-ownership-view','legal'); await expect(political).toHaveAttribute('data-country-ownership-view','legal'); await assertPoliticalLabels(page,2);
  226 |   await press(page,'撤销上次操作',touch); await ready(page);
  227 |   const legalUndone=await persisted(page,worldId); expect(legalUndone.document).toEqual({...controlled.document,revision:legallySplit.document.revision+1});
  228 |   await press(page,'撤销上次操作',touch); await ready(page);
  229 |   const ownershipRestored=await persisted(page,worldId); expect(ownershipRestored.document).toEqual({...undone.document,revision:undone.document.revision+4});
  230 |   await page.reload(); await ready(page); expect(await persisted(page,worldId)).toEqual(ownershipRestored);
  231 |   await tab(page,'地图',touch); await press(page,'全图',touch); await assertPoliticalLabels(page,2);
  232 |   await page.screenshot({path:info.outputPath('ownership-restored.png'),fullPage:true});
  233 |   expect(ownershipRestored.geoSha256).toBe(undone.geoSha256); expect(await saved(page,sourceId,4)).toEqual(sourceBefore); expect(errors).toEqual([]);
  234 |   await info.attach('native-country-result.json',{body:Buffer.from(JSON.stringify({worldId,sourceId,firstNation,secondNation,firstCity,secondCity,revision:beforeConflict,restored,central,configured,undone,controlled,legallySplit,legalUndone,ownershipRestored,secondLand,controlCamera,legalCamera,sourcePreserved:true,errors,touch,physicalDevice:false},null,2)),contentType:'application/json'});
  235 | });
  236 | 
  237 | test('[country-shape] native concave outline, cancelled candidate, chunk persistence and restored city', async ({ page }, info) => {
  238 |   test.setTimeout(450000);
  239 |   const touch = !!info.project.use.hasTouch, errors: string[] = [];
  240 |   page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  241 |   const response = await page.request.get('/build.json'), build = await response.body(); expect(response.ok()).toBe(true);
  242 |   if (process.env.COUNTRY_EXPECTED_BUILD_SHA256) expect(createHash('sha256').update(build).digest('hex')).toBe(process.env.COUNTRY_EXPECTED_BUILD_SHA256);
  243 |   await info.attach('actual-build.json', { body: build, contentType: 'application/json' });
  244 |   await page.goto('/?atlas=new&atlas-format=4'); const atlas = page.getByTestId('atlas-studio');
  245 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'empty', { timeout: 120000 });
  246 |   await page.getByLabel('大世界草稿名称', { exact: true }).fill('自由国土 · 原生验收');
  247 |   await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128');
  248 |   await press(page, '新建空白海洋草稿', touch); await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 });
  249 |   const sourceId = (await atlas.getAttribute('data-atlas-id'))!;
  250 |   const creation = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }); if (touch) await creation.tap(); else await creation.click();
  251 |   await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  252 |   await press(page, '画大陆', touch); await press(page, '全图', touch); await draw(page, touch);
  253 |   await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await press(page, '确认生成并保存', touch);
  254 |   await expect(atlas).toHaveAttribute('data-atlas-state', 'ready', { timeout: 120000 }); const sourceBefore = await saved(page, sourceId, 4);
  255 |   const drafts = page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '草稿', exact: true }); if (touch) await drafts.tap(); else await drafts.click();
  256 |   await press(page, '在这片地形上建国', touch); await expect(country(page)).toHaveAttribute('data-country-state', 'empty', { timeout: 120000 });
  257 |   await page.getByLabel('建国世界名称', { exact: true }).fill('岚海 · 自由圈地'); await press(page, '创建独立建国副本', touch); await ready(page);
  258 |   const worldId = (await country(page).getAttribute('data-country-world-id'))!, url = page.url(), before = await persisted(page, worldId);
  259 |   expect(before.document.version).toBe(4);
  260 |   await tab(page, '国家', touch); await press(page, '新建国家', touch); await page.getByLabel('国家名称', { exact: true }).fill('岚海');
  261 |   await press(page, '手绘国土', touch);
  262 |   await draw(page, touch, [[700,1300],[1000,1600],[700,1600],[1000,1300],[700,1300]]); await press(page, '闭合并预览', touch);
  263 |   await expect(page.getByRole('alert')).toContainText(/自交|退化|轮廓/); await ready(page);
  264 |   expect(await persisted(page, worldId)).toEqual(before);
  265 |   await press(page, '手绘国土', touch);
  266 |   const outline = [[550,1300],[920,1100],[1260,1270],[1160,1460],[1010,1440],[1060,1760],[760,1880],[550,1600],[550,1300]];
  267 |   await draw(page, touch, outline); await press(page, '闭合并预览', touch);
  268 |   await expect(button(page, '确认并保存')).toBeEnabled({ timeout: 120000 });
  269 |   expect(await persisted(page, worldId)).toEqual(before);
  270 |   await page.screenshot({ path: info.outputPath('free-outline-preview.png'), fullPage: true });
  271 |   await press(page, '取消预览', touch); await ready(page); expect(await persisted(page, worldId)).toEqual(before);
  272 |   await press(page, '预览建国', touch); await confirm(page, touch);
  273 |   const savedNation = await persisted(page, worldId); expect(savedNation.document.nations).toHaveLength(1); expect(savedNation.document.territories.length).toBeGreaterThan(100);
  274 |   expect(savedNation.storage.pages).toBeGreaterThan(0); expect(savedNation.storage.manifestBytes).toBeLessThan(256 * 1024);
  275 |   const political = page.getByTestId('country-overlay');
  276 |   expect(Number(await political.getAttribute('data-render-chunks'))).toBeLessThan(savedNation.document.territories.length);
  277 |   await createCity(page, '岚海城', { x: 900, y: 1400 }, touch); await press(page, '城市 岚海城', touch);
  278 |   const cityId = (await button(page, '城市 岚海城').getAttribute('data-city-id'))!; await press(page, '设为首都', touch); await confirm(page, touch);
  279 |   const settled = await persisted(page, worldId);
  280 |   await page.goto(url); await ready(page); expect(await persisted(page, worldId)).toEqual(settled);
  281 |   await tab(page, '地图', touch); await pick(page, { x: 900, y: 1400 }, touch); await expect(country(page)).toHaveAttribute('data-country-selected-city', cityId);
  282 |   await tab(page, '地图', touch); await press(page, '全图', touch); await page.screenshot({ path: info.outputPath('free-country-restored.png'), fullPage: true });
  283 |   // Find a visibly owned land point well inside the removal outline. Its
  284 |   // geometric centre can be sea in this concave generated coastline.
  285 |   const releasedLand = await political.evaluate(root => {
  286 |     const paths = Array.from(root.querySelectorAll<SVGGeometryElement>('.country-territory-layer path'));
  287 |     for (let y = 1660; y <= 1740; y += 4) for (let x = 736; x <= 824; x += 4)
  288 |       if (paths.some(path => path.isPointInFill(new DOMPoint(x, y)))) return { x, y };
  289 |     return null;
  290 |   });
  291 |   expect(releasedLand).not.toBeNull();
  292 |   // A stored country can shrink through the same real outline/preview pipeline.
  293 |   // A capital in the selected area must stop the whole command before writing.
  294 |   await tab(page, '国家', touch); await press(page, '国家 岚海', touch); await press(page, '手绘移除领土', touch); await press(page, '全图', touch);
  295 |   await draw(page, touch, [[850,1350],[950,1350],[950,1450],[850,1450],[850,1350]]); await press(page, '闭合并预览', touch); await ready(page);
  296 |   await expect(page.getByRole('alert')).toContainText(/城市|首都/); expect(await persisted(page, worldId)).toEqual(settled);
```