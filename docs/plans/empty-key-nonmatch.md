# level0 空 key 且节点名不是 csv key 的本地化组件（LocalizationButton 44 + LocalizationText 22 + LocalizationTmpButton 5）

日期 2026-10-19（Asia/Tokyo）。只读。来源：`_ui-export/level0-ui.json`（LocalizationButton `key=""`，且 GameObject.name 不在 localization.csv 第一列），csv 行号为 localization.csv 物理行号。同内容 CSV：`empty-key-nonmatch.csv`（UTF-8 BOM）。

## 统计

- 特效子节点：21（全部是 MUIP `Ripple` 遮罩节点，上面挂着复制来的 ButtonManager+LocalizationButton，占位 `Button`，没有 TMP 子节点，不显示文字）
- 纯数字或动态值：5（SpeedChange ×1；Settings/Workshop 的 ResolutionButton、ScreenModeButton ×4，占位「叠加」，运行时写当前分辨率/窗口模式——推断，方法体未看）
- 真正缺 key 的界面文字：18（去重后 7 种文字）

「文字默认显示」= Normal/Text 这个 TMP 从按钮到面板根之间的 activeSelf 全为 true 且组件 enabled（面板根本身多为关闭，打开面板后才可见）；括号里另给场景加载时的 activeInHierarchy。

## 真正缺 key 的 7 种文字与候选 key

| 占位文字 | 节点名 | 个数 | 候选 key（csv 简体列反查） |
|---|---|---|---|
| 煽动叛乱 | InciteRebellion | 2 | 精确：RebellionUI(第254行) |
| 解除附庸 | Remove | 2 | 精确：RemovePuppy(第337行) |
| 绘制空白国家 | DrawEmptyState | 1 | 无（没有含「空白国家」的 key） |
| 绘制河流 | DrawRivers | 1 | 精确：DrawRiver(第666行) |
| 生成高度图 | GenHeightMap (2) | 5 | 精确：GenHeightMap(第266行) |
| 点击扩张 | Expand | 6 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) |
| Continue | Continue | 1 | 无（中文列与英文列都没有 Continue；ResumeGame 第394/437行「继续游戏」语义不同） |

说明：
- InciteRebellion、Remove、Expand 的 `Tips/TipsText` 子节点都写着同一句「随机省份煽动叛乱，成立新的国家」，对应 csv 第 257 行 `InciteRebellionInRandomProvinceTips`，但对 Remove/Expand 明显是复制来的占位；三者 `tooltipsKey` 都为空。
- 有精确候选的（RebellionUI、RemovePuppy、GenHeightMap、DrawRiver）说明 csv 里有现成翻译，只是这些节点没挂上 key、节点名也拼得不一致（如 `DrawRivers`≠`DrawRiver`、`GenHeightMap (2)` 多了后缀）。运行时这些按钮会不会被别的脚本改写，需看方法体，**待核**。
- 无候选：「点击扩张」（只有近似 ExpandTerritory「扩张」）、「绘制空白国家」、`Continue`（ToolTipsPanel 写死英文）。

## 全部 44 条

