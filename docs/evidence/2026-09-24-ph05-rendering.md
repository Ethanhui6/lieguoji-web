# PH05 相机、显示缓存与 LOD：实施记录

状态：功能、正式性能与证据恢复验收全部通过。基线为 PH04 本地提交 `c131c9664d30da8aafa83114a9169359e6e57635`，分支 `codex/ph05-camera-lod`。本阶段不触发任何远程写入或发布。以下过程按原时序保留，早期“尚未通过”指当时状态，不覆盖末尾最终结果。

## 第一批：T1 / T2

纯相机模型已实现 world/screen 逆变换、fit、pan、锚点缩放、保中心 resize 和可见范围。CSS 像素与 DPR 分离，真实 128² 共享几何在不同视口和相机下保持相同拾取身份及完整编码摘要。定向测试 **17/17**、两文件 ESLint exit 0，结束于 `2026-09-23T21:19:19.700Z`。原始记录暂存 `.autopilot/ph05/camera-checks/second-run-2026-09-24/`，阶段冻结时归档。首轮 16/17 的失败为测试对 IEEE 浮点结果使用严格深相等；只调整测试比较精度，生产实现未改，首轮日志保留。

按需 RenderTexture 缓存、实际输入与 GPU 生命周期主体已接通。只读源码审查核对了 Pixi 8.21 的显式纹理创建、目标绘制、source 所有权及真实 context 事件；静态审查不等于 GPU 验收。销毁异常导致提前退出清理与账本失真的路径已修复：逐项尽力释放、保留未确认的像素并禁止后续分配。恢复 Promise 失败传播和可取消 RAF 等待已补齐，取消/销毁不需要等下一帧才能结束。

渲染器/缓存/输入定向测试最终 **35/35**，约 34.87 秒；四个实现/测试文件 ESLint exit 0。原始日志暂存 `.autopilot/ph05/renderer-checks/20260924-053723-renderer-final.log` 与 `20260924-053831-renderer-lint-final.log`。首轮 34/35 的审计事件用例被测试自身的假计时器阻塞于实际分批 yield，改为真实计时器并给审计补销毁取消后通过；首轮日志 `20260924-053554-renderer-first.log` 保留。这里的 GPU 是单元边界替身，真实浏览器扩展验收仍未执行。根的首次整合 TypeScript 检查 exit 0，记录 `.autopilot/ph05/typecheck-integration-first.log`。

新增真实浏览器验证脚本 `tests/atlas-rendering.spec.ts` 正在准备以下场景：

- 锚点缩放后仍拾取同一地块，横竖视口变更保留世界中心，全字段审计与主备根不变。
- 真正 CDP 触控的双指转单指及 touchCancel 不误选，下一次点选仍有效。
- 离屏提交不提前重画，回到视口后依据已提交内容重建。
- 两轮真实 `WEBGL_lose_context` 恢复同一地图画面、相机与选择；卸载后受管理缓存归零。
- 已提交的新草稿分批接收画面期间丢失 GPU，恢复后只开放该新草稿，旧根保持原样。

首次统一构建已通过：**808/808 单测、34 文件、14 发布策略检查、lint/类型/25 产物检查**；日志 `.autopilot/ph05/checks/first-integration-build/`。包含实现、测试与工具的 158 文件来源快照摘要为 `28a9ec82ada198a6eff80213b7386044d9ee09d826555f3f09f18486fc099772`。

首次三端浏览器为 **33/39 通过，6 失败，369.570 秒，无重试/flaky/跳过**；原始报告和截图已保留在 `.autopilot/ph05/checks/first-integration-browser/artifacts/`。旧 Atlas 的 24 项全部通过；新触控取消、离屏提交、新草稿接收中真实 GPU 丢失恢复的 9 项通过。尚未签 T1/T2 或 PH05 完成。

六个失败为同两类断言在三端重复：

