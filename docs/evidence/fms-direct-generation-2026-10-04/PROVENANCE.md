# 纯高度模块复用来源与范围

本记录对应 2026-10-04 的本地正式适配批次，不授权云端发布，也不把任何 PH 自动标为完成。用户已明确授权只读分析其 FantasyMapSimulator 安装包并在本项目适配所选代码与数据。第三方代码的许可分别保留，不将整个安装包统称为项目原创代码。

## 选定来源与最小白名单

选定研究基线为 `.autopilot/fms-audit/binary/recovered/terrain-adapter.js`：75,624 字节，SHA-256 `420dc9d9dd795406a7334848ec11ee58cb1865d2756ab3b07257a08a9f307c31`。`adapter-extraction.json` 记录其声明在恢复脚本中的来源跨度及适配差异。完整 recovered main、原始 TextAsset、安装包、DLL、metadata/dump、封装常量和完整 BasicMap 不进入 `src` 或 `dist`。

本批实施白名单仅为四个模板：`archipelago`、`continents`、`highIsland`、`pangea`，以及它们必需的纯数值高度操作、显式 seed 的 Alea PRNG、项目新建的拓扑与输入边界。它们覆盖 Hill/Pit/Range/Trough/Strait、Add/Multiply、Smooth/Mask；不需要 Invert、图片加载、HelloWorld、名称库、国家/文化/宗教、气候、河流、城市或 Unity 桥接模块。

已落盘并只读核对的正式适配位置为 `src/world/recovered-terrain/{contract,alea,numeric,templates,engine,topology,research}.ts` 与薄导出 `src/world/seed-terrain.ts`。这份白名单是来源范围，不替代固定 seed 对照、Worker 边界和浏览器验收。

对研究 adapter 做静态 AST 依赖闭包分析时，完整 HeightmapGenerator 声明只依赖选出的 16 项：`HeightmapGenerator`、`createTypedArray`、`heightmapTemplates`、`aleaPRNG`、`getNumberInRange`、`lim`、`d3range`、`d3scan`、`P`、`d3mean`、`rand`、`minmax`、`getTypedArray`、`UINT8_MAX`、`UINT16_MAX`、`UINT32_MAX`。因高度固定在 0–100，项目适配可用 Uint8Array 替代通用 typed-array 工厂。其余 18 个先前提取的公共 helper 不必进入本批产品。

## 已核对的第三方许可

2026-10-04 再次读取以下官方固定提交的原始许可证，核对当前本地全文；不以文件名或游戏所有权代替第三方许可。

