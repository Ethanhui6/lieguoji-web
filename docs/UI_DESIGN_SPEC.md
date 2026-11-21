# 列国纪 UI / 交互设计规范与开发审查提示词（v2.0.2 起执行）

本规范将玩家指定的四项交互与视觉参考原则深度融入《列国纪》宣纸宋代舆图美学体系，作为后续**所有新页面、弹窗、浮层、动画与图标开发**的统一标准。

---

## 一、四大核心设计法则（来源融合）

### 1. 物理手势与自然阻尼（Gestures · Emil Kowalski `/gestures`）
- **半屏/全屏面板手柄（Grabber）**：所有自定义纸张面板顶部统一显示居中暖墨手柄（`SheetGrabber`，`38 × 4pt`，`Theme.ink.opacity(0.24)`），明确暗示可拖拽关闭；严禁在隐藏系统拖拽条后缺失自定义手柄。
- **1:1 跟手与连续反馈**：拖拽面板或浮层时手指位移 1:1 跟手，遮罩透明度随位移连续插值；超过阈值或轻甩即关闭，反向越界拖拽采用弹性阻尼（rubber-band）。
- **悬浮胶囊/回放控制条**：底部/顶部悬浮控制板支持一键折叠为紧凑胶囊（或下划收起），不遮挡主舆图视野；地图浮层必须按明确层级隔离（回放浮层 `.zIndex(100)` 严禁被底部/侧边图例或省份弹窗抢占）。

### 2. 视觉对齐（Optical Alignment · 逸风的 UI 咒语）
- **统一纵轴线（Alignment Rails）**：
  - 页面卡片外边距 `Theme.Layout.pageInset = 16pt`
  - 节标题与面板头部水平边距 `Theme.Layout.sectionInset = 20pt`
  - 卡片内边距 `Theme.Layout.cardPadding = 14pt`
  - 列表项左侧图标固定通道 `Theme.Layout.iconGutter = 22pt`（无论图标自身宽窄，所有主副标题左侧必须落在同一条垂直基准线上）
- **非对称图标几何中心校正**：
  - 播放三角 `.play` 视觉向右偏 `x: +1.2pt`
  - 倒放双三角 `.rewind` 视觉向左偏 `x: -0.8pt`
  - 定位准星 `.locate`、皇冠 `.crown` 等上重下轻图标微调 `y: -0.4pt`
- **对称页头**：弹窗页头与奏折页头居中或左右严格等距，关闭按钮统一 `44 × 44pt` 有效热区。

### 3. 渐进式披露（Progressive Disclosure · WWDC17）
- **首屏克制**：每个面板首屏只保留最高频、最核心的 3~5 项操作或指标。
- **最多两层**：低频/进阶参数（如新建世界的气候与纬度微调、国家页详细宗室谱系、诏令高级选项、回放详细统计）收入带摘要的折叠栏（`FoldSection`）或二级子页，**严禁超过两层嵌套**。
- **空态与单帧可引导**：任何功能在数据尚少（例如刚开局只有 1 帧回放）时，不得让按钮静默失效，必须提供清晰反馈与一键引导动作。

### 4. 临界阻尼弹簧动画（Spring Animation · WWDC23）
- **位移/展开/面板统一临界阻尼弹簧（默认不回弹）**：
  - `Motion.tap`：`.spring(response: 0.26, dampingFraction: 0.96)`（按压与选中切换，干脆利落）
  - `Motion.panel`：`.spring(response: 0.36, dampingFraction: 0.98)`（面板展开、折叠、浮层进出，跟手无拖尾）
  - `Motion.drift`：`.spring(response: 0.52, dampingFraction: 0.98)`（数值条、进度条、大卡片重排）
  - `Motion.stamp`：`.spring(response: 0.32, dampingFraction: 0.68)`（仅用于朱砂印章落印等仪式感反馈）
- **非位移属性（透明度/颜色）保持短促缓出**：
  - `Motion.fade`：`.easeOut(duration: 0.18)`
  - `Motion.reveal`：`.easeOut(duration: 0.42)`
- **性能铁律**：严禁在 60fps `TimelineView` / `Canvas` 中调用离屏 `.blur(radius:)`，严禁对高频动画 `CAShapeLayer` 开启 `shadowRadius`；改用多层低透明径向墨晕替代。

---

## 二、视觉 Token 强制标准

### 字体五阶体系（全局唯一字族：全字库正楷 `TW-Kai`）
**全局严禁出现 `.font(.system(...))`**，数字/等宽标注使用 `Theme.kai(...).monospacedDigit()`。

