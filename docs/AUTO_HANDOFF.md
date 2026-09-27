# 当前续接：preview.6 放大与生成闭环修复，细海岸接入仍在进行

2026-09-27：当前本地版本 0.5.0-preview.6。用户要求的自然大陆、国家、行政区、城市和可见军队尚未完成，不能以技术检查通过代替游戏体验。PH06-T3/T4 均保持 in_progress；全 PH 发布门保留，未推送、未部署，当前没有账号授权阻塞本地工程。

- 已修复放大缓存密度和默认采样标签、取消反馈、绘图长任务和完整撤销字节核算。最后构建 lint/typecheck/build/25 产物检查通过；22 发布策略单元、未变化历史检查按记录复用。正式发行门仍拒绝未完成 PH。
- 三端渲染 9/9 在后续反馈/调度修复之前完成，其不变范围明确复用；第三版生成闭环经记录修复后 8 个唯一场景取得通过证据，四次完整运行 13 次执行，另有被中断首轮，不是一次全过。受影响最终4/4通过，512手绘/海床最大进度间隔173.3/231.7ms、运行中取消22.8/21.1ms，原250/500ms门不变。
- 最终构建元数据 SHA256 030acfa1abf79cc553b03f8b1303f5fae3743e1d03a4d52e0d0245bfe84ef395；完整 dist 集合 ae3349ed4d873ecc1334b20d288fa8288f456d89ba854f23b048af767a25d419。build.json 中 fa98b8c 是构建基础 HEAD，实际源内容由归档冻结清单绑定。最新本地提交另查 Git 和 .autopilot/checkpoint.json。
- 证据与所有失败说明见 docs/evidence/2026-09-27-ph06-zoom-and-completion.md 和 docs/evidence/ph06-zoom-density-2026-09-27/verification.json。未新跑全量旧1211单元；不将分批/复用结果说成全量首轮通过。真实手机、用户自然视觉仍待验。
- ADR0016 独立细海岸内核16项通过，尚未接通第四版世界。距离索引、v4格式、真实GPU裁切和自然手绘生成在 .autopilot/ph06/v4-*-staging/ 分目录暂存，未统一验证、不能当作生产功能。接入前先保存 preview.6 实际 Git/构建生成器闭包指纹，保护旧存档，不覆盖原历史。
- 本地试玩仍为 http://127.0.0.1:4173/?atlas=atlas-5fa3eb44-f9e4-461f-9297-30fab36fa12a&atlas-format=3 ；新建为 http://127.0.0.1:4173/?atlas=new&atlas-format=3 。第四版入口尚未提供。续接须验证预览进程与HTTP构建，不假设常驻。
- Git分支 codex/ph06-world-generation；远端记录仍为 Ethanhui6/lieguoji-web，Pages lieguoji-web，唯一原生Git链。旧线上保留，本轮零云端写入；暂存功能不上传。

---

# V4 当前续接入口：preview.5 权威裁切海岸技术范围组合通过，自然视觉仍未通过

2026-09-27：用户再次否定规则大陆轮廓，要求手绘创世、行政区、国家、城市与可见军队战争的完整体验。本批 `0.5.0-preview.5` 已接入独立 Atlas v3：存档明示地表合同，实际海陆分片共同用于显示、拾取与面积；邻接编辑也受真实岸线／高程锁保护。旧 v1/v2 原语义保留，进入 v3 必须新建或明确创建独立副本。尚不能称为用户要求的完整游戏。