- 脚本使用理论小数坐标作为滚轮/触控锚，原生输入会量化坐标。桌面实际误差 0.233361 世界单位；移动 0.000007524。改为整数 client 坐标输入，保留原坐标相等精度与同地块 ID 检查。
- PNG 文件字节相等比正确重建画面的要求更严格。桌面解码后仅 1376×896 中 3 像素相差 1 个 8-bit 色阶，移动 1082×1864 中 2 像素相差 1。改为逐像素逐通道检查，允许最多 1 级取整差；不遮罩、不忽略区域、不采用较宽的感知差异阈值。世界摘要、相机、选择与主备字节仍要求精确相等。第二轮恢复及卸载检查尚待执行。

独立查看实际截图还发现**真正的缓存接缝缺陷**：无网格的均匀海面上出现每显示块一条深线。桌面截图 y=300、x=378…395，正常 RGB 为 `[32,84,102]`，块边界 x=385 为 `[29,78,96]`，并非上述 1 级恢复色差。透明 gutter 未绘制真实邻地，线性采样与两次 SourceOver 露出背景。正在改为全局采样对齐、真实邻居 halo、唯一不重叠显示核心及相应依赖失效；预算仍计入完整 RT，裁片不重复计算 source。新增海面/陆地内部跨块及真实异色海陆像素回归，未运行前不记录通过。

测试文件首轮 ESLint 的一个未使用解构变量已修正，第二轮该文件 ESLint exit 0；以上新测试修订待接缝修复后统一复验。

接缝修复后的统一构建通过 **811/811 单测、34 文件、14 发布策略、lint/类型与25产物检查**，日志 `.autopilot/ph05/checks/halo-integration-build/`；构建前158文件快照摘要 `f3c3c50a08569a7115298c26933c39991a341af5af6313329e5f7a8990b348ca`。这包括新增的真实邻地依赖、精确失效集合及资源所有权测试；渲染器定向38/38及四文件lint亦通过。

第二轮三端浏览器 **40/42 通过，2失败，无重试/flaky/跳过**，执行 `2026-09-23T22:00:41.994Z` 至 `22:07:14.286Z`，完整原始记录 `.autopilot/ph05/checks/halo-integration-browser/`。三端缩放锚点、触控取消、两轮真实GPU恢复与卸载、接收途中GPU丢失、真实海陆接缝，以及原有24项存档/事务全部通过。两项失败为同一实际缺陷：桌面和平板的离屏修改虽然回执重画0，但 UI 随后的选择刷新让普通预取提前创建两个已经失效的离屏halo核心，缓存创建计数分别154→156与128→130。正在为失效核心保留独立延迟状态，直到真正可见后才解除；不放宽原离屏断言。T1/T2仍未签完成。

离屏修复的定向检查 **39/39 首轮通过、41.41秒，三文件lint exit 0**，原始日志 `renderer-checks/20260924-061336-deferred-first.log` 与 `20260924-061355-deferred-lint.log`。新用例覆盖接收后的选择/预览刷新、切换采样密度、GPU清空后恢复及真正进入视口；干净邻块仍可预取。只修改renderer与对应测试，未扩大缓存预算或放宽断言。

随后统一构建 **812/812 单测、34文件、14发布策略、lint/类型/25产物通过**；日志 `.autopilot/ph05/checks/deferred-integration-build/`，构建前158文件快照摘要 `04feb2519b61fb1bc76415f504ae1cbff79e96d0c6a3366fc855ec8e8edefc07`。18项渲染浏览器定向复验 **18/18首轮通过、零重试/flaky/跳过**，证据 `.autopilot/ph05/checks/deferred-integration-browser/`。旧24项事务浏览器证据仍指向上一构建，不写成同一轮全42项通过。T1/T2对应功能验收完成，整体PH05仍须T3和T4的正式性能门，当前未完成。

只读诊断使用 canvas CustomEvent 请求/回执，不暴露可写世界句柄。完整 audit 在计时窗口外执行，核所有块内容和 manifest；帧耗时记录完整 draw，包括缓存构建与同步诊断监听开销。纹理像素账本只代表受管理缓存逻辑像素，不代表全部显存。

## 第二批：T3 功能验收

