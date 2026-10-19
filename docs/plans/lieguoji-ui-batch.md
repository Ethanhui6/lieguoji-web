# 《列国纪》任务单 A：按原作重建界面（下一批，3 项，一项一个 PR）

编写：游戏策划，2026-10-19（JST）。适用仓库分支：从 `codex/ph06-world-generation` 当时 HEAD 开分支（方案 C 任务 1 合入后再开 A-1）。
所有云端代理用**默认模型**（Bob 决定）。

## 0. 已定前提（Bob 决定）

- 界面这批**直接用原作的贴图、字体和界面文字**，放在单独目录（建议 `public/original-ui/`，或 `src/assets/original-ui/`），每个文件在 `public/original-ui/SOURCES.json` 里登记：来源包（`resources.assets` / `sharedassets0.assets` / `StreamingAssets/...`）、Unity pathID、对象名、导出工具与版本、SHA-256。
- **不做** `.save` 导入，不带解密密钥。构建产物里不能有密钥、loader 常量、个人存档、envs.log、认证或 SDK 配置。
- 以 **Bob 本地安装的版本**为准（`GameAssembly.dll` SHA256 `d42658a9…`，Unity 2021.3.36f1）。Steam 商店图和社区图只做视觉对照，跟本地版本冲突时以本地版本为准。

## 1. 原作 UI 资料盘点（已经有什么 / 还缺什么）

资料副本都在共享电脑 `/workspace/games/架空地图模拟器-ref/`：`project/` 是项目文档和 Claude 的提取物，`game-data/` 是原作资源包，`web-screenshots/` 是公开截图。原作还原另外会导出 `original/`（root localization.csv、level0 界面层级）。

| 资料 | 现状 | 位置 / 证据 | 可直接用？ |
|---|---|---|---|
| level0 场景规模 | 已清点：GameObject 10,184、RectTransform 10,175、CanvasRenderer 7,366、CanvasGroup 1,079、Canvas 2、MonoBehaviour 17,466 | `project/.autopilot/fms-audit/assets/inventory.json`；`project/docs/FMS_PORT_ANALYSIS_2026-10-17.md` §1、§2.5 | 只是计数 |
| **level0 界面层级 / RectTransform 锚点、尺寸、颜色、文字** | **还没导出**。项目里只有画笔面板 3 个 SliderValueConnector 解析，加 4 个场景组件 .bin（World、DisplaySettings、PlayerController、StateLineRenderer） | `project/docs/evidence/fms-brush-input-2026-10-04/scene-ui-parameters.json`、`BRUSH_INPUT_REPORT.md`；`project/.autopilot/fms-audit/binary/coastline-static/scene/*.bin` | **缺**，原作还原正在导出到 `-ref/original/` |
| 画笔参数 | BrushHeight 0/100/默认 45；两个 BrushRadius 0.1/10，默认 1.5 和 3.5（只是候选值，未证实运行时生效） | 同上 scene-ui-parameters.json | 能用，要标「候选值」 |
| 界面文字 localization.csv | 根目录 `StreamingAssets/localization.csv`（1,854,108 字节）还没解析。Base 各模块自带的小 localization.csv 已复制 | 原作安装目录；`game-data/StreamingAssets/Base/{BiomeResource,Religion/*,Traits/*}/localization.csv` | 根表：**缺**，原作还原导出。模块表：可用 |
| 字体 | 清单已有（下表），但还没把 TTF 或 SDF 图集导出成网页能用的文件，也不知道各控件用哪套字体 | inventory.json（resources.assets 16 个 Font，sharedassets0 7 个 Font，加对应 SDF Atlas） | **缺导出和控件对应关系** |
| 羊皮纸贴图 | 已导出 PNG：`1600x900Parchment`、`parchment2`、`parchmentfinal`、`Parchment`、`white-parchment-paper`、`parchmentfinal2`、`scroll`，另有 shader187 汇编和参数 | `project/.autopilot/fms-audit/assets/parchment/`（manifest.json） | **可直接用**（网页已在用 2048² 缩小版 `parchment.jpg`） |
| 地图贴图 | 9 张 PNG，有 material json | `project/.autopilot/fms-audit/assets/map/`（manifest.json） | 可用 |
| UI 图标 / Sprite | 只有名字清单（resources.assets 204 个 Sprite，sharedassets0 97 个），还没导出成图 | inventory.json；源包在 `game-data/` | **缺导出** |
| 城市、港口、要塞预制件 | CityMain、CityCapitalFinal 已恢复并上线；港口和要塞读出了形状，运行时缩放没恢复 | `project/docs/evidence/fms-icons47-2026-10-18/RESULT.md`；`.autopilot/.../coastline-static/city/` | 城市可用，港口/要塞缺缩放 |
| 显示预设（Map Appearance） | 网页已有 8 个显示预设：预设 1 = 蓝海 + 羊皮纸（level0 默认），预设 8 = 白海 + 羊皮纸（对应米黄海）。预设 2–7 的名字和参数在 `src/fms/original/`，我这份副本没有 src | `project/docs/evidence/fms-original-map-2026-10-17/RESULT.md`、`verification.json`（presets: 8）；`fms-original-play-2026-10-17/RESULT.md` | 部分可用。原作「Map Appearance」菜单里的选项名和顺序**缺** |
| 导出工具 | 已有：私有 UnityPy（`.autopilot/fms-audit/tools/python`，没复制）、`assets-inventory.py`、`extract-map-assets.py`、`extract-text.py`、`assets/parchment/export.py`、`coastline-static/scene-read.py`（按 MonoScript 名提取 MonoBehaviour 原始字节）。**没有** level0 层级或 RectTransform 导出脚本 | `project/.autopilot/fms-audit/*.py` | 能当起点，要另写层级导出 |
| 面板外观参照 | 公开截图 30 张：NATION INFO（新旧两版）、HISTORY、CHARACTER、FAMILIES、ALLIANCE INFO、MAP EDITOR（Edit State）、CULTURE、底部工具栏、军事编辑器 | `web-screenshots/SOURCES.md` | 可当对照，但不能替代 level0 数据 |