- 本批游戏代码本地提交 `08a69c23795727dc520885d824426c50d03c7e99`，分支 `codex/ph06-world-generation`，未推送、未发布。构建先于提交完成，元数据仍记录基础 HEAD `17f9f333b964674f84e66a68ac09003c81d93e14`；实际已检源码由冻结清单绑定，后续交接文档提交不改变游戏产物。实际最终 HEAD 另记忽略目录检查点。
- 全量首轮 `.autopilot/ph06/coastal-checks/first` 为 **1210/1211**、67 文件、406.75 秒；唯一失败为旧 v1 拒绝文案断言。仅改准确文案后，真实 Node 定向 **1/1**、6.01 秒，另外47项未选中；先前 shell 定向70项全未选中不算通过。其余1210项、22发布检查和计划检查复用。修复后全局 lint／类型／生产构建及25个产物审计通过，产品源码未因测试修复改变。
- 三端浏览器首轮 `wording-recheck` **12/18**、671209.222ms；6项失败属于漏开旧工坊“世界”面板和副本文案“海陆／陆海”顺序两类脚本问题。只修测试后，`entry-copy-recheck` 完整复跑6项 **6/6**、61179.141ms、exit0，保留完整身份／隔离／刷新断言。最终 **18个唯一场景通过、24次实际执行、零自动重试**，不称首轮18/18。
- 既存 `wording-recheck/http-before.json` 实测本地 `http://127.0.0.1:4173/build.json` HTTP200且匹配 dist；构建 SHA256 `0ea1d390111d836e99ab639961c5c8bb30f39b198869dddbd9cfb89449465bf8`。已从既存清单确认首轮来源249条、复核250条，两轮各自源码及25个dist产物前后稳定，修测试未改变产品源码或产物。统一结论、原始results、来源／产物清单和6张截图归档于 `docs/evidence/ph06-coastal-surface-2026-09-27/`，入口 `verification.json`；未重扫生成替代来源清单。
- PH06-T3/T4 保持 **in_progress**；7项性能／取消浏览器未跑，真机和自然视觉未验收。当前创世主线尚无国家、城市、兵种与战争；不能用旧战役或本轮海岸技术通过代替。下一步继续处理自然大陆轮廓与近景细节差距，再按依赖推进PH06；全PH发布门保留。
- 本地实际试玩副本：`http://127.0.0.1:4173/?atlas=atlas-5fa3eb44-f9e4-461f-9297-30fab36fa12a&atlas-format=3`，在应用内浏览器由旧演示v2修订3明确复制为v3修订0，刷新恢复、控制台无错误；只适用于该浏览器本地保存。新建入口 `http://127.0.0.1:4173/?atlas=new&atlas-format=3`。这是本地预览，不是新增Cloudflare部署。仓库仍为 Ethanhui6/lieguoji-web，Pages lieguoji-web，唯一原生Git链不变；本批没有云端写入或新增授权需求。

---

# preview.4 历史续接：连续地表技术通过，真实海岸当时仍待细化

2026-09-27 最新用户纠正：明确拒绝放大后逐块像素／纯色地块效果，要求特别对照 Steam《架空地图模拟器》的实际画面。当前本地 `0.5.0-preview.4` 连续地表显示与可选网格技术范围已通过：统一构建通过，浏览器首轮30/31后完整接缝三端3/3复核，31个唯一场景最终通过、共34次执行、零自动重试；首轮失败保留，不能写成首轮31/31。真实岸线细分和用户视觉验收仍未完成，PH06-T3 保持 in_progress；T1/T2 保持 done，T4 保持 in_progress，PH06 不结项，PH07 不实施。已完成的海床技术证据保留，但不代替用户视觉要求。全 PH 发布锁保留，旧 9/24 单次试玩授权已使用完，新本地代码没有云端写入授权，旧试玩候选门为 pending。

2026-09-24 历史授权。用户要求逐 PH 推进到最后一 PH，完成后自动进入下一项，不逐批询问。最终为巨大可编辑世界、多国独立行政制度、家族和信仰、iOS质感的网页/PWA单机游戏。默认仍是全部 PH00—PH35、真机及用户视觉验收之前禁止发布。其后要求上传试玩的单次例外仅覆盖已经上传的 90cdabc 分支预览，不覆盖本轮本地变更；不改 main、不伪造 PH 完成，详见 docs/PLAYTEST_RELEASE_2026-09-24.md。

