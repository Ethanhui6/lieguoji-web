# 列国纪原生迁移依据与阶段计划

基线：8ac1160，网页 0.5.46。当前为阶段 1，未实现地图或游戏规则，不表示原作还原完成。原目录 src/、ios/ 不修改。运行时只用 Apple SDK 与纯 Swift；XcodeGen 是 CI 工程生成工具，不打包进应用。

## 源码调查
- 地图：src/fms/model.ts 的 FmsDocument 含 worldId、revision、宽高、点、Uint32 三角索引、邻接、Int32 高程、可选地形锁；海平面 20。必须保留点与邻接顺序。
- 原作格网：original/original-grid.ts、original-document.ts，20k/30k/40k，1600×900，源站点经 Delaunay/Voronoi 构成多边形和共享边。original-politics.ts 以三角面投票映射到省份，填色与边界必须使用同一映射，不能平滑移动共享边。
- 省份/国家/城市：src/sim/types.ts。省份有 polygon、center、label、terrain、legalOwner 与 controller（必须区分）、neighbors、supply；国家有名称、颜色、首都、政体、王朝；城市有 provinceId、position、label、fort。基础 World 不是完整 culture47 状态。
- 战争与外交：play/civilization47-diplomatic-world.ts 的 PoliticalRun47 扩展 FoundingForces47，包含 diplomacy、nativeDiplomacy、vassalManager；联盟、宗主/附庸共同决定参战双方。战争不只是两国布尔开关。军队有士兵、士气、补给、行军路线、占领；海军与旅行状态另有账本。
- 文化：play/civilization47-names.ts、civilization47-population-types.ts。按启用文化生成国家、城市、人物名称；civilization、people、life、kin 以及家族、官职、属性账本共同构成状态。不可只复制显示名称。
- 生成：full-map-terrain.ts → world/recovered-terrain/engine.ts，以种子和模板产生高程；只允许空白无锁地图整图生成。settlement47-regions.ts 的 terrain-connected-unions-perimeter-v1 按地形连通区域和周长代价合并，确定性平局排序。随后 culture47-session.ts 创建人口、军队、外交等开局状态。
- 模拟：play/clock.ts 每日 120 tick。session-advance47.ts 以日界拆分，依次军事/行军、军队日决策、政治外交家族；批次拥有隔离候选与地理数据，成功才接受。UI 的帧数绝不能决定模拟时间。日历、月度生命周期、浮点舍入与随机顺序需要逐项对照测试。
- 存档：play/culture47-session.ts 的 lieguoji-culture-play journal v1/v2 保存 opening、actions、rule、engine、id、fork；culture47-storage.ts 使用 IndexedDB envelope（revision/checksum/journal/checkpoint）及 current/backup/origin。旧指纹不能任意重放。wire47.ts 的 typed arrays、Map、Set、undefined、特殊数值标签不是 Swift Codable 默认 JSON。

## 重写与复用边界
Swift 重写模型、确定性随机与时钟、生成、模拟、命令验证、存档；不嵌入 WKWebView 或 JavaScriptCore。按模块建立 TypeScript 参考输入/输出金样，校验整数、float32、排序及重放一致性后才标为还原。
可复用已在仓库的原作站点与文化 JSON、配色、合规图像资源；转换器只读 src，产物与来源哈希放 ios-native/Resources。系统 UI 使用 SF，不拷贝系统字体文件。纹理在 macOS 预处理为 ASTC，保留无压缩开发回退并记录显存。原作安装目录只读，认证配置、个人存档、审计中间文件不打包。
原生存档单独 schemaVersion/rulesVersion，Codable 原子写入 Documents，保留备份、拒绝未知版本。阶段 1 不创建伪世界存档。网页存档导入必须单独实现转换和校验，不承诺直接兼容。

## 分阶段交付
每阶段独立提交、Linux/macOS Core 测试、macOS archive、未签名 IPA，CI 未通过不称完成。
1. 骨架：XcodeGen、SwiftUI 导航、空 MTKView、120Hz 请求、帧时间叠层、手动 CI。真机验证启动/安全区/生命周期，空画面性能不代表地图性能。
2. 地图：导入真实站点/地形；预构建 tile GPU 缓冲，视锥裁剪、缩放 LOD、纹理图集/ASTC；UIKit 手势（平移惯性、中心捏合、双击、长按）与 CADisplayLink 增量镜头更新。渲染与拾取共享坐标变换和格网边。
3. 模拟：Core actor 独占可变状态，固定逻辑 tick，发布 Sendable 不可变快照；Metal 只读最新快照。分模块移植国家、战争、外交和时间推进；系统 sheet 面板显示真实状态。未移植规则显式列出，不用简化替代品冒充还原。
4. 完善：编辑器命令/撤销、Codable 存档与后台保存、字形图集与缩放分级/碰撞剔除、羊皮纸与海洋质感、无障碍与横竖屏、真机 Instruments 优化。后台申请有限执行时间并原子保存，不假设系统无限允许运行。

## 分层与性能验收
Core 为独立 Swift Package，无 UI/Metal；Render 为 MTKView + Metal，不用 SwiftUI 地块视图；UI 为 NavigationStack、系统工具栏/sheet、安全区、SF Symbols 与触感。
三缓冲限制在途 GPU 帧数，资源只在数据版本变化时更新。模拟与生成不在 MainActor，快照限频发布；手势不重建全图。
叠层统计 CADisplayLink 回调间隔的平均毫秒与最慢 1% 样本均值倒数（1% low），不是 GPU 完成耗时。地图阶段补充 GPU 时间和 draw call/tile 数。120Hz 请求不是实际 120fps 保证；真机须分别测静止、连续拖动、捏合、推演并记录温度/低电量模式/地图规模。目标 8.33ms；当前未测。
