# 原作地图编辑：限定函数恢复

2026-10-06。仅只读用户授权的 FantasyMapSimulator 安装目录以及本项目已有本地索引。实际对象是 Windows PE / Unity IL2CPP；未运行原作、未改安装包、未读认证、SDK 配置或个人存档。原始 dump 留在 ignored 目录。本页记录已恢复行为，不是网页编辑功能完成证明。

## 地类画笔

`PlayerController.DrawBiom(Vector3 pos)`，RVA `0x436330`，2560 字节。实际函数依次执行位置/raycast有效性检查，以当前画笔半径做选区，将命中格索引去重，只保留 `Elevation >= 20`，逐格写 `CellData.Biom = EditPanelUI.currentDrawBiomID`（写入点 `0x436A0A`）。没有修改高程；虽然读取一次 BrushHeightSlider，返回值没有参与地类赋值。

受影响省份去重后更新 World.UpdateLandProvince、RecalCulateBiomAndTerrainInfo、ResetCombatEfficiency、RecalculatePopulation、InitBiomeResource，再更新绘制区和延迟重绘。因此它不是只改显示颜色的图层。在网页游玩地图接入时，省份地类统计和实际战斗/人口/资源应读取同一数据；在绘图页也必须进入保存与撤销。原函数未验证地类ID范围，网页仍须严格验证自己的允许表；原 UI 完整选项本批未恢复。

## 手工河线

`StateLineRenderer.CreateNewRiver`，RVA `0x4E8540`，576 字节。在点击位置创建三点：原点、世界X方向+2.5、+5.0。随后 GetNextRiverID → World.AddRiver → DrawSingleRiver → CreateRiverArrow(animated=true) → EditRiverLine，进入控制点编辑。

`World.AddRiver`，RVA `0x6A2450`，704 字节。将世界坐标转为图坐标：`x=(worldX+BoundOffsetX)/BoundWidth*Width`，y同理；追加到 `riverline`，并在 `mannualRiver` 集合登记索引。

这两函数确实保存河线，但没有写 Elevation / CellData.River / Flux / Moisture，没有气候重算。后续拖动/删除是否另有水文同步尚未核实；不能声称手画线已影响农业/行军。网页应使用稳定ID并区分自动河网和手工线，不能仅放在renderer临时状态。

入口陷阱：旧 `EditPanelUI.OnDrawRiverButtonClicked` 已标Obsolete且指向共享空方法 `0x31BD80`；新入口为 `OnDrawRiverButtonClickedNew`，`0x8E6A60`。本批未展开新按钮体，不把旧方法名当有效操作链。

## 自动河网参数

已有恢复的生成JS从 World.PrecInput 读取降水；generatePrecipitation使用 `precInput/100`；drainWater固定 `MIN_FLUX_TO_FORM_RIVER=30`。每点降水向下游累积，达到阈值才登记河流。

元数据存在 EditPanelUI.PrecipitationFactor、TemperatureModifier、OnPrecipationFactorChanged，以及RegenerateSeaRouteAndRiver入口，但该回调本批未展开。未找到已证实的独立“河网密度”原作滑块。网页可以增加密度阈值作为明确的扩展，默认保留30；需贯通Worker、缓存键、riverIds/湿度/地类与河带，不能仅隐藏河段。

现有网页Hill Max已用恢复的邻接传播与高度贡献，具备半径、高度、衰减、种子及海岸/玩家锁保护。扩展山脉工具应接这些真实参数。

## 网页状态

当前仍为V1/V2严格文档；新版气候、地类覆盖、手工河线需要独立文档版本和明确副本入口，旧档原样读取、CAS、撤销和失败保护继续保留。本页不表示上述新编辑工具已可用。当前正在验证的批次是海战、原作战斗动画和战争层级面板。
