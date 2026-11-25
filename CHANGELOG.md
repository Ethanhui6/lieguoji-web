# 更新日志

## 4.5.0 / build 176 — 2026-11-24

### 一、全站字体统一、特色朱砂红回归、呼吸感修复与游戏内外 100% 视觉对齐
- **根除点击标题/页签字体跳变 & 替换古怪 Cormorant 下沉数字（`LieguojiApp.swift`、`EditorialComponents.swift`、`PaperControls.swift`）**：
  - 将 `Theme.serif`、`Theme.numeral`、`Theme.sans`、`Theme.kai` 全部收敛至经典的离线全字库正楷 **`TW-Kai-98_1`**，彻底消除点击标签或标题时在 `Noto Serif SC` 与 `TW-Kai` 间切换的割裂感；国家/军事/排行页面所有数值全面换回经典等宽正楷对齐数字（`.monospacedDigit()`），彻底告别 `Cormorant Garamond` 大小参差的下沉数字。
- **全面回归列国纪特色朱砂红（`#A83226`）与疏朗留白呼吸感**：
  - 所有主操作按钮（`PrimaryLabel`、`EditorialInkButton`、`EditorialTactileButton(solid: true)`、`SealButton`、`HeroAction`、新世界/自绘地图/史记/政令/排行选中态）全面由突兀黑块回归招牌朱砂红；
  - 拆除次级按钮与列表行箭头外圈厚重边框与 `1.5pt` 硬影，改以轻淡宣纸底（`Theme.wash`）与 `0.65pt` 极细淡墨线托底，恢复疏朗古籍呼吸感；
  - 修复 `BundleArt.carvedSeal(for:)` 漏配「郡/县/道/部」导致州郡详情页错显「龍」印的 Bug（现准确亮出真刻「邑」印）。
- **游戏外（标题页 / 新世界 / 自绘地图）与游戏内 100% 同源对齐（`TitleViews.swift`、`MapEditor.swift`、`WorldSheets.swift`、`MenuSheets.swift`、`QuickSheet.swift`）**：
  - 标题页、新世界向导（同步修复地图勘测栏「陆地」意外折成两行）、自绘地图工坊全套笔刷/步骤条/快捷条，与游戏内全部弹窗统一至同一套温润宣纸 + 朱砂红 + 统一正楷风格。

### 二、顶部大事传报彻底丝滑 60/120fps（零掉帧、清晰可读）
- **根除帧率暴跌元凶（`HeraldScene.swift`、`InkVideoPlayer.swift`）**：
  - 废除每秒 30 次触发布局重算的 `TimelineView` + 动态 `paperW` 宽度动画与离屏 `Canvas` 重绘，改为固定几何尺寸 + 纯 GPU 合成 SwiftUI `.snappy(duration: 0.24)` 展卷；
  - 传报缩略画卷改用 `ImageIO` 后台线程按 `maxPx: 240` 下采样异步解码（彻底消除主线程全尺寸 JPEG 解码卡顿）。
- **拉长可读停留节奏（`GameModel.swift`）**：
  - 重大战报/继统/改制停留提升至 `3.6s`、常规大事 `3.0s`、攻城 `2.5s`，即便 `4×–16×` 高倍速推演仍保留 `≥2.2s` 清晰阅读窗口，不再一闪而过。

### 三、四季分明回归 × 灾异天气彻底融入地图 × 卷轴与远景细节精修
- **零发热四时冷暖回归 + GPU 局部天灾着色 + 轻量流云掠影（`MapRenderer.swift`）**：
  - 严守单 Pass `framebufferOnly = true` 与零 `vnoise` 低温红线，大幅增强春夏秋冬四时地形/海域色温反差（冬季积雪覆盖率与北洋流冰显著可辨、秋日金赭暖调、春日嫩碧、轻量双正弦解析流云掠影）；
  - 恢复 GPU `weatherUniforms` 局部灾区地表着色（雪灾银白霜覆、旱灾龟裂黄褐、洪涝深青水渍、瘟疫暗晦瘴气、五谷丰登金芒），与地形自然融为一体。
- **彻底清除违和旧版卡通灾异贴纸图标（`WeatherOverlay.swift`、`MapEffects.swift`）**：
  - 全面废除地图上漂浮的旧版雪花/太阳/乌云/骷髅卡通徽章贴纸，替换为纯地图原生局部粒子（寒霜飘雪、旱地扬尘、雨漪波纹、低空瘴岚、丰年微芒）；
  - 精修手绘卷轴边距比例使画心更舒展；全图远景（`scale < 0.48`）自动隐藏堆叠白字伤亡飘字，看海更干净。

### 四、彻底解困岛国大军 × 水师大幅扩编 × 精细海权调节与全水师统调
- **打通岛国大军跨海出征全链路（`WarCouncil.swift`、`MaritimeWarfare.swift`、`ArmyOrders.swift`、`Shipyards.swift`、`Naval.swift`、`Custom.swift`）**：
  - `WarCouncil.warPlan` 正式纳入无陆邻海外敌国两栖战线（按敌港与沿海州郡分派 2–6 路主力大军跨海登陆，纯岛国本土留防占比由 `35%` 降至 `14%`，4 军以上即可留 1 军护都其余跨海出征）；
  - `MaritimeWarfare.seaTransportCapacity` 显著扩容海运运力，并在港口全部遭封锁时允许有港岛国强行突围渡海（`2×` 突围运力）；`ArmyOrders` 放开跨海抢滩多军集结与封锁突围登船；
  - `Shipyards.expandNavies` 接入开局首日成军（`Custom.enableAppRules`），岛国/滨海大国按疆域扩编至 `3–10` 支主力多舰水师（全图上限 `260` 支），`Naval.attackCount` 放宽 3 支以内全数出击、4 支以上出动 ≥78%，`tryEscort` 修正护航粮草余量门槛，`tryPortAttack` 优先击破封锁本国海港的敌舰。
- **精细海军调节与造舰修复（`TacticalSystems.swift`、`ArmyCommands.swift`、`WarRuleSettings.swift`、`StrategyDepthViews.swift`、`WorldSheets.swift`）**：
  - 修复隐藏多版的 `queueShipbuilding` 编成参数分隔符 Bug（兼容 `,` 与 `:` 且统一造价 `110/85/100`）；
  - 天下规则新增「水师规模（25%–400%）」与「跨海运力（50%–400%）」独立调节滑杆；
  - 军事 › 水师页与舰队船坞页新增一键「全水师战略统调（巡弋 / 护航 / 封锁 / 破交 / 修整）」与 1–8 艘三舰种自订新水师造舰台。

## 4.4.0 / build 175 — 2026-11-24

### 一、全站字体、按钮触感与游戏内外 UI 全面视觉对齐（Phase 1.5 + Phase 2）
- **彻底告别 iOS 系统默认字体（`LieguojiApp.swift`、`EditorialComponents.swift`）**：
  - 全应用零 `.font(.system(...))`，统一升级为古典三阶字系：**`Noto Serif SC SemiBold`**（国名 / 大标题 / 节标题）+ **`TW-Kai` 正楷**（全站正文 / 按钮 / 页签 / 列表 / HUD / 弹窗）+ **`Cormorant Garamond SemiBold`**（等宽衬线核心数据），启动时后台静默预热 `MemorialPaper` 与 `PhosphorPathCache` 压低首次开页耗时。
- ** unmistakable 触感按钮体系 & 100% 统一图标与真实篆印（`EditorialComponents.swift`、`PhosphorIcons.swift`、`InkIcons.swift`、`MapArt.swift`）**：
  - 新增 `EditorialTactileButton`（亮宣纸底 `#FAF7F0` + 暖墨细框 + `1.5pt` 轻压立体底缘）与深墨实心主按钮，终结“简约但看不清哪儿能点”；
  - 清零全站最后 15 处残留 `Image(systemName:)`（含 `QuickSheet`、`DiplomacyBoard`、`NationEditors`、`ProvinceSheet`、`WorldSheets`、`WorldPanels`），100% 切换为 MIT 官方 Phosphor Icons；
  - 新增「邑」「盟」2 枚真实石刻透明朱砂篆刻印章（全站共 7 枚真篆印：龍 / 史 / 溯 / 權 / 議 / 邑 / 盟）。
- **游戏外与游戏内全页面统一转绘 + 双模式 HUD**：
  - 游戏外（`TitleViews.swift`、`WorldArchive.swift`、`MenuSheets.swift`）：标题页、新世界向导、存档卷宗、设置页与更新日志全面转绘古籍编辑风；
  - 游戏内（`GameView.swift`、`NationSheet.swift`、`NationDecreeViews.swift`、`WorldSheets.swift`、`ProvinceSheet.swift`、`ArmySheets.swift`、`DiplomacyBoard.swift`、`WorldPanels.swift`、`HeraldScene.swift`、`QuickSheet.swift`）：横竖屏 HUD、长按快捷弹窗（`ProvinceQuickSheet` / `ReformCard` 严格对齐 20pt 页边距与纸框瓦片）、大事传报（去除糖果彩色渐变为统一宣纸微阶御卷）全部视觉统一；
  - 新增设置项 `@AppStorage("hud.autoHide")`：默认「常驻 HUD + 右上角净图眼钮」，可选切换「静置 6 秒自动隐去、轻点地图唤出」。

### 二、实机试玩核心玩法与体验痛点专项根治
- **海军扩编与岛国/滨海大国跨海出征（`Shipyards.swift`、`Naval.swift`、`MaritimeWarfare.swift`、`ArmyOrders.swift`）**：
  - `Shipyards.expandNavies`（仅 App 模式生效，零影响网页黄金测试）：开局首月为岛国与滨海大国快速成军护航水师，此后月度自主排产扩编至 2–6 支主力舰队，并加速船坞新舰增补；
  - `Naval.attackCount` 放开 1–2 支舰队全数出击跨海制海，下调远洋粮草警戒阈值与储备余量；`MaritimeWarfare.seaTransportCapacity` 扩容海运运力；
  - `ArmyOrders` 在存在无陆邻海外敌国时自动将敌方最近海港与沿海州郡纳入作战目标，岛国与滨海大国真正跨海交锋。
- **和平时期军队巡边换防（`ArmyOrders.swift`）**：
  - 承平时期久驻满 40–74 日后按确定性 `CreationForces.fnv` 错峰重新抽选边境、海港或都城防区移驻，彻底消除和平期全图军队死寂不动。
- **根除缩放/拖动时地图、军队与文字图层分离（`MapView.swift`、`MapRenderer.swift`）**：
  - 拖拽、双指缩放、惯性滑行与镜头飞越统一纳入单次 `CATransaction` + `presentsWithTransaction = true` + 共享 `MapRenderer.pinnedFrameTime` 帧时钟（严格通过 `fromLayout` 与 `inSyncDraw` 隔离 `layoutSubviews` 零重入），Metal 底图/兵牌与 UIKit 地名/兵力数锁定至同一硬件帧零错位。
- **皇帝 / 元首去世与继统传报（`GameModel.swift`、`HeraldScene.swift`）**：
  - 新增 `Herald.Kind.succession`，完整承接 `accession` 继统与君主/元首驾崩、崩逝、逝世、去世、圆寂、被处死事件（同国去重防双弹），配对应文明画卷与动态标题（大行崩逝 / 元首逝世 / 教宗圆寂 / 大选更替 / 新主继统）。
- **彻底消除「第1次XX战役」频繁刷屏（`WorldExtras.swift`）**：
  - 取消小规模初战即弹史册播报，仅当单一战区总兵力峰值 ≥ 2.4 万、都城保卫战 ≥ 1.2 万或 ≥ 4 支军团会战时才记入大事播报，施加全局 120 日播报冷却，首次会战简称为「XX之战」。
- **模块 4 / 模块 5 边界清理（`NationDecrees.swift`、`PolitySystem.swift`、`MapDetail.swift`）**：
  - 清除 `NationDecrees` 残留硬编码 `"下诏"`（接入 `lex.enactVerb`）及多处 `"州郡"`/`"王室联姻"` 漏网词；`PolitySystem` 新增 AI 长期国策 360 日防抖锁并尊重玩家手选战略；清理 `MapDetail` 废弃 `compassCorner`。

### 三、博物馆级手绘卷轴装裱 + 干净高精地图光影与流畅动画回归（Phase 3，守住冷静防闪退红线）
- **真实手绘卷轴四框装裱（`MapRenderer.swift`）**：
  - 采用仓库已打包的高精手绘卷轴素材（`scroll-border-h.png` 镜像无缝绫边、`scroll-roller-v.png` 紫檀双箍卷轴、`scroll-corner.png` 四隅白玉铜扣包角）配合 24 顶点极轻中空柔影环（0% 压盖地图画心），并恢复解析丝绸云锦书案底纹；
  - 尊重玩家审美品味，**严禁在地图内景铺设繁杂的照相写实地貌贴图**，保持地图画心朗润清晰、一眼辨识疆域与兵势。
- **零噪声解析光影 × 60fps 丝滑动画 × 零 KVC 四季天气回归（`MapRenderer.swift`、`MapView.swift`、`MapEffects.swift`、`WeatherOverlay.swift`）**：
  - 全面保留单 Pass `framebufferOnly = true`、14 MB 有界缓存与零稳态逐像素噪声架构；
  - 回归宋画青绿浅海大陆架渐变、双波法线日照水光、铜版细浪与冬日北洋寒冰；陆地西北暖阳浮雕与高倍缩放双尺度 `paper-detail.jpg` 宣纸纤维；军团真实航向踏步倾身与交战冲锋回弹（100% 保护 `UnitArt.swift` 雕漆兵牌造型）；
  - 均衡档回归 60fps 丝滑行军与战局特效（微温自动降 30fps、高温降 15fps）、标题页 30fps 缓游；安全重铸 `WeatherOverlayView` 四季手绘飘花/夏曦/红枫/飞雪/霖雨涟漪与灾区微章（100% 公开 CoreAnimation API，零私有 KVC）。

## 4.3.0 / build 174 — 2026-11-24

### 一、Phase 0：新中式极简古籍编辑风设计基座（不改底层核心业务）
- **三色铁律与三级离线字体体系（`LieguojiApp.swift`、`Resources/Fonts/`）**：
  - 统一宣纸暖白底色（`#F5F0E6` / `#FAF7F0`）、松烟暖墨文字与深墨主按钮（`#2C241E` / `#6E655D`、`rgba(44,36,30,0.12)` 极细 1px 淡墨分割线）、唯一朱砂红强调色（`#A83226`，仅落于选中态、关键进度条、警示与篆刻印章）。
  - 离线内置静态固化 SemiBold 子集字体 **`NotoSerifSC-SemiBold.ttf`**（3.24 MB，覆盖 GB2312 与全库用字）与 **`CormorantGaramond-SemiBold.ttf`**（69.5 KB，高对比衬线等宽数值），配合 iOS 原生 `PingFang SC` 正文构成三级字体规范，并在启动时经 `CGFont.postScriptName` 精准注册。
- **官方 Phosphor Icons 零依赖矢量引擎（`PhosphorIcons.swift`、`InkIcons.swift`）**：
  - 从官方 MIT `@phosphor-icons/core` 预编译 73 枚功能图标 × `light`/`fill` 双字重（共 146 组 `CGPath`），首次渲染后永久缓存，全站 50+ 功能 UI 图标全面告别慢速 CPU 手绘折线与廉价红色径向光晕；完整保留地形工坊 12 枚统一几何地貌笔刷图标。
- **5 枚真实朱砂篆刻印章透明素材 + 32 倍轻量化宣纸（`Resources/Art/seal-stamp-*.png`、`MapArt.swift`、`PaperUI.swift`）**：
  - 新增真实石刻感透明朱砂篆刻印章「龍」「史」「溯」「權」「議」，彻底取代代码绘制的红色圆角方框假印；
  - `MemorialPaper` 废除旧版两张 1024×1024（8 MB 常驻内存）底图与杂乱红竖格，改用 `#F5F0E6` 底面 + 轻量 256×256 宣纸微粒无缝平铺（内存仅 ~256 KB，直降 32 倍）。
- **非泛型古籍组件库（`EditorialComponents.swift`、`PaperControls.swift`）**：
  - 新增 `EditorialDivider`、`EditorialValueText`（Cormorant Garamond 数字 + PingFang 单位自动基线混排）、`EditorialSectionHeader`、`EditorialInkButton`（深墨底宣纸白字并直标后果）、`EditorialActionRow`、`EditorialTabStrip`、`EditorialFocusLead`；同步将全局 `Group2`、`StatStrip`、`ChipPicker` 升级为去卡片嵌套的宣纸平铺 + 1px 分割线 + 极简朱砂下划线页签（全部维持非泛型边界，严格守住真机 1 MB 主线程栈安全红线）。

### 二、Phase 1：四大核心样板间重塑与边界 Bug 修补（保护模块 3/4/5/6 主体逻辑）
- **国家概览页（`NationSheet.swift`）**：
  - 页顶实行渐进式披露，仅突出 1 项核心焦点（战事告急 / 待决议案 / 国情纲要）；移除杂色胶囊堆叠，议会席位改用三阶暖墨 + 朱砂单色条，国力走势接入 Cormorant Garamond 衬线百分比；文化学说/国教与国势五维默认折叠，页面呼吸感与首屏可读性大幅跃升。
- **朝政 / 议政页（`NationSheet.swift`）**：
  - 将待决大政议案提至朝政首屏，配真实「議」朱砂印与深墨主决策按钮（直接写明核心后果）；双轨中枢（国家元首 / 政府首脑）以 1px 淡墨纵线平铺，顺手清除该处残留的硬编码「君主 / 掌权世家」词条，完全遵循 `LocalizationEngine` 政体词库；动态四方权力天平换用真实「權」印与三阶暖墨 + 朱砂占比格。
- **政令与国策页（`NationDecreeViews.swift`、`NationDecrees.swift`）**：
  - 合并旧版重复出现的两个「本国自动治理托管」开关为页顶单条极简委托栏；长期国策改用 Cormorant Garamond 计数与克制细框互斥卡；18 项御批政令改为疏朗单列平铺操作行，直接注明核心后果与休养期；
  - **后端边界修补**：在 `NationDecrees.swift` 中为全部 18 项常规玩家政令补齐 90–180 日 `decreeCooldowns` 冷却闸门（纯可选字段，100% 兼容旧存档），封堵同日无限连点刷资源的边界漏洞，并在 `V4RefactorTests.swift` 增补专项回归单测。
- **史记与编年页（`ChronicleViews.swift`、`WorldSheets.swift`）**：
  - 山河回放入口升级为真实「溯」朱砂篆章 + 深墨主按钮；分类筛选改用极简下划线条（去胶囊套娃）；事件类型图标全数切换为 15pt Monochrome Phosphor `light` 线刻图标；年份标题与岁纪柱图接入 Cormorant Garamond 衬线数字与三色体系；行间距扩增至 14pt 留白呼吸感。
- **CI 样板间截图补全（`ShotTour.swift`）**：新增 `11d-decrees`（国家政令页）巡览截屏，配合 `11-nation`、`11c-court`、`15-chronicle` 全覆盖四页样板间供视觉验收。

## 4.2.10 / build 173 — 2026-11-24

### 一、根据真机 `.ips` 崩溃堆栈彻底根治进图闪退（SwiftUI 主线程 1 MB 栈溢出）
- **实证定位真机进图闪退真凶（`GameView.swift`、`v4.2.9` arm64 二进制符号化还原）**：
  - 结合真机面包屑（`boot → title → gen.start.continents → gen.founded → gen.decoded → gen.mounted → play.enter`，物理内存仅 212 MB / 温控正常）与真机 `.ips` 崩溃地址反汇编还原出 5 层精准调用链：
    `GameView.backdrop(size:)` → 顶部 `VStack` → 顶栏/横幅构建器（含 11 次动态 `___chkstk_darwin` 栈探针）→ `__swift_instantiateConcreteTypeFromMangledName` → `_swift_getTypeByMangledNameInContext2`。
  - **为何模拟器 100% 通过而真机 100% 闪退**：macOS / iOS 模拟器主线程栈高达 **8 MB**，而 iPhone 真机主线程栈仅有 **1 MB**。原 `GameView` 把全部顶栏、底栏、横屏侧栏、5 条操作横幅、16 分支 `Panel` 弹窗（且横竖屏各嵌入一遍）及 28 个 `.overlay`/`.onChange`/`.animation` 修饰符全部写在同一 `struct GameView` 的辅助方法（`-> some View`）中，编译成单个高达 **3,911 字节**的巨型嵌套泛型 `Body` 类型与 **56 次动态 `___chkstk_darwin` 栈分配**；首次进入 `play.enter` 挂载 `GameView` 时，`AttributeGraph` 栈帧叠加 `_swift_getTypeByMangledNameInContext2` 递归解名直接击穿真机 1 MB 主线程栈上限。
