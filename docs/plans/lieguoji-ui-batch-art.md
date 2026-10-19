# 《列国纪》任务单 A：美术补充（贴图、字体、配色、桌面/手机布局）

编写：美术指导，2026-10-19（JST）。配合策划的 `/workspace/plans/lieguoji-ui-batch.md` 使用，**不修改**那份文件。
原作版本：Steam buildid 24629612（安装文件日期 2026-09-23），Unity 2021.3.36f1。

## 0. 依据和标记规则

- **一手依据**（优先级最高）：原作还原导出的 `/workspace/games/架空地图模拟器-ref/original/_ui-export/`
  - `level0-ui.json`（10,175 个 RectTransform：锚点、尺寸、缩放、Image/MPImage 颜色和贴图、TMP 字体和字号、Localization key）
  - `displaysettings-43912.json`（8 个外观预设）、`fonts.json`、`localization.csv`
- **贴图和字体文件**：我从 `game-data/` 只读导出到 `/workspace/games/架空地图模拟器-ref/extracted-ui/`（说明见那里的 README.md）。
  - 贴图 PNG：`extracted-ui/textures/<包>/<名字>__<pathID>.png`，清单 `textures/manifest.json`
  - Sprite 用量：`extracted-ui/sprite-usage-level0.json`
  - 字体：`extracted-ui/fonts/`，清单 `fonts/fonts-meta.json`
- **公开截图**只作视觉对照，见 `web-screenshots/SOURCES.md`。截图和 level0 冲突时，以 level0 为准。
- 每个数值都带一个标记：
  - 【实测】直接来自 level0-ui.json 或资源文件，后面写节点路径或文件。
  - 【换算】由实测值按画布缩放算出来（公式见 0.1）。
  - 【估】从截图估计，或者是网页适配的建议值。
  - 【网页适配】原作没有，网页自己设计的方案。

### 0.1 画布换算（实测）

- 画布：`Canvas` 的 CanvasScaler 参考分辨率是 **1920×1080**，`m_MatchWidthOrHeight = 1`，也就是**按高度匹配**【实测 level0-ui.json `Canvas` 组件 CanvasScaler】。
- 网页 1 个画布单位换成 CSS px：`s = 视口高 / 1080`。
  - 1600×900：s = 0.8333
  - 1280×800：s = 0.7407
  - 1920×1080：s = 1
- 面板自带的 localScale 也要乘进去：
  - StateInfoNewUI、EditPanelNewUI：1.296
  - BottomPanel：0.9
  - DisplaySettings：0.6
- **桌面验收可能改用 1920×1080**（原作画布参考分辨率），所以下面的【换算】值以 **1920×1080 为主**（画布单位 × 面板 localScale），1600×900 写在后面（= 1920 值 × 0.8333）。1280×800 = 1920 值 × 0.7407。
- 带 `DraggableWindow` 的面板（StateInfoNewUI、EditPanelNewUI、DisplaySettings、TimeDisplay）玩家可以拖动，所以下面写的位置只是**初始位置**。

### 0.2 界面文字的取法（全文通用）

- **文字一律按 key 从 localization.csv 取**，按当前语言取对应的列。
- 组件的 key 是空的，就**用节点名（GameObject.name）当 key**。依据【实测，原作还原 `ui-text-check.md`】：
  - level0 里 key 为空的 LocalizationButton 有 263 个，其中 219 个节点名正好是 csv key；对不上的多半是 `Ripple`、`Expand` 这类特效子节点。
  - LocalizationText 是 227/249，LocalizationTmpButton 是 114/119。
  - 这条规则是强推断，方法体没看到，严格说仍然待核。
- **不许照抄占位文字**：ButtonManager 的 `buttonText`、TMP 里写死的字都是 prefab 占位，不代表运行时显示的文字。例如工具栏的「地图展示」「Tips」、人物面板的「家族信息」、导出面板的「图片导出」都是占位。
- 节点名也不是 csv key、又没有显式 key 的（例如 `SpeedChange`），文字由代码写入，按本文各节写明的 key 来取。

## 1. 公共视觉规格（三个 PR 都适用）

### 1.1 面板结构（新版浅灰面板，实测）

原作新版面板是三层叠起来的，用 MPImage 程序化画圆角矩形，**不是贴图**。网页用 CSS 画，不需要面板底图。

| 层 | 原作节点（以国家面板为例） | 颜色 | 其他参数 |
|---|---|---|---|
| 外框 | `Canvas/StateInfoNewUI` MPImage | 填充 `#fafaf9`，描边 `#000000` | DrawShape=3，OutlineWidth=2.11，StrokeWidth=0.04。圆角半径没有导出，【估】约 6–8 画布单位 |
| 主体 | `.../Border` MPImage，四周各内缩 1.8（sizeDelta −3.6） | `#dbdbdb` 不透明 | 这是面板上**实际看到的大面积底色** |
| 折叠区（收起时） | `.../Content/<Section>` MPImage | `#f0f0f0`，α=0.392 | 叠在 #dbdbdb 上，显示为 **#e3e3e3** |
| 区头 | `.../<Section>/Header` MPImage | `#ffffff`，α=0.569 | 高 20 |
| 区内容底 | `.../<Section>/Content/Panel` MPImage | `#ffffff`，α=0.40 | 描边 `#e5e7eb`，宽 0.5 |
| 标题栏（拖动条） | `.../Dragger` Image `Square Filled` | `#adadad`，α=0.09 | 高 34.1 |

- **核对结论**：截图取到的 `#e5e6e6`，其实是 #f0f0f0（α 0.39）叠在 #dbdbdb 上的结果。我算出来是 #e3e3e3，和截图差 2–3 级，可能是 2025-03 旧版或者截图压缩造成的。所以 `ORIGINAL_UI_PANEL_BG` 要拆成三个常量：
  - `#fafaf9`：外框
  - `#dbdbdb`：主体
  - `#f0f0f0` 加 α 0.392：折叠区
- **区展开后**：`CollapsibleSectionUI.m_DisableMPImageWhenExpanded = 1`，展开时折叠区自己的底色会关掉。其他参数：展开动画 `m_AnimationDuration = 0.25 s`。
- **默认展开**：
  - **国家面板**：level0 里只有 BasicInfo 区是 `m_StartExpanded = 1`，其余区（War、Diplomacy、Family、Traits 等）都是 0【实测】。所以默认只展开「基本信息」。上一版说「各区都是 0」，不对，已更正。
  - **联盟面板（3 个区）、人物面板（5 个区）**：场景里全部 `m_StartExpanded = 1`，各区的 Content 都是 active【实测，原作还原 `ui-text-check.md` 第 6 节】。所以打开时全部展开。
  - 联盟、人物面板运行时会不会再调 Collapse 改掉，待核；推断不会。
- **区间距**：Content 的 VerticalLayoutGroup spacing = 10。

### 1.2 按钮（实测）

| 用途 | 贴图（Sprite，sharedassets0.assets） | 颜色 | 文字 | 依据 |
|---|---|---|---|---|
| 编辑器主按钮（重新生成 / 编辑 / 放置大陆等，共 17 处） | `Rounded Filled 1024px`（pathID 276，九宫格 74） | **`#569ef0`**（截图取色已证实） | TW-Kai 14，#000000 | `EditPanelNewUI/.../EditCountry/GenerateCountry` 等 |
| 删除 | 同上 | `#fa6969` | 同上 | `.../EditCountry/ActionPanel/Delete` |
| 绘制 | 同上 | `#5fb685` | 同上 | `.../ActionPanel/Draw` |
| 擦除 | 同上 | `#e4a132` | 同上 | `.../ActionPanel/Erase` |
| 普通按钮（说明、清空地图、关闭面板） | 同上 | `#ffffff`（编辑器），国家面板「关闭」是 `#f1f1f1` α 0.75 | 同上 | `EditPanelNewUI/Panel/Tips`、`StateInfoNewUI/ClosePanel` |
| 底部工具栏按钮（MUIP ButtonManager） | Normal：`straight final`（九宫格 18）着色 #000000，只是细边框；Highlighted：`Rounded Filled 128px` 着 #000000，再叠 `Flat Shadow` α 0.59，文字变 #ffffff；Disabled：`straigtbound` 着 #6464af α 0.39，文字 #6464af | 见左列 | TW-Kai 25，Normal 文字 #000000 | `BottomPanel/Panel/GenerateMap/{Normal,Highlighted,Disabled}` |
| 下拉框 | MPImage 白底，描边 `#e5e7eb` 0.5；箭头 `chevrons-up-down` 着 #000000 | — | TW-Kai 14 | `EditModeDropDownInfo/DropDown` |
| 输入框 | MPImage `#91c7ff` α 0.53 | — | — | `EditCountry/InputNamePrefab/InputField (TMP)` |