| 层级 | Token | 字号 | 用途 |
|---|---|---|---|
| 页头大字 | `SheetHeader` / `MemorialHeader` | `26pt` / `28pt` | 面板主标题、奏折国号 |
| 标题 | `Theme.title` | `22pt` | 页面次级大标题、开局标题 |
| 节标题 | `Theme.section` | `17pt` | 卡片主标题、条目名、国名 |
| 正文 | `Theme.body` | `15pt` | 列表主文、按钮文字、说明 |
| 标签 | `Theme.label` | `13pt` | 芯片按钮、小节名、数据值 |
| 注释 | `Theme.caption` | `12pt` | 副标题、时间、辅助注脚（最低字号原则上不低于 `11pt`） |

### 色彩与线框
- 纸底：`Theme.paper`（`#F2EAD7`）、卡片浮面：`Theme.paperElevated`（`#F9F4E8`）、暖墨主色：`Theme.ink`（`#1E1A16`）、墨灰：`Theme.inkMuted`（`#4D453B`）、淡墨：`Theme.inkFaint`（`#7E7568`）。
- 强调色：朱砂印红 `Theme.cinnabar`（`#9E2A22`）、御金 `Theme.gold`（`#A67B2B`）、青玉 `Theme.jade`（`#336854`）、石青 `Theme.indigo`（`#345074`）。
- 圆角：卡片 `Theme.Radius.card = 12pt`、控件 `control = 9pt`、小芯片 `chip = 7pt`。
- 线宽：`Theme.Border.hairline = 0.75pt`，双边框仅用于核心奏折/国书/按钮强调。

### 图标规范（`InkGlyph` 优先）
- 高频界面按钮、卡片头、底栏、回放控制、快捷操作统一使用 `InkIcon(glyph:)` 手绘工笔墨线图标（见 `ios-native/App/InkIcons.swift`），保持 `1.45–1.65pt` 统一墨线笔触与圆头收笔（`.round`）。
- 通过 `GameActionLabel` / `InkGlyph` 映射自动收敛系统 SF Symbols，避免粗细不均、风格割裂。

---

## 三、列国纪 UI / 交互开发审查提示词（可直接复用）

在每次为《列国纪》新增功能、弹窗、HUD 或重构页面前，将以下提示词附在任务上下文中并逐条验收：

```markdown
你正在为 iOS 原生应用《列国纪》（宣纸宋代舆图美学）设计或实现 UI 与交互。所有改动必须严格满足以下 8 项审查准则：

1. 【字体统一】全局只使用 Theme.title(22) / section(17) / body(15) / label(13) / caption(12) 及页头 26/28pt（TW-Kai 全字库正楷），数字用 .monospacedDigit()；严禁出现 .font(.system(...)) 或随意发明中间字号。
2. 【视觉对齐】外边距统一 Theme.Layout.pageInset(16)，节标题与页头统一 sectionInset(20)，卡片内边距 cardPadding(14)，行内左侧图标统一宽 iconGutter(22) 使文字严格沿同一条垂直轴线左对齐；不对称图标必须通过 InkIcon 光学居中。
3. 【手绘图标】优先使用 InkIcon(glyph:) / GameActionLabel，新缺口先补充至 InkIcons.swift，保持工笔细墨线风格一致，禁止大面积混用不同粗细的 SF Symbols。
4. 【物理交互】所有底部面板使用 SheetHeader / MemorialHeader（自带 SheetGrabber 顶部拖拽手柄）与 ≥44pt 热区；悬浮面板支持一键折叠/展开且不遮挡主地图；高优先级模式（如山河回放）必须锁定底层地图点击并置于最高 zIndex。
5. 【渐进式披露】首屏只展示 3–5 项核心信息/操作；次要设置或长列表收入带摘要的 FoldSection 折叠栏，层级不超过 2 层；数据为空或不足时提供明确反馈与引导按钮，绝不留无响应死按钮。
6. 【弹簧动效】位移/展开/切换统一使用 Motion.tap / Motion.panel / Motion.drift（WWDC23 临界阻尼，默认不回弹），仪式印章用 Motion.stamp，纯透明度/色变用 Motion.fade / Motion.reveal；禁止手写随意的 .easeInOut 或过度回弹弹簧。
7. 【地图与渲染性能】禁止在 60fps Canvas 中调用 .blur()，禁止给高频动画 CAShapeLayer 加 shadowRadius；所有 Core 改动仅在 regimes.enabled 时生效，严禁破坏网页对照黄金测试。
8. 【验收清单】提交前核对：Swift 5 兼容（ForEach 不使用匿名元组）、零 .font(.system)、零未处理死按钮、全量单测与 npm run check 通过。
```