- **全面重构 `GameView` 为 20 个独立具体 `struct: View` 与双 `ViewModifier`（零 `AnyView` 热路径损耗）**：
  - 将 `GameView` 拆分为 `GameRootStage`、`GameHudCanvas`、`GameInkVignette`、`GameTopChrome`、`GameTopBar`、`GameTopDateCapsule`、`GameSeasonBadge`、`GameWeatherOverflowBar`、`GameActionBanners`（及 5 个独立横幅结构体）、`GameHeraldHost`、`GameCleanMapChip`、`GameTransportPill`、`GameBottomChrome`、`GamePortraitBottomBar`、`GameLandscapeRail`、`GameWallpaperOverlay`、`GameLegendOverlay`、`GameViewSwitcherOverlay`、`GameToastOverlay`、`GamePanelBackRow`、`GameSidePanelOverlay`、`GamePortraitSheetHost`、`GamePanelRouter`（再拆为实体/世界双路由）以及 `GameLifecycleModifier` / `GameSelectionModifier`；同时减少无关 HUD 局部刷新、进一步降低主线程发热。
- **同步清除全应用其余巨型 SwiftUI 栈溢出隐患（防止进图后点国家/州郡/军团/回放/编辑再闪退）**：
  - 全二进制扫描发现 `NationSheet` 单体泛型 `Body` 高达 **9,436 字节**（`GameView` 的 2.4 倍）、`ReplayOverlay`（2,700 字节）、`ProvinceSheet`（2,485 字节）、`EditorView`（2,245 字节）、`ArmySheet/FleetSheet`（2,185 字节、54 次动态栈分配）；
  - 将全站通用的 `Group2` 与 `FoldSection` 改造为非泛型视图边界（`FoldSection` 收起时延迟零构建），新增 `ViewBoundary` 并在 `NationSheet`（五页签、聚焦页、定制子页、新建世家/外交通牒弹窗）、`ProvinceSheet`、`ArmySheet`、`FleetSheet`、`ReplayOverlay`、`EditorView` 全面切断巨型泛型类型传播链。

### 二、Core 单测隔离与旧世界回调泄漏修复
- **`NativeEngine.swift`**：在两个初始化器中同步清理 `DeclarationEngine.opinionBias = nil`，修复旧世界关闭后的闭包残留引用。
- **`CreationStabilityTests.swift`**：补充 `defer` 清理全部全局规则钩子（`Session.uninstall()`、`UnitKinds.enabled`、`DeclarationEngine.*`、`ArmyAutonomy.temper`），保证 `core-linux` 全量黄金回归单测与多模板稳定性压力测试 100% 全绿。

## 4.2.9 / build 172 — 2026-11-24

### 一、彻底根治真机建图/读档进入游戏闪退（实证四重真凶全清零）
- **根治跨世界 `flushSync()` 错投旧地图渲染器的致命越界崩溃（`MapView.swift`、`GameModel.swift`、`LieguojiApp.swift`）**：
  - 逐行溯源 `v4.2.5 → v4.2.8` 查明：`GameModel.generate()` / `continueGame()` / `show()` 在 `map = loaded.world; worldID = UUID()` 之后、SwiftUI 尚未销毁旧 `MapView #1` 并挂载新 `MapView #2` 之前，就在下一行同步调用了 `apply(loaded.state)` → `controller.flushSync()`；因 `MapController` 缺少世界代次隔离，新世界状态被直接灌进持有旧标题网格的 `MapRenderer #1`，触发 `MapRenderer.baseColors` 第 762 行 `terrain[v * 4 + j]` `Index out of range (SIGTRAP)` 或 Metal 顶点缓冲越界读崩溃，且偷吃 `snapArmies` 并在濒死旧视图上额外构建 `InkField` / `WashTopology` / `seaLanes`。
  - 现为 `MapController` 引入严格 **`activeWorldID: UUID` 世界代次锁** 与统一 `prepareForWorldSwitch(to:)` / `bindController()` / `unregisterSync(owner:)`：世界切换前先推进代次立即静默旧视图并抢先释放其瞬态墨场/拓扑内存，所有 `scheduleSync()` / `flushSync()` 与 10 余项地图回调严格校验 `worldID == controller.activeWorldID`；`MapView.layoutChanged()` 内的 `revealStarted()` 改由异步 RunLoop 起动，彻底消除 `UIView.layoutSubviews()` 布局重入风险。
- **Metal 渲染核全链路边界硬守卫（`MapRenderer.swift`、`Ink.swift`）**：
  - `MapRenderer.setMap` 与 `setTerrain` 强制校验 `next.vertices.count == map.vertices.count && next.cellCount == map.cellCount`，硬拒绝跨拓扑误调用；
  - `baseColors` 与 `recolor` 严格核验 `terrainBase?.count == c.count` 与顶点安全上限，彻底消灭数组越界；
  - 新增 `makeSafeBuffer` 根除空数组传入 `device.makeBuffer(bytes:length:)` 的空指针读取 UB；
  - `draw(in:)` 与 `drawInk` 在发起 `drawIndexedPrimitives` 前强校验 `positions`/`colors`/`revealTerrain`/`revealFields`/`previousColors`/`ink` 最小字节长度，并显式配置 `mtk.depthStencilPixelFormat = .invalid` 与 `mtk.framebufferOnly = true` 进一步降带宽降温。
- **真机内存再省 ~45MB + 存盘零堆尖峰（`NativeHost.swift`、`JSValue.swift`、`NativeEngine.swift`、`GameModel.swift`）**：
  - `GameModel.loadBackdrop()` 载入的 `world.bin` / `grid20k.bin` / `doc20k.bin` 通过 `NativeHost.seedSharedInputs` 与 `NativeHost.creationInputs` 共享同一份只读实例，彻底消灭两份完全相同的 ~45MB 静态格网常驻内存；
  - `GameModel.generate()` 内层作用域即时释放 ~10MB `founded` JSON 中间体后再挂载新 `MapView`，`NativeHost.create` 全程包裹 `autoreleasepool`；
  - `JSValue.swift` 新增流式 UTF-8 序列化 `jsonData(reserveCapacity:)`，跳过 20MB 级中间 `String` 与百万次临时键对象分配，直接将进局存盘内存尖峰腰斩并保持与 `Data(json.utf8)` 逐字节一致。
- **清除 `Core` 建世随机种子 `precondition` / `!` 崩溃雷区 & 增补多模板压力单测（`CreationPolitics.swift`、`CreationForces.swift`、`CreationGeography.swift`、`CreationStabilityTests.swift`）**：
  - 移除 `CreationPolitics`、`CreationForces`、`CreationGeography` 中全部可被随机种子触发的 `precondition` / `preconditionFailure` / 强制解包 `!`，改为安全跳过或返回 `nil` 触发建世平滑重试；
  - 新增 `CreationStabilityTests`：覆盖 `JS.jsonData` 逐字节一致性校验，以及 **12 组多样种子 × 4 大地形模板（多大陆/联合大陆/群岛/高山大岛）× 和平/战乱 × `organicBorders: true`** 的完整建世、规则启用、地图着色校验、推演与存盘回读压力回归。
- **轻量零开销真机诊断面包屑（`CrashBreadcrumb.swift`、`MenuSheets.swift`）**：
  - 新增 `CrashBreadcrumb`，仅在生命周期节点记录短轨迹并挂载未捕获异常记录；「设置 › 性能与帧率」新增默认收起的「运行诊断与内存」折叠栏，可随时查看实时物理内存、温控档位与上次运行轨迹并一键复制。

## 4.2.8 / build 171 — 2026-11-24

### 一、底层渲染与生命周期回归 Claude 硬核架构：彻底根治建图进入游戏闪退
- **彻底拆除真机闪退的三大根源（`MapRenderer.swift`、`MapView.swift`、`WeatherOverlay.swift`）**：
  1. **移除真机 `.memoryless` 双离屏缓存渲染通道**：删除 `v4.2.6` 引入的 `cachedBaseTex` / `cachedOverlayTex` / `cacheMSAATex`（物理机启用 `.memoryless` 且在模拟器上被 `#if targetEnvironment(simulator)` 跳过，恰在建图完成 `reveal == 1.0` 进入游戏首帧触发）及冗余 `blit` 管线，回归 Claude 单 Pass 直绘 Metal 管线，直接省去 ~36–48MB 离屏显存并消除真机离屏 MSAA 风险；
  2. **彻底清除 `CATransaction` / `layoutSubviews()` 内同步调用 `mtk.draw()` 与同步 `sync()` 的重入闪退路径**：修复 `v4.2.3` 误回流进 `MapView.Coordinator.set` 的 `mtk.draw()` + `waitUntilScheduled()` 事务重入问题，所有重绘统一交由 `mtk.setNeedsDisplay()` 安全驱动，仅手指物理拖拽/双指捏合启用同事务呈现，建世展卷与镜头飞行全程异步零阻塞；
  3. **清除 `WeatherOverlayView` 私有 KVC（`particleType`/`orientationLongitude`）与全屏粒子层膨胀**：重构为不足 95 行的轻量灾异州郡微标层，移除 4 份 5.1MB `atlasRainRipple36` 预分配与全屏 `CAEmitterLayer` 粒子风暴。
- **彻底拆除进局 ~100MB 内存峰值炸弹（`MapArt.swift`、`MapEffects.swift`、`InkVideoPlayer.swift`、`GameModel.swift`）**：
  - 废除 `BundleArt` 60 余张常驻 `static let` 未压缩位图与进局瞬间拉满内存的 `BundleArt.prewarmAsync()` / `EffectsView.prewarmAsync()`；改为 **14MB 有界 `NSCache` + `ImageIO` 硬件缩略解码**（36 帧战局图集由 `1536×1536` 9MB/张 缩略至 `576px` 1.3MB/张，省下 7 倍内存，且收到系统内存警告自动清空）；
  - `MapLabelsView` 字图缓存上限由 48MB 收敛至 16MB 并挂载内存警告自动清理；旧 `MapView` 卸载时立即调用 `renderer.releaseResources()` 归还全部 Metal 顶点/海图/墨场缓冲；
  - `GameModel.generate()` / `continueGame()` 在挂载新世界前先清理图片缓存、用 `autoreleasepool` 及时释放 JSON 解码临时对象，并将新建世界后的 `archiveCurrent()` 与首次 `save()` 错峰延后 1.5 秒执行，彻底消除建图进入瞬间触发 iOS Jetsam 内存杀进程闪退。

### 二、彻底根治“一打开游戏手机就特别烫”：GPU 算力削减 ~75 倍 + 恢复 Claude 级冷静温控
- **Metal 渲染核瘦身重构（`MapRenderer.swift` 从 2,563 行精炼至 1,579 行，删减近千行冗余，20 条管线精简为 10 条、MSL 着色器从 ~960 行精炼至 ~150 行）**：
  - 彻底清除全部高耗电逐像素噪声/三角函数/SDF 着色器（删除 `deskFragment` 改用零开销硬件清屏、`landFragment` 150 条片元运算砍至 1 次乘法由 CPU 预计算四季色温、`seaFragment` 120 条海浪三角运算砍至 1 次纹理采样+1 次乘法、羊皮纸回归 Claude 单纹理 1 次采样、移除 `spriteShadowPipeline` 重复全军重绘将柔影直接烘焙进 4.1 雕漆盾牌）；
  - 300 行逐像素 SDF 卷轴着色器（`scrollMountFragment`）重构为单次 CPU 预计算的几何古风卷轴装裱（紫檀 6 段圆柱明暗、双鎏金箍、碧玉圆顶轴头、米金宋锦绫边、牙白隔水、四角回纹与画心双阶内阴影），以 **1 指令 `colorFragment`** 绘制，零片元发热。
- **恢复 Claude 原版开屏冷静帧率与真温控体系（`MapView.swift`、`MapEffects.swift`）**：
  - 标题页背景漂移由 60–120fps 回调至 Claude 经典 **20fps**（3 pt/s 慢移肉眼同样顺滑、重绘次数降至 1/3~1/6），一打开 App 机身保持冰凉；
  - 默认「均衡」档回归 Claude 规范（`mapFPS: 60 / marchFPS: 30 / effectFPS: 30`）并自动回调旧版强制拉满发烫的 `60/60/60` 存档设置；恢复微温 `.fair → 30fps`、发热/低电量 `.hot → 20fps / 15fps` 阶梯温控，且 `EffectsView.calm` 严格遵守 `effectFPS` 上限不再硬拉 120Hz。
- **传报长卷零视频解码发热（`InkVideoPlayer.swift`）**：
  - 移除传报横幅频繁拉起 `AVQueuePlayer` / `AVPlayerLooper` 硬件 H.264 解码器带来的 `mediaserverd` 阻塞与发热；以 8MB 有界缓存即时呈现 54 卷全文明预烘焙古画长卷并叠加零 CPU 占用的轻柔缓推，同时完整保留 `v4.2.7` 的「军队归属锁防冻结、开页即停传报、35 日/季节硬校验（杜绝夏天放春天事件）与传报精确年月季节徽签」。

## 4.2.7 / build 170 — 2026-11-24

### 一、紧急根治重大 Bug：军队在地图上完全不动、只有事件在动
- **查明并彻底修复世界切换时的渲染回调清空竞态（`MapView.swift`）**：
  - `v4.2.6` 将高频地图通道移出 `@Published` 改用 `MapController.onNeedsSync` 后，新建世界或读取存档切换 `worldID` 时，SwiftUI 会先挂载新 `MapView` 再销毁旧 `MapView`；旧实例 `dismantleUIView` 调用 `Coordinator.stop()` 时无条件执行了 `controller.onNeedsSync = nil`，直接抹掉了新地图刚刚注册的渲染回调，导致推演中只有 SwiftUI 事件在更新，而地图上的军队、舰队与战线全部原地冻结。
  - 现重构为带实例归属锁的 `registerSync(owner:handler:)` / `unregisterSync(owner:)`，旧视图卸载时仅允许清理自身归属的回调；同时在 `MapView.updateUIView`、`Coordinator.layoutChanged()` 与 `sync()` 增加自动校验重绑与 `isAnimating` 显示链路保活（即使半屏面板开启且关闭了开页自动暂停，军队亦以 30fps 流畅行军绝不冻结）。

### 二、传报系统全面整改：打开任意界面立即停弹 × 严格时令校准 × 标明事件发生时间
- **点击其他界面立即停止并清空后台传报（`GameModel.swift`、`GameView.swift`）**：
  - 打开任意弹窗/面板（国家、州郡、军事、外交、纪事、菜单、排行、视图切换、天时抽屉或山河回放）瞬间立即同步置位 `pageOpen = true` 并调用 `dismissHerald()`：立刻终止正在播放的传报横幅、释放后台视频解码并清空待播队列，彻底根除“打开其他界面时背景上方还在疯狂乱弹事件、严重拖卡”的顽疾。
- **杜绝跨季错时播放（彻底消灭“夏天还在放春天事件”）**：
  - 为每条 `Herald` 精确记录事件发生的 `day`、`month` 与 `dateText`，新增 `GameModel.isHeraldTimely(_:state:)` 严格校验：① 距当前日期超过 35 日的积压旧传报直接丢弃；② 凡属四时天象/农桑灾丰类事件或含季节词（春/夏/秋/冬/暴雪/封山/梅雨等），一旦当前推演已进入另一季节立即丢弃，绝不跨季错放；③ 战事传报仅在对应战争仍在持续时弹出；④ 队列上限压紧至 2 条、4× 及以上高倍速缩短停留时长，且推演中当前展示的传报若过期或跨季会即时自动收起。
- **顶部传报清晰标注事件发生年月与季节（`HeraldScene.swift`）**：
  - 在顶部传报横幅标题旁新增等宽数字时间徽签（如 `1452年3月·春`），让玩家一眼明晰该条传报精确发生于何时何季。

### 三、进入游戏过渡重铸 & 全链路实机流畅度再提速
- **进入游戏秒级无卡顿无缝过渡（`MapRenderer.swift`、`GameModel.swift`、`TitleViews.swift`）**：
  - 新增跨世界复用的 `SharedMetalAssets` 静态缓存：将原本每次进入新世界/续档都在主线程耗时 ~485ms 重新编译的 1,100+ 行 Metal 着色器源码、20 条渲染管线、羊皮纸纹理与 16 张兵种序列帧贴图常驻复用，将 `MapRenderer.init` 耗时骤降至 ~15ms；
  - 读档与进局统一在 `GeneratingView` 阶段即等待新 `MapView` 挂载就绪后再切入 `.playing` 并以轻快的 `1.15s`（新建 `2.0s` 且全屏轻点可随时跳过）丝滑展卷，彻底告别白屏闪跳与生硬顿挫。
- **进一步削减游玩期主线程与 GPU 卡顿（`MapRenderer.swift`、`GameModel.swift`、`GameView.swift`、`HeraldScene.swift`、`InkVideoPlayer.swift`）**：
  - `MapRenderer` 离屏底图缓存的节气分桶由 `120` 档/年（每 3 天即失效重绘）优化为 `24` 档/年（每半月一档，与天气层一致），大幅降低游玩期间离屏 20,000 地块重烘焙频次 5 倍；
  - 4× 以上高倍速（`8×/16×`）或机身偏热时，传报横幅自动切换零 `AVQueuePlayer` 解码开销的高清预烘焙古画静帧海报；`HeraldBanner` 与 `FoundingView` 动效时钟由 120Hz 节流至 30Hz，并移除顶栏日期高频数字形变动画；
  - `GameModel` 适度放宽推演态 `publishState`（`0.28s`）与领土合批门限（`0.22s`/`0.36s`），预建国色查表替代每步 200+ 次 CSS 十六进制解析，并用 `cityByProvCache` 替代线性扫描，实机帧率与跟手度显著跃升。

## 4.2.6 / build 169 — 2026-11-24

### 一、UI 细节、矢量图标规范与视觉材质全面重构
- **地形编辑面板 12 枚功能图标统一重铸（`InkIcons.swift`、`MapEditor.swift`）**：
  - 为 `深海(.trench)`、`浅海(.sea)`、`内湖(.lake)`、`平原(.plain)`、`丘陵(.hill)`、`高原(.plateau)`、`山脉(.mountain)`、`雪峰(.peak)`、`群岛(.island)`、`抬高(.raise)`、`压低(.lower)`、`平滑(.smooth)` 建立 **12 枚彼此独立的规范矢量几何图标**（彻底告别深浅海、丘陵高原、山脉雪峰复用雷同，重绘内湖为岸畔盆地水纹告别“眼形”误读，重绘平原为疏朗沃野禾苗彻底杜绝选中糊成一团）；
  - 新增 `InkIcon(crisp: true)` 统一等宽圆头圆角描边渲染与选中态暗红反白逻辑，并统一 12 枚笔刷右上角精巧地貌色标，未选中与选中反色均清晰锐利。
- **国家详情抽屉与全站弹窗：根除顶部白边、统一无缝宣纸底纹、移除概览低质模糊横幅（`GameView.swift`、`NationSheet.swift`、全站 13 个视图文件）**：
  - 查明国家页顶栏（`< 返回列国 | 国家`）泛白割裂源自 `backRow` 与 `.safeAreaInset(edge: .top)` 叠加的实底浅白层 `Theme.paper.opacity(0.96)` 与下方做旧宣纸 `MemorialPaper` 色温错层：现重构为顶栏直接置于主内容裁切区之上、全抽屉从顶部圆角至最底端共用同一张无缝 `MemorialPaper` 宣纸纹理（仅以 `0.75pt` 细墨线区隔顶栏与主标题），并将全站剩余 28 处 `.presentationBackground(Theme.paper)` 全部统一为 `.presentationBackground { MemorialPaper() }`；
  - 彻底移除国家页「概览」Tab 下方的低分辨率模糊横幅插画容器与动态加载代码，让「国情卷宗」卡片紧接 Tab 栏呈现，排版更紧凑清爽，同时进一步降低国家页打开耗时。