- 点击水波纹（Ripple）用 `Radial Filled 256px`，颜色从 #ffffff α 0.157 渐变到 α 0 【实测 ButtonManager `startColor`/`transitionColor`】。网页可以用 CSS 实现，不用贴图。
- 贴图本身是**白色或黑色的遮罩**（导出后算出的不透明部分平均色就是 255,255,255），颜色全部来自 Image.color。所以网页可以直接用原作 PNG 做 `mask-image`，再用 `background-color` 着色，也可以改用 CSS 圆角。

### 1.3 图标（实测，全部是 sharedassets0.assets 的 48×48 白色遮罩，界面里着 #000000）

| 折叠区（国家面板，按原作顺序） | 图标 Sprite | 标题 key（localization.csv） | 依据 |
|---|---|---|---|
| BasicInfo 基本信息 | `crown` | BasicInfo | `StateInfoNewUI/.../BasicInfo/Header/Icon` |
| Action 行动 | `flag` | level0 里 key 为空，运行时赋值 | `.../Action/Header/Icon` |
| LeaderHistory 领袖记录 | `book-open` | LeaderRecords | `.../LeaderHistory/Header/Icon` |
| War 战争 | `swords` | level0 里 key 为空（csv 里有同名 key `War`） | `.../War/Header/Icon` |
| Family 家族 | `castle` | Families | `.../Family/Header/Icon` |
| Traits 特质 | `shield` | StateTrait | `.../Traits/Header/Icon` |
| Diplomacy 外交 | `handshake` | Diplomacy | `.../Diplomacy/Header/Icon` |
| History 历史 | `scroll` | History | `.../History/Header/Icon` |
| Resource 资源 | `database` | Resource | `.../Resource/Header/Icon` |
| （MainHistory，默认隐藏） | `book-open` | History | `.../MainHistory`，activeSelf = false |

- 展开/收起的箭头：`chevron-down` / `chevron-up`（16×16，白色）【实测 CollapsibleSectionUI `m_ChevronDownSprite`/`m_ChevronUpSprite`】。
- **更正策划计划 A-2 里的两处推断**：
  - 家族图标是 `castle`，不是 `users`/`git-branch`。
  - Trait 的标题 key 是 `StateTrait`。
- `users`、`git-branch`、`x`、`Search` 在 resources.assets 里，但 level0 的界面没有引用它们，本批先不用。

### 1.4 字体

#### 用在哪里（实测，`fonts.json` 加 level0-ui.json）

| 原作字体资源 | 用在哪里 | 用量 |
|---|---|---|
| **TW-Kai-98_1 SDF**（全字库正楷体，sharedassets0 Font pathID 214） | 界面主字体：面板标题、区标题、按钮、工具栏、事件条、时间 | level0 界面 1,578 处 |
| Roboto-Regular SDF | Localization 组件的拉丁文字体（`uiCustomLatinFont`），城市名（World.EnglishCityNameFont） | 61 处 |
| RobotoSlab-VariableFont_wght SDF | World.EnglishFont；界面里用在 LanguageChoose、Settings、Thanks、HistoryInfo 的标题 | 154 处 |
| **Avara SDF** | World.EnglishMapFont，也就是地图上的英文国名大标签 | 地图 |
| LiberationSans SDF | TMP 默认字体，多数是没改过的占位按钮 | 104 处 |
| OpenSans-Regular / Semibold / Bold SDF | Settings、Workshop 等的少量文字；DisplaySettings 标题用 OpenSans-Bold | 66 处 |
| ARIAL SDF | HistoryInfo、Announcement 等的零星文字 | 17 处 |
| 微軟正黑體（只有 TMP 图集，没有 Font 对象） | World.ChineseMapFont（中文地图字体）。界面里只出现在抖音直播画布，本批不用 | 9 处 |
| NotoSerifKR-Regular SDF | World.KoreanFont | 4 处 |

#### 国名大标签用的衬线字体：**Avara**

- 依据一：fonts.json 里 World.EnglishMapFont = Avara SDF。
- 依据二：我用 `fms_02_map_political_labels_01.jpg` 里的 "Ypresian Empire" 和原作带的 8 种衬线字体逐个渲染对比。只有 Avara 吻合：Y 的弯臂、硬折角、a 的形状都对得上。RobotoSlab、Playfair、Noto Serif 都不像。对照图：`extracted-ui/compare/label_font_compare3.png`。
- 标签字距明显偏宽【估：约 0.08–0.12 em，从截图量的】。
- 城市小字是 Roboto（截图里的 "Himoto"、"Chengen"，和 EnglishCityNameFont 一致）。

另外，resources.assets 里有个 `FontDropdownCatalog`，列了 8 个可选字体：Avara、TW Kai、Moria Citadel、Playfair、Roboto、Inconsolata、NotoSerifCJK、NotoSansCJK【实测】。它挂在哪个菜单上（推测是地图标签字体选择），level0 里还没确认。本批不做这个选择器。

#### 网页字体方案（Bob 已定：用原作字体）

| 用途 | CSS font-family | 打包方式 | 许可（依据） |
|---|---|---|---|
| 界面主字体 | `'TW-Kai', 'LXGW WenKai', serif` | **Bob 已定：直接打包原作 TW-Kai-98_1（版本 103.1）的字符子集**。成品是 `extracted-ui/fonts-web/TW-Kai-98_1.subset.woff2`：字表用原作还原的 `twkai-charset.txt`（3,017 字，其中汉字 2,896 个），覆盖率 100%，文件 1,481,636 B（约 1.41 MiB）【实测】。LXGW WenKai 只在子集缺字时作回退，见下面「字表外的文字」 | TW-Kai：数位发展部「全字库」，**可以二选一：政府资料开放授权条款第 1 版，或 OFL-1.1**，可以商用、改作、散布，但必须署名。依据：https://data.gov.tw/dataset/5961 的「授權方式」和备注；https://www.cns11643.gov.tw/pageView.jsp?ID=59 ；条款原文 https://data.gov.tw/license 。原作里那份字体的 name 表也写着「(c)2018 National Development Council. Open Government Data License, version 1.0」。建议选**政府资料开放授权条款第 1 版**：裁剪子集属于「改作」，这份条款明确允许，只要求署名，不涉及 OFL 的保留字体名问题。 |
| 拉丁文界面字 / 城市名 | `'Roboto', 'Liberation Sans', Arial, sans-serif` | 打包 Roboto-Regular、Roboto-Bold（原作文件） | Apache 2.0（字体 name 表） |
| 设置类标题 | `'Roboto Slab', serif` | 打包原作 RobotoSlab 可变字体 | Apache 2.0（name 表） |
| 地图英文国名 | `'Avara', 'Roboto Slab', serif` | **整份原样**打包原作 Avara.otf（28 KB），**不裁剪**。Avara 是 OFL 保留字体名，改过的版本不能再叫 Avara | OFL-1.1，Raphaël Bastide / Velvetyne（https://velvetyne.fr/fonts/avara/ ）。原作那份 name 表里没有许可字段，要随附 OFL 全文和版权行 |
| 地图中文国名 | `'Microsoft JhengHei', 'Noto Sans TC', sans-serif` | **不打包**，只写系统字体名，没装的设备回退到 Noto Sans TC | 微软正黑体是商业字体；Noto Sans TC 是 OFL |
| ARIAL 零星文字 | `Arial, 'Liberation Sans', sans-serif` | **不打包** | Arial 是 Monotype 商业字体（name 表）；Liberation Sans 是 OFL |
| TMP 默认 / 占位 | `'Liberation Sans', Arial, sans-serif` | 可以打包原作 LiberationSans（OFL）| OFL（name 表） |
| 韩文 | `'Noto Serif KR', serif` | 按需 | OFL |

- TW-Kai 原文件 52 MB，**一定要裁剪**。
- **字表**【实测】：`original/_ui-export/twkai-charset.txt`（原作还原生成，sha256 9f319c62…8cef，说明见同目录 `twkai-charset.md`）。
  - 来源：主 localization.csv 和 Base 模块 localization.csv 的简繁两列；7 个文化的国名、城市名、人名表；CultureData 的官职和文化名；resources.assets 内置名表；另补 ASCII 95 个字符。
  - 原作的随机人名、国名都是从名表整条抽取，不是逐字拼的，所以名表里的字收全，就覆盖了所有随机名。
  - 网页新增的界面文字，要先并入字表再重新裁剪。
- **网页字体成品**（`extracted-ui/fonts-web/`，【实测】字节数）：

