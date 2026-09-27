# 列国纪当前续接

更新：2026-09-27T22:45:27.643Z。先核实际Git、源码与dist；旧证据保留。

## 当前状态

- 本地preview.22已完成306/306、计划/lint/类型/构建/dist/11闭包、生产GPU及三端浏览器；实际build SHA256 517215bfffe6125531d90b8540ad53f358547c3739ff63f3ca64a4c60f410be2，原build.commit=d651bcc9502d5afe31fef80d0a17b9a9988bc819。已本地提交5aadcba21f13ed101c5983fd4e97ce16f8206f55；[本批记录](evidence/2026-09-28-ph06-natural-range-sea.md)。真实山脉仍管状，自然视觉失败；PH状态不变。
- 分支codex/ph06-world-generation；preview.21游戏源码已本地提交31e27620c816db33993a8ac419274c9a86c32624。原build.commit=502164889fef2f0280b725c76538cd07df7d5e36如实保留；最新文档提交以git log核实。
- preview.21为上一批已提交历史基线；149/149和旧三端证据只描述21。当前实际dist与IAB为上方22，旧存档在22读取恢复修订1已实际核实。
- PH06-T3/T4保持in_progress，PH07及T1为in_progress且PH07→PH06依赖未改。自然视觉、用户视觉、真机、整体PH和性能未完成。
- 新Atlas尚无国家、行政区、城市、首都、军队与战争。旧0.4工坊/测试战役独立，不能冒称新版已有。

## 最新实证

preview.22的真实全图和40%中景仍显示窄圆管状山系；海洋亮青光圈已减弱。对应原因包括固定宽度/横截面与fine-tree未应用谷地削切，不能称达到参考游戏体验。22详细失败、修复、同存档材质A/B和原生生成保存恢复证据见本批报告。下述旧记录仅作为历史基线保留。

preview.20接入细山脊高程与真实18历史恢复。旧默认/local逐值保留；小大陆密度错误已修复。自然视觉仍未通过，真实中近景与所有失败见本批归档。19流向与触摸修复记录如下。

preview.19已接入真实地形流向。来源为保存的细高程，实际相邻下坡路径可取景、取消与刷新重算；完全不写地理根或存档。此功能仍是有界只读查看，不是完整河网或蓄水。三端本轮通过，见上方报告；18的下方结果只作为原地形基线。

[preview.18报告](evidence/2026-09-28-ph06-fine-land-belt.md)：18文件125/125，计划/lint/类型/构建/dist/11真实生成闭包通过；新陆地真实高程逐节点显式保存，旧sampler不变，主支山带及紧凑工具架已接入。

| 浏览器仿真 | 完整流程耗时 | 结果 |
|---|---:|---|
| desktop-chromium | 273.488 秒 | PASS，450秒、零重试 |
| mobile-chromium | 274.828 秒 | PASS，450秒、零重试 |
| tablet-chromium | 361.266 秒 | PASS，450秒、零重试 |

三端原生绘两陆、追加、旧陆保护、撤销、刷新、近岸拾取、重叠拒绝通过；同一源码/dist、原450秒预算、零重试。范围纠正：18的按钮使用鼠标click，移动端仅绘图与地图点选是触摸，不是全程纯触摸保存。19新回归使用原生tap覆盖所有移动按钮。另五种响应状态/44px/键盘/根字号放大/高对比通过，实际运行到write-continuous-heights后取消成功，数据库不写、刷新一致。总耗时不是单次响应时间，仿真不是真机。

实际图仍圆峰、蓝色近岸光带强、内陆空。已改善连续地形不能称完整参考游戏体验；截图和visualfalse见归档。公开raw snapshot长同步诊断仍未关闭，当前生成预览走已有私有异步快照。

## 已有基线和独立下一批

- 细海陆绘制、生成预览/确认/取消、追加/撤销/保存恢复已有；局部细高程编辑和非零锁1/2/3的三端旧实证见[preview.14](evidence/2026-09-28-ph06-continuous-relief.md)。不可误用preview10旧审计称接口不存在。
- [preview.16](evidence/2026-09-28-ph06-coast-scale.md)三端通过是旧基线；[preview.17](evidence/2026-09-28-ph06-branching-relief.md)113/113但数值图视觉拒绝、无17浏览器。13旧超时、15拓扑失败及所有历史原件保留。
- 17真实生成闭包73原件已冻结于evidence/ph06-preview17-generator-history-2026-09-28；原捕获时sourceIsHead=false/browserExecuted=false不改写。18真实闭包现已冻结并在20检查通过。实际20闭包也已冻结于.autopilot/ph06/v4-preview20-history-staging，ready SHA256 d493528b03e19873105aa1c20e6f831983c9f0cf3dcd91a6e94ea25e234b088b：47份源码逐字节匹配最终检查，11闭包及engine重算一致，原build.commit保留ef52727；本批已接存储历史并通过5项定向及149项联合检查；原件未改。
- PH07内核见[工程入口](evidence/2026-09-28-ph07-engineering-entry.md)和[内核记录](evidence/2026-09-28-ph07-hydrology-kernel.md)。当前新增真实Owned快照提取、只读Worker/bridge路径和地图显示；所有数据从当前保存地形读取，无地理修订/数据库写入。快照11项与内核16项正常导入通过；19统一检查与真实三端浏览器已通过，仍不算完整河网。
- preview.22山系、海洋材质及实际21存储历史已接入。下一批先冻结22实际生成闭包再改生成器，修真实山体形态并继续PH07跨页流向。国家行政城市军队尚未接入，不以空面板代替。