字体清单（inventory.json 里的 Font 对象；哪个控件用哪套字体还不知道，要等 level0/TMP 引用导出）：

- resources.assets：NotoSansSC / NotoSansTC / NotoSansKR / NotoSans（可变字重）、NotoSansCJK-VF、NotoSerifCJK-VF、NotoSerifJP、Roboto-Regular、PlayfairDisplay、Inconsolata-SemiBold、MoriaCitadel、Milonga-Regular、NanumMyeongjo、BRWakaisho、GenJyuuGothic-Normal
- sharedassets0.assets：RobotoSlab、Roboto-Bold、NotoSerifKR、Avara、LiberationSans、ARIAL、TW-Kai-98_1；另有 `微軟正黑體 Atlas`、OpenSans 全套 SDF Atlas（只有图集，没有 Font 对象）
- **许可风险（推断，要核实）**：ARIAL、微軟正黑體是商业字体，Bob 授权的是「用原作资源」，但这不等于有字体再分发许可。建议这两套不进产物，用 NotoSans/LiberationSans 代替，并在 SOURCES.json 里注明。TW-Kai-98_1（全字库楷体）的许可条款要单独查。其余 Noto/Roboto/OpenSans/Playfair/GenJyuu/Nanum 都是 OFL 或 Apache。
- 部分贴图名是 UTF-8 中文被当成 CP437 显示的乱码（比如 `ΦìëΦÄôτö£τé╣`），导出时要按 UTF-8 还原名字。

**面板配色（待核对）**：美术指导从官方新版截图取色：面板底 `#e5e6e6`，按钮蓝 `#569ef0`。**这是截图取色，不是 level0 数据**，要等原作还原从 level0 的 Image.color 核对。核对前在代码里写成具名常量 `ORIGINAL_UI_PANEL_BG` / `ORIGINAL_UI_BUTTON_BLUE`，加注释「待核对」。

## 2. 公共规则（三项都适用）

