# 撤职与月度调度核（尚未接生产）

2026-10-07；父提交 bc15375。指定原安装目录只读；GameAssembly.dll SHA-256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。仅使用已有元数据与窄 RVA 静态反汇编，没有运行原作，也不提交 dump。

## 已核实的原顺序

- DismissAllForCharacter 8820D0：首个 StateManager 或 states 缺失返回 0，随后重新取 manager/states；遍历所有非空国家，没有领土、存活或玩家限制。每国先 EnsureGovernmentOfficeData，再按 holderCharacterId 快照该人物任职，逐条撤职，仅累计成功项。过滤谓词 353F30 / 88D0C0。
- DismissAssignment 882810：Ensure 后按对象身份删除任职；失败返回 false，成功立即 MarkDirty。MarkDirty 5D2B20 先 int32 递增版本，再置 normalized=false。找不到人物管理器或任职人仍返回 true。
- 在该人物实时 GovernmentOfficeRole 中取第一条匹配任职；缺失则 CreateRoleMirror 881FF0，原样复制 holder、startTime、office/state/scope/war/polity。选择谓词 88D3E0 使用任职自己的 stateId 和原始 warSystem，包含 holder。
- 履历去重 88D460 只比较 office/scope/raw war/双方 Normalize 后的 startTime；不比较 stateId、holder、roleType、endTime 或政体。不能自行添加原作没有的条件。NaN 不相等；空履历元素会抛错。
- 非重复时，第二次获取的 pastRoles 在读取时钟前捕获；时钟归一 f32；null/空原因转 dismissed，空格保留。随后重取实时角色，用 88D520 移除：目标国家 id、office/scope、归一 warSystem，不比较 holder/start。删除任职后的异常保留原生部分写入；网页必须在私有候选上执行并原子提交。
- AdvanceMonth 836DC0：先快照字典中存活人物，谓词 568990 遇空人物抛错。每个快照人物若仍存活才更新年龄，随后无条件 ProcessNaturalDeath；新注册人物下月参与。全部处理后要求已有 DeathStatistics，月份 12 才 CleanupOldCharacters，最后替换为全零计数及新空 deathAges。不是月初先清空统计。

## 本批验证

- office-dismissal、office-assignment、role-history、character-month、character-death、natural-death、character-lifecycle：108 项 / 7 文件通过，见 office-month-first.json。
- 新四文件目标 ESLint、全工程 tsc --noEmit 均退出 0；实际退出码见 office-month-checks.json；tsc 无输出，PowerShell 未创建空日志。
- 包含外国/已灭亡国家任职、破坏性删除前快照、部分失败、重复历史、镜像缺失、旧统计在回调间共享、年末清理及异常保留。

这些是独立核与宿主依赖合同；v23 可玩引擎不变。未宣称浏览器、iPhone、视觉或完整原作等价通过。下一批冻结 v23，接 v24 的真实死亡/角色/官职/继承、独立存档及可见结果。