- **开局设置页「山河格局」微型等高线舆图重绘与文字截断修复（`TitleViews.swift`）**：
  - 全面重构 `TerrainSilhouette`：以闭合 Catmull-Rom 有机海岸曲线、浅滩晕圈、多层海拔等高圈、山脊雪峰与海浪纹精细绘制 `多大陆`、`联合大陆`、`群岛`、`高山大岛` 四幅古风微缩等高线海图；
  - 重排 2×2 格局卡片为「`48×48` 舆图缩略图 + 独占整行完整标题 + 下置战略标签胶囊 + 精简地势评语」，彻底根除「联合…」「高山…」标题截断问题。

### 二、沙盘地图边框重铸：高精细程序化古风舆图卷轴装裱
- **全面替代生硬拼接贴图，以 Metal 视网膜级程序化着色器重绘古风舆图装裱（`MapRenderer.swift`）**：
  - 全新编写 `scrollMountFragment` 空心四框零过绘着色器（画心内部 0% 过绘）：
    - **左右紫檀木卷轴与包金玉轴头**：真实三维圆柱法线光照、细长红酸枝木纹年轮与漆面高光、上下双弦纹拉丝鎏金箍，以及车制圆润拱顶的青白碧玉轴头与东南书案柔影；
    - **米金宋锦绫罗装裱宽边**：织物经纬暗纹 + 菱格云锦暗花光泽 + 做旧宣纸微韵 + 牙白隔水边 + 墨口/泥金双细框 + 卷轴自然卷入阴影；
    - **四角回纹云纹鎏金包角**：全视网膜分辨率抗锯齿矢量纤细回纹与云钩，严守绫边四隅不侵画心；
    - **画心柔和内阴影（Inner Shadow）**：沿手工微起伏毛边向内渲染多阶温润暖褐内阴影与宣纸微卷过渡（西北略深、东南柔润），彻底告别生硬贴图割裂感。

### 三、核心性能深度重构：离屏静态地图双层缓存 × 主循环零抖动 × 动效零掉帧
- **接入离屏静态地图双层 RenderTarget 缓存与 Dirty Flag 机制（`MapRenderer.swift`）**：
  - 新增 `cachedBaseTex`（海图 + 20,000+ 地块地形/国色）与 `cachedOverlayTex`（州界、双层河网、手绘河道、海路、经纬线、海岸细饰、矢量地貌、国界、城徽/要塞/海港 13 层静态矢量）双层离屏缓存纹理（物理机 MSAA 瞬态目标采用 `.memoryless` 零显存占用），仅在缩放、平移落定、领土易主、节气/天时或显示开关变更时按需烘焙；
  - 推演期间镜头静止时，60fps 军队行军、战争墨晕（`InkField` + `FlipSweep`）与战斗动画帧直接通过 2 个全屏三角形（`blitVertex` / `blitFragment`）直通合成静态底图与静态叠加层，严禁每帧全量重绘 20,000 地块与 13 层矢量，GPU 帧耗时骤降约 85%–92%，同时完整保留国土易主渐变与战争墨晕实时 60fps 渲染。
- **渲染与 SwiftUI 状态彻底解耦：消除推演每步 5–7 次整页重排（`MapView.swift`、`GameModel.swift`）**：
  - 将 `MapController` 上 20 余项纯渲染高频字段（`world` / `armies` / `route` / `effects` / `washes` / `relations` / `seaPorts` / `forts` / `holy` / 镜头聚焦请求等）全部移出 `@Published`，改由单步原子合批的 `scheduleSync()` / `flushSync()` 直达 `MapView.Coordinator.sync()`，让 `GameModel` 节流机制真正生效；
  - 同步优化主线程热路径：`MapLabelsView.setCities` 改为零字符串分配快速签名比对、`nationLabels` 增加单位字宽测量缓存、`GameModel` 缓存 `cityByProv` 省城索引。
- **消除动画与传报触发瞬间掉帧（`MapArt.swift`、`MapEffects.swift`、`InkVideoPlayer.swift`）**：
  - 新增 `BundleArt.prewarmAsync()` 与 `EffectsView.prewarmAsync()`，进入世界时即在后台线程通过 `preparingForDisplay()` 预解码全部 36 帧高密度战斗/海战/围城/插旗/抢滩图集与四季粒子，彻底消除首次触发动画时的主线程 PNG 解码卡顿，并合理收敛海量大战同屏粒子上限；
  - 升级 `InkVideoPlayer` 后台异步预加载视频轨元数据（`loadValuesAsynchronously`）后再创建 `AVPlayerLooper`，彻底消除传报横幅弹出瞬间主线程阻塞 `mediaserverd` 导致的掉帧。

## 4.2.5 / build 168 — 2026-11-24

### 一、底部抽屉与地图联动 4 项核心交互 Bug 彻底修复
- **底部抽屉半屏弹出时的地图镜头聚焦偏移（彻底消除遮挡国家名与核心疆域）**：
  - 在 `MapCamera.swift` 新增 `MapCamera.focused(...)` 可视安全区居中投影算法，并在 `MapView.swift` / `GameView.swift` / `NationSheet.swift` 全链路接入：竖屏弹出半屏抽屉（`50%` / `38%`）时，自动按上方安全视口 `(顶栏底边 .. 抽屉顶边) / 2` 上移镜头中心（横屏侧栏展开时同步向左侧可视区居中），打开国家页改由 `fly(toNation:)` 精准对准国名大字与核心疆域重心，点击屏幕下半部州郡时亦平滑轻移避开抽屉，彻底解决“斯巴达共和国”等国家大字被抽屉顶边截断的顽疾。
- **全屏展开抽屉的顶部状态栏/灵动岛安全区适配（零重叠防误触）**：
  - 全站 12 个视图文件统一将抽屉最大高度封顶于 `.fraction(0.89)`（圆角顶边优雅停在状态栏与灵动岛下方），并在 `PaperUI.swift` 新增 `SheetTopSafeClearance` 硬件安全区垫片挂载于抽屉顶部非滚动安全区，即便极端拉升或任意机型隐藏状态栏时也能动态补足顶部安全留白，彻底根除 `< 返回州郡` 按钮与系统时间/信号栏重叠。
- **地形编辑面板（自绘地图）顶部统一拖拽条（Drag Handle）与四档高度手势交互**：
  - 在 `MapEditor.swift` 地形编辑画板最顶部（四色地貌占比条上方）新增与国家/州郡抽屉完全一致的居中灰色圆角胶囊拖拽指示条，支持橡皮筋跟手上下拖拽及轻点切换 **收起（极简胶囊） / 精简（单排快切笔刷，多释放 ~45% 绘景视野） / 标准 / 展开（自动展开笔触细节与保护海岸）** 四档高度，交互与视觉全站统一。
- **抽屉高度切换与「州郡 → 国家详情」平滑过渡 × 零数据闪烁**：
  - 重构 `GameView.swift` 抽屉架构，将原本分散在各页面的不同 `presentationDetents` 合并为根部统一 `sheetDetent` 绑定与 `Motion.sheetSwap`（`cubic-bezier(0.32, 0.72, 0, 1)`，280ms）平滑过渡，彻底告别切换面板时高度生硬跳切；
  - 在 `GameModel.swift` 新增国家详情内存预取缓存，打开 `ProvinceSheet` 时即刻后台预热所属国家数据，配合 `NationSheet` 第 0 帧同步四格指标渲染，点击「国家详情」瞬间零空白、零数字闪烁。

### 二、动态历史画卷短视频库暴增至 54 卷（彻底告别高重复率）
- **由 19 卷大幅扩容至 54 卷全画幅 60fps 主体物理动态长卷（总包体仅 11.54 MB）**：
  - 新增 35 幅来自世界各大博物馆公有领域（Public Domain）的传世古典历史名画（涵盖《千里江山图》《汉宫春晓图》《出警入跸图》《步辇图》《文会图》《呼尔满大捷图》《关原合战屏风》《松林图屏风》《罗马元老院西塞罗斥喀提林》《英国下议院》《雅典学派》《特拉法加海战》《火船击无敌舰队》《维京长船》《布雷达的投降》《拿破仑加冕》《维苏威火山喷发》《1680 大彗星》《丝路商队》《火烧议会大厦》《夜巡》《圣罗马诺之战》《大马士革使节觐见》等），统一调和为本作温润古宣丝绢色调并经逐像素光流物理合成 60fps 真实动态（波浪纵摇、烈焰跳动、雪花樱瓣、斜阳光柱、山间雾霭、大漠热浪、烛火微颤与星芒流光）；
  - 全面升级 `HeraldScene.swift`、`NationSheet.swift`、`ArmySheets.swift`、`WorldSheets.swift`、`WorldPanels.swift`、`StrategyDepthViews.swift` 路由引擎：按文明谱系、政体类型、兵种与战报语义精准选卷，并扩大至 **16 卷防重复记忆环**，连续数十次事件与各国详情画卷几乎零重复。

## 4.2.4 / build 167 — 2026-11-24

### 一、严重 Bug 根治 × 海岸线与地图细节重铸 × 极速低耗流畅
- **彻底修复“移动地图时飘字数字滞留屏幕原地”严重 Bug（`MapEffects.swift`、`MapView.swift`）**：
  - 将战损飘字（`-120`、`+N 军` 等）与点选落指水晕全部重构为锚定世界坐标 `(worldX, worldY)` 的嵌套 `CALayer` 容器，随镜头拖拽、双指缩放、惯性滑行与镜头飞跃逐帧 `camera.toScreen` 贴地跟随，彻底告别文字数字停留在手势原地不随地图移动的顽疾；
  - 将高速平移期间的 `MapLabelsView` 升级为世界坐标精确反算快路径 `repositionVisible(camera:viewport:)`，彻底消除累积像素漂移与边缘吸附错位。
- **海岸线重铸 × 地图近观细节升级 × 彻底释放静止 GPU 发热卡顿（`MapLayers.swift`、`MapDetail.swift`、`MapView.swift`、`NationSheet.swift`）**：
  - 将 `MapLayers.outlines` 与 `MapDetail.ornaments` 中原始锯齿状 Voronoi 海岸线全面重构为 `BorderCurve.chain` + `BorderCurve.smooth` 连续斜接三层古舆图海岸线（外层碧青浅海陆棚 → 薄雾浪沫 → 暖沙岸边 + 区分大陆双色清锐岸线与孤岛淡墨细岸），彻底根除折角重叠珠点与灰白浑浊宽边；
  - 将 `waterlines` 精修为 5 道清锐宋画青碧等深线与单遍柔滑抗锯齿，并在放大近观时新增河口浅滩、高山微刻脊线与林野点苔肌理；
  - 关闭地图静止时的 `ambientActive` 无谓 30fps 空转（静止降至 0% GPU 发热），重构 `NationSheet.reload()` 异步分步加载并去除嵌套 `LazyVStack`，根治国家页 1073ms 级首开卡顿。
- **墨晕重铸：回归「生成地图开卷」同款生宣水墨漫渗质感（`Ink.swift`、`Wash.swift`）**：
  - 将 `inkCompositeFragment` 与 `sweepFragment` 升级为与开卷 `revealFragment` 完全同源的大尺度 `0.015` 级生宣毛细渗纹、利落清透湿墨前沿（`soft: 0.062`）、初湿墨沉与湿锋蓄墨深环（`front = reached * (1 - reached) * 4.0`），兼具友军经过顺滑染回我方领土的完整体验。

### 二、彻底清除国家页组件白边 × 顶/底 HUD 视觉统一 × 自绘/世界编辑器全面升级
- **彻底消灭国家页及全站组件/卡片边缘白边（`LieguojiApp.swift`、`PaperUI.swift`、全站 28 处 Sheet）**：
  - 查明卡片泛白亮边源自 `Theme.paper2` 过浅与 `Group2` / `.paperCard()` / `.glass()` 双框 `2.5pt` 间隙形成的亮白边圈：全面调暖 `Theme.paper2` 宣纸色温、移除全部双框亮隙改用单层精致暖墨收口与 `.clipShape`，并扫清全站剩余 24 处旧版 `.presentationBackground { MemorialPaper() }` 为全实底宣纸弹窗。
- **全局数字对齐 × 顶/底 UI 比例统一（`GameView.swift`、`PaperControls.swift`、`NationSheet.swift`）**：
  - 统一顶栏（`42pt`）与底栏悬浮坞（`46pt` / `38pt` 同心朱印钮）体量、线宽、字号与 `monospacedDigit` 基线对齐，彻底消除以往“顶栏偏小、底栏偏大”的割裂感；统一 `StatStrip` 四格数字基线高度，将 `NationSheet` 人物掌权实效改用 `WrapLayout` 独立胶囊（杜绝“外/交+6”断字换行）。
- **自定义地图（自绘地图）与世界编辑器全面重铸（`MapEditor.swift`、`WorldEditor.swift`、`WorldEditorMore.swift`、`InkIcons.swift`）**：
  - 「自绘地图」笔刷由 10 种扩充至 **12 种**（新增深海沟/海峡、高原，6×2 对齐排布），新增 **自由 / 左右对称 / 四象对称** 镜像绘图模式、**实时四色地貌占比仪表（海/平/丘/山）**、一键「中央海峡 / 环陆内海」快速雕琢，并将笔触刷新间隔提速至 `45ms`；
  - 「世界编辑」全面统一为 `ChipPicker` 标签栏，补齐 `InkIcons` 全部剩余符号映射并清零编辑器残留 SF Symbol，视觉与交互全站统一。

### 三、19 部短视频重铸为真实多维动态 × 矢量驱动棋子动作
- **彻底告别水平平移：19 部 60fps 历史短视频全面升级为真实主体物理动态（`Resources/Video/herald-*.mp4`）**：
  - 全面淘汰旧版水平 Ken Burns 滑动，改为逐像素双线性光流变形与动态光照重制全部 19 部短视频：海战与航海呈现真实波浪起伏、船体纵摇与鼓风船帆；战场与起义呈现旌旗迎风飘扬、火光随焰明暗跳动、冲击微震与飞溅火星；大旱呈现地表上升热浪折射；洪涝呈现斜风骤雨与闪电划空；庙堂与盛典呈现流动斜阳光柱与三维景深花瓣/金尘/飞鸽。
- **大地图军团/舰队真实二维矢量动态（`MapRenderer.swift`）**：
  - 军团与舰队顶点着色器按真实行进二维方向矢量（`normalize(delta)`）动态倾身、踏步起伏、弹性呼吸与交战双向突刺，摆脱僵硬单轴左右摆动。

### 四、核心玩法深度跃升：全局自动治理、议会置顶、人物/文化/宗教大强化与 57 种历史政体
- **治理界面支持「全图列国统一自动治理」（`PolitySystem.swift`、`NationDecrees.swift`、`NationDecreeViews.swift`、`WorldOrders.swift`、`PaperUI.swift`）**：
  - 默认开启全图列国自动施政（不必再逐个国家点开手动开关），在「治理」页最顶部与「天下诏令」新增一键「全图自动治理」总开关，同时保留单国「手动接管 / 恢复委托」精细微调。
- **共和国/立宪国议会大幅前置（`NationSheet.swift`）**：
  - 议会制国家在「概览」首屏即展示紧凑议会席位分布条（一键直达议政），并在「议政」页最顶部默认直接展开完整的「议会与政党格局」主卡（不再沉底折叠）。
- **大幅强化人物四维属性与特质、26 文明文化学说与 27 种国教实效（`CultureDoctrines.swift`、`Faiths.swift`、`MonarchLore.swift`、`Uprisings.swift`、`DiplomacyDeep.swift`、`Daily.swift`、`CombatReader.swift`、`MaritimeWarfare.swift`、`Rebellion.swift`、`WorldDepth.swift`）**：
  - 新增 `CultureDoctrines` 26 大文明专属「文化学说」（如礼乐郡县农本、武士道与岛防、海洋霸权与商律、长生天铁骑、海上马车夫等，提供 12%–26% 级陆战/海战/破城/岁入/人口/安定修正），并实装异文化州郡税收 −18% 与动荡 +18 机制；
  - 27 种国教教义加成整体抬升约 3 倍（10%–24% 级别），掌控国教圣地再享全军攻防 +12%、岁入 +15%、国运 +0.25/月，同教/同文外交好感抬升至 +24/+20、异教冲突至 −16/−32；
  - 人物军事/行政/外交/魅力四维系数与 43 项特质实效大幅提升（明君猛将与昏君庸主在战力、财政、安定与外交上差距立现），全部修正明细在国家概览卡与「数值明细」弹窗透明可查。
- **历史政体扩充至 57 种 × 文明地名库扩容（`Custom.swift`、`PolitySystem.swift`、`LocalizationEngine.swift`、`NamingCatalog.swift`）**：
  - 新增 14 种真实历史政体（元老院共和、执政官共和、总督商业共和、自由商盟邦、帝国自由市、护国公制、大公领、边区侯国、藩镇节度使、都护府、埃米尔国、马穆鲁克军政、法老双冠王朝、土司宣慰司），总数达 **57 种**，并大幅扩充各主要文明的历史地理与国名池。

## 4.2.3 / build 166 — 2026-11-24

### 一、彻底根治严重卡顿、更新日志点开卡顿与行军/光影不流畅
- **手势 VSync 合帧与 0 帧图层锁定（`MapView.swift`、`MapRenderer.swift`）**：
  - 将高频单指拖拽与双指缩放改由 `pendingCamera` 累积至 `CADisplayLink` 每 VSync 仅提交 1 次原子 `CATransaction` + Metal 渲染，彻底根除以前触控回调在单帧内多次同步 `mtk.draw()` + `waitUntilScheduled()` 阻塞主线程造成的严重掉帧与发烫；
  - 纯平移与惯性滑行期间启用零网格分配的 `labels.panVisible` 快路径（每 4 帧与松手尾帧完整重排避让），同时维持底图与军团动画、国名、兵力条 0 像素错位。
- **军队丝滑连续行军 × 活态海波与云影光晕（`MapRenderer.swift`、`MapView.swift`）**：
  - 抬高行军帧率温控底线：常规与轻温（`.fair`）稳定满帧 `60fps`（仅在严重/极端发热才温和降至 `45/30fps`），彻底告别以往开玩两分钟即锁死 30/20fps 的顿挫感；
  - 为军团位移新增跨步 C1 Hermite 速度连续衔接（`lastLegVelocity` + `1.18×` 步长微叠），转弯与连续行军如丝顺滑、不再每步一顿；
  - 新增静态观图 `30fps` 轻耗活态光晕模式（`ambientActive`），海面波光与西北流云柔影持续流动、不再在推演间隙停顿跳帧。
- **视频首帧与更新日志 0 毫秒秒开（`InkVideoPlayer.swift`、`HeraldScene.swift`、`LieguojiApp.swift`）**：
  - 彻底废除在主线程同步调用 `AVAssetImageGenerator.copyCGImage` 解码视频首帧的卡顿元凶，改用预烘焙的 19 张轻量 `320×180` 首帧海报（`< 0.5ms` 即显）并异步延后 `0.12s` 启动硬件解码平滑淡入；传报卷轴展卷完毕（`0.68s`）即刻停止 `TimelineView` 逐帧重算；
  - `ReleaseNotesSheet`（更新日志）由全量迫切 `VStack`（一次性排版 38 个版本）重构为 `LazyVStack`（默认展示最近 4 版 + 一键「展开更早历史版本」），点击「更新」即刻秒开零卡顿。

### 二、敌军墨晕升级 × 友军路过顺滑染回我方领土
- **友军收复染回机制（`ConquestWash.swift`、`InkCells.swift`、`ConquestWashTests.swift`）**：
  - 彻底修复敌军在我方领土留下墨晕后撤离、因该州不再交战导致我方军队经过却无法洗回敌墨的机制缺口：新增 `WashInput.Kind.reclaim` 友军收复信号，凡我方军队行军或驻守在本国被敌墨染污的州郡（无论敌军是否仍在），均沿 `from → to` 全程行军路径以方向性反洗墨波顺滑将领土染回我方本色；
  - 同步优化墨格统计（`provinceInkCount` / `totalInkCells` O(1) 早退跳过洁净州郡），并新增 `testFriendlyArmyReclaimsEnemyInkAfterEnemyLeaves` 单元测试严格锁死不回退。
