# 接续位置

先核Git、最新AGENTS、tasks.webRebuild和AUTO_HANDOFF。当前本批源码912dabc，模拟fe7a64；WEB-04-42完成，43下一项，37仍进行中，21及完整PH/真机/视觉门保持。不要再重做退役名额释放。

下一切片先接已有真实夫妻的出生闭环；WEB-04-43还包含成年成家，不能以出生子集标整项完成。

1. 修改新规则前冻结当前实际fe7a64 Worker字节，保留原前史；出生通过显式规则启用及受保护副本边界接入，不静默改变原世界。先检查当前已有副本链合同，不把新增一代来源硬塞旧格式。
2. 在 `advancePeopleMonthOwned47` 年龄→死亡→继任之后、当日自主分封之前接婚育owner。独立持久 `enabledTick/lastMonth/random.state/draws`，稳定人物ID顺序，同月不重复。
3. 复用 `native-economy/character-registry.ts` 注册/命名和 `native-culture/character-init.ts` 已恢复核。`nativeGenerateLeaderChildren(false)`恢复的是开篇家庭，不是月度出生算法；出生概率、间隔和择偶触发尚未核实，明确网页适配。
4. 在population types/validation添加独立newborn凭据，实际生日、双方父母和childrenIds、kin/life/家族成员及单调ID同步。旧开篇来源birthTime<=0约束保留。
5. `grant.memberIds`是历史授封快照，绝不追加婴儿。用独立出生/加入账证明当前支系成员；houses与house-governance的绝嗣及历史return校验均要按实际时间重建成员，避免仍有后代却收回封地。
6. 成年成家必须从真实在世人物配对，年龄、当前配偶、直系/近亲约束及跨家转入履历完整。不能只改spouseId或伪造祖先；初始配偶生成器不代表后续婚姻匹配。
7. 成批后检查主家/支系出生、当月死亡父母不再出生、新后代阻止绝嗣回收、逐日/batch/冷恢复随机流完整一致，以及原前史/grant未变化。再接成年及跨代继任，不宣称第一批完成全部无限代际。

继续保留5300旧局和5304实际1968日新局；5305是独立最终检查入口，不同origin不会自动搬档。最终新试玩的实际保存状态见verification.json。不要停用户旧服务，不向云端写入。