开始接入远/中/近语义细节、真实高程/稳定ID标签及有界避让。三档保持同一高程配色，标签不改变数据或拾取；普通海洋不重复铺满负高程，选中海洋保留准确深度。实现合同见ADR0010；纯策略/布局由phase_audit负责，DOM/渲染接线由game_ui负责，根负责实际浏览器与性能证据。此处记录开工，不是功能通过。

纯LOD/布局定向 **25/25首轮通过，527ms；两文件lint exit 0**，原始记录 `.autopilot/ph05/lod-checks/first-run-2026-09-24/`。实际坐标取真实共享quad的面积质心；测试覆盖迟滞、大幅跨档、ID0、海平面0、选中负深度、包括被过滤项的256检查上限、实测大字矩形、遮挡/边缘与完整源字节不变。

DOM展示池最多32节点、批量测量探针池最多256节点、尺寸缓存最多256项；不是宣称全部DOM只有32。所有候选/实际测量/布局/写入在完整draw计时内，隐藏/恢复/销毁接入既有生命周期。统一构建 **840/840单测、35文件、14发布策略、lint/类型/25产物通过**，日志 `.autopilot/ph05/checks/lod-integration-build/`；161文件来源快照摘要 `ec2dc4d5871273d1e68d25cc50ccf9ed05e9c80f2a78be387bb428b7fc570a9b`。包括两个新增真实LOD流程的48项浏览器检查正在执行，未完成前不签T3。

48项实际浏览器执行结束于`2026-09-23T22:40:53.549Z`，**45通过、3失败、零跳过/重试/flaky**；原始记录`.autopilot/ph05/checks/lod-integration-browser/`。两项新增LOD流程在三端全部通过，全部旧24项事务/存档亦通过。失败为桌面GPU截图差异，以及桌面/平板接缝取样：

- GPU恢复的完整合成PNG有15像素变化，其中11个超过1色阶的像素均在工具栏左边圆角/边框，最大8，范围x16—18/y22—66；世界约从x284开始。该浮层无backdrop-filter，使用半透明背景、边框与阴影。其余4个≤1色阶变化的坐标当时未记录，不扩大结论。保留PNG与差异统计`.autopilot/ph05/lod-context-diff-desktop.json`。
- 接缝用例为避让选中标签而真实选择远处海洋，但选中操作会重置相机中心，脚本未重新“全图”，使固定世界探针落到画外/工具栏。仅修复测试坐标设置，不改变生产相机或放宽像素容差。
- GPU用例改为在真实新draw同步完成后的事件里只读`readPixels`整张默认framebuffer，包括DOM遮挡下面的地图；核正确默认读写绑定、物理尺寸、无GL错误、海/650米陆地/地图外背景各至少100真实颜色像素、全画布不透明。每个RGBA通道仍≤1，同时精确核相机、选择、全部数据/主备根和真实DOM标签布局。完整合成PNG及其差异仍保存；不遮罩、不藏UI、不清屏或改绑定。这里的读回开销不进入T4计时窗口。

改动后测试文件与PH04回归工具lint、完整类型检查exit0，记录`.autopilot/ph05/lod-pixel-{lint,typecheck}.log`。第一次定向命令的中文grep未匹配到用例，实际运行0项、exit1，保留`checks/lod-pixel-browser/`；改为明确文件/行号选择两例×三端，复测进行中，不计通过。生产源码和dist始终保持840构建；仅测试与测量工具变更。

最终定向6项**6/6通过、52.7秒、零重试/flaky/跳过**，原始数据`.autopilot/ph05/checks/lod-pixel-browser-second/`。161文件来源快照`caa8224903c45ee70ebe0b382625ab41eb4af5a412b54f4cd82c2f4c8a07f330`包含修订测试及PH04回归工具；生产840构建未改。当前48个不同场景均有通过证据，组成是同一生产构建45/48加受影响6/6，**不是单轮48/48**。T3功能完成，PH05仍等待T4。

## 第三批：T4 性能验收进行中

