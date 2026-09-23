# 架构

React 管理界面，PixiJS 8 负责二维地图；地图读取 World 快照而不自行模拟战争。
src/sim 为纯 TypeScript 确定性规则与测试大陆数据；sim.worker.ts 是浏览器 Web Worker，所有运行中命令/步进经带请求 ID 的消息执行。
useGame.ts 负责线程请求、超时、暂停调速和持久化接口；切页或卸载终止线程。预览调用同一 sim-core 规则，确认时由 Worker 再校验。
Province 分 legalOwner/controller；Nation 分 regimeId/dynastyId；City position/label 独立。没有首都失守即灭国规则。
IndexedDB 保存当前槽和前次有效备份。SHA-256 校验 JSON 世界对象；旧版 schema1/rules0.1.0 与新版 schema2/rules0.2.0 明确分发，不进行静默或破坏性迁移。
网页只包含应用、演示数据和必要静态资源；无 Cloudflare 后端循环，不使用 D1/R2/DO。

## 世界工坊 0.2.0

RootApp 管理工坊、测试战役、自建推演路由。默认 `/` 打开工坊；`?demo=1` 和 `/campaign/test` 进入旧规则样例；`?world=run-…` 只恢复对应本地存档，缺档明确失败，不生成另一个世界。模拟界面/Pixi 延迟加载，工坊首屏不等待全部渲染后端。

worldgen/engine 纯函数负责 640 单元 Voronoi 拓扑、种子地理、连续笔刷、国家扩张和城市首都校验。草稿允许未完成内容；compileWorld 要求全部陆地已分国且每国恰有一座合法首都。海洋不进入 Province 集合，岛屿不会跨海邻接。世界编译后沿用同一 Worker 和行军战斗核心。

StudioCanvas 使用 Canvas2D 缓存静态绘图；MapCanvas 使用 Pixi 缓存自建地图纹理，省略全图密集省名，军队作为动态层。地理噪声由种子复现，国家颜色来自归属，战斗结果由规则得出。custom-world 每国驻军在空闲时依据补给、兵力、地形和边境情况调动；不替换已有玩家行军/战斗/撤退。当前只有基础军事自主决策。

工坊数据库 `lieguoji-world-studio-v1` 保存 Workspace（草稿 + 历史索引），旧测试数据库名保持原样，每个自建运行使用 `lieguoji-custom-run-<uuid>-v1`。草稿和推演分别做 SHA-256、严格字段校验、主槽/前一有效备份、revision及主槽原值CAS比较。工坊三层版本不兼容均锁写；等待保存/开始/导入时通过同步操作锁与UI inert 阻止编辑覆盖旧快照。

开始推演先写入新世界独立库，再登记工坊历史，登记失败时不导航、不删除旧历史。工坊导入推演重新分配run身份；游戏内导入只接受同场景且同run身份，跨世界导入请回工坊。原0.1.0测试大陆JSON不增字段，rulesVersion仍为0.1.0，已有校验和保持兼容；旧客户端不会访问新世界数据库。

## 国家经营与外交 0.3.0

新运行世界使用 schema2/rules0.2.0，增加 version1 的 statecraft：省区人口/粮食、国家政策/最新实际账目/决策、规范化国家对的外交状态。新 compileWorld 以和平初始化，旧 schema1 世界仍沿用原军队规则。核心的纯报告函数用于界面读取，界面不另维护人口、粮食或外交状态。

国家政策、宣战、停战经新的 Worker state-action 请求执行，携带预览时的 day 与 nextEventId。预览先暂停并获取权威快照；确认再校验，过期则要求重做预览。地理控制、经济结算与敌对判定均由 sim-core 更新。

运行封装 version1/rules0.1 对应旧 World，version2/rules0.2 对应新版 World。编码在异步 checksum 前克隆，解码先检查内外版本组合、世界结构和原始 checksum；未知未来版本不回退旧备份。revision 必须为非负安全整数，CAS 与备份仍保留。数据库名、工坊 Draft/Workspace schema 不变。

旧自建世界的经营副本调用同一初始化器，沿用旧异国敌对语义；RootApp 先校验当前 run、操作锁和历史上限，写入新 run 独立库后登记历史，再导航。原运行库不写，不把创建副本伪装为原档升级。详细约束见 adr/0003-statecraft.md。
