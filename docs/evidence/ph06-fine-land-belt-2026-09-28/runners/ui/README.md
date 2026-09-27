# 地图工具架与 v4 运行中取消补充浏览器用例候选

状态：**仅编写，未执行、未通过。** 本目录不修改生产源码、现有 tests、dist 或已有检查阈值。使用 `webapp-testing` 的真实页面操作和截图原则；采用项目既有 TypeScript / Playwright 入口与只读观察器。主代理在最终组合界面提升和真实构建之后统一运行。

## 候选与边界

- 用例：`tests/atlas-map-chrome.spec.ts`，相对本目录。
- 独立配置：`playwright.config.ts`。仅一个 Chromium 项目、一个测试、一个新 context；重试为 0，完整用例上限 180 秒。未调整原用例的 450 秒上限。
- 引用项目现有 `tests/helpers/atlas-shape-readonly.ts` 的只读 renderer metrics / saved manifest；相对路径按本候选所在位置写定，**直接从本目录执行，不必复制到生产 tests**。
- 使用稳定的 role / aria / `.atlas-tool-shelf`，不依赖 `data-chrome="map-first-staging"`。生产提升成 `map-first` 后仍适用。
- 通过实际 `/?atlas=new&atlas-format=4` 页面、现有三个字段和“新建空白海洋草稿”按钮创建一个独立 `128` 规模 v4 草稿；无内部生成器调用、无伪造地图、无 IndexedDB 写入注入。前后只读比较保存的 root / manifest 原字节，确认工具操作不改地理。
- 页面只建立一次；之后依次 resize 为桌面 `1440×960`、平板 `810×1080`、手机 `393×852`。它们是同一桌面 Chromium 上的 CSS 视口模拟，DPR 1，**不是真手机、真平板、Safari 或触控手势验收**。

每个正常尺寸检查六个工具按钮：放大、缩小、全图、浏览、画大陆、网格。检查启用、实际 44 CSS px 最小目标、滚动可达、真实命中和无页面横向溢出；点击后观察相机、编辑模式、网格请求反馈。网格在全图 LOD 可不画线，本用例不把网格按钮状态当作近景网格渲染证据。空白新稿的“撤销”正确地保持禁用，仍检查窄屏“撤销 / 工坊”文字存在。

键盘以一个已知焦点为起点，随后实际 Tab / Shift+Tab 遍历六个工具，检查 `:focus-visible` 和实线框，最后用 Space 开关网格。截图保留真实焦点与按下状态，不额外覆盖页面装饰截图。

手机尺寸另做两种显示检查：

1. 注入并恢复 `html` 根文字字号为当前值的 2 倍，**测量真实按钮字体确实翻倍**，再次检查六工具的可达性、点击和键盘。仅属 rem 文字压力模拟，不冒称系统字号或浏览器整页缩放。工具架内部原生滚动允许保留，但每个目标必须可到达。
2. Playwright `forcedColors: active`，检查媒体查询确已启用、六工具仍能操作、焦点仍可见，并截实际页面。之后恢复。仅属强制颜色模拟，不冒称人工对比度或全无障碍认证。

界面检查产生 5 张实际产品页面 PNG（正常三尺寸、手机 200% 文本、手机强制颜色），以及 `map-chrome-observations` JSON 附件：视口、按钮实测尺寸/位置/字体、工具架滚动边界、焦点样式、实际相机、截图路径及 PNG SHA-256、console/pageerror。失败时保留已经产生的观察和截图，最终终态仍以 Playwright 原始 `results.json` 为准。

## 追加一次真实 v4 运行中取消

按照主代理追加范围，完成响应性截图后恢复标准文字、非强制颜色与 `1440×960` 桌面视口。使用同一个 UI 新建空白草稿：先保存只读 root / revision / manifest 原字节与全库 `databaseDigest`，再用真实鼠标在实际相机下画较大闭合轮廓，触发产品默认自然地形生成。

仅从生产 DOM `data-atlas-progress-stage/completed/total/state` 观察进度，等待阶段名含 `write-continuous-heights`、状态为 busy、且 `0 < completed < total`，然后实际点击可见“取消操作”。DOM 只读观察器另外记录 **trusted 点击实际到达时** 的阶段和计数；点击时已离开该阶段也会失败。最多观察该阶段 90 秒、不重试、不调用内部取消、不改 Worker 速度、不注入进度，不设“取消时延已通过”的自造结论。

核对 ready / committed、无“大陆生成预览”、取消反馈、原 root / manifest 字节及全库 digest 不变；随后真实刷新，核对仍是同一草稿且持久化完全一致。保存取消后和刷新后两张额外实际 PNG，以及 `map-chrome-running-cancel-observations` 附件，保留观测阶段、可信点击、前后实际 root / digest。**阶段太快未能命中属于失败或未观测，不自动重试变绿。** 全部仍在同一个 180 秒补充用例内；原 450 秒核心用例不改。

核心确认大陆、添加第二块大陆、真实保存与刷新恢复仍由 `tests/atlas-add-detail-coast.spec.ts` 覆盖；本补充只取消一次未完成生成，不重复整套确认流程，也不宣称自然地貌、性能、真实设备或 PH06 阶段通过。

## 待主代理执行

前置：按最终 diff 提升工具架候选；完成同版本真实检查与构建，绑定源码 / dist 指纹，启动并确认本次本地预览。配置不会自行启动或复用未识别的服务器，只接受本机 URL。**目前不得把这段命令当作已运行证据。**

在项目根目录 PowerShell，保留主代理已经核实的 `GAME_BASE_URL`；设置本轮唯一的新标签后执行：

```powershell
$env:MAP_CHROME_RUN = 'first'
# GAME_BASE_URL 应为主代理已核实的本次本地预览 URL；配置缺失时直接报错。
node .autopilot/ph06/map-chrome-browser-staging/run.mjs
```

配置只收集这个测试文件。结果在本目录 `checks/first/results.json`，PNG / 附件 / 失败 trace 在 `checks/first/artifacts/`。若标签目录已存在，`run.mjs` 启动器拒绝覆盖；下一轮使用新的真实修复标签，保留首轮失败。必须通过此启动器执行，避免跳过输出保护；它不构建、不启动服务器、不改变产品数据。不得同时启动原完整 coast 浏览器流程争抢机器；由主代理安排串行执行。

通过后仍需主代理实际打开 PNG，记录自然语言观察；DOM 尺寸、焦点样式和截图存在不等于视觉审美验收。候选尚无实际截图，也没有通过结论。