- 当前游戏代码提交 `147702e8c87e529f75b399f61503f58c9ea85e11`，分支 `codex/ph06-world-generation`，本批仅本地提交、没有推送。构建在此提交前完成，元数据 commit 字段仍是基础提交 `1b556e5`，实际运行源码和产物由下述冻结清单绑定；后续仅记录性提交不改变该构建。当前焦点为 PH06-T3 连续地形／海岸的视觉纠正；preview.4 使用真实 quad 四三角、同海陆类别共享角点插值与权威中心高程，海陆独立 height×light LUT；网格默认隐藏，玩家主动开启后仅 near 可见。显示重建不改存档高程与几何，真实岸线仍依权威共享边，尚未完成更细真实岸线。任务仍以 `plan/tasks.json` 为准。
- 当前统一 `.autopilot/ph06/continuous-checks/run.mjs first` 的 `build:cf` 实际 exit 0：1164/1164 单元、62 文件、408.66 秒，22/22 发布门、lint／类型检查／构建及 25 个 dist 产物审计通过。构建起止 `2026-09-27T03:50:29.665Z`→`03:57:53.338Z`，证据 `first/build.log`、`first/build-execution.json`。最终 `dist/build.json` SHA256 `c096754324425cc86e6fc3b9e81839362f8853c8d35ae14b3d1708f060d8b427`，commit 字段 1b556e5 仍为未提交改动的基础 HEAD。浏览器覆盖 rendering 三端27＋细海岸三端3＋桌面真实大陆ocean保存恢复1：首轮30/31、800568.703ms、exec33761 exit1，唯一失败为mobile近景probe越界(-33,700)，发生在读像素前。只修真实UI相机构图，保留全部世界坐标、±3物理像素条、RGB≤1及次数，随后整个接缝用例三端3/3、40029.362ms、exec65530 exit0，新的全局lint/typecheck也通过。最终31唯一场景通过、34次执行、零自动重试；完整证据 `docs/evidence/ph06-continuous-2026-09-27/verification.json`，不得称首轮31/31。
- 本轮来源使用既存 `first/source-before.json`，实际 **240 条**，未重新扫描。清单 compact JSON 集合 SHA256 `9c8a8808ffa14c663b7994a23e7c1c5d8d28971ee8ccec4c048b2a1c4d1c00aa`；清单原始文件 SHA256 `443c7474baf2f77507c381b0c29f4921da8b7fce3c4142f50e9759aecaf4d848`。首轮来源/全部dist前后稳定；复核归档 `source-recheck.json` 实际242条，集合SHA256 `a616a2232e3377948043778c36885ae7d987f04157964a9f0155c47bf3eea8a3`，文件SHA256 `115fbce5f14c8e1776272b76102f231b6725d64419cc03c8b0ce4b89945da9f6`。两轮共有文件仅 `tests/atlas-rendering.spec.ts` 的相机构图改变，另加两份复核runner/config，实际产品源码与25个dist产物完全一致。first240/recheck242清单已归档在 `docs/evidence/ph06-continuous-2026-09-27/`，不重新扫描；后续计划/文档更新不在历史运行快照内。
- 本轮定向证据：surface/material 首轮 13/13；renderer 相关首轮 88/89，唯一失败为已失效的旧 `Graphics.fill` 调用计数 oracle，改为等价真实 mesh triangle 几何断言后单项 1/1 复查通过，无 unhandled，保留 first 日志，不称作首轮 89/89。Root另在真实IAB对本地演示“山海新卷 · 手绘试玩”revision2 reload、放大204%／306%；又使用旧海岸工具强度1000/4轮，UI预览报告1089地块/546顶点，确认后实际reload为revision3，console `[]`，见归档 `local-playtest-observation.json`。这是UI烟测，报告数量不是独立二进制审计；旧工具没有增加亚地块权威海岸几何，不代表真机、用户视觉或云端发布。
- Root 已实际浏览官方 `fantasymapsimulator.com` 的 `screenshot-1.webp`、`screenshot-4.webp`，以及官网链接视频 `https://www.youtube.com/watch?v=cOBavAtMod0` 的 0:02／0:34／0:49 画面。这是具名画面观察，不仅是文字检索；不扩大为完整游戏体验，也不复制其素材或界面。
- 海床 `0.5.0-preview.3` 技术基线 `build:cf` 实际 exit 0：1146/1146 单元、60 文件、408.09 秒，22/22 发布门、lint/类型/构建及 25 产物全部通过；日志 `.autopilot/ph06/ocean-checks/build-first.log`。`dist/build.json` SHA256 `17e4aa3cfdcb42d96163b107a5bfea1556cadd0912113cbcfbc124089c96cc3d`；commit 字段 1b556e5 是构建时未提交源码的基础 HEAD。海床＋手绘三端浏览器 12/12 首轮通过，635.72778 秒，零失败／重试／跳过；来源和全部 dist 产物前后不变，证据 `docs/evidence/ph06-ocean-2026-09-27/browser-verification.json`。这些技术结果不代表连续地形视觉已获用户认可，不覆盖随后尚未验证的修改。
- 后补 7 项 PH06-T4 窄测试已写入，但浏览器从未启动，现因视觉优先暂缓。最后 3 处审查强化已由本轮全局 lint／类型检查覆盖；静态通过不能称为 7 项行为／性能已验。旧日志保留；当前仅引用 root 的冻结来源清单，不重新扫描源码。
- 手绘首批 `0.5.0-preview.2`：统一 1106/1106 单元、22/22 发布门、lint/类型/构建/25 产物通过；其后窗口变化保护另验 75/75 渲染单元，不合并称为单轮最终全量。首轮手绘三端浏览器 6/6（269.697秒）、渲染三端 24/24（401.872秒）、区域锁/旧入口三端 6/6（83.225秒）分别全过，均零重试、失败、跳过和 flaky。报告见 `.autopilot/ph06/handdraw-checks/{browser-first,render-browser-first,browser-regressions-first}/results.json`，归档说明 `docs/evidence/2026-09-27-ph06-handdraw.md`。
- 首批固定构建元数据 SHA256 `9c3d43ed6f1d276589f472702ae75b60b5a0923a8d71d9121fcb15eb585bb70b`，源集合 SHA256 `0029b59e996b4a25edf466dde46ca30c3b573d3d3ecabe5020b88638f513942e`，证据 `docs/evidence/ph06-handdraw-2026-09-27/{build.json,sources.json}`。构建的 commit 字段是当时基础 HEAD 90cdabc，不能替代未提交源码快照；这些通过结果不自动覆盖下一批 preview.3。
- 已验证海床操作保持空白 v2 的 -100 米创建合同，通过显式配方生成与世界边界连通的负高程海域，保留内陆负洼、全部陆地、几何、归属与区域锁；有岸生成陆架向海盆过渡，空海也可生成深海。真实数据与保存闭环有效，preview.4连续显示的受影响浏览器已按首轮+复核组合通过；下一批继续PH06真实权威海岸细化，阶梯海岸的真实几何细分和用户视觉要求尚未验收，T3保持进行中。水系、气候、国家管理、城市、家族等后继 PH 未因此完成。
- 9/24 试玩实际已上传：`https://a2cb06be.lieguoji-web.pages.dev/`，Pages 原生 Git 分支预览，部署 `a2cb06be-416b-481d-88f2-0270a0ce0247`，提交 90cdabc。9/27 实际 HTTP build.json 仍匹配。原在线三端核心 6/6、资源 23/23 成功，属旧发布证据。
- 旧 GitHub CI `35956425996` 已终态失败：22 发布门、1049 单测、lint/类型/构建通过，浏览器 153/156，3 项为同一过时入口地址期待。本地已严格修正路径和两个必要参数，首批旧入口三端回归已通过，云端结果仍保留失败；当前工作不等待旧 CI，也不借此重推。详情 `.autopilot/ph06/release-followup-20260927.json`。
- 唯一任务状态：plan/tasks.json；执行指令：CODEX_AUTOPILOT_V4.md；世界/视觉合同：docs/WORLD_V4.md、docs/DESIGN_V4.md；发布门：docs/RELEASE_POLICY_V4.md。
- PH00—PH05 已完成，PH06 仍 in_progress。PH03 是具名硬件上的真实规模测量与后继性能合同，不是完整游戏支持容量或性能PASS。标准65,536地理样本目标保留；262,144高实体档帧间隔p95为28.6—35.6ms，尚不达桌面目标。2048结构历史刷新读库约1.2s、完整校验载入约281s，明确由PH04/28/33解决，不能绕过验证。
- PH03最终本地检查：569单测/24文件、14发布策略、lint、类型、生产构建及23产物审计通过。八份浏览器原报告包含保留的早期smoke失败；正式matrix290步骤、实体9组/54次传输、controls129步骤、长历史14步骤、guards6步骤、移动仿真34步骤均执行完成。mobile是桌面RTX上的Pixel参数，不是真手机。
- 原始报告、源码快照、设备、SHA、截图及摘要均在docs/evidence/ph03/；结论docs/evidence/2026-09-24-ph03-scale.md，锁定门槛ADR0008。首次smoke的favicon404、最初报告误计缓存、取消和绘图锁修复均保留，不抹成首轮全过。
- PH04-T1/T2核心已完成：独立生产草稿格式，地理/模拟区/行政membership分离，稳定ID、唯一共享顶点、跨块邻接和空间索引。首批合并检查96/96通过，其中69项新core、27项既有worldgen；lint/类型通过，本地提交ceddb31647d055c18ba9fc0a9da940ea2245a4bb。证据docs/evidence/2026-09-24-ph04-chunked-world.md，设计ADR0009。不要将src/bench的ScaleFixture注册为生产引擎，不迁移旧档；world3/rules0.3完整模拟仍未实现。
- PH04全部完成本地验收：独立生产Atlas草稿/共享顶点/分块索引/Worker/原子主备与完整根CAS/容量/备份副本/实际编辑与恢复。最终build:cf **776/776单测、33文件、14发布策略、lint/类型/25产物通过**；最终8×3浏览器 **24/24、195.014秒、零重试/flaky/跳过**。旧入口81例为此前v1构建证据，最终776仍含冻结引擎golden。详见docs/evidence/ph04/verification.json与阶段证据文档。
- PH04性能13项门全部通过：100笔完整Worker观察计算p9521.1ms、确认至保存/CPU正确画面p9551.1ms/max62.9ms；10初存max2671.8ms、10新页面全校验恢复max1657.9ms；三规模wire变化8.09%，全部可见进度max109.8ms，10次提交前取消max8.3ms且源根/键不变。精确127文件来源dd311e07...、dist d4228157...和全部raw在docs/evidence/ph04/performance-v4与source-snapshots。所有初次失败保留，未改阈值；此范围不是完整社会规则/真实手机/物理屏幕性能。
- PH05-T1—T4全部完成：共享相机、真实拾取、视口裁剪、受限几何/纹理缓存、标签避让、远中近LOD、GPU丢失恢复与压力验收，已本地提交并进入PH06。
- PH05最新构建856/856单测、37文件、14发布检查、lint/类型/25产物通过；完整三端浏览器单轮48/48、466.161秒、零重试/flaky/跳过。另有实际像素/双GPU恢复定向6/6。记录checks/terrain-integration-build、terrain-full-browser、terrain-pixel-browser-direct，历史失败完整保留。
- PH05-T4最终四配置正式验收72/72有效，全部原时间目标通过；headless DPR1/DPR2、headed DPR1/DPR2的最大rAF间隔分别46.4/89.3/36.0/68.0ms。统一source 6d02caf87c5af65e0bd882c7f29b644cbd7580633386e72f4bd6356a29e053f6，dist ec306820bb90ec941191b73f7000c9c32c5adee9cf91251e85afde639a5767f5。PH04四模式13/13原门通过。归档2154文件完整恢复，保存的原评估器再次通过72/72和13/13，见docs/evidence/ph05-verification/verification.json。正式结论见2026-09-24-ph05-rendering.md；未把rAF写成物理屏幕FPS，未把移动仿真写成真机。
- 本地预览和一次传输在会话续接中实际退出，失败/中断报告保留；仅在确认PID/端口失效后恢复。新进程信息.autopilot/ph05/preview-process.json，固定本地测量任务与终态在.autopilot/ph05/jobs。检查点.autopilot/LOCAL_HANDOFF.md已通过结构校验；它不是当前进程仍存活的证明，也不是新任务迁移。
- 当前试玩分支codex/ph06-world-generation；本次待上传PH06源码/浏览器/隐私证据统一绑定本地发布门，正式提交与云端build.json须核对。源基线为PH05最终本地提交f07e574eeaff3838d063fb194154ed2e73f06bbd（872文件，847个归档/恢复证据Git blob逐字节核验）；PH06四子项仍in_progress。PH04基线c131c9664d30da8aafa83114a9169359e6e57635。这段为发布前历史；90cdabc 实际已于 9/24 上传，实际结果见本文件顶部 9/27 续核，不能继续按“未上传”重推。
- 历史线上0.4.0：提交b9b8f96b40544ef8b7e1e428910fe2df64fec6f7，仓库Ethanhui6/lieguoji-web（私有），Pages lieguoji-web，唯一原生Git链，main生产/其他分支预览。稳定URL https://lieguoji-web.pages.dev/ ，固定URL https://a257d63e.lieguoji-web.pages.dev/ 。这些是此前核验的历史部署，本轮未触发云端。
- 尚未通过：生产大世界/完整社会规则/长局性能、真实iPhone/Android/平板、用户视觉验收及其余PH。正式五国地图/未知CANON/缺失原规划独立待核，不阻挡自建沙盒；不伪造通过。
- PH06历史0.5.0-preview.1统一构建通过：1049/1049单测、53文件、22/22发布策略、lint/类型/25产物。固定dist 0bdf3cb4…首轮核心浏览器10pass/3fail，三个岛链失败均为错误海底恒高断言，原设计允许真实海底过渡；限定测试修正后同构建三端岛链3/3通过，10+3组合覆盖13项（不写成单轮13/13），见docs/evidence/playtest-2026-09-24/browser/verification.json。三端256及桌面512的11次生成观测进度最大220.8ms、4次运行中取消10.4—16.7ms，原250/500ms门本次范围通过，旧960失败保留。区域锁已接真实存储/会话/Worker/Bridge/UI并通过当时三端功能；近景采样台阶与更广性能/视觉验收仍待完成，PH06仍in_progress。见docs/evidence/2026-09-24-ph06-generation.md与docs/evidence/playtest-2026-09-24/。
- 当前批PH06-T1/T2：独立v2草稿与旧档明确副本、可复现种子/大陆参数、真实生成候选预览、原子确认/取消/撤销与恢复；山系盆地岛链、细海岸与锁定局部重算必须实际实现验收，不能仅有类型或按钮。设计ADR0011，实施准备.autopilot/ph06-implementation-plan.md。
- 当前无需新增账号授权。普通本地工作自动推进；发生中断保存检查点。会话结束后不声称仍在后台开发。