正式测量前静态预检发现原轨迹6次滚轮放大仅约5.05倍，无法进入near阈值26 CSS像素；正式测量尚未执行，先修正轨迹并增加实际远/中/近、非空真实标签、near网格覆盖门。保持原60秒、三景各三次、cold/warm、四配置、40ms输入节奏与全部原性能阈值。

PH04性能回归首批已采完并汇总：**13门中12通过，Worker观察计算门失败**，评估`.autopilot/ph05/ph04-regression-first-evaluation.json`。四份完整报告同source/dist、均measured且无浏览器错误：`2026-09-23T22-49-58-518Z-edits`、`22-50-39-173Z-loads`、`22-57-23-282Z-transport`、`22-58-12-955Z-cancel`，均在`.autopilot/ph04/measurements/`。

| 本次回归 | 实测 | 原门 |
| --- | --- | --- |
| 100编辑完整observedCompute | p95 33.2 / max43.2ms | p95≤25ms，**FAIL** |
| 持久化并正确画面 | p95 91.4 / max105.4ms | p95≤250 / max1000ms，PASS |
| 输入反馈 | max3.1ms | ≤50ms，PASS |
| 10次初次保存/冷恢复全校验 | max3126.5 / 1984.7ms | 各≤5000ms，PASS |
| 三规模局部传输 | 差异8.243%，最大23847bytes | ≤10% / 128KiB，PASS |
| 最大分片/实际进度 | 104438bytes；Worker127.4ms/可见146.3ms | ≤512KiB / 250ms，PASS |
| 10次提交前取消 | max9.1ms，源根不变 | ≤500ms，PASS |

一次传输在`22-52-56-545Z-transport`因本地预览连接拒绝失败；重启后`22-53-44-289Z-transport`在会话续接时进程消失，仅8条结果，无status/completedAt，不能算完整通过。其原报告保留。核实旧句柄不存在、4173端口无监听与项目node进程不存在后，使用隐藏本地preview与固定命令job包装器恢复；进程身份与日志写`.autopilot/ph05/preview-process.json`和`jobs/`。不将窗口/session曾启动当作仍在运行的证据。

只读诊断核实新旧Worker产物完全相同：`atlas.worker-BQxya0_v.js`，78183bytes，SHA256 `4dd4755e7a86f558c1978cf336c1ac2c0acc24e27d7633d2722167e4e7c8138e`。`observedCompute`不包含主线程showPreview/accept，完整ACK等待已扣除，不能挪计时或把主线程耗时当直接计入Worker。当前preparation p95 7.4、storageCompute24.2ms（旧4.8/14.1）；多个分项均变慢，现报告不足以证明单一根因。

实际发现的可修冗余：标签遮挡MutationObserver在面板进度文字变化而边界不变时仍请求整图draw；每次draw重建1024格preview几何。正在改为真实遮挡边界变化才重排标签，并缓存输入未变的preview/selection/outline几何；保留进度、全部校验、完整draw计时和GPU/接收失效。不提前声称它解释了全部回归，须同样100编辑复测。

上述优化完成：取消固定遮挡盒内部文字/子节点变化的无条件重画订阅；实际尺寸由border-box ResizeObserver，位置/展开/祖先/字体/滚动/增删继续触发。三个Graphics覆盖层按数据、输入、scale与GPU代次缓存，未改变任何帧序列或CPU计时定义。新增6项边界后定向**48/48首轮、45.92秒，四文件lint exit0**，日志`renderer-checks/t4-overlay-first-*`。

优化后的统一构建**846/846、36文件、14发布检查、lint/类型/25产物PASS**，单测73.89秒，整体结束UTC`2026-09-23T23:10:43.788Z`；来源快照162文件摘要`5647e080a9cf25b405b2661ae2cbe4143237fff1ad157794ec3e139efa2bfdda`，记录`checks/overlay-integration-build/`。新生产构建先执行相同100编辑复测；其浏览器/性能结果仍待记录，不能把此前840构建的证据直接改称846通过。

