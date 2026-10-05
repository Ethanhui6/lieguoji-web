# 原作时钟：WEB-04-09 开始前的只读核验

2026-10-05。指定安装目录只读；沿本项目已有IL2CPP dump/script索引定位GameAssembly.dll的PE函数。没有运行原作、读取个人存档、SDK或认证配置；没有使用ELF/DWARF/hk4e。DLL指纹同本目录DELIVERY.md。

## 已证实的连接

- `TimeManager.Update` RVA **0x523F10**（272字节）：`IsGameNeedUpdate`允许时，`gameTime += Unity.Time.deltaTime`；`dayCount = (int)(gameTime / secondsPerDay)`；首轮prevDayCount<0时从当前dayCount开始，否则从`prevDayCount + 1`循环至当前dayCount。每次GetDateByDayCount，日期改变才调用`AdvanceOneDay` **0x5215E0**。即帧时间累计与日结分离，掉帧可以补算多日。
- `TimeManager`构造从`WorldSettings.dayLengthInSeconds`取`secondsPerDay`。`WorldSettings.cctor` **0x6E2240**在 **0x6E22D6**写`0x3DCCCCCD`（float32约0.1秒/日），在**0x6E22C1**写`monthLengthInSeconds=3`。这是初始化默认值；TimeSerializationData包含SecondsPerDay/GameTime，加载可能覆盖，未检查个人存档。网页3秒/日是较慢的适配选择，不是这个原作默认值。
- `Army`/`Navy`位移协程使用`Time.deltaTime`，详见首都/运动及海军报告，位置不是只能随日结跳一次。
- `GlobalTimeScaleManager.ApplyGameSpeed(int)` **0x38ADA0**：索引对数组长度取余，取speedSettings[index]，在**0x38AE06**调用`UnityEngine.Time.set_timeScale`（目标**0x231DCE0**），然后发OnTimeScaleChange(speed,desc)。它会实际改变缩放时间。
- `.ctor` **0x38B0D0**：defaultTimeScale=1；currentSpeedIndex/defaultSpeedIndex=2；speedSettings七档 **[0.1,0.5,1,2,3,4,5]**。在1倍且默认日长未覆盖时，约0.1缩放秒/日；不能据此宣称所有实际存档都相同。

七档数组有独立数据证据：global-metadata.dat **0x641108**处28字节：

`cdcccc3d 0000003f 0000803f 00000040 00004040 00008040 0000a040`

SHA256 `b82766c6c309a1967d690fb2c651b6bd58d3bed84bf23a3bb23b4b1f0973d823`，与PrivateImplementationDetails对应字段名一致；脚本元数据引用**0x2EE4180**，构造InitializeArray调用点**0x38B18D**。只保留这份必要数字证据，不发布完整metadata/dump。

`TimeManager.ctor`具体为**0x524430**，prevDayCount初值-1。`World.FixedUpdate` **0x6AD1E0**在0x6AD295调用`World.UpdateManager` **0x6C8E90**；管理器内部在0x6C9410调时间、0x6C960A调陆军、0x6C9721调海军。`World.IsGameNeedUpdate` **0x6BAFF0**返回isGameStarted && !isGamePaused。固定步长、补步上限以及倍率是否另行修改固定步长未核实。

`ArmyManager.Update` **0x35D060** → `BatchUpdate` **0x359010** → `Army.UpdateState` **0x3523E0**；状态更新使用Time.time-lastUpdateTime。`NavyManager.Update` **0x431090**在0x43143D读取Time.deltaTime，传给NavalSystem.Update和BatchUpdate **0x42D3F0**，单位入口Navy.UpdateState(float) **0x427590**。这证明单位状态消费子日时间，但完整战斗分支未核验。TimeSerializationData见已有dump.cs42182；恢复入口TimeManager.ApplyParsedData **0x522620**仅定位，未展开恢复语义。

## 待接网页，不能提前记作完成

先封存现有532842引擎与依赖，再设计新版本的游戏时间、固定子步或确定性事件步进、陆军/舰队途中位置和命令校验。保持经济日结、累计补算与重复执行一致，保存真实游戏时间而非仅显示alpha；切后台暂停、改速、Worker延迟、旧档副本、存档CAS都必须复验。

未恢复日结内部完整调用顺序/完整暂停链/加载后倍率与日长覆盖/碰撞交战的子日时序。已定位但尚未全部展开：GlobalTimeScaleManager.SetTimeScale 0x38B060，ResetToDefault/Start 0x38B050，BottomPanel.OnPauseGameButtonClicked 0x47DDC0，SpeedButton.OnGameSpeedButtonClicked 0x506830。不能凭速度数组没有0就猜暂停是否还写timeScale=0，也不能把显示层插值称为真实即时模拟完成。monthLengthInSeconds=3亦不能冒充所有LocalDate月份均30日。