PH01证据docs/evidence/2026-09-23-ph01-compatibility.md；PH02证据docs/evidence/2026-09-24-ph02-workbench.md。旧25任务摘要保持不变。冻结0.4核心与两套旧规则仍受原指纹和golden保护。

---

# 0.4 历史交接记录（以下发布节奏已由 V4 覆盖）

## 当前已发布版本

本批为 0.4.0 历史记录、只读回放与独立分支，任务源 `plan/tasks.json`，规则见 `docs/adr/0004-history-replay.md`，完整验收记录见 `docs/evidence/2026-09-23-history.md`。恢复时先核对本文件、Git 工作区/远端、当前 PR 与线上 `build.json`，不从头重建。

| 项目 | 已核验结果 |
| --- | --- |
| 工作目录 | `D:\游戏\架空地图模拟器` |
| 先前已发布基线 | `a25321b17c8d4292d92646ab40d48cfb341b0405` / 0.3.0 |
| M4 功能实现 | `8d716dda2c92373c62f87aef700c3d93984c4472` |
| 首屏地图测试修正 | `f33bb991bbbddc814849d8564ca571d431a65e67`；只改测试与验收说明 |
| 功能 PR | https://github.com/Ethanhui6/lieguoji-web/pull/19 |
| 最终 PR CI | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35868873630`；260 单测、60 浏览器首次通过 |
| CI 实际测试合并提交 | `075dce9f6b48c34bf8d0d647cb337c265b52af3b` |
| 最终分支预览 | `https://0100487d.lieguoji-web.pages.dev`；build.json 对应最终功能提交，15/15 首次通过 |
| 已验收生产功能提交 | `d60098f13087c43d4c0d6970f6450b24c8364ac3` |
| 生产 CI | `https://github.com/Ethanhui6/lieguoji-web/actions/runs/35870297239`；已核对实际 checkout，260 单测、60 浏览器首次通过 |
| 生产部署 ID | `8b9382c7-73cc-4ce2-b2e8-cf501c64feed` |
| 固定生产部署地址 | `https://8b9382c7.lieguoji-web.pages.dev` |
| 生产 HTTPS 验收场景数 | `27/27 首次通过，0 重试/flaky/跳过`；报告 .autopilot/m4-production-results.json |
| 稳定游玩入口 | https://lieguoji-web.pages.dev/ |

