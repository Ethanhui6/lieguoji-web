# 原作 UI 文字与默认值核对（7 项）

日期 2026-10-19（Asia/Tokyo）。只读。依据只来自 box 上的 `_ui-export/`（level0-ui.json、prefabs-ui.json、displaysettings-43912.json、display-sliders.json、localization.csv、raw/）、`/tmp/fmsui/data` 里同一批原始资产，以及 `-ref/project/docs` 里的拆解记录。没有用 Bob 的电脑，没有方法体反汇编（GameAssembly.dll 不在 box 上），box 上也没有 Il2Cpp dump.cs 文本，只有 DummyDll（只能看签名、字段偏移和 RVA）。
可信度：**实测** = 序列化数据直接读到；**推断** = 由多处数据推出，没看到方法体；**待核** = 只有方法体能定。

## 公共前提：key 为空时用节点名当 key
LocalizationButton / LocalizationText 的序列化 `key` 大多为空。level0 统计结果（实测）：
- key 为空的 LocalizationButton 有 263 个，其中 219 个节点名正好是 csv key；不匹配的 44 个大多是 `Ripple`（21 个）、`Expand` 这类特效或子节点。
- LocalizationText 有 227/249 个，LocalizationTmpButton 有 114/119 个。

所以“key 为空时取 GameObject.name”是**强推断**。方法体（LocalizationButton.Awake 0x3B7190、OnEnable 0x3B75D0、RefreshLocalization 0x3B7760）不在 box 上，严格说仍是**待核**。`-ui/layout-spec-v1.md` 也按同一假设标了“(名)”。

## 1. 底栏按钮：「地图外观」（静态占位是「地图展示」）
- 结论：中文界面运行时大概率显示 **地图外观**（繁体 **地圖外觀**）。「地图展示」只是 prefab 里写死的占位文字。
- 依据：
  - `Canvas/BottomPanel/DisplayPanel/MapAppearance`：ButtonManager.buttonText 为「地图展示」，Normal、Highlighted、Disabled 三个 TMP 也是「地图展示」。
  - 同一节点的 LocalizationButton `key=""`、`tooltipsKey=""`，没有带显式 key 的子节点。
  - 节点名 `MapAppearance` 对应 localization.csv 第 193 行：`MapAppearance,地图外观,地圖外觀,Map Appearance`。
  - 旁证：docs/FMS_REFERENCE_BASELINE_2026-10-04.md 第 23、42 行记录 B 站视频（2024-08 版）里看到的是「地图外观」竖向面板。这条说的是面板，不是按钮本身。
- 可信度：**推断（强）**。依赖上面的公共前提，最终以 RefreshLocalization 方法体**待核**。

## 2. Tips 按钮：不是「提示」，大概率是「常见问题」
- 结论：
  - 写死的占位是英文 **Tips**。
  - 按节点名当 key 的规则，中文界面应显示 **常见问题**（繁体 **常見問題**），既不是「提示」也不是「Tips」。
  - 如果运行时不做替换，才会显示写死的「Tips」。
- 依据：
  - `Canvas/BottomPanel/Panel (9)/FAQ`：ButtonManager.buttonText 为 `Tips`，三个 TMP 也是 `Tips`，字体 RobotoSlab（其他底栏按钮用 TW-Kai，说明作者只当英文写）。
  - 该节点 LocalizationButton `key=""`，节点名是 `FAQ`。
  - csv 第 1586 行：`FAQ,常见问题,常見問題,FAQ`。
  - csv 第 594 行：`Tips,提示,提示,Tips`。这个 key 有中文翻译，但这个按钮没引用它。
- 可信度：
  - 「写死 Tips、key 为空」：**实测**。
  - 「显示常见问题」：**推断**，方法体**待核**。

