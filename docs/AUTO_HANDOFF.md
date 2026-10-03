# 列国纪当前续接

更新：2026-10-03。先核 Git、源码、dist、本机服务和实际 IndexedDB，不重建工程。plan/tasks.json 为任务状态源。本批只做本地开发、检查与提交。

## 当前版本与试玩

- 分支 codex/ph06-world-generation。source/evidence 提交 **5c5de59e00b5054f781af70ae17be7c1445a81bf**；续接文档随后单独提交，最终以 git log 为准。构建基准 b3740e9bd4996be3706084dc3270b9846f2b93ab。
- package/dist **0.5.0-preview.30**。build.json SHA256 d8364036878203e7bd409e1e364e59dc848e1eecf7be58398b455cfe75558917。build.commit 保留真实构建时基准，不改写为后来提交。
- 最终源码清单 f7231feaccf1e0661610f5e17cb7c43df266c6982f77fe95c5cce14a62d30cb1；dist清单 c3c26a8f291c42511b2af3a0b6187857d4be3f56d8dd838f55775cfd90f447a5。完整检查在 checks/final，后续只有浏览器脚本更正，最后绑定 checks/touch-target。
- 本机 http://127.0.0.1:4173/ 已核实；[试玩三国归属编辑](http://127.0.0.1:4173/?country=country-903e9bd3-3b5e-43b6-9504-21228c33f87f)，同浏览器 IndexedDB 本地保存。原生页保留法理视图。未来继续先核实服务，不承诺进程常驻或会话结束后开发。
- 当前 v4“长岬列国 · 制度工坊”保持修订2、三国三城、11,087条领土/36页；岬湾507、临川658、云岚9922。两国制度保持 preview.29 已保存值，云岚仍未设定。原生预览曾圈选382地块将云岚实控移交岬湾，已经取消，没有将该实验写入原档。
- [来源v3](http://127.0.0.1:4173/?country=country-89a80bd7-2e1b-4760-85f5-d6a553f171da)、[旧v2](http://127.0.0.1:4173/?country=country-4c1a87a3-7f27-4e21-8bca-b1bd858fd9c0)、[旧v1](http://127.0.0.1:4173/?country=country-13d3982c-b8bf-4734-bd4d-1a36e979234e)、[原地理草稿](http://127.0.0.1:4173/?atlas=atlas-1e14963a-048c-47de-850a-7a8bd63556e3&atlas-format=4) 保留，摘要未变，不转正式设定。

## 本批实现与核验

1. PH10-T3：v4 手动圈选法理/实控移交，真实单字段变更、预览、取消、Worker确认重算、摘要及CAS保存、刷新和持久撤销。圈内第三方对应归属整笔拒绝；城市/首都整单元保护，最后法理领土保护；零实控国家仍保留。没有 schema 或旧档迁移。
2. 地图法理/实控双视图，填色、国界、标签锚点、土地拾取一致；状态解释双归属，切层不写世界且相机不动。视图按世界记忆。预览入口每次同步所编辑字段，修复取消后切层再预览会看不到变更的路径。
3. PH10-T4：未设定制度预览字段对齐，去除旧冗余差异。制度仍仅配置，不参与财政/继承/征募/行政区。

- 186/186相关单元、22发布门、全lint、类型、生产验证构建/dist通过；引擎和11地理生成器身份与preview.29相同。不是全仓单元重跑。
- 桌面 desktop-verified 2/2、平板仿真 tablet-final 2/2；手机仿真 mobile-verified 最后2/2通过。三端零自动重试。后续仅手机脚本增加真实放大步骤，桌面/平板结果明确复用；产品与dist相同，不宣称最终脚本全重跑。
- 保留 first 测试工厂类型错误、desktop-final未开面板、mobile-final在全图点中邻近城市触控区等失败记录。修改为精确命令类型、显式打开面板及手机真实缩放；未删除检查、缩小触控目标或注入状态。两份失败trace已审查，只含独立生成夹具与localhost请求。
- 原生三国页：382地块预览确实改变实控路径/边界，原存档未写；取消恢复原路径/标签。法理切层刷新保留，旧v1/v2/v3及v4摘要不变。控制台无错误/警告；16个实际脚本/CSS/Worker绑定dist。真实原档只做预览/取消，确认/撤销由隔离浏览器夹具与Worker/IDB测试覆盖。
- [本批报告](evidence/2026-10-03-country-ownership.md)、[原件归档](evidence/country-ownership-2026-10-03/verification.json)、[暂存检查点](evidence/2026-10-03-country-ownership-checkpoint.json)。182份原件/58,342,919字节已逐项校验暂存字节；保留两份较大的失败trace。真实存档仅身份/计数/摘要及有限实体规则，不导出完整领土存档；不含凭证。

## 状态、限制与下一批

- PH10-T3由todo推进in_progress；PH10-T4保持in_progress并补证据。PH09/PH10均未整体验收，没有新增整PH done，没有跨过发布门。正式CANON、核图、正史、真机和用户视觉独立待验。
- 国家编辑已可用，但自动国家/原创纹章、行政树、省州县规划、城市街廓/道路/港口/人口经济、家族/信仰、外交/兵种/大世界战争与完整PWA循环仍未完成。不能将手动实控编辑当作战争占领。
- 自然地貌本批未重做；不规则共享直边单元仍存在，圈选按单元中心，不能声称任意曲线划界。稠密国名/城名层级、视图切换和冷加载等待仍需完善；本批不是性能或自然视觉通过。手机全图小区域可能落在城市触控范围，放大可区分。
- **下一批1—3项**：优先闭合PH09图层/导航（搜索定位、视口返回与密集标签），同时处理大世界交互等待；再按依赖补PH10剩余建国能力。PH10/PH04满足后进入PH11各国行政树，之后PH12/13自动/手动区划。不用家族/信仰空面板跳过依赖。PH07持久河网/湖泊/出口保留，地理生成修改前冻结preview24闭包。
- 容量规则不变：政治网格最多262,144种子；v2/v3/v4领土最多65,536；512KiB消息，领土页1024条/32KiB，累计不可变分块64MiB后拒写，无GC。显示200,000细片/边段及32Mi路径字符预算保留，超限报错不丢数据。

## 发布与授权

本批只读核实 remote https://github.com/Ethanhui6/lieguoji-web.git，hooksPath=.githooks。历史Pages项目lieguoji-web，唯一生产链是原生Git（main生产、其他分支预览）。旧站 https://lieguoji-web.pages.dev/ 本批未部署，也没有重新验云端。

9月24一次试玩例外已消耗。全部PH及必要验收完成前禁止push、远程PR/Issue/Milestone/Release及Pages触发；不绕过pre-push、不创建第二部署链。当前无需登录/App/秘密输入。会话结束后不继续后台开发。

历史：[29制度](evidence/2026-10-03-country-institution.md)、[28领土移除](evidence/2026-10-03-country-response.md)、[27自然国界](evidence/2026-10-03-country-natural.md)、[26分块圈地](evidence/2026-10-03-country-scale.md)、[25建国](evidence/2026-10-03-country-world.md)、[24岸湾与汇流](evidence/2026-10-03-ph06-coast-ph07-macro.md)。