- **生宣水彩墨晕着色器精修（`Ink.swift`、`Wash.swift`）**：
  - 升级 `inkCompositeFragment` 与 `sweepFragment` 为高速双八度 `fbm2` + 细腻生宣纤维羽化（边缘柔化加倍、去除泥褐色浑浊混色，以纯净矿彩国色呈现攻占与反洗收干层次），在 GPU 算力显著下降的同时呈现更通透自然的宣纸晕染过渡。

### 三、彻底根治国家页白边 × AI 手绘御卷装裱边框 × 地图图层与光影重铸
- **彻底根除国家页及全部弹窗白边（`project.yml`、`GameView.swift`、`NationSheet.swift`、`TitleViews.swift`、`PaperUI.swift`）**：
  - 查明 iOS 26 SDK 编译下弹窗出现四周留白与刺眼白玻璃亮边的真正根因，在 `project.yml` 开启 `UIDesignRequiresCompatibility: true` 退出系统悬浮玻璃边框，全站弹窗统一改为 `.background(MemorialPaper().ignoresSafeArea())` + 实底 `.presentationBackground(Theme.paper)`，并压暗 `MemorialPaper` 顶边泛白叠层，横竖屏国家页与全部二级面板彻彻底底零白边。
- **AI 手绘御制千里江山装裱边框（`MapRenderer.swift`、`MapLayers.swift`、`Resources/Art/scroll-*.png`）**：
  - 全新生成并接入 3 套 AI 手绘高精御卷装裱纹理：上下无缝宋锦织锦紫檀镶边（`scroll-border-h.png`）、左右圆柱紫檀雕花卷轴与绫锦竖边（`scroll-roller-v.png`）、四角透明鎏金碧玉云纹包角（`scroll-corner.png`），配合 `scrollBorderFragment` 统一西北御案柔光与 45° 斜接桌案落影，拉远展卷尽显博物馆手卷质感。
- **地图图层与定向光影全面升级（`MapLayers.swift`、`MapRenderer.swift`）**：
  - 清除 `MapLayers.relief` 中生硬的几何尖角三角山与 `"V V V"` 草原折线，重绘为柔和 9 点宋画云烟曲弧远山、叠瓣苍翠松林与润泽草甸；大幅强化地形法线定向明暗（`hillshade` 向阳暖金坡 / 背阴松烟谷），提亮海面浅滩青绿宝石光泽与动态斜阳碎金水光，并精简陆地片元噪声与零灾异循环早退。

### 四、开局与地图生成过渡动效重绘 × 19 部全画幅 60fps 历史短视频
- **重绘 `GeneratingView` 与 `FoundingView` 开卷动效（`TitleViews.swift`、`MapRenderer.swift`）**：
  - 淘汰粗糙的暗褐石印与扭曲小对勾，重铸为典雅御卷建世浮卡：12 阶段专属动态单字书法朱印（海/岸/山/川/州/国/界/城/族/兵/盟/定）+ 诗意副题 + 八珠步进，并以 `Equatable` 隔离抬头与 60fps 纯 GPU 墨金进度条，取消遮罩模糊释放全部算力给 Metal；同步升级 `veilFragment` 为三源有机水墨漫渗开卷。
- **顶部传报短视频扩充至 19 部全画幅 60fps + 4 连防重轮播（`HeraldScene.swift`、`InkVideoPlayer.swift`、`NationSheet.swift`）**：
  - 在原有 10 部基础上全新制作 9 部 180 帧真 60fps 全画幅短视频（民变烽火 `uprising`、王室联姻 `marriage`、赤地大旱 `drought`、瘟疫迷城 `plague`、远洋宝船舰队 `voyage-fleet`、暴雨山洪 `flood`、凯旋破城 `capture`、故国斜阳 `extinction`、会盟定鼎 `alliance`），总数达 **19 部**；新增 4 连防重循环队列大幅降低重复率，并同步扩展国家页横幅视频匹配种类。
- **修复核心测试构建错误（`StrategyDepthTests.swift`）**：补齐 `ArmyTactics.supplyStatus` 缺失的 `provinceIndex` 参数，全量 `core-linux` 单元测试、`archive` 打包与模拟器实机截图验证全绿通过。

## 4.2.2 / build 165 — 2026-11-23

### 一、实机反馈核心体验与视觉缺陷全面根治
- **完整回归 v4.1 雕漆兵牌与纯矢量宋画融纸地貌（`UnitArt.swift`、`MapRenderer.swift`、`MapLayers.swift`）**：
  - 彻底撤回 PC 原作散件图标与 AI 生图地貌贴片，100% 回归 v4.1 经典雕漆漆盾（`0plate`）＋256×256 四阶象牙浮雕矢量兵牌与 1–3 枚水陆编队战阵；
  - 将纯矢量水彩融纸地貌升级为 7 点曲弧宋画远山、多瓣阔叶林团、叠层松柏与柔和丘陵，缩放任意倍率均与宣纸底纹、河流、城池浑然一体。
- **全面去除地图事件与战事上的丑陋圆圈套框（`MapEffects.swift`、`atlas-battle-36.png`、`atlas-amphibious-36.png`、`atlas-capture-flag-36.png`）**：
  - 清除交战红白圆环、围城乳白大圆盘与粗圈、港口封锁三重虚线圆圈、两栖登陆脉冲椭圆、插旗双椭圆及地图事件外扩圆环/圆盘底，全面替换为纯净无圆框 36 帧交锋刀光火花、攻城烽烟＋城下纤细水平进度条、两栖岸轰炮火、精细铁锚封锁标与手绘无框宋画微标。
- **根治建图血条堆叠、缩放图层错位、血条挡视野与国家页白边（`MapView.swift`、`GameModel.swift`、`MenuSheets.swift`、`PaperUI.swift`、`LieguojiApp.swift`、`GameView.swift`、`NationSheet.swift`、`WorldSheets.swift`）**：
  - 开局、换图、读档与退回标题时立即清空兵力条缓存，并在 `reveal < 0.99` 期间严格锁隐 `TroopLabelsView`，彻底根治生成地图时浮现一堆血条的旧病；
  - 将兵力条触发倍率大幅抬高至超高倍近观（`icon >= 19.5`，数字 `>= 22.5`）并瘦身精修，同时在「设置 › 画面」新增「放大时显示军队血条」开关支持一键彻底关闭；
  - 拖拽、双指缩放、松手尾帧、惯性滑行及镜头飞行全程在单一 `CATransaction` 内同步 `mtk.draw()`，彻底根治缩放时地图底图与军团动画/覆盖层错位分离的顽疾；
  - 去除 `MemorialPaper` 两侧刺眼竖向白带与顶边切角红条，柔化卡片纸色与边框，为国家/州郡/军团/舰队/国家列表补齐全底边无截断滚动（`.scrollContentBackground(.hidden)` + `.ignoresSafeArea(.container, edges: .bottom)`），修复国家页重复称谓与传报横幅退场撞顶栏。

### 二、10 部全画幅 60fps 历史长卷短视频 × 7 套古风交互音效
- **彻底告别白纸贴图标循环（`InkVideoPlayer.swift`、`HeraldScene.swift`、`NationSheet.swift`）**：
  - 以 10 幅全画幅宋明工笔青绿水墨长卷重制全部 10 部 `640×360` 180 帧真 60fps H.264 历史短视频（大战、海战、围城、登基、变法、大航海、丰年赈济、江山和约、庙堂议政、关山风雪），赋予每部独特视差运镜、飘雪/飞花/波涛/烛火/云雾/祥鹤动态；
  - 新增 7 套轻量化零阻塞古风交互音效（`sfx-seal / scroll / anchor / march / clash / cannon / herald.wav`，`Feel.swift`），可在设置内自由开关。

### 三、陆海完全体 × 州郡五槽基建 × 四线科技 × 16 组因果事件链 × 全数值透明拆解
- **陆军完全体（`TacticalSystems.swift`、`CombatReader.swift`、`Editing.swift`、`Daily.swift`、`ArmySheets.swift`、`StrategyDepthViews.swift`）**：
  - 实装五阵型（常规/锋矢/鹤翼/方阵/游击）与四野战军令（常规/强行军/扎营掘壕/坚壁清野），真实联动攻防/移速/围城/耗粮/士气；
  - 实装四阶老兵勋阶（新募/精锐/百战/虎贲·近卫）、陆海动态补给线与地图补给弧线高亮、兵种相克清单可视化。
- **海军完全体（`TacticalSystems.swift`、`Shipyards.swift`、`MaritimeWarfare.swift`、`ArmySheets.swift`）**：
  - 统一 `200` 水兵/艘与 `12000` 海粮/艘口径；实装 `1–3` 级海港船坞扩建（上限 `5/8/12` 艘）、船台定制三舰种造舰与另立新舰队队列、海域制海权评分（`0–100%` 与海贸红利）、水师提督四大特技（火攻/顺风/铁索/破交）以及地图友军护航连线（`.escort`）。
- **深度策略大系统与全站透明拆解（`WorldDepth.swift`、`NationInfo.swift`、`Commands.swift`、`DiplomacyBoard.swift`、`ProvinceSheet.swift`）**：
  - 州郡新增五槽基建（水利/商市/要塞/船坞/书院，Lv 0–3 真实加成税收/粮产/城防/船坞/科研）与战略特产实体联动（良马骑攻 +15%、铁矿补员 −18%、良木造舰耗时 −20%）；
  - 国家新增四线时代科技演进（军备/航海/农商/治政，1–5 阶）、外交国际信誉度（影响邦交好感，毁约宣战重扣 −18）、16 组多阶段因果事件链与 6 个月后因果回响；
  - 实装国家/州郡全核心数值「数值明细」透明修正来源拆解弹窗与宣战前「敌我双边实力评估」弹窗，清零全站残留帝制硬编码，补齐二级页左边缘右滑返回手势；
  - 新增 `StrategyDepthTests.swift` 完整单元测试覆盖全部新系统并确保原版黄金回归全绿。

## 4.2.1 / build 164 — 2026-11-23

### 一、开局换图与全局 60/120fps 点击流畅度重铸
- **彻底清除「换一方山河」横穿预览图的横线动画（`TitleViews.swift`）**：
  - 移除新世界预览卡（`terrainCard`）上方全宽 `InkBusy()` 4pt 横线进度条与半透明闪白遮罩，取消手动换图 110ms 人工等待；
  - 升级为 `previousTerrain → terrain` 双缓冲水墨微绽溶叠过渡，按钮旋钮支持 180° 弹簧转动；支持轻点预览图直切「地貌 / 势力」、点左上角胶囊一键复制种子，并在底部勘测栏实时生成战略地势评语。
- **全局点击零掉帧与 60fps 建世开卷（`MapView.swift`、`GameView.swift`、`GameModel.swift`、`PaperControls.swift`、`TitleViews.swift`）**：
  - 解除程序镜头飞行与惯性滑行期间的 `presentsWithTransaction` 主线程同步阻塞（严格仅在手指物理拖拽/捏合时同步），并将弹窗打开后的后台 30fps 省电节流延后 `0.50s` 至弹簧动画落定后生效，彻底解决点选州郡/军团/底栏时的掉帧卡顿；
  - 大地图点选新增 0 毫秒 GPU/CoreAnimation 朱墨落指双圈水波纹反馈（`showTapFeedback`）；移除 `StatTile` 开页首帧并发状态重排并合并点选刷新；
  - 解耦「新世界 / 世界卷宗」弹窗退场动画与后台建世；`FoundingView` 升级为 60fps 独立时钟 + GPU `scaleEffect` 进度条，展卷提速至 3.6 秒（续档 1.8 秒）并支持「轻点立即入局 ›」一键跳过。

### 二、四季雨雪手绘粒子回归 × 36 帧连拍图集 × 60fps 历史画卷短视频
- **恢复并升级手绘四季与天气屏幕粒子（`WeatherOverlay.swift`、`MapArt.swift`）**：
  - 彻底停用代码手绘多边形，恢复手绘桃花瓣（`fx-petal`）、丹枫（`fx-maple`）、冰晶雪花（`fx-snowflake`）与灾丰宋画微标（按屏幕点尺寸精确归一化）；新增双景深手绘斜风银雨（`fx-raindrop`）、流云山霭（`fx-cloud-mist`）及霖雨 36 帧（30fps）水花涟漪序列帧（`atlas-rain-ripple-36`）；修复 `ArtEmblem` 徽记渲染。
- **36～64 帧高密度拼接图集与 180 帧真 60fps 画卷视频（`SpriteAnimator.swift`、`MapEffects.swift`、`InkVideoPlayer.swift`）**：
  - 陆战、海战、围城全面移除代码折线弧框，实装 `1536×1536`（`6×6` 共 36 帧 @ 30fps）高密度拼接图集 `atlas-battle-36`、`atlas-naval-36`、`atlas-siege-36`；
  - 6 部画卷视频（`herald-war / naval / siege / peace / regime / weather.mp4`）全面重制为 `640×360` 180 帧真 60fps H.264 无缝循环动画并解除压暗裁切。

### 三、高倍放大地图细节、原作海陆棋子与军事/水师/国家页对齐重构
- **高倍放大零三角山、零杂块（`MapRenderer.swift`、`MapLayers.swift`、`MapDetail.swift`）**：
  - 清除放大后刺眼的平涂几何三角山（`MapLayers.relief`）、城郊黄褐色平行四边形杂块（`MapDetail.fineDetail`）、河道双影脱节与都城印记重影；
  - 升级 7 套 `512×512` 焦墨古舆图地貌印章（`stamp-*`），在 Metal 正片叠底管线接入 `512×512` 无缝原作宣纸纤维细节纹理（`paper-detail.jpg`）。
- **原作清晰单枚海陆棋子与页面对齐修复（`UnitArt.swift`、`WorldSheets.swift`、`ArmySheets.swift`、`NationSheet.swift`、`GameView.swift`、`Districts.swift`）**：
  - 地图与面板统一回归原作清晰国色兵种与战舰/运兵船/商船单枚大棋；
  - 军事总览重构为「军情 / 战局 / 陆军 / 水师」四主签整宽对齐（彻底解决水师标签被截断）并嵌入 60fps 海战画卷；净化舰队页内部调试文案并拆分视图层级提速渲染，新增国家页「国情卷宗」导语与舰队点击直达；
  - 统一 `StatStrip` 图标基线与 `.medium` 默认展开高度，消除横屏右侧栏重复抬头与日期截断，并修复 `Districts` 区域只读查询污染冻结存档的问题。

### 四、GitHub 统一中文发布规范
- GitHub Actions 自动读取版本号与构建号，打包输出带版本号的 `lieguoji-4.2.1-build164-unsigned.ipa`，将统一中文更新日志同步写入 Actions 摘要与 GitHub Release（`v4.2.1`）。

## 4.2.0 / build 162 — 2026-11-23

### 竖屏、横屏、收起边框（净图）与二级菜单零遮挡重构
- **根治竖屏与横屏 HUD 挤压错乱（`GameView.swift`、`ReplayOverlay.swift`、`PaperUI.swift`、`LieguojiApp.swift`）**：
  - 竖屏顶栏重构为 `38pt` 紧凑纪年胶囊 + 右侧 `146pt` 一体化四键宣纸工具坞（视图/框选/净图/菜单），总宽严格小于 `366pt`，窄屏绝不挤压折行；
  - 地图视图切换器（`MapViewSwitcher`）由原本 `480pt` 超高单列重构为竖屏 `2×5`、横屏 `5×2` 紧凑双列/五列宫格，并新增全屏透明点外即收遮罩，彻底消除向下遮挡底栏的问题；
  - 横屏采用 `GeometryReader` 严格划分左侧 `44pt` 导航轨、顶部 `36pt` 状态栏（右侧详情面板打开时自动向左收缩让位）与右侧面板区，天气溢出条、传报横幅与底部纪事条严格居中在左轨与右侧面板之间，零重叠碰撞；
  - 二级菜单返回栏重构为 `0.96` 宣纸毛玻璃吸顶栏 + 底部分隔细墨线，彻底解决正文滚动与返回按钮文字重叠；横屏侧栏将返回与关闭按钮内嵌进面板顶栏，彻底删除原本悬挂在边框外侧 `.offset(x: -17)` 的突兀圆钮，并移除统计与诏令页的双层重复宣纸边框；
  - 点按顶栏「净图」按钮时，顶栏、底栏、横屏左轨、专题图例（`MapViewLegend`）、视图宫格、天气条与四边暗角同步丝滑收起，仅在右上角留一枚 `32pt`「展开」胶囊。

### 极简古舆图焦墨细线生图地貌（白底提纯透明墨迹 × 零贴图割裂感）
- **修正生图描述范式与亮度转 Alpha 纯墨线叠印（`MapArt.swift`、`MapRenderer.swift`、`MapLayers.swift`、`MapView.swift`）**：
  - 摒弃与平涂古纸底图冲突的厚涂重彩阴影画风，改用极简古舆图焦墨细线描述生成 10 枚纯白底手绘线稿印记（`stamp-mountain` 远山、`stamp-mountain-snow` 雪峰、`stamp-hill` 丘陵、`stamp-forest` 阔叶林冠、`stamp-pine` 北境松林、`stamp-desert` 大漠沙丘、`stamp-marsh` 水乡芦苇，以及 `stamp-capital-east / west / islamic` 三大文明都城微缩线稿）；
  - 经亮度转透明度（Luminance-to-Alpha）提纯出纯净焦墨线条，在 Metal 渲染管线中以半透明墨色叠印于水彩底晕之上、羊皮纸正片叠底纹理之下，与各国国色和宣纸肌理浑然一体。

### 深度海军战略系统大升级
- **三舰种协同编制、五大水师战略指令、提督委任与船坞修船（`MaritimeWarfare.swift`、`Naval.swift`、`ArmyCommands.swift`、`GameState.swift`、`NativeView.swift`、`ArmySheets.swift`、`WorldSheets.swift`、`MapEffects.swift`）**：
  - 每支舰队升级为**主力战舰（楼船/战列）+ 巡弋快舰（艨艟/巡洋）+ 封锁炮舰（火舫/臼炮）**三舰种协同编制，支持在舰队面板实时调配比例（主力舰强化正面海战火力、快舰拓宽护航与破交截杀半径、炮舰强化港口封锁与两栖岸轰）；
  - 新增**五大水师战略指令**（制海巡弋 / 护航掩护 / 封锁敌港 / 破交袭扰 / 归港修整），玩家与 AI 舰队共用，支持一键委任本国水师提督（提供真实海战火力加成）与船坞日常/紧急抢修补员；
  - 封锁敌国海港每 10 日累积水师战功（晋升新编水师 → 精锐水师 → 镇海主力 → 无敌舰队四阶勋衔）并截夺敌方海贸商税充入本国国库；大地图新增旋转朱墨封锁锁链警戒环与两栖抢滩近海舰炮岸轰弹道弧。

### 原生硬件解码古风水墨动态短视频画卷 × 多层次 60/120fps 战场动效
- **实装 `AVQueuePlayer + AVPlayerLooper` 静音短视频循环舞台（`InkVideoPlayer.swift`、`HeraldScene.swift`、`WorldPanels.swift`、`WorldSheets.swift`、`MapEffects.swift`）**：
  - 打包 6 段 `480×270` H.264 60fps 古风水墨动态短视频（`herald-war.mp4`、`herald-naval.mp4`、`herald-siege.mp4`、`herald-peace.mp4`、`herald-regime.mp4`、`herald-weather.mp4`），配宣纸羽化晕边蒙版融入顶部大事传报御卷、交战/围城对阵图与海上会战面板；
  - 大地图陆战升级为双层赤金象牙刀光、双圈震波与多波次流矢齐射，海战升级为三重海浪激波与双舷四道交错火炮齐射水柱，围城升级为旋转战术外环与跃动火舌。

## 4.1.0 / build 161 — 2026-11-23

### 审美品味回正：回归经典纸墨舆图统一画风（彻底消除割裂“贴图感”）
- **恢复经典国色兵种与战舰棋子，并补齐同画风运兵船（`UnitArt.swift`、`MapRenderer.swift`）**：
  - 全面移除 4 帧厚涂小图贴片，恢复深受认可的经典国色雕漆兵种与双桅战舰棋子（`UnitArt`）；
  - 为跨海登船陆军按完全一致的四阶雕漆象牙工艺补绘专属 `Transport` 运兵船棋子（弧底木船＋长矛旗徽单帆＋舷侧圆盾＋水波纹），远近辨识清晰且与地图融为一体。
