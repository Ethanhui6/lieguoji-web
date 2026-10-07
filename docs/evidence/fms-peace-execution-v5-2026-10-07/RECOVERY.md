# 原作和约效果、执行器与完成判定

2026-10-07；父 HEAD da05fe9，根独占写入。接续 WEB-04-37，上批议和/计划/分类内核在14f18db。只读代理分别核查目标/崩溃、执行器、三类效果，根实现并检查。授权 GameAssembly.dll SHA-256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

这是实际可执行的规则代码，**尚未导入生产会话/Worker，不是新可玩版本**。没有创建v28、改动旧规则指纹/库或重建5206；当前可玩仍v27/Store29。没有运行原作、读取私档/认证/SDK配置，不提交dump。静态恢复、固定样本代码验证不冒充桌面运行对照。

## 本批实现

- `native-war/achievement.ts`：目标达成、内部目标、国家崩溃与政体阈值，补上上一批显式查询依赖。
- `native-war/settlement-effects.ts`：附庸、即时赔款、统治集团改宗，效果结果保留原null理由。
- `native-war/vassal-effect.ts`：即时附庸检查、排队移除、退出战争/联盟、关系登记、历史和动画调用顺序。
- `native-war/settlement-execute.ts`：实际转地/效果执行、抑制作用域、失败/异常、结局重算、内战国运和上下文去重查询。

输入合同为合法int32/f32和有效容器。原世界服务通过明确端口提供；函数自身未实现的省份征服级联、联盟退出、内战分类、上下文帧栈、国运随机和动画资源不可当作已完成。调试日志不是玩家史记。

## 目标和崩溃的精确差异

`HasStateCollapsed(null)=false`；缺失/非正InitialProvinceCount直接false，哪怕国家已死。否则先CurrentProvinceCount，再独立查政体territoryLossThreshold；`f(f(i32(initial-current))/f(initial)) > threshold`，**严格大于**，不钳制损失比例。CurrentProvinceCount是国家原省列表Count，包括海/null/重复项，死亡/缺国/空列表引用为0。阈值缺国默认.5；有国家时再查询该国取政治属性并clamp到f(.3)..f(.8)。政治属性缺失应异常；第二次国家消失亦异常。本批二审已修第二次查询的显式判空，不把null交给常量适配器。

`IsAchieved`的目标2/6先构建原固定敌方及有效范围，逐项计数当前不再由敌方持有的省（当前省缺失也算）；然后比较整数required，clamp到1..max(1,范围Count)。重复项重复计数，不提前短路，不因war.internal改变这条分支。**空范围为false，与CalculateProgress空范围=1不同。** 其他类型才调用Progress>=1；null war/goal为false，null scope异常。

`IsAchievedInternal`自身不要求war.internal。目标7独立：目标国不存在/死/无陆省立即true，无需时间或受益国；否则达到minimumMonths后，受益国须存在/存活/有陆省，InitialOwner快照中本人且当前仍陆地的省数>0，最后重新查询受益国陆省，比较f(current)>=f(f(initial)*.5)。不ceil、不max1，保留2^24附近f32边界。目标8–10只看目标国死/无陆省，完全不查时间；其他false。全部内部目标检查要求非空可执行集且逐项短路。

## 三类效果

BuildEffect仅4/6/11有效，null goal异常；构造只记目标ID、受益方、承担方，类型由效果决定。Applied=0/AlreadySatisfied=1为成功，Failed=2失败；Applied理由为null。Apply不读取plan，不检查war仍活动；war仅用于调试日志ID，null为-1。

赔款先解析受益国、承担国，要求两者存在且承担国活着；**允许受益国已死、承担国无陆地、双方同一对象**。金额为：

```
half = max(0, roundEven(f32(f32(target.gold) * .5)))
floor = max(1, int32(max(0, target.goldPerMonth) * 6))
amount = max(half, floor)
target.gold = int32(target.gold - amount)
beneficiary.gold = int32(beneficiary.gold + amount)
```

先扣后加，立即一次性支付，可透支，最少1，无余额封顶、分期或重放去重。重复Apply重复支付。同对象扣加相抵仍Applied。六倍收入乘法保留int32溢出。例：金库100/月金30赔180→-80；金库3和5/月金0都赔2。调用的是调试日志，没有额外赔款史记或动画。

附庸要求两国存在/活着、目标有陆省；先IsVassalOf(target,beneficiary)（宗主对象引用相等）→AlreadySatisfied，再TryMakeVassalImmediate。即时检查不查pending队列：拒null、同对象、死亡、目标已是任何附庸、宗主本身是附庸；不添加实力/好感/休战条件。通过后：

1. 移除所有同目标对象pending项，保留其他次序；快照旧战争后逐个退出；强制退出联盟。
2. 采样float gameTime提升double；构造关系，tribute=f(.3)、armyCap=.5、rebellionReason空串、更新日Random.Range(1,28)。登记vassalStates和宗主列表（不额外去重）。
3. **登记以后才LeaveAllWarV2**，因此嵌套和约可重入；同附庸效果内层看到已登记，返回AlreadySatisfied。
4. 再次采样gameTime，创建同一附庸事件对象，依次写目标国史、宗主国史、世界史；国家调用false表示isCameraFollow，不是禁止发布。
5. 调试日志，附庸箭头。无统一try/catch或回滚；后续抛错保留候选中的已执行部分。