新构建同样100笔编辑首轮完成，`2026-09-23T23-10-56-621Z-edits/report.json`：observedCompute **p95 20.0/max23.9ms**，正确持久画面 **p95 53.9/max67.5ms**，反馈max2.5ms，采集无错误。对应计算/交付原门通过；另外三模式仍待同构建复测，不能与前一dist直接拼成13门通过。新PH04测量源`e1fbda93f05f2dbfa1a8926e6e44bdcd0700bb568fa088e8e8fdc095164a4b13`、dist `89d277cfe94748d0e2d963ff4c17589d57c39d072792dacdc94493110601fc2d`。前次33.2ms失败完整保留。开始v2真实三景轨迹smoke，尚无正式T4结论。

v2首次三景smoke完成：`.autopilot/ph05/render-measurements/2026-09-23T23-12-09-105Z-smoke-headless-dpr1/`，评估`render-smoke-v2-first-evaluation.json`。6个cold/warm样本的实际三档、真实DOM高程标签、近景网格、陆海拾取、输入槽位、源数据/主备根和32Mi纹理账本均有效。5秒预检不满足正式覆盖，不能写T4通过。实际RTX3060/ANGLE D3D11、Chromium153.0.8010.12，画布1376×896、DPR1。

| 地理测试景 | cold rAF最大 / CPU draw p95（ms） | warm rAF最大 / CPU draw p95（ms） |
| --- | --- | --- |
| continental | 128.5 / 5.6 | 7.2 / 1.6 |
| archipelago | 196.3 / 9.0 | 10.8 / 1.3 |
| mountains | 175.0 / 11.2 | 11.2 / 1.9 |

三景cold最大帧均超过100ms，后两景完整draw p95超过8ms；失败保留，不用warm替代。按实际completedFrameSequence对齐诊断：首次滚轮仍是far、标签0/网格关闭，密度0.25→0.5时创建50张新RT（48可见+2干净预取），CPU分别129.9/195.5/176.9ms；不能误归因为near标签。第二次密度0.5→1又建26张RT。由此实现有界世界坐标terrain Graphics复用，保留当前真实密度RT、实际halo和完整旧依赖核验；不预热轨迹、不改计时或阈值。预算与生命周期见ADR0010。

几何复用定向首轮53/55：renderer46/46，cache7/9；两个LRU测试把不同空Graphics mock深比较为相同，改用对象身份断言后cache9/9（263ms），四文件lint通过。首轮与修订日志均在`renderer-checks/t4-terrain-*`。统一新构建和真实像素/性能验证尚待结果；额外缓存只承诺逻辑quad和条目预算，不宣称总GPU内存。

几何复用统一构建**856/856单测、37文件、73.48秒；14发布门、lint/类型、25产物审查通过**，结束UTC`2026-09-23T23:28:27.748Z`，记录`checks/terrain-integration-build/`。164文件快照SHA256 `2e02cc96200a0d0d67e0481f19c5d65856ef7edd7bc1602bc52b8c3a3ea7b95b`。首个定向浏览器命令经Windows CMD包装仍未匹配用例（0项exit1，`checks/terrain-pixel-browser/`），改为直接Node启动Playwright并使用独立参数数组，避免shell对正则参数再解释；产品、测试断言和dist未改。实际6项在`checks/terrain-pixel-browser-direct/`执行，包含远中近真实颜色和几何账本。

新构建实际6像素/双GPU恢复检查**6/6、58.2秒、零重试/flaky/跳过**，`checks/terrain-pixel-browser-direct/`。中景真实core边界、近景网格两侧地块内部颜色一致，全部framebuffer恢复误差≤1、完整世界与主备字节一致，卸载后两套资源账本归零。手机/平板仍为仿真。

同一v2三景smoke首轮完成，原始`render-measurements/2026-09-23T23-31-00-308Z-smoke-headless-dpr1/`、评估`terrain-smoke-v2-evaluation.json`。6样本均valid且满足原时间阈值；正式覆盖仍false，不能算PH05完成。T4来源`b7abddbd6e13213de866ad922e91bc5cbfd94d304945edf6b12ef029184f7c21`、dist `ec306820bb90ec941191b73f7000c9c32c5adee9cf91251e85afde639a5767f5`。