| 组成 | 可证实的来源 | 保留内容 |
|---|---|---|
| Alea PRNG 1.1 | [macmcmeans/aleaPRNG，e1afc01b16c076fadb79837157c19bff9671a110](https://github.com/macmcmeans/aleaPRNG/tree/e1afc01b16c076fadb79837157c19bff9671a110) | 原作 Johannes Baagøe 2010 MIT 署名、McMeans 2017–2020 衍生 BSD-3-Clause 完整条件和免责声明、完整原源码许可 notice |
| 高度操作与模板的 Azgaar 来源 | [Fantasy-Map-Generator，3d94b809dcde4747fa3bb8a7fe727508da2d5e5b](https://github.com/Azgaar/Fantasy-Map-Generator/tree/3d94b809dcde4747fa3bb8a7fe727508da2d5e5b) | Max Haniyeu (Azgaar) 2017–2024 版权及完整 MIT 许可 |

Alea 的 [BSD-3-Clause](https://github.com/macmcmeans/aleaPRNG/blob/e1afc01b16c076fadb79837157c19bff9671a110/LICENSE) 允许带修改的源码及二进制再分发，要求保留版权、条件、免责声明，并禁止未经许可借作者名义背书。其[源码开头 notice](https://github.com/macmcmeans/aleaPRNG/blob/e1afc01b16c076fadb79837157c19bff9671a110/aleaPRNG-1.1.js) 同时给出原作者 MIT 与衍生 BSD 署名。

Azgaar 的 [MIT 许可](https://github.com/Azgaar/Fantasy-Map-Generator/blob/3d94b809dcde4747fa3bb8a7fe727508da2d5e5b/LICENSE) 允许修改复用与分发，要求软件副本或实质部分保留版权和许可全文。现有证据支持此来源家族，**没有确定安装包所基于的历史 commit，也没有声称恢复代码与所引当前固定 commit 字节相同**。已恢复操作名、选定模板命令与官方源码的比较只是来源证据；Unity 修改和本项目适配另记。

完整许可以逐字副本保存在 `src/world/recovered-terrain/licenses/` 三个文件中，并在 `public/terrain-licenses.txt` 保留三份完整文本，供构建产物分发：

- `aleaPRNG-LICENSE.txt`
- `aleaPRNG-1.1-source-notice.txt`
- `Azgaar-Fantasy-Map-Generator-MIT.txt`

其中完整 Alea 源码 notice 为 1,926 字节，SHA-256 `41e45411392f1c9b12ce1e067d7b251a60af0b7b6f7e1de51d9456096a421549`。上一批曾有错误的 5 字节截断文件，已修正；本次逐字保留的是完整版本。

网页拓扑实际调用的 npm 组件与上述历史 helper 分开计：已核对本项目锁定/安装的 `d3-delaunay 6.0.4`、`delaunator 5.1.0`、`robust-predicates 3.0.3`，并再次读取各官方 tag 的许可。`public/terrain-licenses.txt` 也包含这三份安装组件的完整 LICENSE 原文，合计保留六份许可/notice 文本：

- [d3-delaunay v6.0.4](https://github.com/d3/d3-delaunay/blob/v6.0.4/LICENSE)：ISC，Observable, Inc. 2018–2021 和 Mapbox 2021 版权。
- [delaunator v5.1.0](https://github.com/mapbox/delaunator/blob/v5.1.0/LICENSE)：ISC，Mapbox 2026 版权。
- [robust-predicates v3.0.3](https://github.com/mourner/robust-predicates/blob/v3.0.3/LICENSE)：Unlicense 公有领域声明及免责声明。

这三项属于本项目网页拓扑依赖，不是从 Unity 安装包恢复的原始邻接实现，也不证明原作使用了这些版本。

## 三个 d3 命名 helper 的处理

高度模块实际只用到 `d3range`、`d3scan`、`d3mean`。恢复版是简化循环；与官方 [d3-array v3.2.4 range](https://github.com/d3/d3-array/blob/v3.2.4/src/range.js)、[scan](https://github.com/d3/d3-array/blob/v3.2.4/src/scan.js)、[mean](https://github.com/d3/d3-array/blob/v3.2.4/src/mean.js) 不是相同实现，精确历史来源未确定。不得仅凭命名宣称复制了该版本，或用其 ISC 许可伪造已核实的历史来源。

本批 `numeric.ts` 已以项目新写的有限数值 helper 替代这三段：`boundedIndices` 产生有限非负整数索引序列；`firstMinimumIndex` 在数值比较下保留首次最小项的索引；`finiteMean` 求有限数值数组的算术平均。输入域由核心边界约束，固定 seed 输出对照须确认随机调用顺序与结果未变。无需携带未使用的 d3randomNormal/d3max/d3median/d3min/d3sum，也不把它们留作未审查的备用能力。

## 必须显式保留的适配差异

- 使用私有 RNG/Math 状态，禁止改写全局 Math.random；必须提供 seed。
- Unity 单元定位已替换为对明确输入点的网页定位；网页 Delaunay/邻接不是原 Unity 拓扑。
- 所选安装包逻辑的 getLinePower 读取外层对象后采用默认 0.79；本批保留为 `legacyLinePower=0.79`。不能静默采用当前 Azgaar 另一实现并仍声称相同数值行为。
- 有界只读输入、已知模板、点数/邻接/工作预算、Worker 超时与取消需在正式入口执行。研究 adapter 的“图连通”本身不证明所有任意贪心路径必然终止。
- 高度 0–100 与海平面 20 来自已审查高度模块；后续转换为米、网页矩形边界、补外海均属于本项目明确约定，不能表述为原作测量。

## BasicMap 点网的真实限制

以下依据仅是此前解码的中立 `map-{1,2,4,8}-geometry.json`，没有读取个人存档、认证或 SDK 配置。四份文件均无显式世界 Width/Height、cellsX/cellsY、邻接、顶点或三角形；高程全零，seaLevel 保持 null。

| 随包文件 | 点数 | 实际坐标范围 x / y | 本次从排序观察到的列×行 |
|---|---:|---|---:|
| 1.save | 19,928 | 0.44–1595.62 / 0.47–899.5 | 188×106 |
| 2.save | 30,030 | 0.38–1600 / 0.35–900 | 231×130 |
| 4.save | 40,050 | 0.32–1600 / 0.31–899.67 | 267×150 |
| 8.save | 79,924 | 0.22–1598.24 / 0.23–898.66 | 377×212 |

行列观察方法：按相邻 x 回退超过全宽一半切分行，再逐行检查长度恒定、x 严格递增以及各行 y 范围严格分离，四份均满足。**这些是坐标观察推断，不是源文件保存的网格参数，也不是恢复了原邻接。** 1600×900 可作为显式网页重建窗口，不能冒称原边界已恢复。

研究适配器要求 cellsX×cellsY 等于点数，Invert 用行列反射，Strait 用 cellsX 设定宽度上限。所选四模板不使用 Invert，但不能随意改变点排序/列数后仍声称相同地形规则。1/2/4 的点数在 50,000 上限内；8 的 79,924 点超限，不能为了通过而静默丢点。原采样点没有完整矩形四角，也不能直接塞进目前要求四角与完整 Delaunay 的研究 v2 导入器。

本批直接生成推荐使用明确的新网页点网。若后续使用 BasicMap，应分开记录“原随包坐标、网页重建邻接、新生成高程”，显式设计裁切或边界转换并验证，不称为原作完整地图。原坐标数组、根 JSON 和封装工具仍留在 ignored scratch，本文件只提交数量、结构、来源和限制。

## 本次实施与运输边界核对

已对上述八个正式纯核心文件做 TypeScript AST 只读检查：未检出 DOM、网络、动态执行、Node process、Puerts/CS 标识符或全局 Math.random 赋值；模块外部依赖只见既有 `model` 工具与 `d3-delaunay`，不引用 ignored 研究目录或原游戏资源。三个源码许可副本与已审查原件逐字节一致，六份相关许可/notice 的全文均保留在公开许可文件。

2026-10-04 执行 `npx vitest run src/world/seed-terrain-worker.test.ts`，27 项通过，13.27 秒；单文件 ESLint 通过。它执行真实生成 Worker、既有导入 Worker、两个 receiver、512 KiB 包编码和 IndexedDB 提交/回执路径，只替换昂贵的生成与地形转换为合法小候选。覆盖输入快照、双 Worker 顺序、12 MiB 上限、请求白名单、13 类损坏/版本/摘要/缺片响应、两个预览阶段取消、原草稿不变、唯一新根、提交后取消与回执丢失恢复。该测试不冒充原算法等价、完整游戏移植、浏览器视觉或真机验收；真实高度核心对照另由核心测试记录。

公开许可文件当前为 8,583 字节，SHA-256 `057596c400e1b9323cd075f92db30cbd6f5b2d189b64df904f436b29298a20b3`。其内容仅为必要署名、官方来源链接及完整许可，不包含恢复脚本、封装信息、地图原始数据或认证内容。
