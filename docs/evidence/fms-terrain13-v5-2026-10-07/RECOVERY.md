# WEB-04-13 地貌战斗恢复切片

本批根执行者独占写入；两个只读审计代理分别核原函数与版本合同。只读指定安装目录与本项目已有静态索引，不运行原作/恢复脚本，不读认证、SDK 配置或个人存档。本文件是限定函数证据，不是桌面实机对照通过。

## 原件与方法

- Windows PE / Unity IL2CPP，不是图片示例中的 ELF / DWARF。沿用“元数据定位 → 单函数恢复 → 适配 → 编译与行为验证”的方法；没有声称使用不存在的 DWARF 或 hk4e-mcp。
- `D:/steam/steamapps/common/FantasyMapSimulator/GameAssembly.dll` SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。
- `FantasyMapSimulator_Data/StreamingAssets/Base/Military/Default/military/MilitaryProfile.json` SHA256 `395030721678acdfcd5ce1cc6ae75872b595c2a72e1b160a8f5ad3f41657cfcf`。
- 本轮按已有 `dump.cs` / `script.json` 索引在内存限定反汇编目标函数及直接依赖。原二进制与 dump 不入 Git/dist；五类表的数据适配位于 `terrain13-native.ts`。

## 恢复合同

| 原函数 | RVA | 确认行为 |
|---|---|---|
| MilitaryProfile.GetUnitCombatModifier | 0x3FEE10 | power × attack/defense Evaluate × max(.01, armyUnitCombatScale) |
| BuildTerrainContext | 0x405560 | biomeCounts 比例；单省山地权重为 IsMountainous ? 1 : 0 |
| BuildBiomeRatios | 0x404AB0 | 只把 count>0 且非 Marine 的项计入总数，然后 float32 除法；未知 biome 不等于海洋 |
| TerrainModifierTable.Evaluate | 0x40E140 | 正权重加权，不再次归一化；未命中名称默认1；命中系数至少.05；空/非正和回退1；乘山地插值；最终至少.05 |
| EnsureInitialized / ResolveBiomeModifier | 0x40E0A0 / 0x40E3E0 | mountain<=0 回退1；按精确原 biome 名称查表，不按中文或组名查表 |
| WorldSettings..cctor | 0x6E2240 | 0x6E237E 写 +0x34 = 0x3F666666，即 float32(.9)；是静态默认值，不声称已恢复运行时所有设置入口 |
| Province.RecalCulateBiomAndTerrainInfo | 0x45A880 | 0x45AA14/1C/27 传省 cells 的整数高程，阈值60与标准差5 |
| ElevationBasedTerrainAnalyzer.AnalyzeTerrain | 0x37B770 | high=count(h>60)/N，veryHigh=count(h>80)/N；山地=(veryHigh>=f32(.15) 或 high>=f32(.30)) 且 std>5；高原=avg>60 且非山地 |

平均值转换 float32；每个偏差与平方为 float32；平方和通过 LINQ Sum<float> 在 double 中累加后转换 float32（0x1B7E260，0x1B7E36F/373 与 0x1B7E3E4），然后 float32 除法、sqrt 和转换。不能误用每项相加后都 float32。高度比较严格大于60/80，不是大于等于。

原 Biomes 静态构造器 0x363F20（数组赋值 0x36408F—0x364427）顺序：Marine、Hot desert、Cold desert、Savannah、Steppe、Tropical seasonal forest、Temperate deciduous broadleaf forest、Tropical rainforest、Subtropical evergreen broadleaf forest、Taiga、Tundra、Snow-covered land、Wetland。新规则以该 ID 对照原表，不从显示层中文倒推。

例：骑兵纯草原进攻系数约1.63125；山地热带雨林约.55125。盾兵在山地热带雨林防御约1.2285。均已含静态 scale .9，但未含上层士气、军粮、城防、精锐等因素。

## 网页桥接与明确未恢复部分

- 原省由 Unity cells 构成；网页省由 h20 裁海后的真实三角面并集构成。新建/显式副本使用同一 float32 源点和升序边交点，从裁海凸面内点恢复唯一辖区归属。bbox网格缩小候选，边判断总量有上限；无匹配、多匹配、面积不守恒均拒绝创建而不改旧档。
- 每面按真实面积加权其非海原顶点 biome；省地貌份额为这些面积质量归一化。山地统计使用归属面的唯一原陆地点，高程>=20；共享省界源点可分别计入两省。不添加合成海岸交点样本，不以省中心或粗三类 terrain 伪造13类。
- 同一绘图气候派生算法复制到独立 `terrain13-climate/` 并纳入新指纹；显示层未来改动不能暗改已有模拟。静态 context 存入 run，仅创建/copy 派生，load/tick 不重算。
- Army 上层国运、领袖、政体、通用省防御完整链仍未恢复。本批保留明确的网页士气/军粮/城防公式，去掉旧粗森林/山地系数，避免与原表重复叠加。部队攻击间隔与网页日内时间映射仍沿用冻结 v9 合同，不是 Unity Time 等价证明。
- 陆战、围城回补/削减、AI 进攻/驰援判断与详情展示都消费新规则。道路接触以实际交锋位置找所在省的聚合地貌，不取排序端点地貌，不声称逐 cell 或局部三角面取样；无陆地样本则无地貌倍率，仍保留 BaseCombatPower × .9，不计两端城防。
- 原字典依插入顺序累加；网页地貌比例按固定 biome ID 顺序计算。沿已恢复 float32 运算步骤，但不是任意原省列表逐 bit 等价证明。
- 海战与补给的规则本批保持既有网页适配；不把本次陆战恢复称全海军/物流复刻。长期围城使用真实全抵抗、实际日结军粮，不用 .01 抵抗来冒充完整流程。

## 兼容边界

v12 的8个执行文件逐字封存至 `compat/chronicle2`，指纹 `4f3d955e7a3e3626d2392fd46dce89e221b0935d89aac5a998f22771a67595ea`。v13 为独立 `fms-terrain-13` / Store15 / `lieguoji-fms-terrain-v13`；旧局读取后原版本续跑，只有明确副本创建新身份。新旧库隔离，CAS、主备未来字段锁、chosen previous 备份、事务超时取消沿用；原档、正式站与发布边界不变。

本文件先记录已恢复合同。实际测试、构建、浏览器截图、未通过项及最终指纹见同目录 DELIVERY/证据文件，未生成的报告不代表通过。