- **资源目录**：原作资源只放在 `public/original-ui/`（贴图 `textures/`、字体 `fonts/`、文字 `text/`），每项都登记在 SOURCES.json。网页自己画的东西不准放进这个目录。
- **文字**：界面文字从 root localization.csv 按 key 取（中文列优先，没有中文才用英文列）。key 来自 level0 的 Localize 组件；能在 csv 里找到才算「原作文字」。网页新增的文字单独放在 `src/i18n/web-extra.*`，并标「网页新增」。
- **手机竖屏收纳（430×932，iPhone 13 Pro Max 的 CSS 尺寸）**：地图始终占满屏。原作左右两侧的面板改成底部抽屉，有三档：收起（只露 44px 标题条）、半开（约 45% 高）、全开（92% 高，留出顶部安全区）。同一时间只开一个面板。底部工具栏收成一行图标，放不下的进「更多」。触控目标至少 44×44。面板里的折叠项（Basic/Action/War/Trait/Diplomacy…）保持原作顺序，默认只展开第一项。
- **桌面验收视口 1600×900**（原作画布也是 1600×900）：用同一世界、同一镜头、同一暂停时刻截图，和原作截图（Bob 补的截图，或 `web-screenshots/` 里对应的图）并排放一张对照图，存到 `docs/evidence/<批次>/compare/`。
- **共同验收**：
  1. 功能能点：面板里每个原作按钮或折叠项都要么接到网页已有的真实功能，要么明确显示「暂未实现」并禁用，不准有点了没反应的按钮。
  2. 旧存档不受影响：只改显示，不改引擎指纹（引擎指纹只覆盖模拟规则文件，见 PORT_ANALYSIS §4）。旧存档继续/保存/刷新 1/1，冻结引擎登记测试照常通过。
  3. 构建产物审查：dist 允许清单新增 `original-ui/**`，并加一项检查：产物里没有 `.save`、`*constants*`、`envs.log`、`gameConfigDyV2.json`，也没有已知的 AES 密钥字节串（用私有目录的哈希比对，不把密钥写进测试源码）。
  4. lint、typecheck、相关单测、生产构建、桌面和手机尺寸浏览器流程都通过。手机尺寸仿真不能写成「iPhone 已通过」。

---

## A-1 主界面布局（PR 1）

**目标**：游戏主画面换成原作结构：地图全屏，底部一条原作工具栏，左边国家信息面板位，右边人物或详情面板位，中间放大面板位（历史/家谱），加上顶部事件条。用原作配色和字体。

**控件清单**（来源：`web-screenshots/fms_01_main_nationinfo_history_character_01.jpg`、`fms_05_…`、`news_20250216_megamap.png`、`comm_recent_06.jpg`。精确锚点、尺寸以 `-ref/original/` 的 level0 导出为准）：

- 底部工具栏，从左到右 10 个按钮：Generate Map / Map Appearance / Settings / History / Statistics / Set As Wallpaper / Map Editor / Pause Game / 1x Speed / Tips。
  - 网页对应：生成新世界、外观预设菜单（A-3）、设置、历史（现在的 CultureHistory47）、统计（没有就禁用并显示「暂未实现」）、设为壁纸（网页做不到，**隐藏**，并注明原因）、地图编辑器、暂停、倍速切换（1×/2×/4×，对应 10/20/40 日/秒）、提示。
- 顶部事件条：原作 MajorEventMessageUI 8 秒显示、1 秒淡出（证据见 `docs/FMS_DESKTOP_WEB_COMPARISON_2026-10-07.md` 第 12 行、`docs/evidence/fms-chronicle-v5-2026-10-06/NATIVE_EVIDENCE.md`）。接现在的 CultureNews47。
- 左面板位（NATION INFO）、右面板位（CHARACTER）、中间面板位（HISTORY 时间线 / FAMILY TREE）：面板外框、标题字、Close 按钮。面板内容归 A-2。
- 面板底色 `#e5e6e6`，按钮蓝 `#569ef0`（**待核对**）。标题字、正文字体等 level0 导出的 TMP 引用定下后再用；没导出前先用 Roboto（正文）和 PlayfairDisplay/RobotoSlab（面板标题），并标「推断」。

**原作资源**：工具栏和面板用到的 Sprite（`Rounded Filled 128px/256px`、`Rounded Outline 128px - 1x`、`chevron-down`、`chevron-up`、`UISprite`、`Background`，在 sharedassets0.assets）；字体 Roboto-Regular（resources.assets）、Roboto-Bold（sharedassets0）、NotoSansSC（resources.assets，中文）。

**手机竖屏**：工具栏收成底部一行 5 个图标（暂停、倍速、历史、国家、更多），其余进「更多」。事件条贴在顶部安全区下方，最多一行，点开看详情。左/右/中三个面板位都改成底部抽屉，按「公共规则」收纳。

