# V4 当前续接入口：本地开发，发布锁定

2026-09-23 用户最新确认：要巨大精细地图、多国可自定义行政制度、深入家族/信仰、iOS质感UI；最终网页/PWA独立游戏。**全部PH00—PH35与真机/用户视觉验收以前，不push任何分支，不做任何新云端写入或发布包上传。** 现有站保留。用户已明确要求逐PH实现直至最后一PH，完成一PH后自动进入下一PH，不逐批询问；已建立持续目标，文档完成不等于游戏完成。

- 当前指令：CODEX_AUTOPILOT_V4.md；范围/依赖：docs/PH_ROADMAP_V4.md、plan/tasks.json；设计与世界：docs/DESIGN_V4.md、docs/WORLD_V4.md。
- 发布锁：docs/RELEASE_POLICY_V4.md、plan/release-readiness.json；只有全部PH及十项最终验收真实完成、源指纹匹配才可准备首次候选上传。后续CI/HTTPS单独记releaseVerification，不能事前伪造。
- 原25任务保留；新增36PH/144子项。PH00、PH01已完成：固定旧引擎/golden、完整指纹Worker/存储/UI分派、V4版本合同、显式副本及受保护原始备份。本地完整构建472单测与14发布策略通过；72个浏览器场景均有通过证据（首轮69/72，修正缺失链接显示断言后三端3/3，不写成首轮72/72）。PH02已完成单检查器/iOS质感基线、真实五项导航及阅读偏好；新增外观9/9，原72首轮66/72，修复通知遮挡及两类测试同步断言后受影响57/57；81个不同浏览器场景均有通过证据。下一步直接PH03大世界基准。旧皇室M4-004范围映射PH18—20，不跳过架构前置。
- 规则改变前已发起的旧版最终提交：b9b8f96b40544ef8b7e1e428910fe2df64fec6f7，版本0.4.0；部署a257d63e-95c8-48b0-bb11-c1447775bd03；https://a257d63e.lieguoji-web.pages.dev；稳定地址https://lieguoji-web.pages.dev/。
- 该旧版最终main CI35876437785真实260单测/60浏览器首次通过，最终HTTPS4/4、0重试/flaky。历史完整功能HTTPS27/27。证据.autopilot/final-release-0.4.0.json；这些不算新版PH通过。
- 长列表连续触控仍未验收；正式地图/未知正史、原规划与真机事项保持原状态。V4首发是原创自建沙盒，不偷偷补正式剧情。
- V4规划本地提交a88c859，PH01本地提交8291b376486e8d2b2fc75ce9fc1fac495f8000ce；当前开发分支codex/ph02-ios-workbench，PH02本地实现与验收已完成，待本次本地提交；包含浅深色/阅读偏好和真实三端界面。只做本地提交，未推送、未创建新云端资源、未打包发行。本地具体提交见.autopilot/checkpoint.json并核实git status；勿将线上b9b8f96当成本地修改已发布。
- PH00实际检查：36PH/144子项/旧25摘要与依赖校验通过，发布策略14/14，lint/类型通过；本地pre-push实跑退出1阻止未就绪上传，未执行网络push。core.hooksPath仅本项目.githooks，别处不改。普通本地开发可继续，发布锁仍locked。

规划与锁定证据见 docs/evidence/2026-09-23-v4-planning.md；当前PH01证据见 docs/evidence/2026-09-23-ph01-compatibility.md、规则边界见ADR0006；PH02证据见docs/evidence/2026-09-24-ph02-workbench.md及ADR0007。本地检查点 .autopilot/checkpoint.json 以V4状态覆盖旧“下一步发布”字段；不要恢复旧发布指令。会话停止后不声称仍在后台开发。

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