M4-001/002/003 已完成真实 CI、预览和生产 HTTPS 验收，任务标为 done，写入上表生产功能提交。M4-004 皇室保持 todo，M4 里程碑 #5 保持开放。后续交接提交也会触发原生部署，最新 HEAD、CI 和部署 ID 写入忽略文件 `.autopilot/checkpoint.json`；不要将功能验收 SHA 当成永远不变的最新 HEAD。

## 本批已实现的操作

在自建推演中打开「纪事 → 历史」，确认创建记录副本。副本从当前日开始，原局与未记录的过去不改、不补造。单日推进、军令与国家命令成功后分别编号，世界与完整记录一起自动保存。

回放在独立 Worker 中完整重算核验，可按序号或日期定位、播放暂停，并查看当时地图、部队和国家账册。回放期间不能下令或保存覆盖原局；退出恢复原 live 状态。分支确认冻结来源时点，再重验父局、序号与快照 hash，之后分配新身份独立推进。

`.history.json` 经校验和完整重算后，以新存储身份导入为只读归档；原包内部身份、输入与 hash 保持原样。继续推演须从归档创建分支。移动端可在工坊选回已登记的历史运行。

## 验收证据

- 本地 `build:cf` 已通过计划校验、ESLint、TypeScript、260 单测及生产构建，23 个严格白名单产物包含 sim/replay Worker。历史核心 40 项、历史存储 57 项，原有 163 项继续通过。
- 本地完整首轮 54/60，6 个失败是两项安全测试在三端误把成功新建分支/归档后的全库预算增长判为异常。源记录未变化；修为源完整字节/hash 不变，另核对新增主备预算。故障与取消仍要求全部证据不变。
- 第一次定向复测 6/9，分支断言替换位置未改对，已纠正。最终全部 12 项故障保护与 3 项回放运行检查 15/15，0 重试/flaky/跳过。60 个不同本地场景已有通过证据，不写成单轮 60/60。原始报告、trace 与截图保留在 `.autopilot/m4-local*`。
- 首个真实 PR CI https://github.com/Ethanhui6/lieguoji-web/actions/runs/35867427462：260 单测、60 浏览器首次全过。该运行属于实现提交 `8d716dd`，不替代后续修订的检查。
- 首个 HTTPS 预览 https://7b84ec2c.lieguoji-web.pages.dev/：23/24。桌面首次地图就绪的 5 秒断言结束时，Pixi 动态初始化资源仍在途；已完成 JavaScript 均 200/MIME 正确，未见控制台错误。只将首屏地图就绪设为明确 15 秒局部上限，保留其他检查与全局超时；修正后 6/6 通过。无缓存 MISS 证据，不把冷 CDN 当成已证实原因。
- 最终修订同提交 CI 260/60、Pages 预览 15/15，以及生产 CI 260/60、HTTPS 27/27 均首次通过，实际提交和地址见上表。首轮失败不得删除或改写为首次全过。

