# v14 国家战力接线合同（本地有限范围已验证）

2026-10-07，接续 be90da7，WEB-04-13 仍进行中。根唯一写入者；代理仅只读原函数与合同复核。本地检查与范围见checks.json/DELIVERY.md，完整原作与物理设备另验。

## 本批可操作目标

当前地图新局 → 原分布国运/六政体 → 国家制度与战力设置 → 预览/取消/确认 → 实际对军及围攻消耗同一效率 → 保存/刷新精确恢复。已发布 v13 的20文件及全依赖冻结，旧局原样运行；显式副本才进入 v14 / Store16 / `lieguoji-fms-upper-v14`。

原作恢复：上层float32公式、政体默认攻守、5项特性消费、军队基础快照、通用省防御、核心距离与年度阈值。先前函数证据在 `../fms-terrain13-v5-2026-10-07/{UPPER_EFFICIENCY_RECOVERY,STATE_BASE_RECOVERY,CORE_DISTANCE_RECOVERY}.md`。

## 本轮补充原包证据

原 `GameAssembly.dll` SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`，只读PE/IL2CPP静态恢复，没有运行原作。`State.InitStateSimulationData` RVA 0x5D02F0 先确认宗教，traits为空才InitTrait，随后总是RandomDestiny(true)。`RandomDestiny` 0x5D4560 普通分支在0x5D4617写整数Range(10,90)，即10–89；衰减0.043–0.28。ManifestDestiny分支70–89并提前返回，本批未实现。

`InitTrait` 0x5D04F0 无文化分支从允许六政体集合随机；文化存在时 `GeneratePoliticalSystem` 0x3D2990 按正权重/允许列表抽样。无神论去除神权制。默认空权重字典填六项50是概率权重，不能当作国运。原无文化初始化还有ethnic0–4和2–5个特性。

`ApplyTraitEffect` 0x5BFFA0 最后刷新政体属性0x5DF750；顺序为默认政体、ethnic、特性。FishAndHunting攻守1.05、Nomadic攻1.1，本批ethnic尚未接入。StrengthenCore另将political coreProvinceLimit乘1.2（0x5BEFD7），该字段与CoreProvinceRate=.3不同；当前只消费后者。CommandManager.SetPoliticalSystem 0x70D250末尾刷新属性，UI下拉单独写字段不能证明刷新。

五特性数据来自授权安装目录 `FantasyMapSimulator_Data/StreamingAssets/Base/Traits/StateTraits/traits.json`，SHA256 `bae443b9f9328be70a4006ff560792404a00e43846b637b4bf79ebbd8dfc20d0`；只有英文name与中文description。网页中文短标题为适配标签。WellTrained按恢复代码仅跳过进攻的核心防御倒数，不把原描述扩展成免疫全部地貌惩罚。

## 明确网页桥接及剩余差异

- web seed可重复地产生10–89国运和六政体，非Unity随机序列相同。当前初始特性为空，可手动选5项；不冒充完整13项随机初始化或文化/宗教权重。
- 国运暂为初始化＋手动编辑；原月度衰减0x5DD5E0涉及人口、财政、领袖行政及随机数，未接入。原月调用点0x5BF29A，重掷点0x5DD80D。UI如实提示本版国运保持。
- 人物统率=1、领袖加成=0、国库倍率=1、突出部=false为明确中性输入；没有拿士气、粮食、姓氏冒充原值。
- 地理来自原绘图裁海后的真实省多边形。兵种地利沿用v13陆地面积；通用防御统计该省裁剪面原顶点（包括海点），每省去重、原索引顺序，边缘可共有。不是Unity原cell归属/枚举顺序等价。
- 核心BFS按实际实控邻接及当前有效首都；失都时不擅自迁都，暂停核心增长。每次换旗立即刷新，后续同tick占领与AI不会混用旧owner距离。360个网页日触发原年度阈值一次；不是已验证原历法。
- 军队base在新ID/进入重编时初始化，换属、登船、登陆保留；新国家/新军、政治起义/独立之后同步动态表。
- 对军和围攻共用上层函数；原城fort等级保留在旧世界结构但不假冒v14通用省防御。粮食继续原网页补给、移动、日结减员，并非原金币或直接战力乘数。
- 设置命令为单次原子变更，捕获runId/day/event/tick；预览不写，取消保留草稿，失败不安装。成功递增事件并显示原因；目前进入短期事件，不伪造为完整永久政体史书。
- Store16继承CAS、真实chosen备份、原子事务及超时中止；未知字段锁主备，已知字段损坏可回退。新旧库隔离。

## 尚未验收

统一单元/浏览器/构建/规模的有限本地验证已完成；当前试玩5184/v14，5183/v13保留。没有push、Pages触发或main更改。真机Safari/Chrome、原作运行对照、用户视觉和完整政治/战斗系统仍未通过，不因本批改变。