| 文件 | 处理 | 大小 |
|---|---|---|
| `TW-Kai-98_1.subset.woff2` | pyftsubset 裁剪，去掉 hinting，保留全部 OpenType 特性；3,028 个字形 | 1,481,636 B |
| `Avara.woff2`（加 `Avara.otf` 原件） | 不裁剪，只换 WOFF2 封装 | 13,280 B |
| `Roboto-Regular.woff2` / `Roboto-Bold.woff2` | 不裁剪 | 63,648 / 64,072 B |
| `RobotoSlab-VariableFont_wght.woff2` | 不裁剪，保留可变轴 | 115,748 B |

  首屏字体合计约 1.74 MB（未压缩传输；woff2 本身已经压缩）。`@font-face` 要写 `font-display: swap`；TW-Kai 要 preload【网页适配】。
- **字表外的文字一律回退 LXGW WenKai【网页适配】**。这些情况不在字表里：
  - 玩家输入的国名、人名、城市名；
  - 自定义地图标签（EditCustomLabel）；
  - 创意工坊或导入的地图；
  - 原作代码里写死的字符串；
  - 加密数据里的文字（我们不解密）。
  回退靠 CSS 字体栈 `'TW-Kai', 'LXGW WenKai', serif` 自动逐字回退，不用写代码判断。LXGW WenKai 用官方发布的子集包（OFL-1.1），按 `unicode-range` 分片按需加载。
- **TW-Kai 必须带的署名**（已写进 `extracted-ui/fonts-web/README.md`；正式发布时放进 `public/original-ui/fonts/LICENSE`，再在「鸣谢」里放一份）：
  > 数位发展部 2018 CNS11643 中文标准交换码全字库 全字库正楷体（TW-Kai 103.1）。本网站使用的是依字表裁剪的子集（改作）。此开放资料依政府资料开放授权条款（Open Government Data License）进行公众释出，使用者于遵守本条款各项规定之前提下，得利用之。政府资料开放授权条款：https://data.gov.tw/license

## 2. 配色总表

| hex | 用途 | 依据 |
|---|---|---|
| `#fafaf9` | 面板外框填充（国家、编辑器、文化、宗教、截图、导出、警告等 10 个面板） | 【实测】`Canvas/StateInfoNewUI` 等的 MPImage |
| `#000000` | 面板描边（宽 2.11）、图标着色、正文文字 | 【实测】同上 OutlineColor；TMP 颜色有 1,188 处是 #000000 |
| `#dbdbdb` | 面板主体底色 | 【实测】`StateInfoNewUI/Border`、`EditPanelNewUI/Panel` |
| `#f0f0f0` α 0.392 | 折叠区底色（收起时），叠出来约 #e3e3e3 | 【实测】`.../Content/BasicInfo` 等；叠色是【换算】 |
| `#ffffff` α 0.569 | 区头 | 【实测】`.../<Section>/Header` |
| `#ffffff` α 0.40，描边 `#e5e7eb` | 区内容底、滑块组底 | 【实测】`.../Content/Panel`、`EditCountry/StateCount` |
| `#adadad` α 0.09 | 面板标题拖动条 | 【实测】`.../Dragger` |
| `#a6a6a6` α 0.68，描边 `#858484` | 国名输入条 | 【实测】`StateInfoNewUI/CountryPanelHeaderTMP/CountryNameInput` |
| `#569ef0` | 编辑器主按钮 | 【实测】17 处；截图 `news_20250520_editor_b.png` 里最多的有色像素也是 #569ef0，两边一致 |
| `#fa6969` / `#5fb685` / `#e4a132` | 删除 / 绘制 / 擦除 | 【实测】`EditCountry/ActionPanel/*` |
| `#f1f1f1` α 0.75 | 国家面板「关闭」按钮 | 【实测】`StateInfoNewUI/ClosePanel` |
| `#91c7ff` α 0.53 | 编辑器输入框 | 【实测】`InputNamePrefab/InputField (TMP)` |
| `#6464af`（α 0.39 / 1.0） | 工具栏按钮禁用态的底和字 | 【实测】`BottomPanel/.../Disabled` |
| `#ffffff` | 底部工具栏底（`Background` 贴图） | 【实测】`Canvas/BottomPanel` |
| `#ffffff` α 0.66 加 `thinstraight` 黑边 | 顶部大事件条 | 【实测】`Canvas/MajorEvent` |
| `#ffffff` α 0.49 加 `thinstraight` 黑边 | 时间显示 | 【实测】`Canvas/TimeDisplay` |
| `#808080` | 输入框占位文字 | 【实测】`CountryNameInput/Placeholder` |
| `#0c0c0c` | 地图国名颜色（8 个预设都一样） | 【实测】displaysettings-43912.json `stateNameColor` |
| `#868686` | **海路**默认色（不在预设里，切预设不改） | 【实测】level0 World 组件 #44231 `seaRouteColor`（RGB 各 0.5255）。同一组件里海路线宽 0.37，虚线段长 1.01，间隔 0.56 |
| `#b2b2b2` | **省界**默认色（不在预设里，切预设不改） | 【实测】World `provinceBorderColor`（RGB 各 0.7） |
| `#e5e6e6` | ~~面板底~~ **作废**。这是截图里看到的叠色，不是原作颜色 | `news_20250316_nationpanel.png` |

截图核对：`news_20250316_nationpanel.png` 里出现最多的颜色是 #e5e6e6（区底叠色）、#ededed/#edeeee（区内容底，【换算】是 #eeeeee）、#d9dada（主体，实测 #dbdbdb）。`news_20251201_alliance.png` 里最多的是 #eeeeee（区内容底，和【换算】值完全一致）。截图和 level0 的结构对得上。

## 3. A-1 主界面布局（PR 1）

**对照截图**：`web-screenshots/fms_01_main_nationinfo_history_character_01.jpg`（主界面加工具栏）；`comm_recent_06.jpg`（顶部事件条）。两张都是 1920×1080，可以直接按 s=1 和 level0 数值对比。

### 桌面 1920×1080（主）/ 1600×900（次）

| 元素 | 原作节点 | 尺寸 / 位置（画布单位）【实测】 | 1920×1080 px【换算】（1600×900） | 贴图 / 字体 |
|---|---|---|---|---|
| 底部工具栏 | `Canvas/BottomPanel` | 横向铺满（anchor 0–1），高 30，localScale 0.9，pivot 在底边中点；HorizontalLayoutGroup spacing 1.02，子项对齐 7（底部居中） | 高 27（22.5）；缩放后宽 = 视口 90%：1728（1440），居中贴底 | 底 `Background`（九宫格 10）着 #ffffff；按钮见 1.2；文字 TW-Kai 25 → 22.5 px（18.75） |
| 工具栏按钮（active 的，按场景顺序） | `BottomPanel/*` | 共 10 个，文字按 0.2 的规则取：key 为空就用节点名当 key。逐个见下表 | — | ButtonManager 的 `buttonText` 只是占位，不能照抄 |
| 工具栏字号 | `LocalizationButton` | `fontSizeCN 21.6`，`fontSizeEn 20`；TMP 序列化的 textSize 是 25 | 中文 19.4 px（16.2），英文 18 px（15）【换算 ×0.9】 | 【估】运行时用 LocalizationButton 的字号盖掉 TMP 的 25。之前写的 22.5 px 是按 25 算的，作废 |
| 顶部大事件条 | `Canvas/MajorEvent` | 1000×83.6，顶部居中，距顶 22.4 | 1000×83.6，距顶 22.4（833×69.7，距顶 18.7） | 底 #ffffff α 0.66，外框 `thinstraight`（九宫格 18.75）着 #000000；文字 TW-Kai 25.5 px（21.25），#000000 |
| 时间显示 | `Canvas/TimeDisplay` | 200×41.4，中心在 (−649, 521) | 200×41.4，中心 (311, 19)（167×34.5，中心 (259, 16)） | 同上，文字 TW-Kai 25.5，α 0.49 |
| 左侧国家面板位 | `Canvas/StateInfoNewUI` | 见第 4 节 | 298.1×972.0，左边距 44.0，顶边距 53.3（248.4×810.0，36.6，44.4） | — |
| 编辑器面板位 | `Canvas/EditPanelNewUI` | 见第 4 节 | 宽 253.5，左上角 (1485, 41)（宽 211.2，(1237, 34)） | — |
| 地图外观面板 | `Canvas/DisplaySettings` | 340.3×1303，localScale 0.6，中心在 (−719, −29.6) | 204.2×781.8，中心 (241, 570)（170×651.5，(201, 475)） | 底 `Rounded Filled 256px` #ffffff α 0.4，内层 `thinstraight` #000000；标题 OpenSans-Bold 28.6 |
| HISTORY 面板 | `Canvas/HistoryInfo`（旧样式，默认隐藏） | 521.54×1273.66，localScale 0.6，中心 (726.2, 2.7) | 312.9×764.2，中心 (1686.2, 537.3)（260.8×636.8，(1405.2, 447.8)） | 见 4.8 |
| 导出图片面板（截图导出） | `Canvas/ScreenshotPanel`（新样式，默认隐藏） | 195.6×398.6，localScale 1.296（导出四舍五入显示 1.3），pivot 左上，(526, 499) | 253.5×516.6，左上角 (1486, 41)（211.2×430.5，(1238, 34)） | 见 4.8 |
| 导出历史记录面板 | `Canvas/ExportHistoryPanel`（新样式，默认隐藏） | 195.6×166.51，localScale 1.296，pivot 左上，(526, 499) | 253.5×215.8，左上角 (1486, 41)（211.2×179.8，(1238, 34)） | 见 4.8 |
| 联盟、人物面板 | 预制件 `ui/base/allianceinfopanel`、`ui/base/characterpanel` | 230×750，localScale 1.296，中心 (−767, 0.75)，和国家面板同一个位置 | 298.1×972.0，左边距 44.0，顶边距 53.3（248.4×810.0） | 见 4.6、4.7 |