**验收**：
- 1600×900 下和 `fms_01` 并排对比：工具栏按钮顺序、文字、相对位置、面板位置与宽高比（拿到 level0 后对比 RectTransform 数值，误差 ≤4px）。
- 10 个工具栏按钮都按上面的映射处理，能点的点了有真实效果（暂停后 tick 不再走、倍速切换后实测日/秒变化）。
- 事件条：有真实事件才出现，显示 8 秒后 1 秒淡出（用假时钟测）。
- 430×932 下地图占屏至少 75%（面板收起时），所有入口都能找到。
- 公共验收 1–4。

**依赖**：方案 C 任务 1 合入（避免和引擎改动冲突）；level0 层级导出（原作还原）。没有导出也能先开工，把布局数值做成常量表，导出到了再替换。
**风险**：level0 里大概有 2 个 Canvas 和多套分辨率适配（CanvasScaler 参数未知），网页换算可能偏差；新版和旧版 NATION INFO 并存（商店图 fms_08 是旧版小面板），要以本地安装版本为准；「设为壁纸」「Statistics」网页没有对应功能。

---

## A-2 国家 / 战争 / 外交 / 编辑器四面板（PR 2）

**目标**：把网页现在的国家详情、战况、外交和编辑器面板改成原作面板的结构、字段顺序和文字。数据仍然读网页现有的真实世界。

**控件和字段清单**（截图来源见各项；字段 key 要和 root localization.csv 对上）：

1. **国家面板 = 原作 NATION INFO（新版）**，来源 `web-screenshots/news_20250316_nationpanel.png`、`comm_recent_01.jpg`（中文）、`comm_recent_04.jpg`：
   - 顶部：国名条 + 国家色条。
   - Basic（可折叠）：Political System 下拉、Religion 下拉、Ethnic Attribute 下拉；字段 State、Lifespan、Capital、Religion、Population、Population Limit、Corrupt、Treasury、Political System、Ethnic Attribute、Army Count、Province Count。
   - 折叠项：Action、War、Trait、Diplomacy、Families（fms_01 有）、History（fms_01：按年列事件，加 Full History Records 按钮）、Close。
   - 网页现有字段里，原作没有的放到「网页扩展」折叠项，排在最后。
2. **战争面板 = NATION INFO › War 折叠项 + 战争地图视图**：公开截图**没有**展开后的 War 面板（SOURCES.md 也这样写），字段要等 level0 导出或 Bob 补截图。现在只能确定的是地图上的元素：红色战线边框、军队箭头、省份和城市小字（`fms_08`、`fms_09`）。
3. **外交面板 = NATION INFO › Diplomacy 折叠项 + ALLIANCE INFO**，来源 `news_20251201_alliance.png`、`comm_recent_08.jpg`：
   - ALLIANCE INFO：联盟名条 + 色条。
   - Basic：Population、Army Count、Strength。
   - Alliance Actions：Disband、Expel Member、Invite to Join、Translate、Unbreakable 开关。
   - Ally States 列表：每个成员显示 Strength、Army Count、Population。
   - Diplomacy 折叠项展开后的内容：**没有截图**，缺。
4. **编辑器面板 = MAP EDITOR**，来源 `news_20250520_editor_b.png`，加 level0 画笔参数：
   - 模式下拉（截图里是 Edit State；其他模式的名字要等 level0/localization 导出）。
   - Generate Country 按钮。
   - State Count 滑块（截图值 30）。
   - 国家列表（色块 + 国名）、文本输入加 ⊕ 按钮、分页（« Page 1 of 4 [1] Go »）。
   - Brush Radius 滑块（截图 3.50，和 level0 BrushSize pathID 10073 的默认 3.5 对得上；另一个默认 1.5 属于另一组控件）。
   - Edit / Delete / Draw / Erase 四个按钮，Clear Map，Close。
   - 高度模式：BrushHeight 0–100 默认 45，DecayFactor（默认值未知），形状 Hill/Plane，模式 Add/Subtract/Min/Max/Average/Replace/Erase（`fms-brush-input-2026-10-04/BRUSH_INPUT_REPORT.md`）。
   - 另见 CULTURE 面板（`news_20250520_editor_a.png`），本批只做外框，不做内容。