| 新构建测试景 | cold rAF最大 / CPU draw p95（ms） | warm rAF最大 / CPU draw p95（ms） |
| --- | --- | --- |
| continental | 21.4 / 1.7 | 10.7 / 1.6 |
| archipelago | 32.0 / 1.6 | 7.3 / 1.2 |
| mountains | 39.3 / 2.4 | 10.7 / 1.7 |

实际geometryCache全程64条/72900quad，created保持64、冷轨迹命中增加83—86，纹理继续按实际density绘制；没有为未来轨迹预热。此处rAF为浏览器回调时间，不声称物理屏幕刷新率。开始最终同构建48项浏览器回归，之后四模式存储/编辑回归和四配置正式轨迹；源码、测量工具及ADR冻结。

最终同构建48项浏览器回归**单轮48/48、466.161秒、零重试/flaky/跳过**，开始UTC`2026-09-23T23:33:07.568Z`、任务结束`23:40:54.055Z`；完整报告/截图`checks/terrain-full-browser/artifacts/`。包括全部原PH04存档/取消/未知版本/备份保护及PH05显示/输入/GPU生命周期。之后启动`jobs/terrain-regression/`串行四模式原预算回归；当前仅完成采集的模式不提前记为全部门通过。

最终同构建PH04四模式回归**13/13门全部通过**，评估`jobs/terrain-regression/evaluation.json`。实际四报告在`.autopilot/ph04/measurements/2026-09-23T23-41-04-455Z-edits`、`23-41-27-832Z-loads`、`23-42-24-410Z-transport`、`23-42-46-355Z-cancel`；统一源`80832d9c39a85eb1245ce412cf1e70baec217784cb6ae23ed3e1afb4cf49e280`和同856产物`ec306820...`。100编辑compute p95 **20.4/max30.9ms**、持久正确画面p95 **58.1/max75.6ms**、反馈max3ms；10初存max2692.3ms、10新文档全校验恢复max1730.5ms；三档wire变化8.032%、最大23820bytes、单片max104438bytes；Worker进度max114.6ms、可见max122.9ms；10次提交前取消max10.9ms且原根/键不变。没有改变原阈值。开始`jobs/terrain-formal-headless-1/`正式第一配置；其后需DPR2/有窗口两档，整体PH05仍未完成。

首个正式配置headless DPR1完成，`render-measurements/2026-09-23T23-43-14-761Z-formal-headless-dpr1/`、评估`terrain-formal-headless-1-evaluation.json`。三景各三次cold/warm、**18/18段完整60秒轨迹均valid且满足全部原时间门**；18段rAF p95均约3.7ms，最坏单帧46.5ms，完整draw CPU p95 1.1—1.9ms。数据/主备根、标签与真实拾取、两类缓存、全帧序列和固定输入覆盖均通过，源码/产物未变。rAF不等于物理屏幕FPS。汇总器整体仍返回未通过，原因是另外三配置尚缺；不得提前签PH05。开始第二配置`jobs/terrain-formal-headless-2/`，之后有窗口DPR1/2。

首个DPR2正式配置首段**失败退出，未完成60秒**：`render-measurements/2026-09-24T00-04-42-135Z-formal-headless-dpr2/`、任务`jobs/terrain-formal-headless-2/`，UTC`00:05:05.721Z` exit1。失败为没有进入near，不是误选数据：六次API wheel(-320)的原始可信DOM事件均为`deltaY=-160`，因此scale仅0.830949、LOD medium/grid false；实际选中29819、实际标签80米均符合独立已编辑地理。生产renderer直接使用event.deltaY，无DPR除法。失败不能当作near/GPU压力通过。

需要修正测量输入校准：同配置独立空白DOM探针核API→实际CSS delta转换，再用可信原始事件逐项验证正式±320轨迹；不加载游戏预热、不改变生产缩放/时限/六次输入/near硬要求。测量工具来源因此将变化，前一DPR1的18/18结果只保留为旧工具证据，最终四配置仍须使用同一新工具来源重新执行，不放宽来源一致门。当前游戏856构建、48浏览器、13/13PH04回归继续为同一产品的有效功能/编辑存储证据，不重复构建或重跑未受影响的功能。