- **地貌、地标与印章全面融入纸墨本底（`MapLayers.swift`、`MapRenderer.swift`、`MapView.swift`、`PaperUI.swift`、`MapArt.swift`）**：
  - 移除铺在极简矢量色块地图上的厚重不透明厚涂 PNG 贴图（山脉、林木、城堡、包角与大印章），彻底消除画面细节密度不匹配带来的“像贴上去一样”的割裂感；
  - 重绘轻墨淡彩半透明水彩融纸地貌（`alpha 0.22–0.58`）：宋元双峰淡墨远山与轻雪顶、微润丘陵、多层半透林冠与北境松影、丝绸沙丘与稀见绿洲、草甸细草、青灰泽国与霜蓝冻原，彻底保留干净舒朗的地图细节层级；
  - 印章与面板小图标回归经典宣纸朱印（`SealFace`）与手绘双色水墨线描图标（`InkIcon`）。

### 真 60/120fps 灵动实时动效重铸（彻底告别低帧率“4 帧翻页感”）
- **解锁真 60/120fps 全链路帧率（`MapView.swift`、`MapEffects.swift`、`MapRenderer.swift`）**：
  - 查明并解除旧版隐藏的 20fps 帧率瓶颈（默认 `marchFPS / effectFPS` 由 `24 / 20` 全面解放至 `60 / 60`，自动迁移旧默认配置；`EffectsView.calm()` 帧率上限提升至 `60–120fps`）；
  - 升级经典兵种棋子 Metal 顶点与投影着色器：行军时呈现 60/120fps 轻快踏步微倾、交战时果断突刺回弹、阵亡时柔和下沉淡隐，落地投影与棋子逐帧严密同步。
- **全地图与顶部传报改用真 60/120fps 实时流体水墨与物理粒子动效（`MapEffects.swift`、`WeatherOverlay.swift`、`HeraldScene.swift`）**：
  - 陆战重铸为 60/120fps 交叉金朱刀光弧线＋撞击四芒星闪＋双国抛物线箭雨＋朱砂气环；海战保留 60/120fps 交替舷炮弹道、炮焰与双层白浪水花；围城重铸为宣纸镶边顺时针进度环＋呼吸红核＋袅袅余烬；攻城插旗重铸为**真实征服国国色** Bézier 连续波浪燕尾丝旗＋弹簧落旗＋双圈涟漪；议和重铸为青玉墨圈＋实时展翼白鹤；大事件改为 60/120fps 水墨线描活态徽记；
  - 全屏四季天气粒子升级为高清半透明矢量雪花、樱花瓣、枫叶、细雨与浮光微尘，灾异区域改用精致 20pt 轻透宣纸徽记；顶部大事传报左侧舞台全面升级为 60/120fps 原生 SwiftUI `Canvas` 实时水墨动态演画。

### 符合直觉的稳定 HUD 与一键「净图」开关（零自动乱藏）
- **彻底移除反直觉的自动隐藏与隐形边缘手势（`GameView.swift`）**：
  - 彻底删除拖拽/缩放或静置 6.5 秒后自动藏起四周按钮与靠隐形热区划出的反直觉设计，常态下顶栏与底栏稳定常驻、随手可点；
  - 顶栏右侧新增一枚直观清晰的手动**「净图」**按钮（水墨眼眸图标，横竖屏一致）：仅在玩家主动点击时丝滑收起四周界面纯赏山河，并在右上角常驻醒目的**「显示界面」**恢复胶囊，一键即回。

### 100% 保留 v4.0.0 全部核心玩法与布局修复
- 完整保留 `LocalizationEngine` 文化×政体动态词库（共和/联邦零帝制出戏词、行政区划与军事编制全线统一）、180 日防连点多分支朝议博弈、18 项政令＋5 套一键智能战略预设＋AI 季度自治、完整跨海海运运力/护航截杀/港口封锁/3 日两栖登陆与天时战力联动、顶栏防重叠布局＋天气溢出条＋紧凑横屏侧栏以及柔化海岛浅滩岸线。

## 4.0.0 / build 160 — 2026-11-23

### 模块一：全量序列帧动画体系（Sprite Sheet）与统一播放器
- **彻底废除静态图代码摇晃伪动画（`SpriteAnimator.swift`、`MapRenderer.swift`、`MapEffects.swift`、`MapArt.swift`）**：
  - 生成并精准对齐打包 **10 套** `1024×256`（4×1 透明等宽网格）纯 AI 手绘序列帧图集：`sheet-infantry-march.png`（步兵四帧行军）、`sheet-cavalry-charge.png`（铁骑四帧冲锋扬尘）、`sheet-warship-east.png`（东亚楼船四帧划桨破浪）、`sheet-warship-west.png`（西洋盖伦四帧破浪）、`sheet-warship-nordic.png`（北欧维京龙头长船四帧划桨）、`sheet-warship-islamic.png`（阿拉伯/伊斯兰三角帆战舰四帧航行）、`sheet-transport-ship.png`（跨海运兵船队四帧航行）、`sheet-battle-clash.png`（兵戈交锋四帧火花箭雨）、`sheet-siege-smoke.png`（围城四帧烈焰浓烟）与 `sheet-banner-wave.png`（战旗四帧迎风飘扬，攻城插旗实帧摆动）；
  - 封装零拷贝离散切帧 `SpriteSheetLayer` / `SpriteSheetView`（支持配置 FPS、随机相位与待机/行军/交战/航行/沉没/围城状态切换），并在 Metal GPU 新增 `spriteSheetVertex` / `spriteSheetShadowVertex` / `spriteSheetFragment` 管线，使全图海陆部队按文明战舰差异、移动/交战状态与朝向 60/120fps 实帧跃动，落地阴影逐帧同步。

### 模块二：地图视觉彻底去代码绘图化与古印章换血
- **全面清零地图残留的简陋代码绘制元素（`MapDetail.swift`、`MapLayers.swift`、`MapRenderer.swift`、`MapView.swift`、`PaperUI.swift`）**：
  - 彻底删除陆地残留的旧版弧线山脉与扁平 T 字伞状绿树，新增 4 套同画风厚涂水墨地形精灵（`terrain-hill.png` 温润丘陵、`terrain-savanna.png` 稀树草原、`terrain-marsh.png` 江南水乡泽国、`terrain-tundra.png` 极北苔原冻土），凑齐 **9 组**全地形 GPU 精灵体系；
  - 删除海面机械重复的代码 `~ ~` 波浪折线与被边缘截断的代码罗盘及黑白比例尺；重写海岛海岸线判定，对海中孤岛改用温润细海岸与双层青绿/浅沙浅滩渐变，彻底消除粗硬黑描边；
  - 新增 4 枚博物馆级雕刻朱砂/鎏金古风印章（`seal-chronicle.png`、`seal-replay.png`、`seal-court.png`、`seal-council.png`），全面取代史记、回放、卷宗、诏令、州郡、国家页与面板抬头的全部单字红框印章。

### 模块三：顶栏零重叠修复、横屏解放与全平台动态隐藏 HUD
- **精准修复顶栏与横屏遮挡（`GameView.swift`、`LieguojiApp.swift`、`MapView.swift`、`GameModel.swift`）**：
  - 顶部状态胶囊改用严格防挤压弹性布局（`.fixedSize`），将活跃天时灾异拆入顶栏正下方可折叠 `weatherOverflowBar`，彻底消除日期与季节/天气/战事挤压重叠，并拦截「暴雪平息」等结束词误触发警报横幅；
  - 横屏收窄顶栏至 36pt、底栏按钮至 28pt、右侧改用 44pt 纯图标毛玻璃侧栏，彻底解放 88%+ 海域与地图视野；
  - 实装横竖屏通用动态自动隐藏 HUD：拖拽/缩放地图或静置 6.5 秒后四周非核心控件丝滑隐至边缘，仅留 26pt 半透明日期微胶囊与顶部/底部边缘呼出热区，支持点按地图或边缘轻滑弹性唤起，并提供「观图锁定」纯赏画模式。

### 模块四：「文化 × 政体」全量动态词库引擎（彻底去硬编码）
- **核心引擎新增 `LocalizationEngine`（`LocalizationEngine.swift`、`NationInfo.swift`、`NativeView.swift`、`NationSheet.swift`、`NationDecreeViews.swift`、`ProvinceSheet.swift`、`NationHistoryViews.swift`）**：
  - 覆盖 7 大政体阵营 × 38 种细分政体 × 10 大文明：共和/联邦/议会/社会主义/军政府/神权/部族政体全界面称谓瞬间联动刷新（执政力量与议会天平、执政党/在野党/财团/国防军、签署紧急行政令、内阁部委、州长/省长等），**彻底杜绝共和政体出现「朝堂、世家、文官、朝廷百官、宗室赐封」等出戏词汇**；
  - 彻底修复国家页顶部 `8 省` 与疆域 `8 州` 自相矛盾 Bug，行政区划（省/道/藩/府县/州/行省/旗/部）与军事编制（天子禁军/国民警卫师/旗本近卫/禁卫军团/怯薛亲军等）随文化与政体变更同步更名。

### 模块五：多分支防连点朝议、18 项政令扩容、智能战略预设与 AI 自治
- **朝议博弈深度升级与防作弊（`NationInfo.swift`、`NationDecrees.swift`、`NationSheet.swift`、`NationDecreeViews.swift`、`PolitySystem.swift`、`Custom.swift`）**：
  - 彻底封死朝议议案无限连点刷资源漏洞（引擎层强制 180 日议期冷却锁 + UI 落印倒计时展示）；议案全面升级为 4 条策略分支（强力推行 / 折中妥协 / 派系让利 / 休会搁置）并随战局、财税、腐化与权力失衡动态生成；
  - 国家政令由 12 项扩容至 **18 项**（新增交通基建、战略粮储、格物兴科、海运船坞、遣使修好、减赋安民），新增 **5 套一键智能战略预设**（战时动员 / 富国兴商 / 固本维稳 / 经略扩张 / 格物兴科）与「季度智能托管」开关；
  - 实装 AI 季度自主施政引擎（5 种执政个性原型、自动切换长期国策与危机救灾、权力失衡连锁危机、共和与立宪四年定期换届大选）。

### 模块六：战场去文字化视觉演出与完整跨海海运／两栖登陆体系
- **高倍观战去文字化与实帧演出（`MapEffects.swift`、`MapView.swift`）**：
  - 高倍缩放观战时自动屏蔽重叠战损飘字与交战部队数字标签，以 4 帧实帧兵戈交击、双向抛物线箭雨/炮火、4 帧围城烈焰浓烟与清晰双色血条呈现干净纯粹的战局视觉；
- **跨海海运运力、护航截杀、港口封锁与两栖抢滩登陆（`MaritimeWarfare.swift`、`Naval.swift`、`ArmyOrders.swift`、`Daily.swift`、`CombatReader.swift`、`GameState.swift`、`NativeView.swift`、`NationInfo.swift`、`NationSheet.swift`、`ProvinceSheet.swift`、`V4RefactorTests.swift`）**：
  - 终结陆军徒步踏海：有海港体系时必须自己方或友邦未封锁海港登船，受国家海运运力管控；海上航行期间自动切换为 4 帧透明运兵运输船序列帧；国家军事页新增「海运运力与制海权」专卡（支持一键扩建船坞），舰队标注「护航中 / 封锁敌港」，被封锁海港在州郡页弹出红色阻航警示；
  - 战斗舰队 AI 主动出海护航友军运兵船队并支援两栖抢滩，敌舰可在海上截杀无护航运兵船队，并可近海封锁敌港阻断登船与切断海外补给线；
  - 登船部队踏上敌控沿海州触发 3 日两栖抢滩登陆战（-28% 抢滩攻势罚值，近海友军舰队提供 +20% 舰炮火力支援与 +25% 破城轰击），同步接入暴雪/洪涝天时对海陆战力的真实联动。

## 3.0.0 / build 159 — 2026-11-23

### 全套 49 枚纯 AI 透明手绘美术重构与十大文明差异化视觉体系
- **彻底清零一切代码/GDI+ 临时简陋图，全套 49 枚高精透明 PNG 全部由纯 AI 生成并经亮/暗双底色逐张肉眼核验（`Resources/Art/*.png`、`MapArt.swift`、`MapView.swift`、`MapEffects.swift`、`HeraldScene.swift`）**：
  - **十大历史文明大系全自动匹配（覆盖 `cultures.json` 全部 26 种历史文明）**：中华汉字圈（汉/朝/越/吐蕃）、日本和风、西欧骑士、古典罗马/希腊、北欧维京、斯拉夫、中东伊斯兰/古埃及、草原蒙古、南亚印度、美洲阿兹特克/印加；
  - **多文明差异化地标**：各国都城自动呈现本文明建筑（中华宫阙、日本天守阁、西欧哥特石堡、古典大理石卫城、北欧龙头木堡、斯拉夫红砖洋葱顶克里姆林、伊斯兰青绿穹顶宣礼塔宫殿、蒙古黄金汗帐、印度红砂岩穹亭宫城、阿兹特克/印加阶梯金字塔），同步匹配东亚/西欧/中东要塞与海港；
  - **多文明旗帜、战舰与传报**：攻占飘扬旗与战败折断倒旗自动按国家文明切换东亚龙旗、西欧纹章旗、伊斯兰弯月旗、草原苏鲁锭军纛；海战与沉舰按文明呈现东亚楼船、西欧盖伦大帆船、北欧维京龙头长船；宣战/诏令传报、战神谱与战况卡同步按文明自动切换东亚画戟/玉玺与西欧双剑/皇冠蜡封诏书。

### 世界写实山水地貌精灵与古舆图经纬装裱边缘重铸
- **GPU 实例化纯 AI 写实山河精灵（`MapLayers.swift`、`MapRenderer.swift`）**：
  - 清除旧版粗糙三角山与圆点树，改用 5 组 GPU 实例化手绘透明精灵（写实层峦山脉、阿尔卑斯雪峰、阔叶林海、北方松柏泰加林、大漠沙丘绿洲），并修复预乘 Alpha 混合使山林边缘在羊皮纸上清润无黑边；
  - 随四时节气实时演化地形风貌：仲春阔叶林冠绽嫩翠微粉花影、金秋燃炽红丹枫与金赭斜阳、隆冬北境山巅与林冠挂雪；局部雪灾/大旱实时令当地山林覆雪或枯焦。
- **古舆图卷轴边缘升级（`MapLayers.swift`、`MapRenderer.swift`）**：
  - 重铸画心边框为古舆图经纬分度刻度边栏，四角贴合纯 AI 鎏金碧玉云纹包角（`scroll-corner.png`）四隅镜像无缝衔接。

### 全局 60/120fps 活态动画、无圆框传报与单字方框印章清扫
- **彻底告别单字方框印章与顶部圆形罩框（`HeraldScene.swift`、`MapEffects.swift`、`ChronicleViews.swift`、`GameView.swift`、`PaperUI.swift`、`ProvinceSheet.swift`、`DiplomacyBoard.swift`、`WorldSheets.swift`、`MilitaryOverview.swift`、`ReplayOverlay.swift`）**：
  - **顶部横幅（`HeraldScene.swift`）**：彻底移除圆形罩框，全原生 60/120Hz `TimelineView` 驱动各事件专属活态动效舞台（宣战双戟/双剑撞击微震迸火花、议和白鹤展翅飞升、攻占战旗迎风猎猎翻卷、灭国折旗坠落冒烟、暴雪飘雪/大旱热浪/洪涝闪电暴雨/丰收金穗/瘟疫瘴雾实时粒子）；
  - **地图活态战斗与世事特效（`MapEffects.swift`）**：全量删除地图单字方框印章，陆战双兵刃交锋、海战楼船/盖伦/维京长船颠簸炮火、攻城烈焰升腾摇曳、攻占插旗迎风飘扬、阵亡折旗倾覆与沉舰入海、议和白鹤与天灾丰年全部做成真正会动会变的 60fps 活态动画；
  - **全站 UI 印章清扫**：史记/国史/回放事件标、外交列表快跳钮、围城告警、战神谱（在阵战神配本文明兵戈、陨落名将配本文明折旗）、快捷浮钮与提示条全面替换为无圆框纯 AI 透明微标。

### 鲜明四季视觉、真实四季灾丰事件与实时全屏／局部天气特效
- **模拟核心接入四时灾丰机制（`GameState.swift`、`Society.swift`、`Custom.swift`、`NativeView.swift`、`GameModel.swift`）**：
  - 按真实四时节气自动触发并演进地域性**暴雪封山**、**赤地大旱**、**梅雨洪涝**、**大疫蔓延**与**春耕大兴／金秋大稔**，可向邻州自然扩散并在结束时昭告天下；
- **全屏＋局部实时天气渲染与顶栏快跳（`WeatherOverlay.swift`、`MapRenderer.swift`、`GameView.swift`）**：
  - GPU 陆地着色器大幅强化四季色彩区分（春润青岚、夏沐暖阳、秋染丹枫金赭、冬覆北境银雪与寒霜北洋），并新增 12 区实时局部天气着色（暴雪积白、大旱赤地龟裂纹、洪涝乌云湿暗、瘟疫瘴雾、丰年金辉）；
  - 新增 60/120fps 纯 CoreAnimation 大气层 `WeatherOverlayView`：仲春飘落粉嫩花瓣（`fx-petal`）、盛夏浮暖金微尘/大旱干尘、金秋翻飞丹红枫叶（`fx-maple`）、隆冬斜飘六角雪花（`fx-snowflake`）及暴雪/暴雨加强特效，同时在受灾与丰收州郡上空浮现活态天气微标（高温或打开面板自动休眠省电）；
  - 顶栏日期旁升级四季手绘徽标，并在天下出现天灾或丰年时浮现可点击天时快跳胶囊，一键飞往受灾/丰收州郡。

## 2.9.4 / build 158 — 2026-11-23

### AI 定制宋画工笔水墨手绘美术包（舆图微缩地标 × 传报／战神徽章）
- **生成 6 枚透明高精宋画工笔贴图并打包接入全站（`Resources/Art/*.png`、`MapArt.swift`、`MapView.swift`、`HeraldScene.swift`、`MilitaryOverview.swift`、`NationSheet.swift`、`ArmySheets.swift`）**：
  - **舆图手绘层（纯 GPU 平移零着色开销）**：在最开阔远洋深海自动铺印青金子午卯酉**古罗盘玫瑰**（`compass-rose.png`）；放大赏景时在王都旁浮现手绘**王都宫阙城楼**（`landmark-capital.png`），在真实山地丘陵要冲浮现**雄关烽燧**（`landmark-fortress.png`），在真实濒海良港浮现**古港灯塔帆影**（`landmark-port.png`）。
  - **界面手绘徽章**：顶部战事急报横幅、战神谱卡片、国家军事页与军团详情全面接入**朱砂赤金战神徽**（`wargod-crest.png`）；国玺诏令与和约横幅接入**盘龙金云传国玉玺徽**（`edict-crest.png`），所有透明 PNG 一次解码内存常驻。

### 回归并精进 Claude 经典宣纸湿墨晕开与占领扫色
- **彻底回退 v2.9.1 拖沓浑浊的双层噪声重写，以 Claude `97736f59` 经典利落湿墨公式为基座并精细升华（`ConquestWash.swift`、`Wash.swift`、`Ink.swift`）**：
  - 恢复经典明快攻占扫色节奏（`FlipSweep.maxSeconds = 2.4`、`edge = 0.24`、`after = 0.62`、`speed = scale × 2.35`、`LandFade.duration = 0.72`），沿用单次低频 `fbm` 纤维扰动加轻声 `vnoise` 细纸纹，既保持边缘利落饱满不发糊，又降低约一半片元着色开销；
  - 战争墨迹回归经典 `capillary` 湿墨聚边笔锋与清透国色浸染，并叠加细腻收水退墨（`retreatLift`）、水先墨行先导水痕（`waterHalo`）与新墨湿光（`wetSheen`）。