此前 M0/M1/M2 的工程、创世和保存闭环，以及 M3 的经营外交发布，分别保留在 `docs/evidence/2026-09-23-cloud.md`、`2026-09-23-world-studio.md`、`2026-09-23-statecraft.md`；旧阶段结果不冒充 M4 当前证据。

## 发布链与授权

GitHub 个人账号 `Ethanhui6`，私有仓库 https://github.com/Ethanhui6/lieguoji-web。M4 对应 Issue #16/#17/#18；已附实际验收证据并关闭。免费私有仓库分支保护 API 实际返回 403，保持私有/免费；采用当前 head CI 与预览通过后的受控合并，不声称平台强制门禁。

Cloudflare 账户 `0dccd3742e707d4f6506f2de668e516e`，Pages 项目 `lieguoji-web`。唯一原生 Git 链：main 自动生产，其余分支预览；项目根目录、Node `24.18.1`、`npm run build:cf`、只发布 `dist`。没有 Direct Upload/Actions 生产链，不需要 Actions 部署 Secret。当前无待完成登录或授权；不读取认证配置。

## 存档与恢复边界

旧 World schema1/rules0.1 保持原样；新世界 schema2/rules0.2。经营副本与历史记录副本均显式确认、另建身份，不静默迁移原档。历史库独立为 `lieguoji-history-v1`，运行使用 `run-h-` 身份；current/backup、revision CAS、总预算同事务管理。单历史最多 2048 输入 / 20 MiB，全库主备合计 200 MiB，浏览器实际配额可能更少。