- 配色同 A-1（`#e5e6e6` / `#569ef0`，待核对）。截图里的危险操作按钮用红色（Delete）、绿色（Draw）、橙色（Erase），这些也是截图观察，待核对。

**原作资源**：Sprite `crown`（Basic 标题图标，推断）、`flag`（Action，推断）、`swords`（War）、`shield`（Trait）、`handshake`（Diplomacy）、`chevron-down`/`chevron-up`、`chevrons-up-down`（下拉）、`circle-plus`（⊕）、`trash-2`、`book-open`（以上在 sharedassets0.assets）；`users`、`git-branch`（家族，推断）、`x`、`Search`（以上在 resources.assets）。图标和折叠项的具体对应要以 level0 Image.sprite 引用为准。字体同 A-1。文字取自 root localization.csv。

**手机竖屏**：四个面板都用同一个底部抽屉。抽屉顶部是国名条 + 一排折叠项页签（横向滚动）。编辑器在竖屏时，滑块和四个操作按钮固定在抽屉底部，列表区可以滚动，分页改成上拉加载。

**验收**：
- 1600×900 下四个面板分别和对应截图并排对比：字段顺序、文字、图标、折叠项顺序一致。截图里没有的部分（War、Diplomacy 展开）在对照图上标「无原作参照」。
- 每个字段的值来自真实世界（随机抽查 3 个国家，和 Worker 里的状态逐项对比）。
- 编辑器：Generate Country、State Count、画笔半径、Edit/Delete/Draw/Erase、Clear Map 都接到现有编辑操作，可撤销、可保存、刷新后还在。
- 外交：Alliance Actions 里网页没有的功能（比如 Translate）显示禁用并注明原因。
- 公共验收 1–4。

**依赖**：A-1（面板外框和抽屉）；root localization.csv 和 level0 导出（原作还原）；Bob 补的截图（见第 4 节）。
**风险**：War 和 Diplomacy 展开内容没有参照，硬做就是编造，所以宁可留空；原作字段（Corrupt、Ethnic Attribute、Lifespan 等）网页模拟里可能没有对应数据，没有就显示「—」并列入数据模型对齐批次，不能拿别的数凑；新旧两版 NATION INFO 并存。

---

## A-3 地图字体、标签分层、海面外观预设（PR 3）

**目标**：地图上的国名、首都、城市、省名换成原作字体，分层显示。海面按原作「Map Appearance」外观预设逐个对上（羊皮纸、暗蓝、亮蓝等），不是只做羊皮纸一种。

**控件和字段清单**：
- 标签分层，从大到小：国名（按连片倾斜，算法已有，不重写）→ 首都名 + CityCapitalFinal 图标 → 普通城市名 + CityMain 图标 → 省份名（只在放大后出现，`fms_08`、`fms_09`）。每层在多大缩放时出现、字号多大，要从原作截图量（全景 / 4× / 12× 三档；网页最近放大约 66.7 地图单位高，见 original-map RESULT）。
- 字体：原作地图标签用的是衬线字体（截图观察）。具体哪套（NotoSerifCJK / NotoSerifJP / PlayfairDisplay / TW-Kai 之一）要等原作还原导出标签预制件的 TMP 引用。没导出前，中文用 NotoSerifCJK、拉丁文用 PlayfairDisplay，并标「推断」。
- 「Map Appearance」菜单（底部工具栏第 2 个按钮）：列出所有外观预设，选中后立刻切换海面、陆地、羊皮纸效果。网页现有 8 个预设（预设 1 蓝海 + 羊皮纸是 level0 默认，预设 8 白海 + 羊皮纸 = 米黄海）。还要逐个确认：
  - 原作菜单里每个选项的名字和顺序（level0 + localization）；
  - 每个选项和网页预设 1–8 的对应关系；
  - 暗蓝海（`fms_01`、`comm_recent_06`、`comm_recent_07`）和亮蓝海（`fms_06`、`fms_07`、`fms_10`、`comm_recent_04`）各对应哪个预设。SOURCES.md 推断三种海面是玩家能选的外观，不是版本差异。
- 羊皮纸：ParchmentEffect `c = m + strength·(p·m·color − m)`，按世界坐标铺 249.3×137.2（已恢复）。
- 国家色透明度：StateMapTransparency（「透明度就是 alpha」这一点是推断）。