#### 底部工具栏文字和 key【依据：level0 节点名 + localization.csv + 原作还原 `ui-text-check.md`】

所有按钮的 LocalizationButton key 都是空的，按 0.2 的规则用节点名当 key。

| # | 节点 | 显示文字（中 / 繁 / 英） | 依据 | 占位（不许照抄） |
|---|---|---|---|---|
| 1 | `Panel/GenerateMap` | 生成地图 / 生成地圖 / Generate Map | 节点名 = key | 生成地图 |
| 2 | `DisplayPanel/MapAppearance` | **地图外观 / 地圖外觀 / Map Appearance** | csv 第 193 行。强推断，待核 | 地图展示 |
| 3 | `Panel (1)/Settings` | 菜单选项 / 菜單選項 / Settings | 节点名 = key | 菜单选项 |
| 4 | `HistoryPanel/History` | 历史记录 / 歷史記錄 / History | 节点名 = key；打开 HISTORY 面板，见 4.8 | 历史记录 |
| 5 | `Panel (3)/Statistics` | 统计信息 / 統計信息 / Statistics | 节点名 = key | 统计信息 |
| 6 | `Panel (4)/SetAsWallpaper` | 设为壁纸 / 設為壁紙 / Set As Wallpaper | 节点名 = key | 设为壁纸 |
| 7 | `Panel (6)/MapEditor` | **地图编辑 / 地圖編輯 / Map Editor** | 节点名 `MapEditor` 是 csv 第 228 行的 key，按 0.2 的规则推断，待核。上一版写的 `EditMode`「编辑模式」是照抄占位，作废 | 编辑模式 |
| 8 | `Panel (7)/PauseGame` | 暂停游戏 ↔ 继续游戏（`ResumeGame`） | 节点名 = key；暂停后由代码换成 ResumeGame | 暂停游戏 |
| 9 | `Panel (10)/SpeedChange` | 当前档位，例如「1倍速」 | 节点名不是 key，文字由代码写入，见下一节 | 暂停游戏 |
| 10 | `Panel (9)/FAQ` | **常见问题 / 常見問題 / FAQ** | csv 第 1586 行。推断，待核。不是 `Tips`「提示」（csv 第 594 行，这个按钮没有引用它）。如果运行时不替换，就会显示占位的英文「Tips」 | Tips（RobotoSlab 22.8） |
| 隐藏 | `Panel (2)/Diplomacy`、`Panel (5)/GenerateMap`、`Panel (8)/Thanks` | 外交、—、鸣谢 | 默认不显示，网页也不显示 | 外交操作、速度x1、鸣谢 |

**工具栏宽度复核（FAQ 改成 4 个字以后）**【换算：用 TW-Kai 和 RobotoSlab 的字宽实算，字号 21.6 × 0.9】：
- 「常见问题」宽 77.8 px（64.8），原来的「Tips」只有 42.9 px（35.8），多了 34.9 px（29.1）。
- 现在 10 个按钮里有 9 个是 4 个汉字，每个 77.8 px；倍速最宽的一档「0.1倍速」是 68.0 px。文字合计 767.9 px（639.9）；按钮间距 9 × 0.92 = 8.3 px。
- 工具栏宽 1728 px（1440），扣掉文字和间距后，平均每个按钮还剩约 95 px（79）给内边距。原作的内边距没导出【估】，但余量足够，一行放得下，不会挤。
- 英文界面「Map Appearance」「Set As Wallpaper」这类长词明显更宽，要单独排一次，看会不会超宽【估】。

#### 倍速按钮（7 档）【实测样式；档位来自原作还原】

- 档位：0.1 / 0.5 / 1 / 2 / 3 / 4 / 5 倍，**默认 1 倍**。
- 按钮文字分别取 csv：`MinumSpeed` 0.1倍速、`HalfSpeed` 0.5倍速、`NormalSpeed` 1倍速、`DoubleSpeed` 2倍速、`TripleSpeed` 3倍速、`QuadrupleSpeed` 4倍速、`QuintupleSpeed` 5倍速（英文是「0.1x Speed」…「5x Speed」）。
- 外观：就是工具栏里的普通一格，**原作没有档位刻度、滑块或图标**（`enableIcon 0`，`autoFitContent 1`，`spacing 14`）。所以 7 档在视觉上的区别只是文字不同。
  - 常态：`straight final` 黑边，黑字。
  - 悬停 / 按下：`Rounded Filled 128px` 黑底，白字。
  - 禁用：#6464af。
  - 宽度随文字自动撑开（autoFitContent）。7 档里「0.1倍速」「0.5倍速」最宽，68.0 px（56.7）；「1倍速」到「5倍速」更窄。网页把这个按钮的最小宽度定成 68.0 px，免得切档时其他按钮跳动【网页适配】。
- **切档**：每点一次升一档，**到 5 倍后再点回到 0.1 倍，循环**。依据：按钮 onClick 调 `BottomPanel.OnGameSpeedButtonClicked`【实测】，旧拆解记录说 ApplyGameSpeed 对档位数组长度取余。方法体不在 box 上，所以**待核**（原作还原 `ui-text-check.md` 第 5 节）。
- 暂停时倍速按钮显示什么，没有数据。网页先保持显示当前档位【估】。

### 手机竖屏 430×932【网页适配】

- 测试数据：面板收起时，地图占屏约 82%；国家面板打开后只剩约 57%，低于 60% 的要求。
- **方案**：所有面板改成底部抽屉（bottom sheet）。
  - **默认高度上限 40% 视口**（≤ 372.8 px），保证地图 ≥ 60%。
  - 只有用户主动拖动把手，或点「展开」，才全屏（留出顶部安全区）。程序不能自动全屏。
  - 同一时间只开一个抽屉。
- 工具栏：贴底一行，高 44 px（触控最小值，【网页适配】）。图标顺序沿用原作：暂停、倍速、历史、国家、「更多」。其他按钮收进「更多」。
- 事件条：放在顶部安全区下面，最多一行，字号 14 px【估】，点开看全文。
- 按 932 高换算：s = 0.863。原作 1920 宽的布局在 430 宽下放不下（相当于画布宽 498），所以面板宽度改成 100vw，内边距 12 px【网页适配】。
- **验收**：430×932 下打开任意一个面板（默认高度），地图可见面积 ≥ 60%。收起时目标 ≥ 75%，沿用策划的验收。

## 4. A-2 国家 / 战争 / 外交 / 编辑器（PR 2）

**重要更正**：原作里**战争和外交不是独立面板**，而是国家面板 `StateInfoNewUI` 里的两个折叠区（War、Diplomacy）【实测】。区内的行由 `CollapsibleSectionUI.RowInfoPrefab`（`InfoRow` 预制件）在运行时生成，level0 里没有行的内容。原作还原现在导出了 InfoRow、WarPanel、DropDownInfo、AllianceInfoPanel、CharacterPanel 这几个预制件（`prefabs-ui.json`），下面的行规格以它为准。

**本节的换算规则**：国家、联盟、家族、编辑器面板都是 localScale 1.296，所以 1920×1080 下 px = 画布单位 × 1.296，1600×900 下 × 1.08。

### 4.1 国家面板 = `Canvas/StateInfoNewUI`

**对照截图**：`news_20250316_nationpanel.png`（595×1942，2025-03，新版）；`comm_recent_01.jpg`（中文）；`comm_recent_04.jpg`。