记录持久化失败暂停并锁写，UI 与 Worker 回到已提交状态。未来内外版本先锁写；规则实现指纹不匹配时保留原包和最近快照，可导出，禁止直接重放或继续改写。指纹来自核心内容，不随 Git SHA 或文档提交变化。工坊登记失败时保留已创建记录并报告恢复编号，不删除原局或孤立记录。

Node `24.18.1`；`npm ci`、`npm run dev`、`npm run check`，首次浏览器环境需 `npx playwright install chromium`。本地预览 `http://127.0.0.1:4173/`，复用前查 `build.json`，不终止陌生进程。默认工坊，旧测试战役 `/?demo=1` 或 `/campaign/test`。不同网址不共享 IndexedDB，跨源通过文件导入导出迁移。

## 下一批与独立待验

下一批为 M4-004：先明确玩家自建世界的皇室人物、亲属、君主与继承沙盒规则，再拆分实现及版本化保存/回放验收。现有 dynastyId 引用不等于皇室系统完成；不补造 CANON 未确认的正式人物、亲属或继承。

本地设计草案 `.autopilot/m4-004-design.md` 已调查旧引擎兼容：固定 0.4 五文件闭包，按完整内容指纹分派旧记录的验证、seek、哈希与账册；不得重写原指纹或默认把已发布旧记录全部锁成不能回放。尚未接入应用，不算兼容层实现完成。`.autopilot/compat-0.4/` 留有固定 Git 源、manifest、生成器与独立验证器；rules0.2 和 rules0.1 两份合成 golden 各 70 输入、#32/#64 检查点，各 71/71 序号重算通过。只含项目合成测试数据；既有预期不得随新规则重新生成。续接先读其 README 与 legacy-provenance，再实施真正的指纹分派与新规则。