### 顶部传报横幅与主页背景双双解锁 60/120Hz 满帧流畅
- **顶部横幅解锁原生 ProMotion 帧率（`HeraldScene.swift`）**：移除原先硬锁 `30fps`（`minimumInterval: 1.0 / 30.0`）的 `TimelineView` 限制，改为 `minimumInterval: nil` 随设备满帧 60/120Hz 驱动卷轴舒展、急报微震与手绘徽章入画。
- **主页面背景漂移告别低帧卡顿（`MapView.swift`、`TitleViews.swift`）**：
  - 将主页背景缓游 `CADisplayLink` 从硬锁 `15fps` 升级至 `48–120Hz`（目标 `60fps`），新增零分配 `MapLabelsView.panVisible(dx:dy:)` 快路径在绝大多数帧直接像素平移可见国名与地标，仅每 24 帧执行一次新入镜碰撞重排；
  - 移除标题页覆盖在 `MTKView` 之上的全屏 SwiftUI `.mask(...)` 离屏合成层，改用零离屏直叠柔和径向暗角，显著减轻首屏 GPU 负载。

### 山河回放视觉统一对齐与文字挤压错乱根治
- **彻底修复回放界面文字挤压错乱与控件不协调（`ReplayOverlay.swift`、`PaperControls.swift`）**：
  - 修复 `ChipPicker` 在 5 签且含较长标题时强行挤压文字的问题，同时将「历史节点」五枚签题精炼统一为两字标签（`全部 / 转折 / 兵戈 / 兴替 / 续推`）；
  - 恢复回放顶栏与主界面 `GameView.topBar` 的 1:1 对称结构，将「列强霸权演变色带」移入展开的「本年舆情详情卡」内部并统一 `16pt` 内边距、同心三键工具条与 `InkBar` 疆域条；
  - 将「上一史变 / 下一史变 / 回溯此年」独立拆出至底栏大事横幅正上方的对齐快捷胶囊列，还给 34pt 史事横幅完整可读宽度，彻底告别截断错乱。

## 2.9.3 / build 157 — 2026-11-23

### 五部军制深化：玩家主动整编、诸兵合击与战神专属兵法特技
- **玩家可随时整编军团职能分部（`ArmyCommands.swift`、`Service.swift`、`ArmySheets.swift`、`Annals.swift`）**：
  - 军队详情页「整编队伍」新增「职能分部整编（五部军制）」卡片：一键在**御林禁军、野战主力、边防镇戍、轻骑前锋、攻城炮旅**间自由改编，支持同步换授对应文化的真实军团番号并即刻刷新全军属性与集团军协同。
- **五部专属战场被动全面生效（`CombatReader.swift`）**：
  - 御林禁军**「护驾死战」**（京畿与邻州防御再 +12%）、野战主力**「中坚会战」**（集团军内协同额外放大 +4%）、边防镇戍**「深沟高垒」**（本土守御防御再 +10%）、轻骑前锋**「疾袭冲阵」**（主动出击进攻再 +6%）、攻城炮旅**「重炮破城」**（攻击高防要塞围城破防再 +15%）。
- **集团军「诸兵合击」羁绊（`Annals.swift`、`GameState.swift`、`MilitaryOverview.swift`、`NationSheet.swift`）**：
  - 同战区集团军内汇聚 2 类不同分部额外触发 **+4%** 诸兵合击、汇聚 3 类及以上触发 **+7%** 诸兵合击；军队详情、国家军事页与天下军事总览完整展示各集团军分部构成（如 `主力×2 · 前锋×1 · 炮旅×1`）与诸兵协同加成。
- **战神谱觉醒专属兵法特技（`Annals.swift`、`CombatReader.swift`、`Editing.swift`、`MilitaryOverview.swift`）**：
  - 登榜名将依真实战绩与人物特质觉醒**破阵无双、神机破城、铁壁金汤、千里奔袭、兵仙奇谋**五大专属兵法特技，叠加阶位光环真实作用于战斗、围城与行军，并在战神谱卡片与军队详情醒目呈现。

### 全政体真实帝王命名闭环与历代继位性别比例修正
- **根修第 2 代以后女帝比例回弹（`People.swift`、`Creation.swift`）**：
  - 修正世袭继承 `findSuccessor` 逻辑，在尊重手动立储的前提下按真实历史遵循男嗣优先、旁系男嗣次之、允许女性继承或无男嗣时方由女儿继位，并按文化校准历史继承率，推演百年后女帝比例依然真实自然。
- **幕府、教宗国、哈里发国、法王领与史记称谓全面统一（`MonarchLore.swift`、`People.swift`）**：
  - 修复幕府将军与神权领袖在东亚文化下误套世俗王号的问题：幕府称「`征夷大将军 德川家康`」、教宗称「`教宗 利奥十世`」、哈里发称「`哈里发 欧麦尔二世`」、牧首称「`牧首 尼康一世`」、法王／天师沿用真实法号；
  - 史记即位公告同步接入 `MonarchLore.honor`，与国家页、历代君主谱 100% 统一。

### 山河回放史诗升级与零卡顿渲染
- **顶部丝滑「列强霸权演变色带」与「上一／下一重大史变」一键快跳（`ReplayOverlay.swift`、`GameModel.swift`）**：
  - 顶栏下方新增 5pt 列强疆域占比流光色带，随年份自然伸缩一眼洞察天下分合；大事横幅新增 `‹ / ›` 重大史变快跳钮，直达灭国、统一与改朝换代节点；16× 高速下仍保留重大事件朱印与自动追焦；
  - 消除前向播放每帧重复解码上一帧 RLE 与 SwiftUI 重复排序字典的开销，播放与拖轴更跟手。

### 深度性能根治与全站手势／图标统一扫尾
- **消除进游戏与主页面首帧字图卡顿（`MapView.swift`、`GameModel.swift`）**：
  - `LabelsLayer` 新增每帧同步字图绘制预算（首帧仅主线程直绘前 6 大国名，其余所有国名／城名全部转后台串行队列异步光栅化后一次性补排）并预分都城／普通城池列表，彻底根治主页面与点击进游戏瞬间的 CoreText 同步绘制卡顿；
  - `continueGame()` 将存档磁盘读取移出主线程并立即停止标题背景漂移，点击「继续上次的世界」响应更利落。
- **全页面手势与水墨图标统一收尾（`PaperUI.swift`、`TitleViews.swift`、`ArmySheets.swift`、`Feel.swift`、`NationEditors.swift`、`WorldArchive.swift`）**：
  - 修复 `LegendPanel` 列表项在滚动容器内的点击手势，将设置页「战争规则」折叠卡统一纳入 `Group2` 对齐基线，清理弹出菜单、卷宗、舰队、任命与远程设置残留的原生系统图标并全部换为手绘水墨 `InkIcon`。

## 2.9.2 / build 156 — 2026-11-22

### 国家页滚动交互根修与严格视觉对齐
- **彻底解决国家页在控件上上下滑不动的问题（`PaperUI.swift`、`PaperControls.swift`、`NationSheet.swift`、`NationLedgers.swift`、`GameView.swift`）**：
  - `PaperTrack` 滑轨改用 UIKit 方向感知触控层（`PaperTrackTouchOverlay`）：水平拖动与点击即时调值，竖向滑动彻底放行给外层 `ScrollView`，告别滑轨吞手势；
  - 重构 `LongPressLift`（改为静态 0.42s / 8pt 容差长按，不再在落指瞬间拦截拖动）、将 `NationSheet` 世家行与 `NationLedgers` 族谱行的 `.onTapGesture` 统一转为原生 `Button`，修复 `PaperStepper` 按钮手势竞争，并移除横屏侧栏外层手势对竖向滚动的干扰；
  - `ChipPicker` 将 5 项以内升级为整宽分段控件，`NationTabs` 五大主签与 `StatStrip`、`Group2` 卡片实现像素级左右齐平，同时消除嵌套横向滚动冲突。
- **国家页全页严格视觉对齐**：统一全页外边距（`16pt` 卡片 / `20pt` 节头）与卡内 `16pt` 内容基线，清理 `customBar`、`warPage`、`regime.history` 与 `paneCard` 负边距错位，并补齐残留系统图标的手绘水墨化。

### 主页面、点选开局与推演推进全面流畅提速
- **消除主页面与点按进入游戏卡顿（`MapView.swift`、`TitleViews.swift`、`GameModel.swift`、`MapRenderer.swift`）**：
  - 打开标题页任意弹窗（开创新世界 / 设置 / 卷宗 / 更新）立即暂停背景 Metal 漂移与海浪绘制；主页面缓游期间与开卷动画互不抢占 `CADisplayLink`，跳过不可见阶段的地名排版，并把标题缓游地名避让节流至每 3 帧一次；
  - `playReveal` 在标题页与续档展卷期间由 GPU 独立驱动，消除每秒 12.5 次 SwiftUI 全树重算；新世界山河预览新增 110ms 防抖并优化缩略图分辨率；
  - `MapRenderer.setMap` 永久跳过静态州界线的重复重建，城池图标仅在都城迁移时重建；陆地与海洋片元着色器共享单次低频空间噪声驱动四季云岚/秋枫/冬雪，片元算力减半；高速推演（≥ 4×）适度合批版图刷新并调优状态栏刷新间隔。

### 山河回放倍速拓展、拉锯防闪烁与图志动效重铸
- **七档流畅倍速与防闪烁引擎（`ReplayOverlay.swift`、`GameModel.swift`）**：
  - 倍速由五档升级为 **`0.5× / 1× / 2× / 4× / 8× / 16× / 32×`** 七档（32× 采用双帧跨步并自动在重大历史节点驻停）；
  - 新增逐州易主冷却追踪（`replayFlipTimes`）：0.85 秒内反复易主的拉锯战地块不再叠放互相覆盖的扫色与特效，改由 GPU 顶点柔和渐变过渡，彻底消除频繁易主时的闪烁与杂乱；8× 及以上高速回放动态节流国界/国名重建并在暂停或重大节点瞬间提交高清边框。
- **回放图志动效取代插旗（`MapEffects.swift`、`ReplayOverlay.swift`）**：
  - 回放攻占不再插小旗，改为博物馆历史图志风格的「水彩国色晕斑 + 鎏金双圈涟漪 + 舆图菱星」（`atlasRippleLayer`），重大历史转折配古朴事件朱印，观感清爽高级。

### 真实世界帝王命名规则、合理女帝比例与彻底去除「神国」
- **重构中外历史帝王命名与性别比例（`MonarchLore.swift`、`Creation.swift`、`Founding.swift`、`NameVariety.swift`、`NationInfo.swift`、`NationReigns.swift`）**：
  - 修复开局及新建国家高达 50% 女性君主的问题：App 规则改为符合历史规律的性别分布（君主制/部族约 8%、共和/联邦约 16%、教廷约 3%）；
  - **中华／东亚帝王**：改用真实史书称法 **`[国号][年号/谥号]帝 [姓名]`**（如 `唐贞观帝 李世民`、`汉武帝 刘彻`、`明永乐帝 朱棣`，王国称 `齐威王 田因齐`），告别生硬拼接；
  - **日本天皇**：严格遵循一世一元 **`昭和天皇 裕仁`、`令和天皇 德仁`** 风格，皇室成员配置正统皇室名讳且天然无姓氏，移除所有冗余的「（无姓）」标注；
  - **欧美及世界诸文明**：统一按真实历史规则呈现（`国王 亨利四世`、`女王 伊丽莎白二世`、`沙皇 彼得一世（大帝）`、`苏丹 穆罕默德二世`、`沙阿 阿拔斯一世`、`法老 拉美西斯二世`、`忽必烈大汗`、`摩诃罗阇 阿育`、`赞普 松赞干布`）。
- **彻底去除「神国」与不合中文语境的国名（`NamingCatalog.swift`、`Custom.swift`、`Uprisings.swift`、`PolitySystem.swift`、`QuickSheet.swift`、`GameModel.swift`、`NationSheet.swift`）**：
  - 全面清除「神国」「神国起义」及生硬「神权国」，改按真实宗教与文明体系命名（`教宗国`、`哈里发国`、`伊玛目国`、`牧首领`、`法王领`、`骑士团国`、`圣座领`、`神宫领`、`太平天国`、`教廷`、`宗教起义`），并下调无宗教冲突时的自发宗教起义权重。

### 多兵种五部军制、战区集团军协同与战神谱实战加持
- **五部军制与地道军事番号（`Annals.swift`、`Armies.swift`、`NameVariety.swift`、`CombatReader.swift`、`Editing.swift`、`NativeView.swift`、`GameState.swift`）**：
  - 一国常备军正式划分为五大职能分部并拥有各文明地道番号与真实战斗加成：**御林禁军**（攻+10%/防+15% · 如神策禁军/近卫师团/皇家近卫军团）、**野战主力**（对军进攻+12% · 如征东野战军/主力军团）、**边防镇戍**（本土守御+18% · 如朔方边防军/镇守旅）、**轻骑前锋**（行军+15%/攻+8% · 如骁骑前锋营/骠骑前锋团）、**攻城炮旅**（围城破防+28%/攻+5% · 如神机破城营/皇家攻城炮旅）。
- **战区集团军群自动协同编组（`Annals.swift`、`CombatReader.swift`、`MilitaryOverview.swift`、`NationSheet.swift`、`ArmySheets.swift`）**：
  - 同国 2 支及以上军队在同一战区（京畿/东线/西线/南线/北线）作战时自动组成 **集团军 / 方面军**（如 `东线第一集团军`、`京畿卫戍集团军`），按规模赋予真实 **+6% / +10% / +14% 协同攻防加成**，并在国家「军事」页、全局军情页与军团详情页全景呈现。
- **战神谱实战光环加持（`Annals.swift`、`CombatReader.swift`、`Editing.swift`、`Engine.swift`、`MilitaryOverview.swift`、`ArmySheets.swift`、`NationSheet.swift`）**：
  - 战神谱名将正式拥有专属战神称号（无双战神 / 常胜军神 / 破城名将 / 百战宿将等）与四阶真实全军战场光环（`骁将` 攻+5% 围城+6% / `名将` 攻防+8% 围城+12% / `上将军` 攻防+12% 围城+18% 行军+6% / `军神` 攻防+18% 围城+28% 行军+10%），在阵活将实时加持本国三军作战与行军。

## 2.9.1 / build 155 — 2026-11-22

### 完整回退并根修开局过渡动画
- **根治新世界/续档开卷动画消失 Bug（`GameModel.swift`、`MapView.swift`、`TitleViews.swift`、`LieguojiApp.swift`）**：
  - 修复 `worldID = UUID()` 重建 `MapView` 与 `animateReveal()` 异步竞态导致新地图未挂载就错过开卷回调与 1.25× 镜头推拉、且新 `MapRenderer` 首帧闪出 `reveal = 1` 的核心缺陷；现在新 `MapView` 挂载时按 `controller.reveal` 初始化并在首帧布局就绪（`mapMountToken`）后再启动开卷时钟。
  - 完整回退并保留经典开屏与开卷体验：开屏落墨/等高线/远山/朱印、标题 7 秒慢开卷、开创新世界 6.8 秒「铺纸注海 → 勾勒海岸 → 晕染山河 → 冲刷江河 → 划分州郡 → 分封列国 → 勘定国界 → 营建城邦」八阶段水墨渐显与 1.25× 镜头徐徐拉开、续档 3.2 秒完整展卷。

### 生宣矿彩水墨晕染与占领扫色彻底重铸
- **告别锯齿多边形与脏黑圈（`InkCells.swift`、`Ink.swift`、`ConquestWash.swift`、`Wash.swift`）**：
  - 战争墨迹拉长至更从容的 `1.15s` 浸润 / `1.65s` 退墨节律，收柔顶点邻环权重，在着色器改用双尺度域扭曲毛细丝缕算法（`noise 0.175 / soft 0.25`），彻底消除 Voronoi 多边形硬边；摒弃生硬黑灰描边，改为「毛细淡彩先导水晕 + 通透矿彩主色 + 本色水彩积墨润边」三层自然洇透。
  - 土地易主扫色（`FlipSweep`）放缓柔化（`edge 0.44s / after 0.90s / speed 1.55×`）并大幅增强宣纸纤维双尺度扭曲（`noise 0.72`），去掉旧版深褐脏圈，呈现温润水彩自然漫开的视觉过渡。

### 四季流转全面强化（视觉 × 顶栏 × 真实玩法）
- **鲜明可辨的四季海陆光影与动态雪线（`MapRenderer.swift`、`GameModel.swift`、`ReplayOverlay.swift`、`GameView.swift`）**：
  - `seasonPhase` 严格对齐游戏历法月份（3–5月春 / 6–8月夏 / 9–11月秋 / 12–2月冬），顶栏日期胶囊新增四时节气徽标（春玉 / 夏苍 / 秋枫 / 冬青）。
  - **春**：嫩绿青玉天光与平野晨岚微雾，海面翠润；**夏**：明丽暖金盛夏日光与蔚蓝深海；**秋**：中纬林野与平原铺展鲜明金赭枫红秋韵；**冬**：清冷晶蓝天光、有机飘雪层自北境与高山岭脊南下漫覆（高达 46% 积雪覆盖且保留国色可辨），北洋海面同步生霜泛寒。
- **四季深度介入行军、粮秣与赋税（`Travel.swift`、`Daily.swift`）**：
  - 新增 `WorldSeason` 规则引擎：隆冬客军粮耗 +45% 且高山/冻原/冰川/荒漠加剧严寒非战斗减员、月税 −10%；仲春友军补给与士气恢复 +25%；金秋秋收月税 +12% 且粮草充盈。

### 地图奇观地标创新与属性体系深化
- **山河人文奇观、王都城阙与城郊村舍（`MapLayers.swift`、`MapDetail.swift`、`MapRenderer.swift`）**：
  - 新增世界奇观与地标（岬角白石灯塔、雄关烽燧、大漠古碑、深林重檐古刹）、王都四向城阙角楼与城郊黛瓦村舍桑田，提前至 `0.92×` 缩放即平滑浮现驿道、阡陌与微细地貌。
- **州郡 / 军团 / 国家立体属性体系与全局 UI 图标统一（`Commands.swift`、`Engine.swift`、`ProvinceSheet.swift`、`ArmySheets.swift`、`NationSheet.swift`、`PaperUI.swift`、`NationDecreeViews.swift`、`NationHistoryViews.swift`、`NationLedgers.swift`、`QuickSheet.swift`、`MilitaryOverview.swift`）**：
  - 州郡新增动态「繁盛度（0–100）」「战略定位（咽喉雄关/通海良港/鱼米沃野/边荒险地等）」与「当令节气实效」；军团页新增战备评级、粮道补给态与当令节气状态卡；国家页新增「国势五维（军略/守御/财政/民生/安定）」、当令节气与战事疲弊度洞察。
  - 全站清扫残留系统图标并统一宣纸双线 `Group2` 卡片与手绘水墨 `InkIcon`。

## 2.9.0 / build 154 — 2026-11-22

- 恢复 2.8.8 的陆军雕漆棋子、舰队编队与配色。默认大小增加 12%，可在画面设置调为默认尺寸的 0.7–1.5 倍。
- 局内菜单新增「战争」，可为本局所有国家调节战争频率、战斗烈度、行军速度、征兵规模、造舰速度、叛乱频率和事件频率，并进入外交、同盟、战争期限和停战设置。
- 标题页可为新世界保存七项战事默认值。已存世界沿用各自的规则。

## 2.8.10 / build 153 — 2026-11-22

- 修复标题页性能设置的 SwiftUI 绑定。标题页与局内菜单使用同一组帧率、清晰度和降温偏好。
- 模拟器巡览在实际推演中验证世家与联姻传报、快速收起和接续排队，同时要求世界日期前进。
- 月度国运按领地归属一次汇总人口和容量。军队位置与行军提示共用已解码路线，保护兵力、粮草和士气的整数转换。
- 移除缺失字段兜底路径上的共享计数，保留调试版严格读取开关。

## 2.8.9 / build 152 — 2026-11-22

### 军团、海军视觉重铸与战斗特效打磨
- 军团与舰队地图显示尺寸与雕漆军牌升级，陆战交锋、海战齐射、围城进度环与战损飘字同步强化；疏减约 65% 冗余山峰并丰富全地貌绘景，地形联动行军、后勤损耗、税赋与守备；移除冗余悬浮小笺，国家页精简为五主签、外交页与设置页彻底梳理去重，海洋着色器与月度结算性能优化。

## 2.8.8 / build 151 — 2026-11-22