| 部件 | 节点 | 画布单位【实测】 | 1920×1080 px【换算，×1.296】（1600×900，×1.08） | 样式 |
|---|---|---|---|---|
| 面板 | `StateInfoNewUI` | 230×750，localScale 1.296，中心在 (−767, 0.75) | 298.1×972.0（248.4×810.0） | 1.1 三层结构；描边 2.73 px（2.28） |
| 标题栏 | `Dragger` | 宽 230，高 34.1，顶对齐 | 高 44.2（36.8） | 标题「国家信息」（key NationInfo），TW-Kai 21.5 → 27.9 px（23.2），#000000 |
| 国名条 | `CountryPanelHeaderTMP` | 宽 228.4，距顶 39.7；输入框高 23.1 | 输入框高 29.9（24.9） | 输入框 #a6a6a6 α 0.68；文字 TW-Kai 16.6 → 21.5 px（17.9）；下面有一条 10 高的国家色条（`Image` #000000，运行时着国家色） |
| 滚动区 | `Scroll View` | 距顶 91.1，上下共内缩 126.1 | 距顶 118.1（98.4） | 滚动条 `Rounded Filled 128px`，宽 5.2，轨道 α 0.1 |
| 折叠区 ×9 | `Content/*` | 宽 208.9，左边距 9.5，间距 10；区头高 20；图标 15×15；标题 TW-Kai 14.6；箭头 16×16 | 区宽 270.7；区头 25.9；图标 19.4；标题 18.9 px；箭头 20.7；间距 13.0（225.6 / 21.6 / 16.2 / 15.8 / 17.3 / 10.8） | 颜色和图标见 1.1、1.3。顺序：基本信息、行动、领袖记录、**战争**、家族、特质、**外交**、历史、资源 |
| 关闭按钮 | `ClosePanel` | 160×20，底部居中，距底 8.9 | 207.4×25.9，距底 11.5（172.8×21.6，9.6） | `Rounded Filled 1024px` #f1f1f1 α 0.75；TW-Kai 14 → 18.1 px（15.1） |

- 区的高度是「区头加内容」，由运行时决定。

#### 通用行 `InfoRow`【实测 prefabs-ui.json：sharedassets0 #691 / resources #5741，`newuiprefabs/inforow`】

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 行 | 210.2×20 | 272.4×25.9（227.0×21.6） | 没有底色 |
| 标题 Title | 占满整行，右边留 105.642 | 右边留 136.9（114.1），也就是只用左半边 | TW-Kai 10 → 13.0 px（10.8），**粗体**（fontStyle 1），左对齐、顶对齐，#000000；占位文字「人口:」 |
| 数值 Value | 占满整行，左边留 105.434 | 左边留 136.6（113.9），也就是只用右半边 | 同上，粗体 #000000；占位文字「1」 |
| 文字框 | 高 −10，上移 5 | 文字框比行矮 13.0 px（10.8） | — |

所以一行就是「左半边标签、右半边数值」，两边都左对齐。这和截图里 Basic 区的排法一致。

### 4.2 战争 = 国家面板里的 War 折叠区

- 区头【实测】：图标 `swords`，标题由运行时赋值（level0 里占位文字是「基本信息」，key 为空），箭头 `chevron-down`/`chevron-up`。尺寸和颜色同 4.1。
- 区内容【实测】：`War/Content` 宽 204.9，里面有一个默认隐藏的 Panel（208.9×13，白色 α 0.4，描边 #e5e7eb）。
- **每场战争一块 `WarPanel`**【实测 prefabs-ui.json，sharedassets0 #772】：

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 战争块 | 宽 205.3，高由内容撑开 | 宽 266.1（221.7） | MPImage #ffffff α 0.16，描边 #e5e7eb 0.5 → 0.65 px（0.54）；VerticalLayoutGroup spacing 5 → 6.5（5.4），childAlignment 1（顶部居中） |
| 战争标题 WarText | 高 14，边距 [0, 0, −1.1067, −0.7743] | 字 18.1 px（15.1） | TW-Kai 14，粗体，左对齐、顶对齐，自动换行 |
| 战争下面的明细行 | 用 InfoRow | 同上 | 同 InfoRow |

- 一块里有哪些明细行（交战方、开战时间、战分等）由运行时代码决定，预制件里没有。字段清单照策划的计划；行的样式一律用 InfoRow【实测样式，字段清单【估】】。
- 地图上的战争元素（红色战线、军队箭头）属于地图层，见 `fms_08`、`fms_09`，本批只做对照，不在面板里画。

### 4.3 外交 = 国家面板里的 Diplomacy 折叠区

- 区头【实测】：图标 `handshake`，标题 key `Diplomacy`（外交）。尺寸和颜色同 4.1。
- 区内容【实测】：`Diplomacy/Content` 宽 204.9，没有静态子节点。
- **行**：原作**没有外交专用的行预制件**（prefabs-ui.json 里没有）。网页直接用 InfoRow（左边对方国名，右边关系），规格同 4.1 的 InfoRow 表。**InfoRow 用在外交区 = 网页适配**。
- 关系文字（同盟、交战、停战等）用 csv 里现成的 key，不新造。关系颜色原作没有数据，网页先不加颜色【网页适配】。
- 联盟的详细信息在独立的 ALLIANCE INFO 面板，见 4.6。

### 4.4 编辑器面板 = `Canvas/EditPanelNewUI`

**对照截图**：`news_20250520_editor_b.png`（280×751，2025-05，Edit State 模式）。

| 部件 | 节点 | 画布单位【实测】 | 1920×1080 px【换算】（1600×900） | 样式 |
|---|---|---|---|---|
| 面板 | `EditPanelNewUI` | 宽 195.6，高由内容撑开；localScale 1.296；左上角在 (524.656, 499) | 宽 253.5，左上角 (1485, 41)（211.2，(1237, 34)） | 外框 #fafaf9，描边 #000000 2.11；主体 `Panel` #dbdbdb，宽 193.6 |
| 标题栏 | `Panel/Dragger` | 193.6×34.1 | 250.9×44.2（209×36.8） | 「地图编辑」（key MapEditor），TW-Kai 21.5 |
| 模式下拉 | `EditModeDropDownInfo/DropDown` | 宽 180，高 27.1 | 233.3×35.1（194.4×29.3） | 白底，描边 #e5e7eb；箭头 `chevrons-up-down` 10×10。模式子面板有 EditHeight、EditBiom、EditCountry（默认）、EditFamily、EditArea、EditProvince、GlobalCommands、EditCulturePanel、EditReligionPanel、EditCustomLabel |
| 按钮（整行） | `EditCountry/GenerateCountry`、`RandomState`、`Tips`、`ClearMap`、`ClosePanel` | 180×20 | 233.3×25.9（194.4×21.6） | `Rounded Filled 1024px`；主按钮 #569ef0，普通按钮 #ffffff；TW-Kai 14 → 18.1 px（15.1） |
| 滑块组 | `EditCountry/StateCount`、`BrushSize` | 宽 180；滑块高 9.8 | 滑块高 12.7（10.6） | 组底 #ffffff α 0.42，描边 #e5e7eb |
| 四个操作按钮 | `EditCountry/ActionPanel/{Edit,Delete,Draw,Erase}` | 排成一行，尺寸由 Layout 决定（level0 里是 0） | 【估】按截图每个约 50×26（42×21） | #569ef0 / #fa6969 / #5fb685 / #e4a132 |
| 列表和分页 | `EditCountry/ListPanel` | 宽 180；分页条 178.5×21.7 | 231.3×28.1（192.8×23.4） | 分页条 `Rounded Filled 1024px` 白色；新增按钮 `circle-plus` |
| 名称输入 | `InputNamePrefab` | 180×42；输入框 168.5×18 | — | #91c7ff α 0.53；标签 TW-Kai 10（中文 12） |

### 4.6 联盟面板 = 预制件 `ui/base/allianceinfopanel`【实测 prefabs-ui.json】