原作箭头从目标polePos到宗主polePos，转换深度-.7，后续协程/预制件/完整颜色和时长仍未恢复。周期贡金、军力限制、附庸叛乱也不在本批完成范围。

改宗要求两国存在/活着、目标有陆省，采用受益国**执行时当前**国教。有效宗教排除null/空串/严格Atheism；宗教字典须存在且命中非null对象及内部Religion，name不能严格等于AtheismName；不trim、不查enabled，已登记空白ID和null名称可有效。

按目标统治家族、Leader顺序取对象；国家、存在的统治家族、存在且活着的君主都已同信仰→AlreadySatisfied。否则依次改国家、家族、活君主；家族无死亡过滤，死君主不改；MarkStateNameDirty(false)后调试日志。这个false是refreshNow。没有改全部省份/人物，也未直接生成宗教地图、动画或史记。家族/Leader查询仍使用明确服务端口，原GetRulingFamily为stateId>0按字典Values先匹配stateID且isRuling，Leader为leaderId>0才查人物。

## 实际执行器

plan为空无操作；非空先复制计划结局/赢家、快照blank，再清AppliedTransfers。首都失陷抑制depth++，**仅转地循环**置于try/finally，退出depth=max(0,i32(depth-1))。

每条先查省，再查目标国，即使省缺失也查目标。缺任一个警告继续；不加FromStateId、陆地、目标死亡或最后一省限制。保存实际旧所属国颜色（缺国白色）和目标颜色，调用ConqueredBy(target,true,true)，两bool分别isRecordHistory与shouldStripFamilyControl。实际省owner等于目标对象ID才记原条款对象和动画项，否则警告继续，失败转地不移除目标ID。省份对象与ID映射须一致：原作旧色读Province.state，本适配端口按stateId取对象；不宣称引用失配世界等价。

退出抑制后，仅非blank且有成功动画才播放；**动画之后才清EffectResults**。故转地/动画抛错不会先清旧效果结果。null效果对象抛错；Apply返回null才包装Failed/“效果未返回执行结果”；非null返回身份字段原样保留；先追加结果，失败再按返回结果的goal ID移除所有同ID EnforcedGoals。Apply抛错直接中断，不包装、不回滚先前部分。

效果之后重新读取两侧（含destroyed）并按actual=true/pending=false分类；内战走独立分类端口。仅内战类型5或8..11且MotherStateId的实际结果Victory、母国存在时调用镇压国运，即使母国dead；不是PrimaryDefender，不含FamilyRebellion4。

先计算所有效果成功，再比较Applied/Planned转地Count是否相等，将结果及旧快照交比较日志；只比数量。blank之后早退。否则对存在、存活、当前settlement帧尚未记过的国家记结局。

原上下文去重从帧栈尾部找最新同warId帧，立即查集合，不向更早同war帧继续找。集合来自转地销毁流程：RecordSettlementDestroyedStateLoss正序遍历帧，对参战国首次Add后立即记Defeat。**ExecutePlan和RecordWarOutcome不向集合添加普通幸存国**，原函数重复执行可重复记幸存国结局。不能在此伪造持久幂等；网页须在外部候选事务/命令版本里防意外重放。

## 检查与接续

本批新增70项：目标/崩溃26、效果/附庸22、执行器22。加既有92项和round23项，最终185项/8文件通过（第一轮182通过，随后补内部2/6及计划→执行联接三项）。包括真实对象扣款/改宗、整段Build→Execute→实际结局、嵌套附庸、部分失败、异常抑制退出。实际报告见unit-final.json，摘要/源指纹见checks.json。

全仓lint/types以及末次小改后的相应检查通过。任务更新后plan:check与39项发布/计划保护测试通过。没有生产import，因此没有新构建、浏览器或性能声明；现有试玩证据不重复计为本批。二审发现并已修第二次国家查询消失、国家史记bool命名；其他已核数值和正常一致引用下的次序无新增差异。原始查询异常边界不等同CLR异常类型或完整运行联调。

下一批优先做 **v28生产桥接**，复用本批实现，避免继续重复拆解：先冻结v27真实源/指纹；明确原军力伤害单位、完整历月、参战快照到网页世界的映射；独立规则/库和命令候选，把当前目标→战争分/厌战→和约→军队/外交/史记清理接成可玩的闭环。原生或适配差异逐项写清，旧局历史不能补造。省份征服/内部结算等缺失依赖在实际桥接时按范围补足，未具备的效果不得显示为可执行假按钮。

WEB-04-37继续in_progress；后接WEB-03-06。无push/PR/Issue/Pages/main。正式站、旧存档、5206及其他试玩origin、真机/用户视觉门保持。