- 跨页边界候选已暂存于.autopilot/ph07/boundary-staging，ready-manifest SHA256 248f67e6477660e03e66961a47da5f19d39f079d79f67e4e5fdc7c99d9e3f7cc。14/14有界合成单元通过；首轮两项类型诊断修复为字面量as const后lint/类型通过，实际编译JS逐字节相同，复用原14项。生产未接入、没有完整receiver/河网/湖水量。后续从现有Owned快照按core+halo提取固定来源2—4页，先验预算，不新增公开raw snapshot。
- 独立owned-v2修订加入必要Worker owner守卫、无密集分配的预检与真实Owned两页提取；27/27（原14+新13）、lint/类型通过，首轮测试接线失败保留。ready SHA256 3e89c7d2c9515a33d9b742c90afbebc130880a91d1f5b5715efb339d110c193f；真实Owned测试为小范围，128²仅预算检查。仍未接生产、没有全域receiver或密集性能验收。
- preview18真实闭包已在.autopilot/ph06/v4-preview18-history-staging冻结，ready SHA256 86e7b8e602dfdd5c15c032445a8edf473976e86e743a315dc0c0664c11f37425。d742的47份Git源字节匹配18当时源清单，11闭包/engine匹配原18构建444d8380…；原build.commit=05f566ea…未改写。本批已接正确存储历史，137项检查含该兼容验证；原冻结闭包未改。

用户/V4§14允许不依赖人工验收的工程继续，不能把PH06主观视觉扩大为全部PH07纯代码的前置。依赖完成、最终视觉/真机和发布验收仍保持，不能因“独立工程”标记PH完成。

## 发布和数据边界

仓库Ethanhui6/lieguoji-web，Pages lieguoji-web；唯一原生Git链main生产、其他分支预览。旧站https://lieguoji-web.pages.dev/未更新。9月24一次预览例外已消耗，全部PH与必要验收前禁止任何push、远程PR/Issue/Milestone和部署，不绕过pre-push。只本地，CI文件不代表云端通过。

旧世界/历史/真实存档不改写；自建/测试不自动转正式CANON。编辑与模拟分离、旧规则兼容、未来锁写/多标签保护继续。没有新的登录或秘密需求。IAB本次真实创建“长岬内海 · 细地形创作”，以36点鼠标轮廓生成25.47%陆地，确认修订1并刷新恢复；实际地址http://127.0.0.1:4173/?atlas=atlas-e0aa8c2d-3abc-4a12-88ff-c76b43fe2581&atlas-format=4。创建用18产物；本轮已在20真实刷新恢复修订1。该人工试玩页尚未点选流向，流向实证来自上述三端隔离浏览器。山脉仍过于平滑，原草稿未改。

当前IAB另保留20新生成的独立试玩草稿“长岬内海 · 新细山脊”：http://127.0.0.1:4173/?atlas=atlas-e64a6198-446a-4f23-b139-c5079531102f&atlas-format=4。实际鼠标41点轮廓、22.51%陆地、-5897至2123米，真实确认后刷新显示修订1；旧18草稿仍在且已于20恢复验证。它只展示当前地理创作，山系模板感未验收；没有国家/行政/战争。细节记录在.autopilot/ph06/demo20.json（本机测试元信息，不导出存档）。

当前IAB21独立草稿“长岬内海 · 分区海岸”：http://127.0.0.1:4173/?atlas=atlas-d44d13db-0608-4b84-aed9-983a1e4f6df3&atlas-format=4。与20同41点原生鼠标轮廓、种子及参数，实际预览22.09%陆地、-5897至2128米；确认保存后真实刷新显示修订1。此前20草稿也已在21真实恢复，未改写。截图.autopilot/ph06/demo21-before-ocean.png用于下一批同保存地形/视野的海洋材质对照。当前仍S形管状山脉、亮青岸带，视觉未通过；国家行政城市战争仍未实现。

preview.22当前IAB独立草稿：
http://127.0.0.1:4173/?atlas=atlas-329f6a97-78f7-4512-a2b7-4e92e4b5daf9&atlas-format=4
同手绘输入的实际预览为22.09%陆地、-5897至2046米，保存并刷新修订1。新山系仍管状，不能称自然视觉通过。

实际22源码已在.autopilot/ph06/v4-preview22-history-staging冻结：48份原字节（43生成器+5模拟引擎），11闭包及engine重算一致，inventory SHA256 d213742b9254abff675bec475ad8e72f0c3563ecb60ea83a350019586c3f0620，sourceCommit为5aadcba，原build.commit保留d651bcc。尚未接下一版本存储历史。

PH07 receiver隔离候选在.autopilot/ph07/receiver-staging/checks/first由root实际检查：16/16、类型和lint通过，未接生产/完整河网/存储。下一批山体候选在.autopilot/ph06/ridge-landform-staging；只依据实际高度图和产品图判断视觉，当前22失败图保留。