**对照截图**：`news_20251201_alliance.png`（330×1108）。

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 面板 | 230×750，localScale 1.296，中心 (−767, 0.75) | 298.1×972.0（248.4×810.0），和国家面板同一位置 | 1.1 三层结构 |
| 标题 | — | 27.9 px（23.2） | 「联盟信息」（key `AllianceInfo`），TW-Kai 21.5 |
| 联盟名输入框 | — | — | #a6a6a6 α 0.68；下面一条高 10 → 13.0 px（10.8）的颜色条，运行时着联盟色 |
| 区 ×3 | 宽 214.9，x 6.5 | 宽 278.5（232.1），左边 8.4（7.0） | 区样式同 1.1；行用 InfoRow；三个区都是 `m_StartExpanded 1`，打开时全部展开（运行时待核） |
| 区 1 | `section_BasicInfo` | — | 图标 `scroll`，key `BasicInfo`（基本信息） |
| 区 2 | `section_Actions` | — | 图标 `flag`，key `Actions`（csv 是「行省操作」） |
| 区 3 | `section_StateInfo` | — | 图标 `swords`，key `NationInfo`（国家信息），列成员国 |
| 操作按钮（Actions 区里） | 每行 208.9×20 | 270.7×25.9（225.6×21.6） | Disband / Kick / Join：#51b6ff α 0.7；SetAsCapital：#ff7ee8 α 0.55（默认隐藏）；Fortress / Defortify / Translate：#ff7e8f α 0.55；开关 `toggle_Unbreakable`：#26e42f α 0.58；EnableAll / DisableAll：160×20 → 207.4×25.9（172.8×21.6），#5196ff α 0.7 |
| 底部按钮 | 160×20 | 207.4×25.9（172.8×21.6） | #f1f1f1 α 0.75，文字「退出结盟」 |

- 操作按钮的文字按 csv 里同名 key 显示；某个 key 在 csv 里没有的话，照预制件里的占位文字，在 PR 里列出来【估】。

### 4.7 人物面板 = 预制件 `ui/base/characterpanel`（标题「人物」）【实测 prefabs-ui.json】

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 面板 | 和联盟面板一样 | 298.1×972.0（248.4×810.0） | 1.1 三层结构 |
| 标题 | — | 27.9 px（23.2） | **「人物」/ 人物 / Character**。`Dragger/PanelTitle` 的 LocalizationText 显式写了 key `Character`，对应 csv 第 1241 行【实测】。「家族信息」只是占位，csv 里没有哪个 key 的中文是它 |
| 滚动区 | 距顶 78.3，上下共内缩 113.3 | 距顶 101.5（84.6），上下共内缩 146.8（122.4） | 同国家面板 |
| 区 ×5 | 宽 214.9，x 6.5，`m_StartExpanded 1`（打开时全部展开），行用 InfoRow | 宽 278.5（232.1） | 依次是：BasicInfoSection（图标 `castle`）、AttributesSection（`users`）、TraitsSection（`map`）、FamilySection（`handshake`）、BiographySection（`scroll`）。区标题在预制件里都是占位的 key `BasicInfo`，运行时才改，所以每个区的标题文字要从 csv 里找对应的 key【估】 |
| 颜色条 | 208.4×10（默认隐藏的 ColorPicker） | 270.1×13.0（225.1×10.8） | 默认隐藏，网页也先不显示 |

### 4.8 HISTORY 和图片导出【实测，原作还原核对过】

**HISTORY = `Canvas/HistoryInfo`**（旧样式；入口是工具栏「历史记录」，节点 `BottomPanel/HistoryPanel/History`）。localScale 0.6，所以 1920 下 px = 画布单位 × 0.6，1600 下 × 0.5。

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 面板 | 521.54×1273.66，中心 (726.2, 2.7) | 312.9×764.2，中心 (1686.2, 537.3)（260.8×636.8，(1405.2, 447.8)） | `Rounded Filled 256px` #ffffff α 0.75，外加 `thinstraight` #000000 边框 |
| 标题栏 Dragger | 493.5×64.2 | 296.1×38.5（246.8×32.1） | 「HISTORY」，RobotoSlab 34.1 → 20.5 px（17.1）；中文字号 45 → 27 px（22.5） |
| 滚动区 | 490.7×1133.5 | 294.4×680.1（245.4×566.8） | — |
| 关闭按钮 | 178.6×30，自身 scale 1.5 | 160.7×27（133.9×22.5） | MUIP 按钮，样式同工具栏 |

- 每条历史记录长什么样，预制件里没有导出。网页先用 InfoRow 的字号和颜色【估】。

原作有**两个**长得一样的导出面板，占位标题都写「图片导出」，但 key 不同【实测，原作还原 `ui-text-check.md` 第 4 节】。

**导出图片 = `Canvas/ScreenshotPanel`**（ScreenshotPanelUI，新样式，默认隐藏）

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 面板 | 195.6×398.6，localScale 1.296，pivot 左上，(526, 499) | 253.5×516.6，左上角 (1486, 41)（211.2×430.5，(1238, 34)） | 1.1 三层结构：外框 #fafaf9 加 #000000 描边 2.11，主体 `Panel` #dbdbdb 193.6×396.6 |
| 标题 `Panel/Dragger/Screenshot` | 拖动条 193.6×34.1 | 250.9×44.2（209.1×36.8） | **「导出图片」/ 導出圖片 / Export Screenshot**，显式 key `ExportScreenshot`，csv 第 1059 行【实测】 |
| 9 个图层开关 | 每个 180×20，间距 5 | 233.3×25.9（194.4×21.6） | `Rounded Filled 1024px` #3bd3ff α 0.76。节点依次是 ToggleCurrentMap、ToggleBiomeMap、ToggleHeightMap、ToggleStateMap、ToggleReligionMap、ToggleCultureMap、ToggleAttackArrow、ToggleArmy、ToggleBattleSword。前 6 个对应 csv 的 CurrentMap 当前视图、BiomeMap 植被图、HeightMap 高度图、StateMap 国家图、ReligionMap 宗教图、CultureMap 文化图【推断：开关组件的 key 没导出】；后 3 个的 key 待核 |
| 导出路径 `ExportPathInput` | 180×40.4 | 233.3×52.4（194.4×43.6） | 网页没有本地路径，改成浏览器下载，这一行隐藏【网页适配】 |
| 导出尺寸 `ExportSizeDropDownInfo` | 180×27.1 | 233.3×35.1（194.4×29.3） | 同编辑器的模式下拉 |
| 导出 `ExportMap` / 关闭 `ClosePanel` | 180×20 | 233.3×25.9（194.4×21.6） | `Rounded Filled 1024px` #ffffff。关闭 = csv `ClosePanel`「关闭面板」；导出按钮的 key 没导出，占位「导出地图」不许照抄【待核】 |

**导出历史记录 = `Canvas/ExportHistoryPanel`**（ExportHistoryPanelUI，新样式，默认隐藏）

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 面板 | 195.6×166.51，localScale 1.296，pivot 左上，(526, 499) | 253.5×215.8，左上角 (1486, 41)（211.2×179.8，(1238, 34)），和编辑器面板几乎同一位置 | 1.1 三层结构 |
| 标题 `Panel/Dragger/ExportHistory` | — | 27.9 px（23.2） | **「导出历史记录」/ 導出歷史記錄 / Export History**，显式 key `ExportHistory`，csv 第 1060 行【实测】。但这个标题节点在场景里是隐藏的（activeSelf = false），运行时会不会显示，待核 |
| 「当前视图」开关 | — | — | #3bd3ff α 0.76 |
| 修改导出路径 ModifyExportPath | — | — | #ff8989。网页没有本地路径，这个按钮改成「下载」或者隐藏【网页适配】 |
| 路径输入框 | — | — | #91c7ff α 0.53 |
| 导出 / 关闭按钮 | 180×20 | 233.3×25.9（194.4×21.6） | #ffffff |

### 4.9 下拉行 = 预制件 `DropDownInfo`【实测 prefabs-ui.json，sharedassets0 #654】

| 部件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 整行 | 宽 210.2 | 宽 272.4（227.0） | — |
| 标签 | 高 20 | 高 25.9，字 15.6 px（13.0） | TW-Kai 12，#000000；占位文字「民族属性」 |
| 下拉框 | 高 20.6 | 高 26.7（22.2） | MPImage #ffffff α 0.28，描边 #e5e7eb 0.5 |
| 下拉框文字 | — | 15.6 px（13.0） | TW-Kai 12，#323232 |
| 箭头 | 10×10 | 13.0×13.0（10.8） | `chevrons-up-down`，#000000 |
| 展开列表 | 高 300，每项高 20 | 388.8 / 25.9（324 / 21.6） | — |

- 按尺寸，这个预制件是给 210 宽的面板用的（国家、文化、宗教一类）。具体挂在哪些区里由运行时决定【估】。

### 4.10 手机竖屏（以上各面板共用）【网页适配】

- 国家面板和编辑器都用第 3 节「手机竖屏」的底部抽屉：**默认最高 40% 视口，用户拖动后才全屏**。
- 抽屉顶部：
  - 国家面板：标题栏加国名条，高 【估】56 px。
  - 编辑器：标题加模式下拉。
