# v45 月度海军补建切片

接续 WEB-04-37。WEB-03-06 与 queuedOriginalAudit 不抢跑。本批仅本地；发布、正式站、真机和用户视觉门不变。

## 本批原作依据

只读指定安装版 GameAssembly.dll，SHA256 `d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。PE / IL2CPP29；不是截图中的 ELF / DWARF。使用已有元数据定位和有界单函数反汇编，没有启动原作或恢复脚本，没有读取 SDK、认证配置或个人存档。

- State.AdvanceOneMonth `5BF120` → UpdateArmy `5DBFE0` → UpdateNavy `5DE860`，验证逐月调用。
- UpdateNavy：`quota = portCount == 1 ? 1 : portCount / max(1, portsPerNavy)`（整数除法）。默认每三港一支；两港配额为零是所读版本的实际行为，未擅改。
- GetNavyBuildMonths `5CDAA0`：默认6；State+0xD8 **族群 EthnicAttribute**，海洋 ×0.5，商业 ÷1.5。再乘活着的现任君主特性连乘与港口封锁倍数，float32，向上取整且最少1。
- Character.GetWarshipBuildTimeMultiplier `83CE70`：非正特性按1，乘积至少0.1。原始数据 ShipMaster 为0.5。
- GetPortBuildTimeMultiplier `417FB0`：任何本国陆地的海港不由本国控制时 ×2，不是按比例加权。
- SelectNavyBuildPort `5D7210`：优先无任何国家舰队的港口，再回退全部受控港口。CreateNavy `42DAE0` 再拒绝已有舰队的港口。
- UpdateNavy 启动建造的同次更新也减一个月；在建工期不随新君主或封锁重新计算；没有受控海港则清空排队与在建记录。
- CalculateLandArmySeaCrossingRestriction `321180` 当前直接 false；IsLandArmySeaCrossingRestricted `5D2000` 读取字段+0x310；UpdateNavy 正常出口清零该字段。不能只凭 pressureThreshold 字段名编造原作禁航阈值。

每个函数体长度与 SHA 见 native-methods.json。原始私有分析 dump 不进入构建。

## 网页映射和明确未还原处

- 复用现有国家月度更新日与 ISO 年历；固定120 tick/日是现有网页时钟，非 Unity 的逐帧时钟等价。
- 一次 native Navy 完工映射为一艘网页船、40船员、2400人日粮；扣除真实港口城市资源并保留居民/民粮。保留网页安全舰队上限、本国陆地与港口所有权校验。这些资源/单位映射不称原作数值。
- 港口内是否有舰队使用实际湿三角港湾范围，与航行/控制一致；不是原作 Voronoi 单元同尺度。
- 独立持久化随机序列选港，不冒充 Unity.Random 同种子等价。
- 暂保留超额已有舰队，避免直接删除其船员、运输中的陆军与玩家指令；原作 TrimStateNaviesToLimit 的销毁行为尚未接入。
- 完工但泊位/粮食/兵员不满足时保留工期，次月再试。原作无网页经济与载军适配层，因此这项是显式网页等待政策。
- 此切片没有恢复原作统一 Army 的自由跨海形式；现有网页运输限制仍需后续处理。

## 验收合同

必须有配额/工期/队列数值证据、真实 Worker 月度完工、真实舰队地图实体与资源扣账、重复调用不多建、取消不扣账、刷新恢复、未知字段锁写、损坏主槽回退及两次保存、CAS。新库 v45/Store47；v44完整冻结且继续执行原规则。浏览器固定样例为合成世界，不是原作视觉对照或真实手机通过。最终检查与画面另记 DELIVERY。