| # | 节点名 | 完整路径 | 占位文字 | 文字默认显示 | 所属面板 | 类别 | 候选 key | 备注 |
|---|---|---|---|---|---|---|---|---|
| 1 | InciteRebellion | Canvas/AreaInfo/Background/ProvinceActions/Image/Panel/Panel (1)/InciteRebellion | 煽动叛乱 | 否（面板内，场景加载时隐藏，面板根 AreaInfo activeSelf=True） | AreaInfo/ProvinceActions | 真正缺 key 的界面文字 | 精确：RebellionUI(第254行) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 2 | Remove | Canvas/AreaInfo/Background/ProvinceActions/Image/Panel/Panel (3)/Remove | 解除附庸 | 否（面板内，场景加载时隐藏，面板根 AreaInfo activeSelf=True） | AreaInfo/ProvinceActions | 真正缺 key 的界面文字 | 精确：RemovePuppy(第337行) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 3 | SpeedChange | Canvas/BottomPanel/Panel (10)/SpeedChange | 暂停游戏 | 是（面板内，场景加载时显示，面板根 BottomPanel activeSelf=True） | BottomPanel | 纯数字或动态值 |  | 运行时由 BottomPanel.UpdateGameSpeedAndPauseButtonText 写倍速文字（csv 429–435 行 HalfSpeed/NormalSpeed…） |
| 4 | Ripple | Canvas/DisplaySettings/Background/Scroll View/Viewport/Content/PresetStyle/PresetStyle/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | DisplaySettings | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 5 | DrawEmptyState | Canvas/EditEcology/DrawEmptyState | 绘制空白国家 | 否（面板内，场景加载时隐藏，面板根 EditEcology activeSelf=False） | EditEcology | 真正缺 key 的界面文字 | 无（没有含「空白国家」的 key） |  |
| 6 | DrawRivers | Canvas/EditEcology/DrawRivers | 绘制河流 | 是（面板内，场景加载时隐藏，面板根 EditEcology activeSelf=False） | EditEcology | 真正缺 key 的界面文字 | 精确：DrawRiver(第666行) |  |
| 7 | Ripple | Canvas/EditHeightMapMode/BrushMode/BrushMode/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditHeightMapMode | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 8 | Ripple | Canvas/EditHeightMapMode/MapSize/MapSize/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditHeightMapMode/MapSize/MapSize | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 9 | GenHeightMap (2) | Canvas/EditPanel/Background/Scroll View/Viewport/Content/Panel/GenHeightMap (2) | 生成高度图 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel | 真正缺 key 的界面文字 | 精确：GenHeightMap(第266行) |  |
| 10 | GenHeightMap (2) | Canvas/EditPanel/CultureManager/Background/Scroll View/Viewport/Content/Panel/GenHeightMap (2) | 生成高度图 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/CultureManager | 真正缺 key 的界面文字 | 精确：GenHeightMap(第266行) |  |
| 11 | Ripple | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/High/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditPanel/MapSize | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 12 | Ripple | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/Low/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditPanel/MapSize | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 13 | Ripple | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/Medium/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditPanel/MapSize | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 14 | GenHeightMap (2) | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/Panel/GenHeightMap (2) | 生成高度图 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/MapSize | 真正缺 key 的界面文字 | 精确：GenHeightMap(第266行) |  |
| 15 | Ripple | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/SuperHigh/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | EditPanel/MapSize | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 16 | GenHeightMap (2) | Canvas/EditPanel/ReligionManager/Background/Scroll View/Viewport/Content/Panel/GenHeightMap (2) | 生成高度图 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/ReligionManager | 真正缺 key 的界面文字 | 精确：GenHeightMap(第266行) |  |
| 17 | Ripple | Canvas/GlobalCommands/DismissAllAlliance/Dismiss/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | GlobalCommands | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 18 | Ripple | Canvas/Settings/Background/Scroll View/Viewport/Content/LanguageSwitch/Language/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Settings | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 19 | ResolutionButton | Canvas/Settings/Background/Scroll View/Viewport/Content/Resolution/ResolutionButton | 叠加 | 否（面板内，场景加载时隐藏，面板根 Settings activeSelf=False） | Settings | 纯数字或动态值 |  | 运行时写当前分辨率（如 1920×1080），占位「叠加」 |
| 20 | Ripple | Canvas/Settings/Background/Scroll View/Viewport/Content/Resolution/ResolutionButton/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Settings | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 21 | ScreenModeButton | Canvas/Settings/Background/Scroll View/Viewport/Content/ScreenMode/ScreenModeButton | 叠加 | 否（面板内，场景加载时隐藏，面板根 Settings activeSelf=False） | Settings | 纯数字或动态值 |  | 运行时写当前窗口模式，占位「叠加」 |
| 22 | Ripple | Canvas/Settings/Background/Scroll View/Viewport/Content/ScreenMode/ScreenModeButton/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Settings | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 23 | InciteRebellion | Canvas/StateInfo/Background/Panel/EditState/Image/Panel/Panel (1)/InciteRebellion | 煽动叛乱 | 否（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo/EditState | 真正缺 key 的界面文字 | 精确：RebellionUI(第254行) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 24 | Remove | Canvas/StateInfo/Background/Panel/EditState/Image/Panel/Panel (3)/Remove | 解除附庸 | 否（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo/EditState | 真正缺 key 的界面文字 | 精确：RemovePuppy(第337行) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 25 | Expand | Canvas/StateInfo/Background/Panel/EditState/Image/Panel/Panel/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo/EditState | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 26 | Expand | Canvas/StateInfo/Image/Panel/Panel/Expand | 点击扩张 | 是（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 27 | Ripple | Canvas/StateInfo/StateEditor/Background/Scroll View/Viewport/Content/EthnicAttribute/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | StateInfo/StateEditor | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 28 | GenHeightMap (2) | Canvas/StateInfo/StateEditor/Background/Scroll View/Viewport/Content/Panel/GenHeightMap (2) | 生成高度图 | 否（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo/StateEditor | 真正缺 key 的界面文字 | 精确：GenHeightMap(第266行) |  |
| 29 | Ripple | Canvas/StateInfo/StateEditor/Background/Scroll View/Viewport/Content/PoliticalSystem/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | StateInfo/StateEditor | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 30 | Ripple | Canvas/StateInfo/StateEditor/Background/Scroll View/Viewport/Content/Religion/Change/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | StateInfo/StateEditor | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 31 | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (1)/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 32 | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (15)/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 33 | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (8)/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 34 | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (9)/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似：ExpandTerritory(第253行，扩张/Expand) | 提示子节点「随机省份煽动叛乱，成立新的国家」是复制来的占位，tooltipsKey 为空；精确匹配 InciteRebellionInRandomProvinceTips(第257行)，只对 InciteRebellion 合理 |
| 35 | Ripple | Canvas/Stats/Background/Scroll View/Viewport/Content/StatisticsCategory/StatisticsCategory/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Stats | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 36 | Continue | Canvas/ToolTipsPanel/Background/Panel/Continue | Continue | 是（面板内，场景加载时隐藏，面板根 ToolTipsPanel activeSelf=False） | ToolTipsPanel | 真正缺 key 的界面文字 | 无（中文列与英文列都没有 Continue；ResumeGame 第394/437行「继续游戏」语义不同） |  |
| 37 | Ripple | Canvas/WallpaperPanel/Background/Scroll View/Viewport/Content/SelectScreen/Panel/1/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | WallpaperPanel | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 38 | Ripple | Canvas/WallpaperPanel/Background/Scroll View/Viewport/Content/SelectScreen/Panel/2/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | WallpaperPanel | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 39 | Ripple | Canvas/WallpaperPanel/Background/Scroll View/Viewport/Content/SelectScreen/Panel/3/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | WallpaperPanel | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 40 | Ripple | Canvas/Workshop/Background/Scroll View/Viewport/Content/LanguageSwitch/Language/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Workshop | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 41 | ResolutionButton | Canvas/Workshop/Background/Scroll View/Viewport/Content/Resolution/ResolutionButton | 叠加 | 否（面板内，场景加载时隐藏，面板根 Workshop activeSelf=False） | Workshop | 纯数字或动态值 |  | 运行时写当前分辨率（如 1920×1080），占位「叠加」 |
| 42 | Ripple | Canvas/Workshop/Background/Scroll View/Viewport/Content/Resolution/ResolutionButton/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Workshop | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |
| 43 | ScreenModeButton | Canvas/Workshop/Background/Scroll View/Viewport/Content/ScreenMode/ScreenModeButton | 叠加 | 否（面板内，场景加载时隐藏，面板根 Workshop activeSelf=False） | Workshop | 纯数字或动态值 |  | 运行时写当前窗口模式，占位「叠加」 |
| 44 | Ripple | Canvas/Workshop/Background/Scroll View/Viewport/Content/ScreenMode/ScreenModeButton/Ripple | Button | 无文字组件（ButtonManager 无 TMP 子节点，不渲染文字） | Workshop | 特效子节点 |  | MUIP Ripple 遮罩节点，复制来的 ButtonManager/LocalizationButton，占位 Button 不显示 |