- 抽屉内容就是原作的折叠区列表，**顺序不变，默认只展开「基本信息」**（和原作运行时一样）。区头高 44 px，满足触控要求；图标 20 px；标题 16 px【网页适配】。
- 编辑器在 40% 高度时，四个操作按钮和画笔滑块固定在抽屉底部，列表区在中间滚动。
- 战争区和外交区的行在手机上同样用 WarPanel 和 InfoRow 的结构。行高改成 44 px，字 14 px；标签和数值仍然左右各占一半【网页适配】。
- 联盟、人物、HISTORY、两个导出面板在手机上也走底部抽屉（默认 40% 视口）。HISTORY 是长列表，打开时直接显示第一屏，用户自己往下滚。

## 5. A-3 地图字体、标签、海面外观（PR 3）

**对照截图**：`fms_02_map_political_labels_01.jpg`（国名标签）、`fms_09_map_war_labels_zoom_01.jpg`（放大后的国名、省名、城市名）。截图没标外观预设号，所以**截图和预设不一一对应**。逐个预设对比，要用网页和 Bob 本地原作截的同预设截图。

### 5.1 标签字体

- 英文国名：**Avara**（World.EnglishMapFont）【实测，截图对比吻合】。颜色 #0c0c0c【实测】。字距【估】0.08–0.12 em。
- 中文国名：World.ChineseMapFont = 微軟正黑體【实测】。网页写 `'Microsoft JhengHei', 'Noto Sans TC', sans-serif`，不打包。
- 城市名：Roboto-Regular（EnglishCityNameFont）【实测】。
- 其他字段：World.EnglishFont = RobotoSlab，World.ChineseFont = TW-Kai，World.KoreanFont = NotoSerifKR【实测】。这几个字段具体管哪一层标签，level0 里看不出来，要等原作还原从代码确认。
- 各层标签的字号和出现时机：原作在 DisplaySettings 里有 `StateNameScaleSlider`、`BurgCityLabelScaleSlider`、`ArmyLabelScaleSlider`、`IconDisplayDistanceSlider` 这几个滑块【实测 displaysettings-43912.json】。场景初值和范围见 5.3。

### 5.2 外观预设（8 个，原作没有名字，只按编号验收）【实测 displaysettings-43912.json】

| # | 深海 | 浅海 | 国界线 | 海岸线 | 羊皮纸（Parchment / Texture） | 暗边 | 高度图底 | 国家色透明度 |
|---|---|---|---|---|---|---|---|---|
| 1 | `#1487ff` | `#3c9cff` | `#1487ff` | `#5f5f5f` | 开 / 开 | 开 | 开 | 0.8 |
| 2 | `#1487ff` | `#3c9cff` | `#1487ff` | `#5f5f5f` | 关 / 关 | 关 | 开 | 0.8 |
| 3 | `#5e86b0` | `#5e86b0` | `#5e86b0` | `#5f5f5f` | 关 / 关 | 关 | 开 | 0.8 |
| 4 | `#5881e3` | `#4899ee` | `#1487ff` | `#5f5f5f` | 开 / 开 | 关 | 开 | 0.9 |
| 5 | `#7da3ff` | `#7da3ff` | `#7da3ff` | `#6370ff` | 关 / 关 | 关 | **关** | 0.5 |
| 6 | `#269995` | `#269995` | `#269995` | `#5f5f5f` | 关 / 关 | 关 | 开 | 0.5 |
| 7 | `#e6dcd3` | `#e6dcd3` | `#e6dcd3` | `#4f4f4f` | 关 / 关 | 关 | 开 | 1.0 |
| 8 | `#ffffff` | `#ffffff` | `#dfdfdf` | `#5f5f5f` | 开 / 开 | 开 | 开 | 1.0 |

- 国名颜色 8 个预设都是 #0c0c0c。羊皮纸开着的是 1、4、8 三个。
- 验收按编号逐个对比（ΔE 门槛照策划的定），**不再用「羊皮纸 / 暗蓝 / 亮蓝」这类名字**。
- 截图里看到的亮度和压缩效果，是叠了羊皮纸和高度图之后的结果，不能直接拿来和上面的 hex 比。

- 预设一共只有 10 个字段（`DisplayPreset` 类）：表里 9 列加 `stateNameColor`【实测 display-sliders.json】。**线宽、标签缩放、图标显示距离、海路颜色、省界等都不在预设里，切换预设时不改这些**。

### 5.3 「地图外观」面板控件和默认值【实测 display-sliders.json + level0】

**面板**：`Canvas/DisplaySettings`，旧样式，localScale 0.6（尺寸见第 3 节）。下面的 px 都按 ×0.6（1600 下 ×0.5）换算。

**控件外观**【实测 level0】：

| 控件 | 画布单位 | 1920 px（1600） | 样式 |
|---|---|---|---|
| 每一行 | 宽 270 | 宽 162（135） | 底 `Background` #333333 α 0.39；行内用 Vertical/HorizontalLayoutGroup |
| 行标签 | 高 30 | 字 18 px（15） | TW-Kai 30，#000000，例如「国境线宽度」「植被图」「深海颜色」 |
| 滑块 | 235.1×20；轨道高 6；手柄 30×10 | 141.1×12；轨道 3.6；手柄 18×6（117.6×10；3.0；15×5） | 轨道 `Rounded Filled 128px` #ffffff；填充 #db0e0e；手柄 `Radial Outlinefill` #ffffff |
| 开关（MUIP Switch） | 70×40，自身 scale 0.6；把手 40×40 | 25.2×14.4；把手 14.4（21×12；12） | 边框 `Radial Filled 128px` #828282；把手 `Radial Outlinefill` #ffffff，On/Off 两张图切换 |
| 颜色块 | 225.1×19.1 | 135.1×11.5（112.6×9.5） | 运行时着当前颜色（场景里是 #000000 占位）；上面盖一层透明按钮，点了开取色器 |
| 预设按钮 PresetStyle | 110.3×25.1，自身 scale 1.5 | 99.3×22.6（82.7×18.8） | 常态：`Rounded Outline 1024px - 1x` #686868，黑字；悬停：`Rounded Filled 128px` 黑底白字，加 `Flat Shadow` #000000 α 0.59；禁用：#6464af α 0.39；字 TW-Kai 16.5 → 14.9 px（12.4） |
| 关闭按钮 | 178.6×30，scale 1.5 | 160.7×27（133.9×22.5） | MUIP，同工具栏 |

**9 个滑块**【实测，level0 场景初值】：

| 滑块（字段） | 节点（Content/…） | 最小 | 最大 | 场景初值 |
|---|---|---|---|---|
| StateBorderWidthSlider | BorderWidth/StateBorderWidth | 0 | 1 | 0.2 |
| CoastBorderWidthSlider | CoastLineWidth/CoastLineWidth | 0 | 1 | 0.2 |
| DarkBorderShadowWidthSlider | BorderShadowWidth | 0 | 0.02 | 0.0098 |
| StateNameScaleSlider | StateNameScale | 0 | 2 | 1.0 |
| IconDisplayDistanceSlider | IconDisplayDistance | 5 | 160 | 50 |
| AttackArrowDisplayDistanceSlider | AttackArrowDisplayDistance | 5 | 160 | 80 |
| BurgCityLabelScaleSlider | CityScale | 0 | 4 | 1.0 |
| ArmyLabelScaleSlider | ArmyIconScale | 0 | 1.4 | 0.35 |
| StateMapTransparency | TransparencyForPolitic | 0 | 1 | 0.5 |

全部是连续值（`m_WholeNumbers 0`），横向滑动。

**18 个开关**【实测，场景 isOn】：

| 场景初值 | 开关 |
|---|---|
| 开（9 个） | DisplayBiomHeightMap（植被图）、DisplayAttackArrow、DisplayBurgName、DisplayDarkBorder、DisplayFullName、DisplaySeaRoute、AutoHideBottomPanel、IsRandomStyle、IsEnableBiomeIcon |
| 关（9 个） | DisplayArmy、DisplayBurgObject、DispalyPachment、DispalyPachmentTexture、DisplayPopulation、DisplayProvinceBorder、IsDisplayTime、IsDisplayMajorEvent、IsEnableMapCoordinate |

（字段名照原作拼写，包括 `Dispaly` 这个拼错的。）

**7 个颜色块**：DeepSea、ShallowSea、SeaRoute、StateLine、CoastLine、StateName、ProvinceBorder。场景里全是 #000000 占位【实测】，**不是默认色**。真正的颜色来自当前预设（5.2）。SeaRoute 和 ProvinceBorder 不在预设里，默认色取 World 组件：**海路 #868686、省界 #b2b2b2**【实测 World #44231】。显示设置里的颜色块推断是运行时从 World 回填。World 里的国界 #1487ff、海岸线 #5f5f5f 和预设 1 一致，这也支持网页默认用预设 1。