**原作资源**：`parchmentfinal2`（sharedassets0 #122）、`1600x900Parchment`、`parchmentfinal`、`parchment2`、`white-parchment-paper`（已导出，在 `.autopilot/fms-audit/assets/parchment/`）；shader187 参数；标签字体（同上）；城市图标已在网页里用代码画。

**手机竖屏**：标签字号按设备像素比换算，最小 11 CSS px。同一屏标签更多时，按层级先隐藏低层，不缩小字号。Map Appearance 改成底部抽屉里的一排缩略图。

**验收**：
- **按预设逐个对照**：每个原作外观预设，网页都用同一张图（原作 2 万格、种子 1337、continents）、同一镜头（全景 + 12×），在 1600×900 下截图，和原作同一预设的截图并排；同时在固定开阔海点和近岸点取色，和原作截图对比，ΔE ≤ 6（截图有压缩，所以放宽）。原作截图要用 Bob 本地版本截，商店图只能辅助。
- 标签：全景 / 4× / 12× 下国名、首都、城市、省名各层的出现时机和相对字号跟原作一致；平移不换锚点，缩放不随机跳；点城市能看到全名。
- 切换预设只改显示：模拟、拾取、存档不变，切换后保存再刷新，预设还在。
- 公共验收 1–4（字体文件进产物，许可登记写清楚）。

**依赖**：A-1（工具栏上的 Map Appearance 入口）；标签预制件和 Map Appearance 的 level0 导出；Bob 补的各预设截图。
**风险**：预设 2–7 的名字现在只在网页代码里，和原作菜单可能对不上；CJK 字体文件很大（NotoSerifCJK 可变字体约 20–30MB，推断），要按字表子集化或用 SDF 图集，否则手机首屏会很慢；用商店图取色会受 JPEG 压缩影响。

---

## 3. 交付物要求（每个 PR）

真实改动清单、原作依据（文件路径、pathID）、标明「原作恢复 / 有证据的桥接 / 网页新增 / 推断」、对照图、检查结果、没通过的项。合并到 main 前先问 Bob。

## 4. 需要 Bob 补的原作截图（本地安装版本，1600×900 或 1920×1080 窗口，中文界面优先）

1. 主界面全景：底部工具栏 + 顶部事件条，不开任何面板。
2. NATION INFO 展开 **War**，最好是正在打仗的国家。
3. NATION INFO 展开 **Diplomacy**、**Action**、**Trait**（各一张）。
4. 战争地图视图：正在交战时放大到能看清战线和箭头。
5. **Map Appearance** 菜单本身，再加每个外观预设各一张全景截图（同一张图）。
6. MAP EDITOR 各模式：高度画笔（显示 BrushHeight、DecayFactor、形状、模式）、Edit State 以外的其他模式下拉列表。
7. Settings 和 Statistics 面板。
8. 地图标签分层：同一位置的全景、中景、最大放大三张，政治地图。
9. 手机没有原作版本，不用截。

## 5. 不确定点

- level0 层级导出（原作还原负责）前，所有锚点和尺寸都只能从截图估计。
- `#e5e6e6` / `#569ef0` 只是截图取色，待核对。
- 各控件用哪套字体、地图标签用哪套字体：未知，等导出。
- 预设 2–7 的名字我手上没有（src 没复制到共享电脑）。
- ARIAL、微軟正黑體、TW-Kai 的再分发许可要先查清楚。

## 字体补充（2026-10-19 14:05）
- Arial、微软正黑体：不打包字体文件，CSS font-family 直接写系统字体名，未安装时回退开源字体（如 Noto Sans/Serif TC）。
- TW-Kai：许可查清前不打包，先用开源楷体回退。

## 实测修订（2026-10-19 14:10，依据 -ref/original/_ui-export/，Steam buildid 24629612）
- 战争和外交：做成国家面板 StateInfoNewUI（230×750）里的两个折叠分区 War、Diplomacy。分区框架照原作做，运行时生成的行内容仍留空。
- 画布参考分辨率 1920×1080，按高度缩放；底栏 BottomPanel 高 30。
- 海色：8 个地图外观预设逐个对比 ΔE≤6，海色分别为 #1487ff/#3c9cff、#5e86b0、#4899ee/#5881e3、#7da3ff、#269995、#e6dcd3、#ffffff，其中 3 个开羊皮纸。删除「羊皮纸/暗蓝/亮蓝」这三个名字。
- 颜色：面板底色 #fafaf9，分区 #f0f0f0，编辑器主按钮 #569ef0。#e5e6e6 作废。
- 字体：UI 主体用 TW-Kai-98_1（许可待查，先用霞鹜文楷代替），地图英文用 RobotoSlab/Avara，城市名用 Roboto。
- 布局数值以 level0-ui.json 为准，替换之前的估算。