新增独立DOM校准的首轮静态检查通过：两个`node --check`及两文件ESLint exit0，`tooling-v2/20260924-001504-native-wheel-result.json`。四配置短探针采用与正式工具同一校准函数，保留完整原始事件：

- headless DPR1：`2026-09-24T00-16-02-033Z-smoke-calibration-only-headless-dpr1`，6探针通过，API/CSS倍数1。
- headless DPR2：`00-16-05-036Z-smoke-calibration-only-headless-dpr2`，6探针通过，倍数2，API±640实际DOM±320。
- headed DPR1：`00-16-07-861Z-smoke-calibration-only-headed-dpr1`，固定离散倍数集拒绝，实际API±320对应DOM±399.99999403953564，实测倍数0.8000000119209288，DPR1.0000000149011612。
- headed DPR2：`00-16-53-109Z-smoke-calibration-only-headed-dpr2`，同样拒绝，实际DOM±199.99999701976782，实测倍数1.6000000238418577，DPR2.0000000298023224。

因此校准改为实测有限正倍数区间[0.25,4]，并对原生delta/DPR数值表达使用固定相对界2^-22（四倍float32单位舍入误差），保留原始数值；正式±320的允许表达误差约0.0000763 CSS像素，不能容纳160/400的错误输入。物理canvas/绘图缓冲尺寸仍严格匹配round(CSS尺寸×目标DPR)。这不改变任何性能/时长/LOD/源数据门；修改发生在最终四配置开始之前，全部失败探针保留，静态与四配置短探针仍需核最终结果。

## 后续验收

T1/T2 受影响检查通过后进入 T3 远中近显示及标签密度。T4 使用 ADR0008 原定预算：标准 256² 世界、1440×960 页面、地图至少 1280×800、三景各三次 60 秒，cold/warm 分列；DPR2 与有窗口浏览器分别报告。所有首次失败、原始长帧和来源摘要保留。移动输入仿真不代替 PH35 真机和用户视觉验收。

### 原生输入校准 v2 与 DPR2 预检（00:28 UTC）

四配置纯DOM校准全部通过，原始报告在00:25:18—00:25:43目录，逐事件独立复核见.autopilot/ph05/tooling-v2/calibration-v2-review.md。headless两档API/CSS分别1/2，有窗口分别0.8000000119209288/1.6000000238418577；有窗口实得±319.9999952316285，完整保留其数值表示。仅native wheel/DPR比较使用2^-22相对界，物理像素严格、游戏/时间门不变。

DPR2真实地图预检2026-09-24T00-26-04-887Z-smoke-headless-dpr2有6/6完整合法样本且原时间目标全满足，评估calibrated-smoke-dpr2-evaluation.json因非正式覆盖仍exit1，不能当阶段通过。正式四配置统一新测量来源，串行series/calibrated-formal-v2；旧来源18段不混用。当前产品856/48浏览器/13回归证据仍有效。

## 最终四配置正式验收

UTC 2026-09-24 00:28:13—01:51:00，`series/calibrated-formal-v2` 串行完成四配置，组合评估 `evaluation.json` 的五项总门全部通过，状态为 `render-measurement-gates-passed`。每个配置均为三个非均匀真实测试景、三次重复、cold/warm各60秒，共 **72/72段有效**。没有重试、跳过场景、删长帧或修改原性能阈值；旧工具正式报告与早期失败另外保留。

| 配置 | 完整有效段 | 各段rAF p95的最大值 | 最差单帧间隔 | 各段完整draw CPU p95的最大值 | 原时间目标 |
| --- | ---: | ---: | ---: | ---: | --- |
| headless DPR1 | 18/18 | 3.7 ms | 46.4 ms | 2.0 ms | 全部满足，标准硬门 |
| headless DPR2 | 18/18 | 3.7 ms | 89.3 ms | 1.9 ms | 全部满足，压力单列 |
| headed DPR1 | 18/18 | 3.7 ms | 36.0 ms | 1.6 ms | 全部满足，有窗口单列 |
| headed DPR2 | 18/18 | 3.7 ms | 68.0 ms | 1.6 ms | 全部满足，有窗口压力单列 |