ACCEPT-MAP 与 M2-PLAN 继续 blocked：首次目录为空，原 v2/100 项规划、地图参考与正式轮廓尚缺；补缺计划不冒充原计划。M5 第一次长征仍依赖 M4-004、正式地图及确认剧情；M6 PWA 仍待实现。

桌面 Chrome、Pixel 7、iPad 均为 Chromium 仿真。ACCEPT-DEVICE 保持 pending_acceptance，真实 iPhone/Android、移动 Safari、低端设备长局与正式核图另验。贸易、跨省运粮、海军、谈判、征募与皇室模拟尚未实现。上述事项不阻塞已独立完成验收的自由沙盒历史功能。

额外长历史列表触控补查未完整通过：Pixel 7 上真实滚动及一次完整触控定位已观测，但连续滑动后单次点选出现不稳定，iPad 扩展流程未执行，原因尚未确定。详见 `docs/evidence/2026-09-23-history-touch.md`。这项并入 ACCEPT-DEVICE 待验，不能将 60 项常规 CI 或 27 项 HTTPS 通过表述为所有触控行为通过。下一批先保留并定位该交互问题，再完成相应验收；不得用强制点击或额外重复运行冒充修复。

普通工程、检查、提交与本项目免费部署已获授权；新增登录/App 扩权、秘密输入、账户选择或高风险操作由用户介入。会话结束后不声称仍在后台开发。

### PH03 测量检查点（2026-09-24，仍未完成）

9组联合地图实测290步骤已完成，无执行/页面/控制台错误；262k帧时未达桌面目标，不能写成性能通过。PH03-T1已有固定种子、三档三景及完整摘要/编辑/恢复证据，标done；T2/T3仍测量中，T4未签收。v2整批558单测、14发布门、23生产产物检查通过；9组独立实体/54次真实传输已完成。见docs/evidence/2026-09-24-ph03-scale.md。

当前仅本地分支codex/ph03-world-scale，HEAD仍9e315b24f5311691eefce39974fe884d2baa87eb，本批未提交。实验指纹v1 53543b04a578aadb0b0f672c58eec54f76487019320eeb8c3398676db8e77c53；v2 d5b5e8c6ec2b9af2d24b058f009cbcaff6014d2362b49aa65f45aba7214402cc。精确源码快照和原始结果在.autopilot/ph03/。当前controls实测未结束，禁止并行CPU测试/构建或另一个浏览器基准。之后执行standard的64/512/2048长历史与mobile仿真，核对实际结果后才签收PH03并实施PH04。ADR0009仅为待实施设计。全部PH前禁止push/远程写入/部署，旧线上0.4.0保持历史基线。