## 手机竖屏默认镜头（2026-10-19 14:11，界面美术转述 Bob 的决定，待 Bob 确认）
- 手机竖屏（430×932）进游戏时，默认镜头放大到陆地填满屏幕，不再显示整张地图。
- 验收：首屏地图（陆地+海）至少占屏幕 60%（现约 24%）；开面板时另记（现约 57%）。
- 对照稿：/workspace/games/架空地图模拟器-ui/layout-spec-draft.md，网页截图 screens/web/。
- 手机面板（网页适配）：从底部弹出，默认最多占屏 40%，可上拉到全屏；开面板时地图至少占 60%。

## 美术补充单并入（2026-10-19 14:18，以 lieguoji-ui-batch-art.md 为准，覆盖前面的字体/颜色条目）
- 字体：TW-Kai-98_1 按字表裁子集打包（OFL-1.1 或政府开放授权，署名 data.gov.tw/dataset/5961），霞鹜文楷只补缺字；地图英文国名 Avara 整份打包；城市名 Roboto、部分标题 RobotoSlab 打包；中文国名用微软正黑体、零星文字用 Arial，只在 CSS 写字体名，后面接 Noto Sans TC 和 Liberation Sans 作后备。之前「许可查清前不打包」作废。
- 面板三层：外框 #fafaf9 加黑色描边，主体 #dbdbdb，折叠区 #f0f0f0 透明度 0.39；代码里原来的一个底色常量拆成三个。编辑器按钮：主 #569ef0，删除 #fa6969，绘制 #5fb685，擦除 #e4a132。
- 家族图标 castle（不是 users）；特质标题文字 key 用 StateTrait。
- 39 个原作精灵图用 CSS 画，或拿 PNG 当遮罩着色；素材在 -ref/extracted-ui/。
- 估计值（验收放宽、标注）：面板圆角、编辑器按钮宽度、国名字距和字号。
- 前置：先合指纹收窄 PR（开发协调排在 P-0 后、界面第一项前），再合界面 PR。
- 指纹收窄 PR 验收：改界面组件 .ts 指纹不变；改规则目录文件指纹变；culture47 冻结和老存档用新范围重跑仍能读。
- 字体打包验收：dist 中 TW-Kai 为子集（不得出现 52 MB 原文件），dist 体积在第二层检查里记录。
- 8 个外观预设：先由原作还原从 displaysettings-43912.json / sharedassets0.assets 读参数和滑块默认值，数据对不上的再列出问 Bob。

## 第 3 节核实结果并入（2026-10-19 14:30，见 lieguoji-conflicts-sec3-verified.md）
- 默认外观：currentPresetIndex=-1 即「自定义」，用场景初始值（_ui-export/display-sliders.json），不等于任何预设；网页适配。
- Map Appearance：点一下切到下一个预设，另有随机样式和自定义，不是下拉菜单。
- 底栏 10 个按钮按旧计划顺序；显示文字以 localization 为准，不用节点名当 key（如 FAQ 节点显示 Tips）。
- 滑块：BrushHeight 0–100 默认 45；BrushRadius 0.1–10 默认 3.5（省份模式 1.5）；DecayFactor 0.95–1.0 默认 0.98408。折叠分区只有 BasicInfo 默认展开。
- 新增面板：HISTORY（Canvas/HistoryInfo，521.54×1273.66，底栏入口），AllianceInfoPanel、CharacterPanel（标题「家族信息」）、WarPanel、InfoRow、DropDownInfo 见 _ui-export/prefabs-ui.json；外交没有行预制件，行样式沿用 InfoRow，标网页适配。
- 地图中文字体（C-23）待核。TW-Kai 子集字表 = localization 全部字 + 随机国名、人名用字（待原作还原补）。
- TW-Kai 子集字表：_ui-export/twkai-charset.txt（3,017 字符，v103.1 无缺字）。玩家输入名字、自定义标签、创意工坊地图、代码里写死的中文和加密数据覆盖不到，缺字退回霞鹜文楷（网页适配）。改用官网版需确认是 v103.1 并重核。