# 补充分节：LocalizationText 22 个 + LocalizationTmpButton 5 个

同一来源和判定（LocalizationText `key=""`、`customText=""`；LocalizationTmpButton `m_Key=""`、`m_CustomText=""`；节点名不在 csv 第一列）。类别改为：特效或无文字 / 数字或动态值 / 真正缺 key 的界面文字。可信度：实测 = 序列化值直接读到；推断 = 由路径、命名、占位推出；待核 = 需运行时方法体。

## 统计

- 特效或无文字：0
- 数字或动态值：12（抖音版 TimeLast 和 GameRound 的 nickname/rank/score/worldrank/worldscore 共 6；InputNamePrefab/StateName 共 3；ToolTipsPanel 的 ToolTips、ToolTipsContent 共 2；WarningPanel/LocalizationText 1）
- 真正缺 key 的界面文字：15

## 真正缺 key 的结论

| 节点名 | 组件 | 个数 | 占位 | 候选 key | 可信度 |
|---|---|---|---|---|---|
| Focus | LocalizationText | 3 | 重点关注 | 精确：FocusOn(第277行，重点关注/Focus On) | 推断（强）：占位与节点名语义都对上 |
| NameSequence | LocalizationTmpButton | 1 | 导入 | 占位「导入」精确：Import(第746行)；按节点名无对应 key | 待核：节点名 NameSequence 与占位「导入」不符，占位可能是复制来的 |
| Biom | LocalizationText | 1 | 植被图\n\n | 精确：Biome(第322行) 或 BiomeMap(第1043行)，都是「植被图」 | 推断（强）：节点名少了 e；两 key 中文相同，选哪个不影响中文 |
| High | LocalizationText | 1 | 高\n | 精确：MapSizeHigh(第329行) | 推断（强）：位于 MapSize 面板，High/Medium/Low/SuperHigh 成组 |
| Low | LocalizationText | 1 | 低 | 精确：MapSizeLow(第331行) | 推断（强）：同上 |
| Medium | LocalizationText | 1 | 中 | 精确：MapSizeMedium(第330行) | 推断（强）：同上 |
| SuperHigh | LocalizationText | 1 | 超高 | 精确：MapSizeSuperHigh(第843行) | 推断（强）：同上 |
| RegenerateRiver | LocalizationTmpButton | 1 | 点击扩张 | 按占位无（占位「点击扩张」是复制来的）；按节点名近似：RefreshRiversAndRoutes(第665行「刷新河流航线」)、RiversAndSeaRoutes(第1030行「河流与航线」) | 待核：占位不可信，实际文字需看运行时代码 |
| RegenerateSearoute | LocalizationTmpButton | 1 | 点击扩张 | 按占位无（占位「点击扩张」是复制来的）；按节点名近似：SearouteOnly(第1029行「仅航线」)、RefreshRiversAndRoutes(第665行) | 待核：同上 |
| ReligionList | LocalizationText | 1 | 宗教列表 | 无（csv 没有「宗教列表」） | 实测（反查无结果） |
| Expand | LocalizationTmpButton | 2 | 点击扩张 | 无精确；近似 ExpandTerritory(第253行「扩张」) | 推断：与 LocalizationButton 那 6 个 Expand 同一情况 |
| TrialAnnouncementText (1) | LocalizationText | 1 | <font="TW-Kai-98_1 SDF">三点水余,P | 无（致谢人名列表，csv 没有） | 实测（反查无结果）；人名无需翻译，写死即可 |