## 3. 家族面板标题：「人物」
- 结论：运行时标题显示 **人物**（繁体 **人物**）。「家族信息」只是 TMP 里的占位文字。
- 依据：
  - prefabs-ui.json 的 CharacterPanel（resources `ui/base/characterpanel`），节点 `CharacterPanel/Dragger/PanelTitle`：TMP 文本为「家族信息」，LocalizationText **显式 `key="Character"`**。
  - csv 第 1241 行：`Character,人物,人物,Character`。
  - csv 里没有任何 key 的中文值是「家族信息」，只在更新日志正文里出现过。
- 可信度：**实测**（key 是显式序列化的，不依赖节点名规则）。
- 对照：AllianceInfoPanel 同位置为显式 `key="AllianceInfo"`，对应 csv 第 358 行 `联盟信息 / 聯盟資訊`，和占位一致。

## 4. 图片导出面板标题：「导出图片」；另一个面板是「导出历史记录」
原作有两个外观相同的面板，占位标题都写「图片导出」，但 key 不同：

| 面板 | 标题节点 | 占位 | key | csv |
|---|---|---|---|---|
| 截图导出 `Canvas/ScreenshotPanel`（ScreenshotPanelUI，初始 inactive） | `Panel/Dragger/Screenshot`（active） | 图片导出 | `ExportScreenshot`（显式） | 第 1059 行 **导出图片 / 導出圖片** |
| 历史导出 `Canvas/ExportHistoryPanel`（ExportHistoryPanelUI，初始 inactive） | `Panel/Dragger/ExportHistory`（**activeSelf=false**） | 图片导出 | `ExportHistory`（显式） | 第 1060 行 **导出历史记录 / 導出歷史記錄** |

- 结论：
  - 图片导出面板标题是 **导出图片**，既不是「图片导出」也不是「导出历史记录」。
  - 「导出历史记录」属于另一个 ExportHistoryPanel。该面板的标题节点序列化为隐藏，运行时是否打开**待核**。
  - 两个面板的按钮占位都是「导出地图」。
- 可信度：key 和 csv 值是**实测**；ExportHistory 标题运行时是否可见是**待核**。

## 5. 倍速按钮切到头会不会循环：大概率循环（5 倍之后回到 0.1 倍），待核
- 依据：
  - `Canvas/BottomPanel/Panel (10)/SpeedChange`（ButtonManager #33156）的 onClick 持久调用（实测，raw typetree）：→ `BottomPanel`（#35593，`Canvas/BottomPanel`）`.OnGameSpeedButtonClicked`，mode 1（无参）。
  - 暂停按钮 #37451 → `BottomPanel.OnPauseGameButtonClicked`。
  - `BottomPanel.OnGameSpeedButtonClicked` RVA 0x47DCC0，方法体不在 box 上。
  - GlobalTimeScaleManager 方法（DummyDll，实测）：
    - 0x38AD90 `AddGameSpeed`：只有 16 字节，下一个函数紧跟在后面，像是 index+1 后跳到 ApplyGameSpeed 的小桩。
    - 0x38B0A0 `SpeedUp`、0x38AFD0 `DelGameSpeed`、0x38ADA0 `ApplyGameSpeed`。
    - 字段：`speedSettings`、`currentSpeedIndex`、`defaultSpeedIndex`。
  - docs/evidence/fms-continuous-motion-v5-2026-10-05/ORIGINAL_CLOCK.md 第 10 行：ApplyGameSpeed “索引对数组长度取余”。七档速度 `[0.1,0.5,1,2,3,4,5]`，默认索引 2（ctor 0x38B0D0）。
  - level0 里 `SpeedButton` 脚本组件（DouyinHelper 下的 `NormalSpeed`）没有序列化字段，也不是底栏的那个按钮。
- 结论：如果 OnGameSpeedButtonClicked 调的是 AddGameSpeed/SpeedUp，再经过 ApplyGameSpeed 取余，那么 5 倍再点会回到 0.1 倍，形成循环。
- 可信度：
  - OnClick 目标：**实测**。
  - 取余：引用旧反汇编记录。
  - OnGameSpeedButtonClicked 实际调用哪个方法、有没有另外设上限：**待核**（需要 0x47DCC0 的方法体）。