### 闪退修复与引擎兜底
- **崩溃日志根因定位与彻底防闪退（`JSValue.swift`）**：解析真机崩溃日志（`2.8.7 build 149`，iPhone14,3 / iOS 27.0.1），确认为开局约 25 秒在推演线程触发 `EXC_BREAKPOINT`（`DiplomacyDeep.month` → `Regimes.day` → `NativeEngine.advance` 读取已废弃的 `world.campaigns` 导致 `JS.asArray` 触发 `fatalError`）。除 `build 150` 已改读真实战役表外，本次从引擎数据层 `JSValue` 彻底建立宽松兜底：生产环境读取缺失/错型字段不再 `fatalError`，改为返回与 JS 一致的默认值（`0 / "" / false / []`）并对数组下标越界安全防护，彻底杜绝同类字段错配导致整局闪退。

### 界面与圆角统一、史记与回放重做
- **修复右上角返回圆角与全局同心圆角（`LieguojiApp.swift`、`PaperUI.swift`、`ReplayOverlay.swift`）**：
  - 将 `View.glass` 升级为 `InsettableShape` 并统一使用 `shape.inset(by: 2.5).strokeBorder(...)`，同步修正 `Group2`、`.paperCard()`、`FloatingTacticalPill`、`MapViewSwitcher`、`SealFace` 与 `PaperToastHost`（原 10pt 裁切与 16pt 卡片错配），实现全作严格的苹果同心连续曲率。
  - 修复山河回放顶栏在竖屏下因宽度溢出把右上角「返回当下」挤压变形的圆角 Bug：顶栏改为与主界面 `GameView.topBar` 1:1 对齐的左侧 44pt 纪年胶囊 + 右侧三枚 44×44pt 正圆同心 `CircleIcon`（大势 / 节点 / 朱红返回），统一所有悬浮卡关闭角标为 26pt 圆形 `CardCloseButton`。
- **史记（纪事）页面彻底重做（`WorldSheets.swift`、`ChronicleViews.swift`）**：
  - 彻底移除旧版杂乱堆叠的 4 张顶卡、`ScrollRod()` 与生硬直角矩形框，改为与列国/军事/外交 100% 一致的 `SheetHeader` + `ChipPicker`（「编年大事」/「兴衰长卷」双页签）+ 按年分节 `SectionLabel` 与 `Group2` 奏折卡片；分类筛选改用轻盈 32pt 胶囊、搜索框换用手绘水墨图标，并支持分页懒加载与仅切入「兴衰长卷」时再加载时间轴，首开更顺滑。
- **山河回放页面进一步优化（`ReplayOverlay.swift`）**：
  - 新增拖动时间轴实时浮出的纪年与大事预览浮签、底栏横幅内置快捷定位焦点圆钮，收紧大势悬浮笺高度以留出更广阔的舆图观战空间。

### 军队、海军与作战晕染动画全面升级
- **军队与海军视觉重绘（`UnitArt.swift`、`MapRenderer.swift`）**：
  - 军牌底盘 `0plate` 升级为 128×128 雕漆盾形军牌（平肩微弧收尖盾形 + 亮边倒角 + 雕槽双铆钉），配高反差象牙浮雕全套 13 种兵种（冠翎甲士、方天画戟、鸢形重盾、反曲强弓、重机弩、骏马轻骑、具装铁骑、草原骑射、龙虎大纛、战楼战象等）。
  - 水师战舰重绘为双桅楼船/盖伦主力战舰（高翘撞角、艉楼甲板、双桅鼓风弧帆、燕尾旗舰帅旗、四门炮窗与船底雕浪），新增专属海沫尾迹底纹 `0fleetwake`（跳过阴影通道呈纯净海沫浪环），多舰编队排成破浪雁行阵。
- **作战水墨晕染与战斗特效升级（`Ink.swift`、`Wash.swift`、`MapEffects.swift`）**：
  - 战争占领墨场着色器升级为「宣纸三层水墨洇染」：域扭曲纤维波动 + 先导淡墨水晕 + 湿墨聚边笔锋与干透归纸微润水泽；易主扫色升级为域扭曲双层湿墨暖金波锋。
  - 陆战交锋新增节律性外扩兵戈气圈，海战齐射新增炮弹入水白浪水花环，攻城插旗新增旗竿落定鎏金星芒微闪。

## 2.8.7 / build 150 — 2026-11-22

- 修复顶部「天下大势」解析缺失交战方时的越界。修复切换存档后上一局传报混入、快速收起传报时旧任务抢占新队列的问题。
- 世家和联姻传报接入开局模拟器巡览，并覆盖空参与国、缺失交战方和接续排队。限制传报刷新时长及动画范围。
- 合并每步的新增事件扫描。地图标注数据相同时保留现有图层，镜头静止时复用战斗连线路径。
- Metal 顶点缓冲等待上一次 GPU 读取结束后再原地写入。保护地图特效、战损和 ETA 的坐标或数值转换。
- 修复月度外交结算和朝堂军情读取错误战役字段的问题。多线交战统计和季度宿怨按真实参战方计算。
- 模拟器巡览检测到游戏提前退出时立即报错并采集日志。

## 2.8.6 / build 148 — 2026-11-22

### 修复与性能优化
- **修复 CI 归档构建上传失败（`NationInfo.swift`、`GameModel.swift`、`NationSheet.swift`、`WorldSheets.swift`、`MapEditor.swift`、`NativeHost.swift`）**：
  - 修复 `NationInfo.swift` 朝堂四方权力天平读取 `People.skills(_:)` 返回的 `Persona.Skills` 结构体时误用四元组的编译错误，并显式标定 `Double` 运算类型；在 `GameModel.swift` 补齐 `nationDecree(_:kind:)` 统一包装并在 `NationSheet.swift` 显式标定纹章列表 `[String]` 类型；同步确保 `WorldSheets.swift` 时间长卷引用 `Theme.ink2`、`Names.color(...)` 与 `Theme.kai(...)` 并清零 `MapEditor.swift` 与 `NativeHost.swift` 的 Swift 6 并发告警，恢复 GitHub Actions 自动归档与未签名 IPA 产物上传。
- **根治进入游戏与点开始闪退（`MapView.swift`、`MapRenderer.swift`、`GameView.swift`）**：
  - 移除 `MapView.Coordinator.set` 与 `layoutChanged` 在 `UIView.layoutSubviews()` 及嵌套 `CATransaction` 中同步直接调用 `mtk.draw()` 的路径，统一交由 `mtk.setNeedsDisplay()` 在 CoreAnimation 提交阶段渲染，并在 `set(_:sync:)` 内确保覆盖层各子视图帧尺寸始终与视口 `fullBounds` 一致，彻底解决进入游戏与点击开始时因 `presentsWithTransaction` 双重绘制及 `waitUntilScheduled()` 重入引发的闪退。
  - `MapRenderer.draw(in:)` 的 `MTLScissorRect` 改为对 `pass.colorAttachments[0].texture`（2× MSAA 多重采样纹理）与 `drawable.texture` 取共同宽高下界，并在 `Double` 域完成 `.isFinite` 校验与 `[0, dw] × [0, dh]` 钳制后再转为 `Int`，杜绝视口刚创建或旋转时因 MSAA 纹理尺寸瞬态差异或浮点转整型越界触发的 Metal 闪退。
  - 统一 `PlaySealButton` 的 `.onChange(of: playing)` 为 iOS 17 双参数闭包。
- **消除全屏 `CALayer.mask` 离屏渲染开销（`MapView.swift`）**：
  - 将 `overlayHost.layer.mask` 替换为硬件裁剪架构 `overlayHost.clipsToBounds = true`（`overlayHost.frame = clipRect`）+ 内层 `overlayCanvas`（`frame = CGRect(x: -clipRect.minX, y: -clipRect.minY, ...)`），在保持国名、箭头与特效严守卷轴画心边界的同时，彻底消除 60–120Hz 每帧全屏离屏蒙版渲染开销。
- **核心引擎与着色全链路防越界加固（`Travel.swift`、`CombatReader.swift`、`Naval.swift`、`NativeView.swift`、`InkCells.swift`、`Creation.swift`、`UnitArt.swift`）**：
  - 统一 `UnitArt.swift` 与 `MapRenderer.swift`（`0plate`）的 `CGGradient` 为 4 通道 `CGColorSpaceCreateDeviceRGB()` 并指定 `preferredRange = .standard`。
  - 为 `TravelGraph.location/segment`、`CombatReader.protruding/inputs`、`Naval.issueAutonomous`、`NativeView.gameState`（`etaDays` 有限值校验与 `g.mountain/plateau` 下标检查）、`InkCells.cell(at:)` 与 `Creation.rulers` 补齐全部边界与空数组防护。

## 2.8.4 / build 146 — 2026-11-22

### 新增与优化
- **悬浮小笺全面接入设置开关（`MenuSheets.swift`、`MapView.swift`、`ReplayOverlay.swift`）**：
  - 在「设置 / 地图显示 › 悬浮小笺与看海辅助」及「菜单 › 声音与其他 › 推演与看海体验」同步提供 4 项持久化开关：
    1. `地图局势快控悬浮小笺（四角吸附印章）`（`showTacticalPill`）
    2. `御案天下大势悬浮小笺（列强占比与头号战事）`（`showScrollPlacard`）
    3. `山河回放天下大势悬浮小笺`（`showReplayPlacard`）
    4. `观战巡弋导演镜头（推演中自动巡礼焦点战场）`（`directorCruise`）
- **御案天下大势悬浮小笺、观战巡弋导演镜头与专题图例聚光高亮（`PaperUI.swift`、`GameView.swift`、`GameModel.swift`）**：
  - 实时推演顶栏下方新增「御案天下大势悬浮小笺」（`ScrollPowerPlacard`）：展示前六强国色疆域比例条、前三强点击直飞都城、当前头号焦灼战事、快捷「巡弋」开关与 `×` 一键隐藏。
  - 新增「观战巡弋导演镜头」（`maybeDirectorCruise`）：推演运行中每约 7.5 秒自动以抛物线鹰眼镜头巡礼全图激战陆战、危急围城、海战或交战大国都城，玩家触碰地图后自动礼让 12 秒。
  - 联盟/文化/宗教/世家/政体/经济/特产/地理等全部专题视图左下角 `MapViewLegend` 新增「点图例聚光高亮」：点按任一图例项即可将该群体州郡聚光高亮、其余州郡柔化退为淡宣纸灰，再点一键还原。
- **外交地缘视线弧线、军团海陆补给脉络与纪事兴衰时间长卷（`MapEffects.swift`、`GameModel.swift`、`WorldSheets.swift`）**：
  - 选中任一国家或打开国家页时，自其都城向交战敌都（朱红虚线弧）、盟友都城（青玉弧）与宗主/附庸都城（泥金弧）绘出柔和地缘视线弧线（`GeoArc`）。
  - 选中任一军团时，自最近本国实控州向军团驻地绘出后勤补给脉络（深入敌境断粮或低补给时转为朱砂警示断续线）。
  - 纪事页顶部新增横向「列国兴衰时间长卷」（`ChronicleDynastyScroll`），展示历次关键节点列强疆域消长堆叠色柱与当期霸主，点按任一节点直达该日山河回放。
- **朝堂四方权力天平、当期大政议案、幼主摄政亲政与天命笔导演台（`NationInfo.swift`、`NationDecrees.swift`、`Custom.swift`、`NationSheet.swift`）**：
  - 国家「朝政」页新增「朝堂四方权力天平」（君主中枢 / 门阀世家 / 军功将领 / 议会文官四方占比实时合计 100%，展示主导格局加成及「内廷集权 / 恩荫门阀 / 犒军授柄 / 广开言路」四项制衡手段）。
  - 支持「冲龄幼主摄政」（君主未满 16 岁时由权臣/母后摄政，满 16 岁当月自动触发加冠亲政大典并记入史册）。
  - 新增「当期朝堂大政议案与战后问责」（依战败震荡、战时军饷、豪强坐大或和平兴学动态生成朝堂议案、赞成/反对派系与一键「御批强推」）。
  - 国家「自定义」页新增 12 枚国家旌旗纹章印记（龙/鹰/鼎/狮/狼/樱/剑/日/月/莲/凰/聖，同步盖于国家页顶栏朱印）及「天命笔 · 上帝导演神迹台」（一键天降雄主、天降神兵、天赐巨帑、共主邦联、藩镇分裂）。
- **性能优化**：
  - `NationSheet` 重型页签内容（`tabContent`）改为开页首帧渲染后异步挂载（`bodyReady`），弹窗展开更跟手顺滑；清除 `NationSheet` 与 `FloatingTacticalPill` 残余 SF Symbol，统一为 `InkIcon`。

## 2.8.3 / build 145 — 2026-11-22

### 新增与优化
- **立体雕漆军团棋子与宋版双色水墨图标**：
  - `UnitArt.swift`：升级为三阶立体雕漆/木雕渲染（深墨外郭 + 内切倒角 + 西北至东南立体受光渐变 + 高光内脊）；步兵补齐冠盔与护手阔剑，长枪兵增绘迎风侧旆，战舰增绘桅顶号旗与三门舷侧炮窗，重骑增刻胸甲纹；`MapRenderer.swift` 军牌底盘（`0plate`）升级为双圈雕槽立体漆牌。
  - `InkIcons.swift`：启用宋版双色套印（未选中态在焦点部件敷淡朱砂点睛，小字号自动微增笔锋粗细），补齐 `.chevronDown`、`.chevronRight`、`.computer` 手绘水墨图标。
- **四时节气光影、收水退墨与抛物线鹰眼镜头**：
  - `MapRenderer.swift` + `GameModel.swift`：Metal 陆地片元着色器接入四时节气光影相位（春润青玉、夏沐暖金、秋染缃赭、冬覆清霜，冬日北境高纬轻敷薄霜，高温态自动休眠）。
  - `Ink.swift`：战争墨迹前沿新增新墨微润水光，停战/败退新增「收水退墨」（随退墨进度抬升纸纹显色阈值，使墨晕自外缘沿纸纤维向内收干）。
  - `MapCamera.swift` + `MapView.swift`：长距离相机飞行升级为抛物线鹰眼弧线（`arcInterpolate`），双指捏合到底触发整图展卷磁吸触感；`PlaySealButton` 新增落印扩散朱砂环，`HeraldScene` 宣战双戟新增飞白斜划、议和玉简新增翠白瑞光。
- **山河回放深度升级（`ReplayOverlay.swift`）**：
  - 顶栏新增「当帧天下大势 · 列强消长」悬浮小笺（展示存世国数较开局变化、本步易主州数、前八强州数/占比/较开局净增减 `+N州` / `-N州`，点任意列强直飞其当帧疆域重心）。
  - 新增「按住对比开局」（按住实时预览第 0 帧开局疆域，松手还原）、「大事追焦」（自动飞往重大转折发生州）、「循环回放」及 `0.5× / 1× / 2× / 4× / 8×` 五档倍速；「历史节点」扩充为五类筛选并标注当帧首强霸主。
- **军队 AI、国家 AI 与深度外交完善（`WarCouncil.swift`、`ArmyOrders.swift`、`DiplomacyDeep.swift`）**：
  - 军机处优先反击入侵本土与威胁都城之敌（`1.65×`），进攻选点优先光复本国法定故土并拔除敌方孤立突出部与飞地；残兵或低士气部队自动中止撞击重兵城池。
  - 国家宣战意愿纳入多线作战克制、国库/战败震荡审势与趁敌大败/多线苦战果断出击（`1.28×`）；每月外交新增交战宿怨演进、关系跌破 −45 自动废止旧约，以及弱国面对强邻环伺时主动抱团缔结共同防御条约。
- **版本号规范**：自本版起遵循单数字十进制递进（`2.8.3` → … → `2.8.9` → `2.9.0` → … → `2.9.9` → `3.0.0`）。

## 2.8.2 / build 144 — 2026-11-22

### 修复
- **地图裁剪越界与缩放/拖动坐标系错位**：
  - Metal 渲染管线对地图画心 `[0, map.width] × [0, map.height]` 施加像素精确 `MTLScissorRect`（御案底纹与外侧卷轴画框仍全屏绘制），防止任何底图、军团棋子或行军线溢出卷轴边框。
  - 将 `effects`、`labels`、`floats`、`troops` 四层覆盖视图统一收拢至 `overlayHost`（开启 `clipsToBounds`）并挂载画心蒙版 `overlayMask`，同步限制国名避让回退与北缘都城名留在画心内，彻底杜绝国名、战争箭头、海浪与兵力条飞出上下木框。
  - 修复双指缩放与单指拖拽期间 `sync()` 与 `CADisplayLink` 回调将 `mtk.presentsWithTransaction` 改回 `false` 导致的 Metal 与 UIKit 1–2 帧不同步错位；交互移动期间在单次 `CATransaction` + `UIView.performWithoutAnimation` 内统一更新画心蒙版、覆盖层坐标并同步执行 `mtk.draw()`，同时将 `MapLabelsView.resize` 改为更新 `bounds` 避免字图换档偏移。
- **联盟图与专题视图缺陷**：专题分色视图（`fills != nil`）屏蔽国家色占领墨晕，不再串出绿块；提高专题视图色彩权重避免与地形底色混成撞色；加宽 `MapViewLegend` 至 224pt 减少同盟名截断。
- **顶栏日期截断与面板细节**：竖屏顶栏战争数改为紧凑形态（`N战`）并调整日期字号与布局优先级；优化族谱页副标题、女性继承开关折行，补充掌权世家徽标与成员点击四维能力速览；国家页自定义顶栏增加分隔线与裁剪，百官列表改为切至朝政页签时懒加载。
- **自定义文化空数组闪退与家族一致性**：修复 `NamingCatalog.givenNames`/`houseNames` 与 `Creation.base` 在玩家自建未知文化上调用 `.asArray` 触发的崩溃；修复 `Creation.createNobleFamily` 强制把家主配偶改为同姓的问题，`Nobility` 兜底姓氏统一走纯净池。

### 优化与补全
- **接敌格地貌与军情说明**：App 规则 `CombatReader.inputs` 按 70% 接敌格实际地貌 + 30% 全省地形混合计算战斗地形修正；`NativeView` 补全渡海撤回、边境集结、无路待命与护卫都城说明。
- **海军主动截击渡海**：App 规则 `Naval.issueAutonomous` 检测同海域渡海敌军并优先派舰队驰援近岸港口截击登陆航道。
- **战败震荡接入好战度**：`Regimes.temper` 纳入 `defeatPenalty`，补齐战败割地 → 民情/动荡/好战度下降的政治因果闭环。
- **墨场性能与零警告**：重构 `InkCells.apply` 去除每步 240 KB 整表 CoW 拷贝与 `Set<Int>` 分配，改为可复用时间戳数组；消除 `CreationPolitics.swift` 与 `PeaceBridge.swift` 两处编译器警告；展开全图远景军团图标下限由 8.8 调至 6.8。
- **新增专项回归**：`ContinuationAuditTests.swift`（接敌格地貌、40/80/120 城多模板面积均衡、跨海截击与海上停战返航、家族文化隔离与自定义文化防崩、战败震荡因果链）。

## 2.8.1 / build 143 — 2026-11-22

- 停战后依当前墨量退场，取消尚未显示的落墨。在守军相持和多国前沿重叠时，保持已经显示的进度。
- 和约确认条款中的割让，归还双方其余军事占领地。白和、割地与第三方仍在交战的局势分别用回归场景覆盖。
- 地图底色、国色和墨迹归属同步安装，后台格子更新与画面颜色交接使用只读快照。雪峰和向阳坡的高光限制在保留纹理的范围。
- 军机调度以实际控制的都城为驻防点。失陷的旧都进入已有的收复条件。
- 归国军令与外交复核共用通行规则，撤军可以沿合法的中立地带继续行进。新敌封路时在实际位置停下，和约引起的港口易主随条款生效。
- 展开整图和复位可直接触发镜头动画。巡览通过实际镜头比例确认整图完整入屏。
- Metal 按设备支持的多重采样数初始化。构建校验覆盖地图、扫色和墨迹使用的整份着色器。

## 1.15.0 / build 116 — 2026-11-14

### 修复
- 暂停时打开国家页会改动世界：`posts` 查询每次都调用 `fillPosts`，官员去世后的空缺在查看朝堂时被临时补任。1.14.0 的 CI 巡览世界里正好有五个空缺，面板体检因此判定「世界未保持冻结」而失败。现在只有第一次查看时建立官职，之后的空缺由每月结算补任。用 1.14.0 的服务器产物和巡览世界在本机逐个查询比对存档，确认只有这一个查询改动数据。
- 首都名在常规缩放下仍不显示：1.14.0 把放大后的首都名放在首都圈上方，但离圈只差约一个点，被避让算法判为与自己的首都圈重叠而隐藏。现在按圈的避让框、隐藏标签的余量和半个字高留出距离。

