> **仍然有效（2026-10-19）。** 本文是 [主计划](MASTER_PLAN.md) 的路线依据。当前方向、顺序和验收以主计划为准，不以本文另立阶段。

# Fantasy Map Simulator 网页移植分析（2026-10-17）

依据：只读分析用户自有安装目录 `D:\steam\steamapps\common\FantasyMapSimulator`（Unity 2021.3.36f1，IL2CPP，Windows x64，817MB）。没有读取 envs.log、个人存档、认证或 SDK 配置；没有运行原游戏。存档密钥等加载器常量只在本机私有目录使用，不进入仓库或网页产物。

## 1. 结论

没有 Unity 源工程，原游戏不能直接搬上网页：GameAssembly.dll 是编译后的原生代码，不能在浏览器运行；用 AssetRipper 之类拼回 Unity 工程只能得到资源和空方法，逻辑仍要重写。

可行路线是**以原作数据为准的重建**：原作的数据格式、内容数据、格网、贴图、字体和界面布局都能直接拿到；算法从 GameAssembly 逐个恢复。网页之前不像，是因为这几样都没有按原作来：

| 方面 | 原作实际 | 网页现状 |
|---|---|---|
| 画布 | 1600×900（16:9），Azgaar 式抖动格网，内置 2万/3万/4万/8万格四档 | 1536×1536 正方形，36,864 点 |
| 地图画法 | 每个 Voronoi 格子一块纯色网格；国家色按格铺、透明度 0.8；平滑国界/海岸墨线；SDF 海面；羊皮纸纹理 | 三角网插值连续渐变 + 光照 + 半透明省份多边形 |
| 数据 | 每格数组：Elevation/Biom/Culture/Burg/State/Province…，外加 States/Armies/Wars/Diplomacy | 自定义 sim 世界与日志格式 |
| 时间 | `SecondsPerDay = 0.1`：1 倍速 = 每秒 10 游戏日；State/Province/Army 按批轮转更新（如省份每帧 10 个） | Worker 每天全量推演约 200ms，整页 2–3 日/秒 |
| 界面 | Unity UGUI，场景 level0 中 10,175 个 RectTransform；原作字体与图标 | 自写 iOS 风格卡片 |

## 2. 可以直接拿到的原作材料

1. **存档格式 = 原作数据模型。** `StreamingAssets/BasicMap/*.save` 解开后是 JSON：`WorldData.CellData` 各格数组与 `SerializablePos`（格点坐标）、河流、航线；`StateData`、`ProvinceData`、`ArmyData`、`WarData`、`DiplomacyData`、`CampaignData`、`HistoryData`、`VassalData`、`TimeManagerData`。加密为 AES-256-CBC（零 IV）→ Base64 → GZip（`SaveSystem.DecryptString` / `StreamDecryptAndDecompressSaveToFile`）。
2. **内置格网。** 四个 BasicMap 是空白全海格网，坐标 0–1600×0–900。1 号 19,928 格 = Azgaar `getJitteredGrid` 期望 20,000 格时的 188×106（间距 8.49），说明原作格网就是该算法。
3. **内容数据。** `StreamingAssets/Base`：BiomeResource、Buff、7 套文化（城市名/国名/人名/CultureData）、军事配置与图标、3 套宗教、人物/国家特质，以及 `localization.csv`（界面文字）。可以原样读取。
4. **贴图与字体。** resources.assets 有 `1600x900Parchment`、`parchment2`、`parchmentfinal`、`Parchment`、`white-parchment-paper`；sharedassets0 有 `parchmentfinal2`、`scroll`。字体为 Noto Serif JP、Noto Sans SC/TC/KR、Playfair Display、Roboto Slab、Open Sans 等开源字体。
5. **界面布局。** level0 场景的 RectTransform/Image/TextMeshPro 组件给出每个面板的锚点、尺寸、颜色和文字，可按原样重建后再做竖屏收纳。
6. **已恢复的算法。** 高度模板引擎（Azgaar 派生）、高度配色 Shader189、海洋 SDF 着色、B 样条海岸线与国界、战斗动画图集、部分河流与地貌。

## 3. 移植路线

**阶段 1：原作格网 + 原作画法的地图（本批开始）**
在原作 1600×900 格网上用已恢复模板生成地形；每格 Voronoi 多边形纯色绘制；海岸取真实的陆/海格边，用原作 B 样条平滑。目标：同一格网、同一种子时，地图结构与原作同类。随后接入羊皮纸纹理、国家按格着色（透明度 0.8）、平滑国界、原作字体。

**阶段 2：数据模型对齐。** 网页世界改用原作 CellData/State/Province/Burg/Army 结构；能读写原作 JSON 结构（是否支持导入原作 .save 文件需用户决定，因为需要在网页里带密钥）。

**阶段 3：模拟按原作结构重建。** 按原作 Manager 逐个恢复：TimeManager（每日 0.1 秒）、State/Province/Army 的分批轮转更新、战争、外交、征服、附庸、历史。每个函数先静态恢复输入输出，再写网页实现与测试。目标：1 倍速稳定 10 日/秒，帧率不掉。

**阶段 4：界面按原作重建。** 从 level0 导出界面层级，复用原作贴图、字体、`localization.csv` 文本；先还原桌面布局，再做手机竖屏收纳。

**阶段 5：长局、存档、PWA 与真机验收。**

## 4. 工程流程调整（建议）

- 引擎指纹目前覆盖整个 `src`，任何显示改动都要冻结旧 Worker。建议只覆盖模拟规则文件，显示改动不再产生新引擎。
- 每批验收以“原作与网页同一视角截图对照”为主，证据文档精简。
- 需要用户提供：原作同一张图的全景与放大截图、主要面板截图，作为视觉对照。

## 5. 风险

- 原作逻辑量大（数十个 Manager），全部恢复需要分批长期推进；每批只承诺具体函数。
- iPhone 浏览器内存与性能有限，8 万格地图需实测。
- 第三方组件（Shapes、Michsky UI、Puerts 等）不复制代码，只恢复用户自有逻辑；开源字体按各自许可使用。