- 补充：按钮文字 key 是 csv 第 429–435 行（HalfSpeed、NormalSpeed、DoubleSpeed…）。按钮本身 key 为空，节点名 SpeedChange 不是 csv key，运行时由 `UpdateGameSpeedAndPauseButtonText`（0x47E430）写入，属于推断。

## 6. 联盟面板和家族面板：序列化层面默认全部展开
- 依据（prefabs-ui.json，实测）：
  - **AllianceInfoPanel**：根节点 activeSelf=true；3 个 CollapsibleSectionUI（`section_BasicInfo`、`section_Actions`、`section_StateInfo`）全部 `m_StartExpanded=1`，`m_AnimationDuration=0.25`；各自的 `Content` 都是 active。
  - **CharacterPanel**：根节点 activeSelf=true；5 个 CollapsibleSectionUI（`BasicInfoSection`、`AttributesSection`、`TraitsSection`、`FamilySection`、`BiographySection`）全部 `m_StartExpanded=1`；各自的 `Content` 都是 active。
  - 默认隐藏的只是内部的行或占位：
    - CharacterPanel：Traits、Family、Biography 下的 `Content/Panel` 模板行；`HeaderInput/ColorPicker`；旧的 `Scrollbar Vertical`。
    - AllianceInfoPanel：`section_Actions` 里的 SetAsCapital、Fortification、Defortification 和 Panel (10)/(11)/(12) 的增减按钮行。
  - 对照：level0 的 StateInfoNewUI 只有 BasicInfo 一个 section，也是 `m_StartExpanded=1`。
- 结论：两个面板打开时所有分区默认展开。
- 可信度：序列化值是**实测**。AllianceInfoUI、CharacterPanelUI 运行时有没有调用 `CollapseSection`/`Collapse`（0x53FED0/0x53FEF0）改掉状态，是**待核**（推断：没有理由这么做）。

## 7. 海路和省界的默认颜色
- 结论：
  - **海路 `#868686`**（RGB 0.5255×3，α=1）。
  - **省界 `#B2B2B2`**（RGB 0.7×3，α=1）。
- 依据（level0 World 组件 MonoBehaviour #44231，raw typetree，实测）：

| 字段 | hex | 原始值 |
|---|---|---|
| seaRouteColor | #868686 | 0.5255 |
| provinceBorderColor | #B2B2B2 | 0.7000 |
| stateLineColor（国界） | #1487FF | 0.0784, 0.5294, 1.0 |
| coastLineColor | #5F5F5F | 0.3725 |
| shallowLineColor / coastLineOffsetColor | #C2B280 | 0.76, 0.70, 0.50 |
| riverColor | #08DFEC | 0.0305, 0.8741, 0.9245 |

  - 同一个 World 组件还有 seaRouteLineWidth 0.37、DashLength 1.01、GapLength 0.56。
- 其他位置都没有覆盖这两个颜色：
  - 8 个 displayPresets（DisplaySettings #43912）只有 stateLineColor、shallowSeaColor、deepSeaColor、coastLineColor、stateNameColor 等字段，**没有海路和省界颜色字段**，切预设不会改这两个颜色（推断：方法体没看）。
  - 显示设置里的 SeaRouteColorImage、ProvinceBorderColorImage 序列化为占位黑色 #000000（display-sliders.json colorImages）。推断是运行时从 World 回填。
  - SeaRoutes 预制件（sharedassets0 #482）：材质 DemoIndicatorsMaterialUnlit 的 `_Color` 为白色；OutlineBodyRenderer 的 colorsGradient 是插件默认值（#00F811→白）。推断运行时由 seaRouteColor 覆盖，**待核**。
- 可信度：World 默认值是**实测**；“玩家看到的就是这两个颜色”是**推断**。另外有 PlayerPrefs 或存档覆盖的可能，本次没读（按约束不碰存档）。