## 美术更正（2026-10-19 14:42）
- 编辑模式 key 用 EditMode（不是 MapEditor）。
- 底栏字号：中文 19.4 px、英文 18 px；22.5 px 作废。
- 倍速按钮按最宽的「0.1倍速」定宽，切档时相邻按钮不跳动。
- 字体文件：-ref/extracted-ui/fonts-web/（约 1.74 MB，README 含署名）；font-display: swap，首屏先显示后备字体；验收 dist 中 TW-Kai ≤1.5 MB。
- 待原作还原核对的显示文字和默认值（底栏「地图展示/地图外观」、Tips、家族面板标题、图片导出标题、倍速是否循环、联盟和家族面板默认展开、海路和省界默认色）：核实前照 csv 写，标待核。

## 显示文字核对结果（2026-10-19 14:46，依据 _ui-export/ui-text-check.md）
- 文字一律按 key 从 localization.csv 取，不照抄占位文字；key 为空的按钮用节点名当 key（263 个里 219 个直接对上，其余标待核）。
- 实测：家族面板标题「人物」（key Character）；图片导出标题「导出图片」（key ExportScreenshot），「导出历史记录」是另一个面板；联盟面板 3 个分区、家族面板 5 个分区默认全部展开；海路默认 #868686，省界默认 #B2B2B2。
- 待核（先这样做）：底栏显示「地图外观」；FAQ 按钮显示「常见问题」；倍速到 5× 再点循环回 0.1×。
- 验收：以上显示文字必须与 csv 对应 key 的简体/繁体值一致。
- 例外（2026-10-19 14:48，见 _ui-export/empty-key-nonmatch.md）：44 个节点名不是 csv key 的按钮不按节点名取文字。21 个 Ripple 特效节点忽略；5 个动态值按钮（SpeedChange、ResolutionButton、ScreenModeButton）运行时填入倍速、分辨率、窗口模式（推断）；4 种改用指定 key：RebellionUI、RemovePuppy、GenHeightMap、DrawRiver；「点击扩张」「绘制空白国家」、ToolTipsPanel 的 Continue 先用占位文字，标待核。Remove 和 Expand 的提示文字是从煽动叛乱错抄的，不照搬，标待核。
- 验收：界面上不出现裸 key 名。
- 冒烟扫描：页面可见文字出现 csv key 名即不通过；「随机省份煽动叛乱」只在 Remove/Expand 按钮上出现才算错，InciteRebellion 上是正确文字；3 种待核文字单列、不算失败。27 个 LocalizationText/TmpButton 对照表由原作还原补齐后，主界面任务再派。
- 更正（14:49，美术补充单）：底栏编辑按钮节点 MapEditor，按 key 规则显示「地图编辑」（推断，待核），覆盖 14:42 的「EditMode/编辑模式」。导出面板两个：ScreenshotPanel「导出图片」、ExportHistoryPanel「导出历史记录」（标题运行时待核）。国家面板默认只展开基本信息。倍速按钮最小宽 68 px；底栏 10 按钮约 776 px，栏宽 1728 px 放得下。
- 14:50：编辑按钮 MapEditor「地图编辑」已由原作还原和美术双重核对（level0 Canvas/BottomPanel/Panel (6)/MapEditor，csv 第 228 行），去掉待核。
- 文字对照表定稿：_ui-export/empty-key-nonmatch.md / .csv（71 行，含「可信度」列），主界面任务以此为准；12 个动态值或模板运行时填值，15 个缺 key 的按表处理（强推断的直接用建议 key，其余用占位文字或写死，标待核或网页适配）。
- 15:05：「key 为空就用节点名当 key」这条总规则标待核（本地化脚本方法体未见）；单个按钮不再另标。
- 鸣谢面板人名缺 16 字（冬十售她幸悠拨暖杠栖椎猫甜皓芷豆）：现在就补进字表重新打包，确认 TW-Kai 仍 ≤1.5 MB；鸣谢面板不进主界面 PR。
