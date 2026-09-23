# PH01 兼容引擎验收记录

日期：2026-09-23。本地开发分支 `codex/ph01-engine-compat`；发布仍 locked。没有 push、云端 CI、Pages 触发或发行上传。

## 冻结来源与测试

固定源 Git `8d716dda2c92373c62f87aef700c3d93984c4472`，固定指纹 `65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5`。五个 TS 文件复制前与 Git 对象和已有 manifest 双核验，保持原相对 import 层次。`src/compat/fixtures/` 八个 JSON 全为合成材料，未接触个人存档，未用当前引擎生成旧 expected。

- `npm test -- src/compat/frozen.test.ts` 首轮 162/162，33.68s。modern/legacy 各70输入完整重算、71/71逐序号状态、32/64检查点、累计事件一致；篡改与异指纹拒绝、无输入别名、源与期望字节不变。
- `npx vitest run src/history/store.test.ts src/persistence.test.ts` 首轮97/97，2.95s。新增未知current/backup/candidate和并发变更保护，普通存档未来backup/CAS保护；未知有效历史可读取/导出，不能被覆盖。
- `npm test -- src/engine/registry.test.ts src/engine/fingerprint.test.ts` 最终18/18，1.41s。首轮6个失败来自测试将历史导出封装当作裸HistoryLog，已改为读取 `.history`，未修改合成源或规则预期。包括同引擎分支、显式经营副本、两个独立适配器路由、未知版本拒绝、revision过期和确定性依赖闭包检查。

V4世界/行政/人物/信仰/命令仅定义版本合同，尚非已实现社会功能。生产规则目前只有真实0.4，两个适配器单测不冒充第二套游戏规则。详情见 ADR0006。

代码审查发现命令domain字符串化会放过数组，以及适配器部分入口未执行版本边界。已修正为严格字符串枚举、所有规则/codec入口执行支持版本校验，增加负例；纯codec继续允许未知指纹完整性导出，执行路径仍拒绝未知指纹。

`src/engine/protected-backup.test.ts` 首轮20/20，386ms；新错误恢复入口只读导出原始未来版本主备、修订号及容量来源，缺失数据库不创建，错误scope/非JSON无损数据/超限明确拒绝。

## 整合验收

首次整合 `npm run build:cf` 通过：61任务/36PH/144子项、lint、类型、14发布策略检查、11文件452单测、Vite生产构建及23项dist严格白名单。新增保护备份后正在补最终检查，不将早期构建冒充最终源。

第一次三端兼容浏览器9项：6通过、3失败，0重试。modern/legacy各三端真实Worker回放、固定hash、当时账册、同引擎分支、保存刷新、明确经营副本及原档保护均通过。未知指纹3端全部失败在旧提示文案断言（预期「引擎不兼容」，页面已经是「规则引擎未注册」），未到后续保护断言；已对齐准确文案，不放宽业务检查或等待时间。保留 `.autopilot/ph01-compat-base.log`、`.autopilot/ph01-compat-base-results.json` 与 `.autopilot/ph01-compat-base/` 原始trace/截图。

保护备份加入后的 `build:cf` 通过12文件472单测、14发布策略检查、lint/类型/生产构建。首次尝试启动完整浏览器集合时，Node模块加载在用例收集前因JSON缺少import attribute失败（并未执行72项）。已给manifest加标准JSON导入属性；非打包工具仅注册真实冻结引擎，不臆造当前构建指纹。修正后 `playwright --list` 收集72项，lint/类型、5文件136项受影响测试、生产构建和23项dist检查通过。未变更冻结规则或固定预期。

实际全量执行证据为 `.autopilot/ph01-regression.log`、`.autopilot/ph01-regression-results.json` 和 `.autopilot/ph01-regression/`：72项中69通过、3失败，8.0分钟，0重试。全部新增兼容12项三端通过。剩余3失败全部是原工坊缺失链接测试要求出现disabled「推进一日」，而受保护且无world的页面现已隐藏模拟控件。修改测试为无地图、无时间占位、无推进/继续，并增加原有效局全saves字节hash不变、缺失scope不得生成存档、数据库集合不新增其他局、返回仍恢复原日的证据；不改产品实现，不削弱保护。

2026-09-24定向 `playwright test tests/studio.spec.ts --grep 缺失历史链接 --retries=0` 三端3/3通过，30.3s。证据 `.autopilot/ph01-missing-run.log`、`.autopilot/ph01-missing-run-results.json`、`.autopilot/ph01-missing-run/`。修订测试eslint/完整类型检查通过；未受影响的69项沿用同份生产产物证据，不重复耗时测试。综上72个不同场景都有有效通过证据，**不是同一首轮72/72**，所有运行无重试/跳过来取得通过。

PH01四子项完成：固定引擎与golden、完整指纹分派、V4版本合同、显式副本及保护恢复入口。只做本地构建，没有新的云端CI或部署。手机Pixel7与平板iPad(gen7)均是Chromium仿真，不是真机、iOS Safari或离线PWA验收。原连续触控长列表问题和正式地图/正史验收仍保留，未借本阶段标为通过。
