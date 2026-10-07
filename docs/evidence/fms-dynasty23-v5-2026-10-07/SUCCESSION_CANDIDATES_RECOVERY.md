# 紧急继承候选与非君主处理器

2026-10-07。父提交6c8697a；根独占写入，只读授权GameAssembly.dll（SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b）。按每次1–3个函数静态解码；没有运行原作、读取私档或认证SDK内容。原始反汇编仅留本地忽略目录。

## 已实现的原作规则

- `succession-handlers.ts`：Republic88F250、Theocracy88F560、Tribal88FA10，具体顺序沿[既有恢复证据](STATE_SUCCESSION_RECOVERY.md)。out failure先清空；选举成功跳过紧急候选；失败任命不重试；只有神权制无候选分支先结束已有任期再清领袖。
- Republic紧急候选890600：FamilyManager空直接null，之后才解引用国家。按家族原顺序执行HasLivingFamilyMembers；通过后先GetWarMerit、读取influence、再GetLivingMembers。候选nonnull/alive/age>=25；能力读取顺序军略→魅力→外交→行政。score为逐步f32的`(((military+charisma)+diplomatic)+administrative)+f32(warMerit*.1)+f32(influence*.15)`。按score降序、age降序、完全相同时保留原枚举次序；不追加旁系、不随机、不补性别/国籍门槛。
- Theocracy890CD0：遍历家族GetLivingMembers收集nonnull/alive/age>=0，收集后再Where(alive)，按88E8F0分数降序、年龄降序。并无成年或信仰字段检查。
- Tribal891210：同上，收集门为age>=12，使用88EA20。不能把评分函数支持幼童误当紧急候选允许幼童。
- 88E8F0：先行政、后魅力，再读年龄；35+/30+/25+/18+/10+/0+系数分别1/.9/.8/.6/.4/.25。`f32(f32(charisma+administrative)*f32(multiplier))`。负年龄在两个能力读取后返回0，null直接0。
- 88EA20：先军略、后魅力；35+/30+/25+/18+/12+/6+/0+系数1/.9/.8/.65/.45/.3/.2。同样逐步f32，负年龄读能力后0，null直接0。
- HasLivingFamilyMembers88FE10：null家族false；GetLivingMembers非空按Count>0即true（不重验每个alive）；否则遍历collateralMemberIds，每个ID重新读取CharacterManager，首个nonnull/alive即true。已到达的null列表或manager抛错，不虚构空集合。共和国随后仍重新读取GetLivingMembers供候选枚举。
- 40EA30/40EA40分别读tuple.score/tuple.person，8926B0读取tuple.person.age。Single.CompareTo1854E90保留无穷比较、NaN低于数值/NaN同分语义；有限输入的f32中间溢出不被夹为正常值。完整NaN payload和通用LINQ分配/getter调用次数不宣称逐位等价。

## 检查与真实范围

`handlers-first.json`：43项全过；随后`candidates-first.json`：131项/4文件全过（包含上述43与既有family/state回归，不应相加）。4个改动源码/测试文件目标eslint与全工程`tsc --noEmit`通过。覆盖年龄边界、能力顺序、f32相消/溢出、稳定同分、缺manager、可空家族差异、两次living读取、旁系存在但不入候选、收集后的alive变化、vacancy部分失败。

这些是独立内核，尚无生产调用。当前可玩仍v23/5197，不能声称自然死亡或这些紧急政体路径已在试玩中启用；没有本批UI/真机/视觉/原作实机通过。发布边界、旧库及main保持。

下一窄批已读取Monarchy88EB70、HoldElection845810和AppointLeader506C10。前两外壳将分别保留候选/选票与任命端口；任命内的历史角色、旧任期、新任期和改革有独立副作用，不能简化成改leaderId。生产v24接线需明确这些边界，不覆盖v23。
