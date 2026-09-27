# 列国纪当前续接

更新：2026-09-27T19:27:02.921Z。状态先核实际Git、源码、dist；旧批次保持原始证据，不从头创建项目。

## 当前状态

- 分支codex/ph06-world-generation。记录时HEAD 05f566ea90f22ae5aa3e7421cfa221a53b7acec9（preview.17），preview.18本批待本地提交；实际提交后以git log和.autopilot/checkpoint.json为准。
- 源码/构建0.5.0-preview.18；build.json SHA256 444d8380a0a4a5c8a42f99c7baeb3dfc5d0ef30b303f4e8571e622f27babdcd5。本地4173为验证预览，后续构建会切换产物。
- PH06-T3/T4保持in_progress，PH07及T1为in_progress且PH07→PH06依赖未改。自然视觉、用户视觉、真机、整体PH和性能未完成。
- 新Atlas尚无国家、行政区、城市、首都、军队与战争。旧0.4工坊/测试战役独立，不能冒称新版已有。

## 最新实证

[preview.18报告](evidence/2026-09-28-ph06-fine-land-belt.md)：18文件125/125，计划/lint/类型/构建/dist/11真实生成闭包通过；新陆地真实高程逐节点显式保存，旧sampler不变，主支山带及紧凑工具架已接入。

| 浏览器仿真 | 完整流程耗时 | 结果 |
|---|---:|---|
| desktop-chromium | 273.488 秒 | PASS，450秒、零重试 |
| mobile-chromium | 274.828 秒 | PASS，450秒、零重试 |
| tablet-chromium | 361.266 秒 | PASS，450秒、零重试 |

三端原生绘两陆、追加、旧陆保护、撤销、刷新、近岸拾取、重叠拒绝通过；同一源码/dist、原450秒预算、零重试。另五种响应状态/44px/键盘/根字号放大/高对比通过，实际运行到write-continuous-heights后取消成功，数据库不写、刷新一致。总耗时不是单次响应时间，仿真不是真机。

实际图仍圆峰、蓝色近岸光带强、内陆空。已改善连续地形不能称完整参考游戏体验；截图和visualfalse见归档。公开raw snapshot长同步诊断仍未关闭，当前生成预览走已有私有异步快照。

## 已有基线和独立下一批

- 细海陆绘制、生成预览/确认/取消、追加/撤销/保存恢复已有；局部细高程编辑和非零锁1/2/3的三端旧实证见[preview.14](evidence/2026-09-28-ph06-continuous-relief.md)。不可误用preview10旧审计称接口不存在。
- [preview.16](evidence/2026-09-28-ph06-coast-scale.md)三端通过是旧基线；[preview.17](evidence/2026-09-28-ph06-branching-relief.md)113/113但数值图视觉拒绝、无17浏览器。13旧超时、15拓扑失败及所有历史原件保留。
- 17真实生成闭包73原件已冻结于evidence/ph06-preview17-generator-history-2026-09-28；原捕获时sourceIsHead=false/browserExecuted=false不改写。未来修改生成闭包前先保留真实18闭包。
- PH07独立内核见[工程入口](evidence/2026-09-28-ph07-engineering-entry.md)和[内核记录](evidence/2026-09-28-ph07-hydrology-kernel.md)：真实2-world坡向、出口、内流盆地、部分流域标识、守恒样本累计，修复私有复制后16/16；仍在.autopilot/ph07/hydrology-kernel-staging，无生产Worker/UI/存档接线。没有河流玩法完成。
- 下一批先完成权威format4快照提取，再接可取消Worker/流向显示及持久化；全域流域拼接、水量与河湖规则仍必需。行政、国家、城市、军队依主计划后续接入，不堆空面板。

用户/V4§14允许不依赖人工验收的工程继续，不能把PH06主观视觉扩大为全部PH07纯代码的前置。依赖完成、最终视觉/真机和发布验收仍保持，不能因“独立工程”标记PH完成。

## 发布和数据边界

仓库Ethanhui6/lieguoji-web，Pages lieguoji-web；唯一原生Git链main生产、其他分支预览。旧站https://lieguoji-web.pages.dev/未更新。9月24一次预览例外已消耗，全部PH与必要验收前禁止任何push、远程PR/Issue/Milestone和部署，不绕过pre-push。只本地，CI文件不代表云端通过。

旧世界/历史/真实存档不改写；自建/测试不自动转正式CANON。编辑与模拟分离、旧规则兼容、未来锁写/多标签保护继续。没有新的登录或秘密需求。IAB旧草稿URL仅历史，不能称当前打开；需要试图时另建测试草稿。
