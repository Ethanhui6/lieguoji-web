# v29 自动外交、期限与月初检查依据

2026-10-07；接续 WEB-04-37，根独占写入，两个代理仅只读恢复/审查。未读取个人配置、SDK、认证或存档，未运行原作。以下证据为当前指定安装包静态反汇编，不是桌面 UI 试玩。

`D:/steam/steamapps/common/FantasyMapSimulator/GameAssembly.dll` SHA-256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。

| 规则 | 直接依据 | 网页消费 |
|---|---|---|
| 世界自动外交默认 true | World ctor 6CB340，在6CBB72写+2C3；GameConfig ctor722B00同默认 | war29-diplomacy.initialDiplomacy.worldAuto |
| 每国自动外交默认 true | State ctor5E2510/5E2F20的+50写0101，+51为isAutoDiplomacy | nations布尔表；新增国家按原默认登记 |
| 最大期限默认240月，0..480整数 | WorldSettings cctor6E2240的6E256F写240；设置应用8CE760第六参数clamp0..480 | maximumMonths；网页输入拒绝非法值，0禁用 |
| 原UI先pending后应用 | AI全局面板8F86A0，91206D–9120EF创建0..480滑块；911340改pending，912200确认应用 | 预览/取消/确认，Worker重验run/时刻/revision |
| 世界开关关闭不评估普通自动议和 | EvaluatePeace6757F0，675975–67597C检查World+2C3；随后675A29检查当前存活自主外交参与者 | war29-settlement世界门和单国参与者门 |
| 期限不看各国自主外交、不加36月门 | CheckMaximumDurationWars683E30；完整月数>=设置，非内战，先快照ID，以reason4结束 | nativeMaximumDurationWarIds→settleWar29(reason4) |
| 每月1日，期限先于普通议和 | AdvanceOneDay5215E0；521683–52168B day==1，521B33 CapitalFall.ProcessMonthly→521B4D Maximum→521B54 Evaluate | life.currentDate.day==1，日界触发；先期限再普通判定 |
| 真正零省覆亡独立清理 | 5D30E0/5D3590零省→DestroyState5C3450→68FD80→685A50；686261/686288终战2或3，不查外交开关 | 每tick政治/占领后查真实无领土；普通领土损失比例崩溃仍受外交门 |

原作最大期限为静态 WorldSettings，通过 GameConfig 保存；网页将三项设置放入各个独立世界存档，是明确的浏览器存档适配，不改变其他世界。未读取用户原作当前配置，不能声称默认值就是用户当前设置。原作LoadConfig70E410对缺失的Nullable期限保留当时静态值，并非每次缺失重置240。

reason4使用已恢复的判胜、条款和实际执行器；不是无条件白和。特殊数值沿用 [原结算合同](../fms-peace-kernels-v5-2026-10-07/CONTRACT.md)。普通省份法理/实控双层保留v28的网页适配。当前覆亡以双边普通战争reason2结束；原作多国迁移与AnnexationConquerorId更完整分支仍待接。

网页开关同时约束现有陆地与海上自主宣战；仍保留现有资源/航路策略，不因接入开关就宣称原作整个AI已恢复。已有行军、战斗、补给、运输不因关闭外交而冻结。原作全局面板/国家信息页的准确视觉和文本尚未实机核对，War29Panel为可操作的网页入口。

## 方法指纹

跨度取既有索引至下一函数，含对齐；不提交原始dump或DLL片段。

| 方法 | RVA / 字节 | SHA-256 |
|---|---|---|
| GameConfig ctor | 722B00 / 320 | c12284981ccb673edfa85df95812b2a766ec82e173c8c9fd695964224e620920 |
| World ctor | 6CB340 / 3824 | f6649ec5716a4b706e9f8453ef0dd7d5de74ed2ec29e7ace0299554fe3adc2ce |
| State ctor | 5E2510 / 2576 | e664c6b01c48983c180cab5d495333fd64b541b15e7c582a8a5b21cd834c96fe |
| State ctor overload | 5E2F20 / 2704 | faf5efcf5d998fa4c53dc4e7e27c052cc2db9bb4801636796b4bb077900fc1f6 |
| LoadConfig | 70E410 / 5872 | f3775a401bd7a29609e593ea27daacceefe87e5ea436670abfd8d5d1d21004f6 |
| ApplyRebelIntervalSettingsAndSaveIfNeeded | 8CE760 / 640 | 8f1d08d806b6bd2e3f3f6353900a64bf78afc27f7c1180010f1e1ee851e07084 |
| ApplyAIGlobalSettingsAndSaveIfNeeded | 8CD010 / 912 | f030666b7584355783a93deb3ddbd95fc001b80827bcdd2d9fc161be84b9e7e1 |
| ShowRebelIntervalSettingsPanel | 8F86A0 / 1488 | b8bd4bd08ed0f4bc98ff3d72b3ec3e4e6e9a8fd6b5914a64fbcd4ccfb39ebe3c |
| AI settings confirmation | 912200 / 288 | bb2c2e353d858854abf8bc99d1c7c7bc723738e7e1b21b88070c84ea75fccf78 |
| AdvanceOneDay | 5215E0 / 4160 | a038853389fb51848fba1857e5eff6d4a2144959778121f4b6ddb57118c0c278 |
| OnProvinceRemoved | 5D30E0 / 448 | f105a24b54dd942c07c25d0530a14af3db1787315e6b9bd1e3d51e242108a901 |
| OnProvincesRemoved | 5D3590 / 400 | 74270894638d8a0b9eefa8d650fbbc78f1456be667530a0c118e03a44c64c767 |

CheckMaximumDurationWars、EvaluatePeace与期限筛选哈希沿用 [已核原函数](../fms-war27-v5-2026-10-07/NATIVE_PEACE_FOLLOWUP.md)。