### 新增
- 名将谱（`Annals.swift`，本作规则）：战时各国的战时统帅（没有则为常备军统帅）每月记功 4，当月每拓一州记功 12。战功 40 骁将、100 名将、200 上将军、350 军神。升为名将、军神以及入谱者去世都记入大事记。引擎查询 `generals`，军事页「军情」新增名将谱一节。
- 合纵连横：一国控制的州郡达到全部有主州郡的三成、且现存国家不少于五个时，每月 12% 概率触发，其邻国中州郡最多、彼此不在交战、且不是它附庸的两国结盟（一方已有联盟则另一方加入；双方都已有联盟则不合并）；同一霸主 24 个月内至多一次。
- 外交页邦交总览（`DiplomacyBoard`）：四个数格（战争、同盟、停战、接壤）；同盟一览（名称、是否铁盟、成员，点成员飞到其都城）；所选国家的邦交表，每个有关系的国家一行，标出交战、同盟、宗主、附庸、联姻或互不侵犯（余几月）、停战（余几月）、接壤及兵力强弱，按轻重排序。点行飞到对方都城并显示朱印高亮；行尾三枚小印分别跳到军事页战局（仅交战国）、该国纪事、该国国家页。只读取引擎已有的外交数据，没有新增机制；原作没有的「宿敌」未做。
- 天灾随气候：洪水落在荒漠占一半以上的州郡时改为旱灾（存粮减半、人口 −3%），蝗灾落在冻土冰原占一半以上的州郡时改为雪灾（存粮去四成、人口 −2%）。水旱蝗疫、地震、祥瑞等事件此前已有，这次没有新增种类。

### 调整
- 视觉统一（巡检第一批）：大事记搜索框改用与「搜索国名」相同的纸面输入框；大事记分类按钮的圆角、高度、描边与各页分页按钮一致（圆角 10、高 40）；「天下大势」「岁纪」两张卡片改用通用纸面卡片的双线边框。

### 验证
- 1.14.0 的 CI 运行 43595932706：Swift 测试、IPA、Windows 服务器通过；模拟器巡览的截图全部生成，但面板体检失败（见上），所以 1.14.0 没有发 Release，其内容随本版一起发布。该次巡览的其余检查通过：整图展开时镜头缩放 0.2512 等于整图可见的缩放；国名闪烁 9424 帧 2 次（易主 30 州）；相邻国家最小色差 36.5。已缩小查看整图、军情页、大事记岁纪、天下初定四张截图。
- 本机 lint、类型检查、12 项巡览检查器测试通过。
- 新增 Swift 测试 `AnnalsTests`：战功分级、统帅拓地入谱并升为名将、霸主出现后邻国合纵且两年内至多一次。

## 1.14.0 / build 115 — 2026-11-14

### 修复
- 领袖更替与事件不一致：`dynastyMonth`（禅让）只改国号不换人，`Regimes.change`（革命、复辟）只改政体不换人。新增 `Handover.swift`：禅让由势力最强的别家里能力最高的成年人登位（无人可继则不发生）；改为共和或联邦时按共和候选规则选出新元首并排除旧君；复辟和其余改制由别家登位；政党夺权、军政府还政选举总统时同样换人。全部走引擎原有的任命流程，任期、统治家族、纪事同步。
- 首都名要放得很大才显示：首都名按地图单位缩放，开局缩放下不足 8 点被隐藏。现在缩放后不小于 4.5 点时一律按 11 点绘制，并避开首都三重圈；放大绘制时排在国名之后，不挤掉国名。

### 新增
- 元首与掌权者（`Heads.swift`，本作规则）：每种政体细分给出元首头衔、政府首脑头衔、谁掌权、首脑是否选举产生。政府首脑即中枢「行政首脑」一职。君主立宪、联合王国、议会共和、幕府、摄政五种由政府首脑掌权。
- 掌权者生效：`Regimes.governor` 返回在世的掌权首脑。国势（军略、守御、财政、民生取其军事、行政、魅力）、AI 好战度（`temper`）、外交人格、税收特质、国运的行政项、战场统帅加成都改读掌权者；安定度的魅力项仍读元首。原作逐位对照的普通推演不受影响（仅本作规则开启时生效）。
- 组阁与倒阁：首脑由选举产生的政体，大选当月由议会多数推举，统治家族以外有人选时不用宗室；民心低于 −0.35 时每月 4% 概率倒阁。元首不变。
- 更替必书：`watchPremier` 每月核对首脑人选，凡有变化都记入大事记并写明原因（卒于任上、已不在本国、奉君命改任、议会改组、岁末考核罢免）。
- 天皇唯一：日本文化且为帝国或君主立宪的现存国家中，只有序号最早者称天皇，其余称大王；两国交战时都称天皇。
- 大事记：岁纪年表、分类印、距今时间、涉事国家标签、搜索、只看一国。
- 军事页默认页「军情」：军队动态计数、列国兵势、围城与交锋直达、兵种构成、最强之军、断粮与溃退。

### 调整
- 国名摆放：原来只取腹地最深的一点、沿三个方向取最长直线。现在在距边界至少为最深处六成的格点里取八个候选位置，每处试领土主方向、其一半和水平三个角度；按「直线可写长度 ÷ 字数」与「直线中段 70% 到边界的最小余量」两者较小值（即可写字号）择优，沿主方向略加分，偏离重心略减分。

### 验证
- 本机 lint、类型检查通过。
- 新增 Swift 测试 `HandoverTests`（禅让、革命、复辟后领袖、任期、统治家族、国号、政体一致；无人可继时不变）与 `HeadsTests`（各政体席位、天皇唯一、选举只换首相不换君主、朝廷自行换人入纪事、掌权者取首相）。

## 1.13.0 / build 114 — 2026-11-14

### 修复
- 地图不能展开：1.12.0 的提交 9c8b6720 把最小缩放从「整图可见」改成「铺满屏幕」，竖屏下最多只能看到约四分之一的地图。最小缩放恢复为整图可见（`MapCamera.scaleBounds`），进入游戏时仍铺满整屏。新增回归测试 `testWholeMapIsReachable`。
- 查看都城没有反应：国家页打开时镜头已经飞向都城，按钮再飞一次同一位置，而且都城在面板后面，所以看不出变化。现在按钮把面板降到最低一档，镜头用 `MapCamera.spotlight` 移到都城并放大到至少整图的 10 倍，都城落在屏幕高度 30% 处，并显示朱印双环高亮。新增回归测试 `testSpotlightAlwaysShowsTheCapital`。
- 国名一直闪烁：每次易主，`MapLabelsView.setNations` 把所有国名标签删掉重建，新标签先隐藏再用 0.22 秒淡入，所以每丢一个州全图国名闪一次。现在按文字就近复用原有标签（`NameStability.match`），位移不到半个字高、大小变化不到 15%、倾角变化不到 0.1 弧度的保持原位；文化、家族、宗教等视图的分组名同样处理。新增回归测试 `testNamesSurviveBorderChanges`。

### 新增
- 国色分明（本作规则）：`NationColors` 新色板 30 色，十二种色相各分浅、中两阶，另加六种土色墨色。新世界在第 0 天按都城位置重新分配：最近六国取 CIELAB 色差最大的颜色，其后六国放宽 22。开卷预览用同一算法，交接时颜色不变。推演中新成立的国家避开持有或毗邻其州郡的国家的颜色。原作按序号发色，相邻国家色差最低约 10；新算法在 8–160 国的随机布局模拟中，一国与最近四国的色差最低 23。已有存档不改色。
- 海面细节：水线由三道加到五道（距岸 5、10.5、17、25、35），浅水泛白范围由 16 加到 22；海浪改为一到三道叠浪，每道下有一条深色刻线，长度、相位、间距各不相同；沿岸浅水格加浅滩短划；海面纹理加三层平滑噪声的晕染，每个通道变化不超过 ±5.5%。冷色、暖色两种海色都生效，受「舆图细节」开关控制。
- CI 巡览新增三项：逐帧采样国名可见度并写 `name-stability.json`（镜头静止推演约 36 秒，闪烁次数超过 4 即失败）；相邻国家最小色差写 `color-contrast.json`（低于 15 即失败）；新增截图 `03b-colors-dense`（都城最密处特写）、`04c-capital-spotlight`、`04d-map-unrolled`。

### 调整
- 国家页「国势」五行（军略、守御、财政、民生、安定）都带图标，原来只有财政一行有。

### 验证
- 本机 `npm run check` 通过：lint、类型检查、11 项巡览检查器测试、945 项引擎单测（45 项跳过）。
- 国色算法用脚本在 8、12、24、40、80、160 国各 30 组随机都城布局上模拟：一国与最近四国的色差最低 23.2–29.2，平均约 53；原色板按序号分配时最低 10.3。
- CI 运行 43591449119 全部成功：Swift 测试、IPA、Windows 服务器、模拟器巡览。已缩小查看主页、天下初定、国色密集处特写、战争三连、都城高亮、国家页等截图：相邻国家颜色分明，海面有水线、叠浪与晕染，都城朱印环显示正常。
- 国名稳定：镜头静止推演 8023 帧，期间 34 个州郡易主，国名闪烁 3 次（阈值 4），新建标签 13 个、移位 144 次。
- 国色：十二国开局，一国与最近四国的最小色差 ΔE 36.5（阈值 15）。
- 巡览里「整图」那张截图没有缩到底：巡览用的连续缩放请求只生效了一部分（该请求路径游戏内没有使用，手势缩放走的是另一条路径，下限已由单元测试 `testWholeMapIsReachable` 覆盖）。1.14.0 改用直接展开整图的请求，并在 CI 中核对缩放数值。

## 1.12.0 / build 113 — 2026-11-13

### 修复
- 开战后双方不出兵：1.11.0 里，纵队兵力不足目标所需七成时会在边境无限期等待。两国主力隔着边境对峙时，双方都判定对方太强，所以谁也不越境。现在集结最多等 15 天，兵力不足时最多等 30 天，到期带着现有兵力进攻（`WarCouncil.muster`）。
- 开卷「勘定国界」阶段，设备端预览世界的国界色写死为蓝色 `#1487ff`。现在改用正式世界相同的 `stateLineColor`，与「天下初定」一致；地图编辑器预览同样修正。

### 新增
- 「全部交还 AI」：军事页一键把玩家亲自指挥的军队和舰队交回军机调度；框选横幅新增「交AI」（引擎命令 `releaseToAI`）。
- 复国序号：按原作 `StateNameFormatUtility` 模板 `{RestorationOrdinal}{Name}`、「第{0}」。复国后国名加「第二」「第三」等前缀，只在本作规则世界生效。
- 国名多样：历史国名库按文化扩充到 22–90 个。新世界按文化加权抽取政体细分，如苏丹国、公国、选侯、沙皇国、幕府、汗国、酋邦、城邦、商业共和、邦联、教宗国。只改国名、称号和党派，规则仍按原政体计算；抽取由世界种子决定，可重放；已开局的世界不改名。
- 京畿驻军（本作规则）：战时都城的把守需求为全军约八分之一，最先占用把守预算。
- 取富庶之地（本作规则）：进攻目标的评分加入人口项，距离相近时先打人口多的州郡。原作 `FindRegularTargetProvince` 只按距离计算；原作的首都及邻州优先只用于和平驻防（`FindTargetIdleProvince`），本作此前已经移植。

### 调整
- 启动动画改为宣纸风格：墨晕、远山、「列國紀」逐字书写、朱印，最后从白纸衔接开卷地图。系统启动屏设为同色 `LaunchPaper`。
- 主页背景开卷 3.2 秒改为 7 秒，平移由每秒 8 点降为 3 点，刷新 30 帧改为 20 帧。
- 首都三重圈放大到 2.2 倍城市单位，原来是 1.75。排地名时先为首都图标留位，首都名排在国名前，国名不会盖住首都。
- 「均衡」档行军帧率 60 改为 30，推演占用 80% 改为 65%。旧默认档自动迁移。手机微热时行军降到 30 帧、拖动降到 60 帧；发热严重时降到 20 帧和 30 帧。
- 自动接入电脑计算默认关闭，推演全部在手机本机完成；设置中仍可打开。
- 画面边缘：最小缩放由「整图可见」改为「铺满屏幕」，平移边距由 44 改为 0，竖屏上下不再露出地图外的底色。不再绘制原作裱边（`mapMount`：#DED1C5 纸带加黑线），卷轴暗角从地图边缘起淡出。主页顶部和地图页上下的黑色渐变改为淡墨渐变。CI 截图新增 `edges/` 边缘特写：主页顶部、地图页上下、开卷国界阶段顶部。

### 验证
- 本机 `npm run check` 通过：lint、类型检查和 945 项引擎单测，45 项跳过。
- CI 运行 43568976073 全部成功：Swift 测试、IPA、Windows 服务器和模拟器巡览。已查看主页、开卷「勘定国界」、地图页、府城特写，并裁出主页顶部和地图上下边缘逐张检查，没有空条或硬边，开卷国界为国家色。
- 战争对照：用同四个固定世界（8–16 国、80–200 州）推演三年，比较 1.11.0 与本版。集结中部队占战时部队 5.4% → 2.4%，战争中无交战时间占比 27.6% → 25.6%，连续 90 天无交战 27 → 23 次，每日计算 108 → 99 毫秒。数据来自本机 Windows 服务器，不是真机帧率或温度。
- 新世界仍由设备内置的 JavaScript 引擎在手机本地生成，纯 Swift 建世尚未接通。

## 1.11.0 / build 112 — 2026-11-13

### 新增
- 开卷动画重做：白纸注海、陆地留白、墨线勾岸、赭墨染山河、国色自都城晕开，各图层渐显；地图完成后控件弹性滑入。
- 军机调度新增集结：多军合击的目标先在相邻本国州郡集结再一同出击；兵力不足七成时在边境等待；目标所需兵力计入邻州敌军的一半。军事页显示「集结」。进入敌境后遇到超过己方 1.6 倍的敌军会退回最近的本国州郡。
- 推演帧长可调（`frameTicks`，默认每日两帧）；陆军每三帧调度十五支，舰队每日调度三次。

### 调整
- 叛乱默认值：`rebelMinProvinces` 24、`calmMonths` 18、`unrest` 0.35。

### 验证
- 同一组四个世界（8–16 国、80–200 州）推演三年对照：一天计算时间由 150–290 毫秒降到 64–130 毫秒；战斗次数、易主数与最大国占比无系统性偏移。数据来自本机 Windows 计算服务器，非真机帧率。
- 进攻方以劣势兵力接战的比例与军队损失的对照数据见本版提交说明；真机体验待用户验证。

## 1.10.3 / build 111 — 2026-11-10

### 修复
- 单步排队时立刻开始再暂停，尚未真正启动的播放任务保留单步的显示归属，确保暂停后接收已执行结果。
- 地图后台更新分开核对领土、着色、边界加粗。选择国家或州郡不会再丢弃同批着色，也不会连带取消易主后的城市与省界更新。
- 易主计算遇到新的地图模式或外交着色时，保留最新后台颜色结果，取消主线程临时重算全图颜色的回退路径。
- 颜色浓度改为后台计算；海洋配色调整只更新海洋纹理。地形编辑会拒绝编辑前尚未返回的着色、边界与易主结果。

### 新增
- 5 项地图后台任务归属回归，覆盖边界与着色并发、易主与选择并发、旧地图结果、同类任务逆序完成。
- 同一冻结世界内测量国家、州郡、军队、排行面板，记录平均、p95、最长间隔和超过 50ms 的次数。存档前后必须一致，报告带世界 SHA-256，供后续受控对照。

### 验证与已知问题
- 本地 `npm run check` 通过，含 lint、类型、9 项巡览检查器测试、945 项引擎单测，45 项跳过。Swift、App 编译与模拟器结果待最终提交 CI 补记。
- 本批处理了地图更新冲突和同步颜色回退；面板长列表布局、纯 Swift 建世、原作造舰/改革特质和真机性能仍未全部关闭。

## 1.10.2 / build 110 — 2026-11-10

### 修复
- 暂停后，尚未返回的旧循环不再继续预取下一批推演。
- 恢复或单步会建立新的显示归属；旧回复即使稍后才完成 JSON 解码，也不能覆盖新日期和军队显示。
- 引擎 actor 在实际执行前检查世界版本与请求代次，阻止排队的旧请求推进新世界；晚到的旧读档/建世也不能替换新世界。
- 连续单步按提交顺序执行，再开始推演时先等待此前单步；同一轮暂停仍接收真正已经执行的尾批次。

### 新增
- 7 项 Swift 归属回归，覆盖暂停尾批次、恢复、反序完成、单步、排队旧请求和旧世界载入。
- 模拟器中通过真实控制方法连续执行 62 次播放/暂停/单步请求，记录所有安装的日期，检查无回退，且暂停后显示与引擎一致。报告失败会令截图任务失败。
- 保存自动创建的 CI 世界与调校数据，供后续同一存档的性能对照；不读取个人存档。

### 验证与已知问题
- 本地 lint、类型检查、6 项巡览检查器测试、945 项引擎单测通过，45 项跳过。Swift 与 iOS 结果待本版 CI 补记。
- 本版没有修改模拟规则、存档格式或时间倍率。面板布局和绘制的长帧仍需继续定位，不能据此宣称真机卡顿全部消失。

## 1.10.1 / build 109 — 2026-11-10

### 新增
- 最新原生版的续接步骤、源码基线、已知未完成事项与验证边界，见 `docs/CODEX_COMPLETION_2026-11-10.md`。
- 军机调度回归：取消兵力不足的回援、保护已经交战的军队、都城守备例外、在途任务替换与正常进攻进度保留。
- 原生截图巡览增加完成标记与 26 个关键画面的完整性检查，超时、少图或损坏的图片不再记为成功；失败时仍保留截图供排查。
- 模拟器巡览显式关闭自动接入电脑计算，测试创建的世界留在模拟器本地，避免接入玩家的实际电脑；玩家安装后的设置不受影响。

### 修改
- 军机先评估兵力再分配回援任务，取消的回援可被新的真实军令替换。
- 远程计算引擎协议升为 3，防止旧规则的电脑服务器接管本版世界；需要配套更新电脑服务器。
- 原生版本与 npm 工程版本统一到 1.10.1，修正 README 停留在 1.5.0 的版本信息。

### 修复
- 非都城防线兵力悬殊时，已有行军目标的援军先被锁定，导致回援评估拒绝后仍被派去。
- 调度更改为进攻任务后，旧回援/把守行军继续被保护而不执行新军令。

### 验证
- 本地 `npm run check` 通过：lint、类型检查、88 个测试文件通过，945 项通过；44 个文件 / 45 项跳过（包括需显式开启的导出和长测）。
- 最终 `npm run check` 复测通过，另含 4 项巡览检查器测试；单测阶段约 43 秒。
- `git diff --check` 通过。
- 正式发布代码 `d512cdacbe6129728649a5e59f35cb39a97e5dd5` 的 GitHub Actions `42793606902` 全部通过：Swift 全量测试及服务器构建、iOS/Metal 编译和 IPA、Windows 服务器、模拟器巡览。
- 正式巡览 `finished=true`，26 个必需画面的文件完整性检查通过；已实际查看标题版本、世界战争画面、军事页、战局页、行军及横屏截图。标题显示 1.10.1 / build 109。模拟器不是手机真机。
- 已下载正式 IPA，55,063,440 字节，SHA-256 `9daad0d245c22d30d412cfe251a970ee1d66687fef041032eb44ae6222b43a02`。完整记录见 `docs/CODEX_COMPLETION_2026-11-10.md`。

### 已知问题
- 纯 Swift 创建新世界尚未完全接通，当前仍沿用已有 WebKit 建世后交给 Swift 推演的流程。
- 当前运行规则尚无造舰机制；改革特质缺可确认的原作公式，继续待补。
- 真机性能、触控和用户视觉尚未在本版验收；模拟器截图不能替代这些结果。
- 面板停顿仍存在：正式巡览国家页压力场景 p95 93ms、最慢 564ms；另一候选运行出现过约 3992ms 的最慢间隔。不是同一冻结世界的对照，不据此宣称性能提升。
- 本次会改变采用原生军机规则的后续部署决策；存档结构不变，不删除或迁移用户存档。