这些值是各段极值，不是跨配置、冷暖或场景平均。主机为Windows 10.0.19045 x64、i7-12700H、RTX3060 Laptop GPU，Chromium 153.0.8010.12；实际launch/CDP GPU/驱动完整保留。浏览器rAF不代表物理屏幕FPS，CPU提交不代表GPU完成时间。有窗口自动化也不等于用户视觉或真实手机验收。

四份报告共用源SHA256 `6d02caf87c5af65e0bd882c7f29b644cbd7580633386e72f4bd6356a29e053f6`、dist SHA256 `ec306820bb90ec941191b73f7000c9c32c5adee9cf91251e85afde639a5767f5`，每份执行前后均不变。正式目录依次是：

- `render-measurements/2026-09-24T00-28-14-073Z-formal-headless-dpr1`
- `render-measurements/2026-09-24T00-48-59-710Z-formal-headless-dpr2`
- `render-measurements/2026-09-24T01-09-48-980Z-formal-headed-dpr1`
- `render-measurements/2026-09-24T01-30-19-199Z-formal-headed-dpr2`

每段均核验完整绘制序列、真实DOM输入、三档LOD、实际陆地标签、近景网格与海陆拾取、持久根/全地理不变、精确物理画布尺寸及缓存账本。纹理硬限32 Mi pixels，几何硬限128条/131072 quad，覆盖在途预留与真实释放；这些是受管理资源的逻辑预算，不是浏览器/显卡总内存承诺。

最终功能证据复用同一未修改产品的856/856单测、48/48单轮浏览器、6/6定向像素与GPU恢复、PH04四模式13/13。测量校准修订只改变测试工具，不重复构建或重跑无关功能。浏览器覆盖桌面、手机和平板参数仿真；真实设备继续留在PH35。

`final-evidence` 逐文件核对并保存正式来源及被测dist，复制PH04四份完整原报告。它是本地技术验收材料，不是发行包；没有上传或发布。收集助手首次缺少函数结束括号，语法检查退出1且未执行文件操作；补齐后检查与实际收集退出0，记录在`final-collection-notes.json`，未影响游戏或正式结果。

证据归档采用逐文件完整SHA与8 MiB无损gzip块映射，原 `.autopilot/ph05` 不删不改。归档完成后另在全新目录恢复全部原字节，使用保存的原评估器重新核验四配置及PH04四模式；实际归档/恢复结果在完成后补录。地理测试景仍是合成测试资料，不冒充PH06生成器、正式CANON或完整社会模拟。

## 最终归档与恢复复验

2026-09-24T02:06:04.630Z：完整恢复 2,154 文件 / 1,580,203,960 bytes，通过逐字节校验。归档包含 805 个 gzip 对象，含工具及清单共 813 文件 / 131,949,590 bytes；manifest SHA256 `db96df30122b4221c173c9e1ebd81f465b8f2a90ba5d752b0e0bb5e7a147de57`。保存的原渲染评估器复验 72/72 有效，四配置全部原时间目标通过，除时间与恢复路径外和原评价一致；原 PH04 评估器复验 13/13 通过。完整收据与日志见 `ph05-verification/verification.json`。两次归档助手的 PowerShell 数组预检失败发生在创建目标之前，日志保留，没有覆盖原始资料。

限定隐私审查扫描 2,176 文件 / 1,580,628,513 bytes，未检出高置信秘密、敏感路径或读取错误；范围与限制见 `ph05-privacy-review.json`。没有逐张 OCR 二进制图片，也不将模式扫描称为绝对保密证明。本地保存的技术证据不是游戏发行包，无云端写入。PH05-T1—T4 及 PH05 标记 done；PH06 从此基线继续。