## 全部 27 条

| # | 组件 | 节点名 | 完整路径 | 占位文字 | 文字默认显示 | 所属面板 | 类别 | 候选 key | 可信度 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | LocalizationText | Focus | Canvas/AreaInfo/Background/FollowTarget/Focus | 重点关注 | 否（面板内，场景加载时隐藏，面板根 AreaInfo activeSelf=True） | AreaInfo | 真正缺 key 的界面文字 | 精确：FocusOn(第277行，重点关注/Focus On) | 推断（强）：占位与节点名语义都对上 |  |
| 2 | LocalizationTmpButton | NameSequence | Canvas/CultureInfoNewUI/Border/Language/NameSequence | 导入 | 否（面板内，场景加载时隐藏，面板根 CultureInfoNewUI activeSelf=True） | CultureInfoNewUI | 真正缺 key 的界面文字 | 占位「导入」精确：Import(第746行)；按节点名无对应 key | 待核：节点名 NameSequence 与占位「导入」不符，占位可能是复制来的 | CultureInfoNewUI/Border/Language 下 |
| 3 | LocalizationText | Biom | Canvas/DisplaySettings/Background/Scroll View/Viewport/Content/DisplayBiom/Biom | 植被图\n\n | 是（面板内，场景加载时显示，面板根 DisplaySettings activeSelf=True） | DisplaySettings | 真正缺 key 的界面文字 | 精确：Biome(第322行) 或 BiomeMap(第1043行)，都是「植被图」 | 推断（强）：节点名少了 e；两 key 中文相同，选哪个不影响中文 |  |
| 4 | LocalizationText | TimeLast | Canvas/DouyinStartGamePanel/StartPanel/Scroll View/Viewport/Content/GameTime/TimeLast | 对局时长: 20 分钟 | 是（面板内，场景加载时隐藏，面板根 DouyinStartGamePanel activeSelf=False） | DouyinStartGamePanel/StartPanel | 数字或动态值 |  | 推断 | 抖音版开局面板，挂 LocalizationTextWithAdditionalText，运行时拼接时长数字 |
| 5 | LocalizationText | High | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/High/High | 高\n | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/MapSize | 真正缺 key 的界面文字 | 精确：MapSizeHigh(第329行) | 推断（强）：位于 MapSize 面板，High/Medium/Low/SuperHigh 成组 |  |
| 6 | LocalizationText | Low | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/Low/Low | 低 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/MapSize | 真正缺 key 的界面文字 | 精确：MapSizeLow(第331行) | 推断（强）：同上 |  |
| 7 | LocalizationText | Medium | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/Medium/Medium | 中 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/MapSize | 真正缺 key 的界面文字 | 精确：MapSizeMedium(第330行) | 推断（强）：同上 |  |
| 8 | LocalizationText | SuperHigh | Canvas/EditPanel/MapSize/Background/Scroll View/Viewport/Content/SuperHigh/SuperHigh | 超高 | 否（面板内，场景加载时隐藏，面板根 EditPanel activeSelf=False） | EditPanel/MapSize | 真正缺 key 的界面文字 | 精确：MapSizeSuperHigh(第843行) | 推断（强）：同上 |  |
| 9 | LocalizationTmpButton | RegenerateRiver | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/ActionPanel/RegenerateRiver | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/ActionPanel | 真正缺 key 的界面文字 | 按占位无（占位「点击扩张」是复制来的）；按节点名近似：RefreshRiversAndRoutes(第665行「刷新河流航线」)、RiversAndSeaRoutes(第1030行「河流与航线」) | 待核：占位不可信，实际文字需看运行时代码 | 按钮本身默认隐藏 |
| 10 | LocalizationTmpButton | RegenerateSearoute | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/ActionPanel/RegenerateSearoute | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/ActionPanel | 真正缺 key 的界面文字 | 按占位无（占位「点击扩张」是复制来的）；按节点名近似：SearouteOnly(第1029行「仅航线」)、RefreshRiversAndRoutes(第665行) | 待核：同上 | 按钮本身默认隐藏 |
| 11 | LocalizationText | StateName | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/EditArea/InputNamePrefab/StateName | 行省名字 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/EditArea | 数字或动态值 |  | 推断 | InputNamePrefab 共用模板的标签，三处都写「行省名字」，运行时应按用途改写（区域/国家/自定义标签） |
| 12 | LocalizationText | StateName | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/EditCountry/InputNamePrefab/StateName | 行省名字 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/EditCountry | 数字或动态值 |  | 推断 | InputNamePrefab 共用模板的标签，三处都写「行省名字」，运行时应按用途改写（区域/国家/自定义标签） |
| 13 | LocalizationText | StateName | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/EditCustomLabel/InputNamePrefab/StateName | 行省名字 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/EditCustomLabel | 数字或动态值 |  | 推断 | InputNamePrefab 共用模板的标签，三处都写「行省名字」，运行时应按用途改写（区域/国家/自定义标签） |
| 14 | LocalizationText | ReligionList | Canvas/EditPanelNewUI/Panel/EditModeDropDownInfo/Panel/EditReligionPanel/ListPanel/ReligionList | 宗教列表 | 否（面板内，场景加载时隐藏，面板根 EditPanelNewUI activeSelf=True） | EditPanelNewUI/EditReligionPanel | 真正缺 key 的界面文字 | 无（csv 没有「宗教列表」） | 实测（反查无结果） |  |
| 15 | LocalizationText | nickname | Canvas/GameRound/Background/Scroll View/Viewport/Content/nickname |  | 是（面板内，场景加载时隐藏，面板根 GameRound activeSelf=False） | GameRound | 数字或动态值 |  | 推断 | 抖音版对局排行（GameRound），占位为空，运行时填玩家昵称 |
| 16 | LocalizationText | rank | Canvas/GameRound/Background/Scroll View/Viewport/Content/rank |  | 是（面板内，场景加载时隐藏，面板根 GameRound activeSelf=False） | GameRound | 数字或动态值 |  | 推断 | 同上，填排名数字 |
| 17 | LocalizationText | score | Canvas/GameRound/Background/Scroll View/Viewport/Content/score |  | 是（面板内，场景加载时隐藏，面板根 GameRound activeSelf=False） | GameRound | 数字或动态值 |  | 推断 | 同上，填积分 |
| 18 | LocalizationText | worldrank | Canvas/GameRound/Background/Scroll View/Viewport/Content/worldrank |  | 是（面板内，场景加载时隐藏，面板根 GameRound activeSelf=False） | GameRound | 数字或动态值 |  | 推断 | 同上，填世界排名 |
| 19 | LocalizationText | worldscore | Canvas/GameRound/Background/Scroll View/Viewport/Content/worldscore |  | 是（面板内，场景加载时隐藏，面板根 GameRound activeSelf=False） | GameRound | 数字或动态值 |  | 推断 | 同上，填世界积分 |
| 20 | LocalizationText | Focus | Canvas/ProvinceInfo/Background/FollowTarget/Focus | 重点关注 | 否（面板内，场景加载时隐藏，面板根 ProvinceInfo activeSelf=False） | ProvinceInfo | 真正缺 key 的界面文字 | 精确：FocusOn(第277行，重点关注/Focus On) | 推断（强）：占位与节点名语义都对上 |  |
| 21 | LocalizationText | Focus | Canvas/StateInfo/Background/FollowTarget/Focus | 重点关注 | 否（面板内，场景加载时隐藏，面板根 StateInfo activeSelf=False） | StateInfo | 真正缺 key 的界面文字 | 精确：FocusOn(第277行，重点关注/Focus On) | 推断（强）：占位与节点名语义都对上 |  |
| 22 | LocalizationTmpButton | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (1)/Expand | 点击扩张 | 是（面板内，场景加载时显示，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似 ExpandTerritory(第253行「扩张」) | 推断：与 LocalizationButton 那 6 个 Expand 同一情况 | m_TooltipsKey=ClickGenTips(第251行) |
| 23 | LocalizationTmpButton | Expand | Canvas/StateInfoNewUI/Scroll View/Viewport/Content/Action/Content/Panel/Panel (2)/Expand | 点击扩张 | 否（面板内，场景加载时隐藏，面板根 StateInfoNewUI activeSelf=True） | StateInfoNewUI | 真正缺 key 的界面文字 | 无精确；近似 ExpandTerritory(第253行「扩张」) | 推断：与 LocalizationButton 那 6 个 Expand 同一情况 |  |
| 24 | LocalizationText | TrialAnnouncementText (1) | Canvas/Thanks/Background/Scroll View/Viewport/Content/TrialAnnouncementText (1) | <font="TW-Kai-98_1 SDF">三点水余,Proselyte,<… | 是（面板内，场景加载时隐藏，面板根 Thanks activeSelf=False） | Thanks | 真正缺 key 的界面文字 | 无（致谢人名列表，csv 没有） | 实测（反查无结果）；人名无需翻译，写死即可 |  |
| 25 | LocalizationText | ToolTips | Canvas/ToolTipsPanel/Background/Dragger/ToolTips | 声明 | 是（面板内，场景加载时隐藏，面板根 ToolTipsPanel activeSelf=False） | ToolTipsPanel | 数字或动态值 |  | 推断 | 通用提示面板标题，占位「声明」（抖音版声明），运行时由调用方传入标题 |
| 26 | LocalizationText | ToolTipsContent | Canvas/ToolTipsPanel/Background/Scroll View/Viewport/Content/ToolTipsContent |   《架空地图模拟器》为本人(zero)独立研发作品，从未授权任何第三方厂商在抖… | 是（面板内，场景加载时隐藏，面板根 ToolTipsPanel activeSelf=False） | ToolTipsPanel | 数字或动态值 |  | 推断 | 通用提示面板正文，占位是抖音版声明长文，运行时由调用方传入 |
| 27 | LocalizationText | LocalizationText | Canvas/WarningPanel/Border/Container/LocalizationText | 民族属性 | 是（面板内，场景加载时显示，面板根 WarningPanel activeSelf=True） | WarningPanel | 数字或动态值 |  | 推断 | 通用警告面板正文，占位「民族属性」是复制来的，运行时由调用方传入；csv 近似 EthnicAttribute「民族特征」(第380行) |

CSV 说明：`empty-key-nonmatch.csv` 现为 71 行数据，新增列「分节、组件、可信度」，前 44 行为原 LocalizationButton 分节（内容不变，只补可信度）。