**预设、随机、自定义**【实测字段 + 原作还原的行为说明】：
- 工具栏「地图外观」按钮和面板里的 PresetStyle 按钮（`DisplaySwitchButton`）都是切到**下一个预设**。
- 还有「随机风格」开关（IsRandomStyle）。
- 用户手动改了任何一项，就变成**自定义**，`currentPresetIndex = -1`。
- 场景存的 `currentPresetIndex` 就是 −1。

**网页首次打开的默认值【网页适配】**：
- 场景初值和 8 个预设都不一样。比如场景的透明度是 0.5，预设 1 是 0.8；场景里羊皮纸是关的，预设 1 是开的。场景初值也不等于运行时生效的值，所以**不能把场景初值当成原作默认值**。
- 网页的做法：
  - 10 个预设字段用**预设 1**；
  - 其余滑块和开关用上面的场景初值；
  - 海路 #868686，省界 #b2b2b2（World 默认值）。玩家设置或存档有可能覆盖它们，这次没读存档。
- 用 Bob 本地原作「新开游戏第一帧」的截图核对后再定稿。
- IsRandomStyle 场景值是开。它是不是表示每张新地图随机挑一个预设，没有数据【估】。网页先当作关，免得验收截图对不上。

### 5.4 地图和羊皮纸贴图（实测导出）

| 贴图 | 包 | 尺寸 | PNG |
|---|---|---|---|
| `parchmentfinal2` | sharedassets0 #122 | 4096×4096 | `extracted-ui/textures/sharedassets0/parchmentfinal2__122.png` |
| `1600x900Parchment` | resources #128 | 4096×2048 | `textures/resources/1600x900Parchment__128.png` |
| `parchmentfinal` | resources #83 | 4096×2048 | `textures/resources/parchmentfinal__83.png` |
| `parchment2` | resources #62 | 2048×2048 | `textures/resources/parchment2__62.png` |
| `Parchment` | resources #111 | 2048×2048 | `textures/resources/Parchment__111.png` |
| `white-parchment-paper` | resources #113 | 8192×4096 | `textures/resources/white-parchment-paper__113.png` |
| `template-3160023` | resources #154 | 4096×2048 | `textures/resources/template-3160023__154.png`（用途不明，【估】是羊皮纸或底纹） |
| `AL-Noise-01/02/03/08`、`AL-Noise-06` | resources / sharedassets0 | 512–2048 | 噪声贴图，【估】用于海面颗粒或羊皮纸 shader |
| `T_Noise_Clouds`、`T_Perlin_Noise`、`noise-rgb` | resources | 512–2048 | 同上 |
| `Water_Cartoon_Min` | resources #98 | 2048×2048（切成 64 帧，每帧 256×256） | 水面特效序列帧，【估】不是海面底色 |
| 城市和军队图标：`crossbow-icon`、`sword-icon`、`army-chess-*-icon`、`gonfalon-*-icon`、`army-transport-ship-icon`、`sailboat`、`conquest-flag-icon`、`war-claim-target-icon`、`shield-cross-icon`、`ShieldFinal` 等 | resources / sharedassets0 | 256–1024 | 在 `textures/` 下，本批地图层可以直接用 |

## 6. 资源清点小结（实测）

- **字体**：Font 对象 23 个（resources 16 个，sharedassets0 7 个），TMP 字体资源 33 个（resources 13 个，sharedassets0 20 个）。原始字体文件都已导出到 `extracted-ui/fonts/`。
- **贴图**：Texture2D 共 269 个（resources 143 个，sharedassets0 126 个）。去掉 SDF 图集和 0×0 的 Font Texture 后，导出了 213 张 PNG。Sprite 共 301 个（resources 204 个，sharedassets0 97 个）。
- **level0 界面引用的 Sprite**：48 个，去掉 9 个抖音直播礼物图后是 39 个，都在 sharedassets0.assets。最常用的是：
  - Radial Filled 64px（951 处）
  - Background（740）
  - Rounded Filled 128px（537）
  - Rounded Filled 1024px（468）
  - Rounded Filled 256px（396）
  - Flat Shadow（317）
  - straigtbound（315）
  - Rounded Outline 1024px - 1x（218）
  - straight final（124）
  - thinstraight（53）
  - 图标：crown、flag、book-open、swords、castle、shield、handshake、scroll、database、chevron-down/up、chevrons-up-down、circle-plus、languages
- **乱码名还原**（CP437 → UTF-8）：例如 `ΦìëΦÄôτö£τé╣` → 草莓甜点、`µ┤╛σ»╣Φ»¥τ¡Æ` → 派对话筒。这些是抖音直播礼物图，本批不用。

## 7. 来源与授权

- **决定（Bob 已定，知情决策）**：界面直接使用原作的贴图和字体，并公开发布。本节只登记来源，供 `public/original-ui/SOURCES.json` 和网页「鸣谢」使用。
- **原作资源**：Fantasy Map Simulator（Steam appid 3035500，buildid 24629612）。
  - 贴图、Sprite 来自 `FantasyMapSimulator_Data/resources.assets`、`sharedassets0.assets`（pathID 见 `extracted-ui/textures/manifest.json`）。
  - 界面文字来自 `StreamingAssets/localization.csv`（sha256 b2dd7059…）。
  - 界面层级来自 `level0`（sha256 a9aba2ef…）。
  - 原作贴图和界面设计的著作权归原作开发者。
- **字体来源和许可**（来自字体 name 表和官方页面）：

| 字体 | 版权 / 许可 | 处理 |
|---|---|---|
| TW-Kai 103.1 | 数位发展部（原国发会）全字库；政府资料开放授权条款第 1 版，或 OFL-1.1（二选一）；必须署名 | 已裁剪：`extracted-ui/fonts-web/TW-Kai-98_1.subset.woff2`（3,017 字，1,481,636 B）；LXGW WenKai（OFL）作缺字回退；署名见 1.4 |
| Avara | Raphaël Bastide 等，Velvetyne；OFL-1.1，保留字体名「Avara」 | 原样打包，附 OFL 全文 |
| Roboto Regular / Bold 2.137 | Google；Apache 2.0 | 打包 |
| Roboto Slab 2.002 | Roboto Slab Project Authors；Apache 2.0 | 打包 |
| Liberation Sans 2.00.1 | Google / Red Hat；OFL-1.1 | 可打包 |
| Open Sans（只有原作 SDF 图集，没有字体文件） | 网页用官方发布的 Open Sans，OFL-1.1 | 可打包 |
| Noto Sans TC / Noto Serif KR 等 | Adobe / Google；OFL-1.1 | 按需 |
| Arial 5.10 | Monotype，商业字体（name 表写着只能按所在产品的许可嵌入） | **不打包**，只写系统字体名 |
| 微軟正黑體 | Microsoft，商业字体 | **不打包**，只写系统字体名 |
| Moria Citadel | DragonFang「Freeware」，name 表里没有许可文本 | 本批不用 |
| NanumMyeongjo | NHN，name 表只写了「NHN Corporation」 | 本批不用 |

## 8. 缺口（等补）

1. 战争块里有哪些明细行、外交行显示哪些字段：运行时代码决定，预制件里没有。现在样式是【实测】，字段清单是【估】。
2. MPImage 的圆角半径：导出的字段里没有，暂按截图【估】。
3. 文字规则（0.2）：key 为空时用节点名当 key，是强推断（219/263 对得上），方法体待核。由此推出的几个文字也待核，最好用 Bob 本地中文截图确认：
   - 工具栏「地图外观」（占位是地图展示）；
   - 「地图编辑」（占位是编辑模式）；
   - 「常见问题」（占位是 Tips）。
   已经实测、不用再核的：人物面板标题「人物」，导出图片面板标题「导出图片」。
4. 外观面板的默认值：场景初值不等于运行时生效的值；IsRandomStyle 的含义没有数据。海路和省界的默认色已经有了（#868686 / #b2b2b2）。
5. 倍速按钮：5 倍后回到 0.1 倍循环，是推断，待核；暂停时倍速按钮显示什么，没有数据。
6. 联盟、人物面板各区在场景里是全部展开（实测），运行时是否改写，待核。人物面板 5 个区的运行时标题 key 没确认。
6b. ExportHistoryPanel 的标题节点在场景里是隐藏的，运行时是否显示，待核。导出图片面板里后 3 个开关和「导出」按钮的 key 没导出。
7. HISTORY 每条记录的行样式没有导出。
8. 8 个外观预设各自的原作截图，要用 Bob 本地版本截（同一张图、同一镜头）。
9. TW-Kai 子集已经做好，**不再是阻塞项**。策划计划第「字体补充」节里「TW-Kai 许可查清前不打包」那句已过时，请策划更新；SOURCES.json 里登记选用的授权（政府资料开放授权条款第 1 版）和署名（见 1.4）。网页新增的界面文字要并入字表后重新裁剪。
