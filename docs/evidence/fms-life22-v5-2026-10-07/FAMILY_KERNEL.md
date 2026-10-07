# 家族继承选择核已实现

接续 v22 可玩源码提交 34842488b1bc477d942ccb94d11fecdee02d2b19。新增 native-economy/family-succession.ts 三个独立选择器，遵守 NEXT_FAMILY.md 的原分阶段、女性惩罚、unchecked int32、稳定顺序和有效能力 f32 合同。GetLivingMembers 直接复用既有 native-culture/restoration-leader.ts；未重复实现。

首轮 46 项通过（新选择器 32＋既有复国选择 14）；只读审查未发现实现偏差，并建议补普通成员 +2000 溢出和直接成员/旁系全平局两项回归。最终 48 项通过，family-kernel-final.json。目标 ESLint、完整 types 通过；最后两项只新增测试，不改变执行核。未以此重复运行或声称 v22 浏览器全量结果。

无生产调用，v22 引擎/5195 产物不变。独立核并不代表玩家已经有完整家族继承。任命和虚拟人物由显式端口提供，不补随机或重试。有效能力仅接受有限 float32 输入；原泛型 LINQ 内部 getter 精确调用次数不在等价声明内。

生产输入缺口：现 CourtPerson 强制已有首次君主任次及命名锚，无法容纳真实未登基子女/配偶/旁系。后续版本需独立人物身份及可空任次；旧档未知亲属不能变成空数组，未知年龄不变成 0。新生产版本冻结旧合同、采用明确副本。当前选择核已经具备，下一批从 GenerateCharacterFromCulture839080、CreateFamily85BD00/85BD30 的实际创建入口继续，随后再做家族初始化与死亡/继承事务。
