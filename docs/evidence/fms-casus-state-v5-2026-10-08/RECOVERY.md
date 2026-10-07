# 宣战理由与国家初始化：现有 WEB-04-37 的接续切片

2026-10-08。根独占写入。没有切换到排队的全项目审查，也没有运行原作、恢复脚本、读取认证/SDK配置/个人存档。只读当前授权安装的 GameAssembly.dll、既有方法索引及指定 StateTraits 数据，以已知 RVA 解码小函数。

DLL SHA256：`d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b`。这些是静态代码证据，不是游戏运行观察。续接 [上一批合同](../fms-declaration-kernels-v5-2026-10-08/RECOVERY.md)。本批新增函数尚未由生产 v29 导入；源指纹及测试见 [checks.json](checks.json)。

## 本批实际代码

1. `native-war/casus-belli.ts`：安装版目录、共同资格、同文化目标资格、宗教有效性、独立吞并/附庸资格、普通/文化统一/空白国权重。
2. `native-war/casus-goals.ts`：资格重验、全国家及同文化范围、普通连片目标与赔款、完整主/副目标字段、TryBuildDeclaration。已有连接生长器仍是明确端口，未伪造已接入生产。
3. `native-war/diplomatic-geography.ts`、`state-initialization.ts`、`diplomatic-power.ts`：四层水省邻接、扩张倾向来源、初始化双点数重置；另补组合测试连通点数→目录→权重/选择→目标→实际 StartWar 返回端口。

## 目录和资格

每条初值：allowed=[]，annexThreshold=1，其他布尔false/数字0。注册顺序：

|ID|原名键尾部|允许目标|覆盖默认值|
|---|---|---|---|
|1|TerritorialConquest|2,1,3,6|无|
|2|Annexation|3|dedicatedAnnex=true，threshold=INT_MAX|
|3|Hegemony|4|无|
|6|CulturalUnification|1|Unifier，minimumSameCulture=2，forceDecisiveCede，weightBonus|
|7|ReligiousConversion|11|theocraticConflict|
|8|BlankOccupation|3|dedicatedAnnex，INT_MAX，requiresBlank|
|10–16|CivilWarSuccession/Reform/Independence/Overthrow、ProvinceRebellion、FamilyRebellion、VassalRevolt|空|internal=true|

名称前缀均为 CasusBelli_。枚举4/5并未注册。内战条目的登记不等于内战生成或结局已实现。

CanUse顺序：a/d非null且不同引用、d未死 → `IsBlankConquerable(d)==requiresBlank` → 陆邻包含或海邻包含（短路） → Unifier → 政体5/宗教ID精确不同/依次验证双方宗教 → minimumSameCulture>0时直接返回同文化阈值 → 先完整HasCedeable，再按allowed原序枚举。没有独立的a.dead/internal条件；它们属于外层。非null要求不能吞成空集。

允许目标0/1/2/6需要cedeable；3需要land>=1且dedicated或land<=threshold；4需要land>=1再查VassalManager且守方不在附庸字典；11需要land>=1。CB2资格没有实力或五省上限，这属于Choose偏好。IsVassal原作按字典ContainsKey，不检查value非null，不检查进攻方；生产端口须保留区别。

同文化列表按守方省列表原序：null/nonland/省文化不等于攻国文化跳过；先查陆邻，失败才在国家海邻关系成立时查沿海。不核当前owner、不排序、不去重，不要求守国国家文化相同。seaNeighbors查询在遍历前；阈值达成立即返回。完整列表每次命中即读取id，不能延后至全部遍历完。

宗教id null/空串/Atheism先返回false；随后manager缺失抛错，字典缺失则false。条目、MapReligion、Religion缺失false；最终name!=AtheismName，name=null可以为true。不trim、不检查enabled/圣地。

## 权重与目标

普通权重沿用上一批逐项f32；sum<=0早退，NaN不早退。CB6在最终clamp前，当share>=f32(.45)且重新查询当前领袖有Unifier时加f32(.15)。不复用CanUse时的trait结果。

requiresBlank分支不读实力/好感/领袖：`f32(f32(f32(clamp01(f32(expansionism-1))*.08)+.58)+f32(ambitious*.04))`，最后SSE minss与f32(.7)取小，NaN返回第二操作数.7。普通NaN仍传播。

BuildDefaultGoals重新CanUse。含11优先返回EnforceReligion；其次含4且再次可附庸则返回Vassalize。其后**先minimumSameCulture>0选同文化列表**，不成立才按territorial/reparations决定是否读普通cedeable。CB6返回完整同文化CedeArea，无quota/connected/strength/RNG/赔款。没有目标时不会自动换另一个CB。

普通目标继续ChooseOccupyCount、连接生长（空结果才Take兜底）、再次实力比较。share>=.65且allowed含1为CedeArea，否则OccupyCount，required=min(count,chosen.length)。赔款使用完整原cedeable、required1、id2、primary=false；只有主目标成功且allowed含6才抽一次**float32**随机，严格<.35。尾部无主目标时才再次核吞并资格。

主目标id1、addedBy/beneficiary=攻国、target=守国、primary=true。whole-state目标3/4/11 scopeType3，显式空provinceIds、required0；地区目标scopeType0。districtId/secondaryStateId均0。TryBuildDeclaration只构造有目标的声明，不能算StartWar成功；组合测试保留StartWar实际null失败结果和点数减半。

## 更正上一批“初始100”的范围

上一批已核三池构造器初值100，但不能据此推断一个完成初始化的新国在首月120点立即宣战。新增调用链证实 InitStateSimulationData 在首次UpdateStateData和trait/destiny之后，**覆盖开战和停战两池**：分别Random.Range(f32(threshold*0),f32(threshold))；默认两个threshold均100。总点数不被这两次覆盖。因此默认首次UpdateStateData后的总点数120，开战/停战初始为各自随机结果。

已把常量改名为CONSTRUCTOR，添加双池片段和顺序/失败回归。完整初始化顺序为：效率 → 时间/活状态 → UpdateStateData → 边省/敌边省 → DetermineStateReligion → 仅traits空才InitTrait → RandomDestiny(true) → 开战随机立即写 → 停战随机立即写 → 视觉dirty/联盟dirty → 弃省检查 → 传参开启时人物家族初始化。原方法不是事务，后续异常会保留早期写；网页应在私有候选上调用。

RandomDestiny(true)先intRange(2,5)写次数。ManifestDestiny成立则减次、intRange(70,90)写天命提前返回；否则减次、intRange(10,90)、floatRange(f32(.043),f32(.28))、清紧急动员队列。这些随机早于双池。**本批没有宣称复制完整Unity RNG序列或初始化整体**。

自动国扩张值：f32(Random.value*5+1)，转double经MathUtility.Rn(x,1)的ToEven，再回float，范围约1–6。不是粮策/政体/君主trait。已核PlaceState和TryRebel复制出生地原国值，不重抽；空构造器默认0，带参构造按输入写。未核的反射/反序列化路径不作结论。

默认StateTraits文件SHA256 `bae443b9f9328be70a4006ff560792404a00e43846b637b4bf79ebbd8dfc20d0`，13项：FightToTheEnd/StrengthenCore/ManifestDestiny/BullyTheWeak/DefyTheStrong/TotalWar/WellTrained/CoreDefense/CavalryTradition/HomelandDefense/Conqueror/SiegeCapture/FieldCombatElite。它没有IsPacifist/IsAmbitious效果；不能给所有新国伪造随机和平/野心。也不能反推旧存档特殊状态一概false。

已核文化trait生命周期留给实际数据桥复用：有效文化Ensure政体/ethnic/trait权重→生成政体/ethnic→GenerateTraitsForState→UpdatePoliticalSystemAttributes。目标数量intRange(2,6)，按原池顺序收weight>0者加权无放回，不足从全池Except已选均匀补足，写列表后逐个ApplyEffect。无文化直接随机2–5个。Add/RemoveTrait完整重置再应用；PostLoad逐trait ApplyEffect不重抽。**本批未新增完整trait生成器或宗教实体生命周期。**

## 四层水省海邻

UpdateNeighborState先清陆/海集合，再遍历源State.provinces每省邻接；源省不检查owner/isLand，null抛。邻居通过全局列表按ID查，越界抛，null抛。foreign且owner!=0的陆省加陆邻；所有nonland加seed。

seed/visited为Province对象的默认引用相等（普通class，非UnityEngine.Object，无Equals/GetHashCode/IEquatable重载）；不能直接改成按省id去重。四轮队列，每轮固定当前end，出队visited成功才扩展，nonland未visited再入队，foreign非0陆省加海邻。第四轮新入队不会处理。陆/海邻可重叠，无港口、舰队、政体、洲、国家存在或存活过滤。输出set只在foreign分支内再次读；异常保留已clear/已add的部分写。

刷新：月UpdateStateData→UpdateStateLandFeature及初始化；加载时只对!isDead刷新。没有证据支持每次占领立刻重算。方法后半颜色冲突修正未纳入这段实现。

**实际数据前置条件仍未满足：** 当前网页只有陆地区域和渲染用水三角形，后者4跳不等于原作水省4跳。需要明确的真实水省图/版本化适配，不能继续把整片海连通或港口运输图当原作海邻。

## 独立复核、修复与适配边界

- CB复核发现并修复：同文化查询的分支优先级、随机返回f32、逐省立即读id；各有新检查。
- 邻接复核发现并修复：foreign判定前提前读输出set；新增副作用端口反例。
- 第一轮单测290全过；第一轮typecheck因测试spy被推断成40|60而失败，已显式标number，未放宽生产类型或删除检查。后续检查见checks。
- JS readonly数组不具备C# List._version变更异常。合法静态数据的顺序已测，但不能宣称所有集合变异异常等价；NativeWarIdSet已有槽顺序/变异检查仍保持。
- Unity RNG、真实海省拓扑、完整trait/faith/联盟/附庸/内战生命周期、外交和渲染frame cache调度仍有生产桥差距。未用默认假数据宣布还原。
- 本批不改v29规则/存档/试玩产物。没有本批新截图、录像、浏览器或构建结果，因为生产入口未导入这些独立模块；旧证据保持原日期与范围。

## 新核方法指纹

完整方法边界的SHA256（不使用早期截断探读hash）：

|方法|RVA / bytes|SHA256|
|---|---|---|
|BuildCatalog|668DA0 / 2688|12ba8a8923fe12ad0ce5f965ba04c30ca8f13675c80a693ee4c507ad44fc2eb4|
|CB ctor|668D10 / 144|57cd42fb6a76ba1c1fb74006d768772f39c777f6cd36c47d5c3e321ce31aa7de|
|CanUse|6684F0 / 832|79a478abe0d38feb1aaa5a3fa8d701cd44557d2537eff0a3e5ef90e1bd7d22c2|
|Annex feasible|668BE0 / 64|af04787441f495c80463fd75ae14b7aae498eeb41be7c2ed5b567534a3cb8b77|
|Vassal feasible|668C20 / 128|eef9d4522d8e07185bc392179db134157b39e0e21fd7e71b324bfddb34f44582|
|VassalManager.IsVassal|657550 / 96|e9e859492efd4f6754af27b50fb1c4113e46821a27e9b6262b1e763c0e846f45|
|HasSameCulture|68B4A0 / 464|306ad4b66a31e7cf49605e57b692d8384f16b99b7e5821b5726cd55c49aea668|
|GetSameCulture|68A1C0 / 544|2e33388109b2cb3c0f3e0c90410673a928a692f8d05eb45e35c8e8b7fa85ac56|
|TheocraticConflict|669E00 / 128|839e1b1103be9211398562c0f387fd02562ea9bac0ef11cc0d5775dc3921e9ea|
|ValidReligion|669E80 / 224|9fcd439d0f3f6772b47332e548381f47519c100149279eede6f5ec272fa83fdd|
|EvaluateAiWeight|668980 / 608|024e28203465d77958af56ff7094c34692780d6a9021f486b63272722cd2d7b2|
|BuildDefaultGoals|6678C0 / 2480|b45ec7ff338d7931f67184492cb01551e9a2321f23c7a06ce0c7d8becbc47d5f|
|ChooseOccupyCount|668830 / 336|15a51beda1a3202c9935f9a62f594899e7617008f05550389c9c885af5f32667|
|StrengthAdvantage|668CA0 / 112|34661aaacc4413acc5a06a0e2d53630924d8cae59b2e102dc5b12f444a284cc2|
|AnnexGoal|6677F0 / 208|87528b4752b90f7236cc5b2f5ae72a4d1021aab14c053155c82b57579255b55c|
|VassalGoal|668420 / 208|cfae45826c0b27ae7bf145b89b2074cfb69bda596873d516e144d78984e61b84|
|ReligionGoal|668270 / 208|6ac06e11027c90048fe69de5810c969f0a11798272c87be1dec57f78cd7bcc0a|
|Goal ctor|681D30 / 224|b37c371a88aeaf96beaf7900b18f2ec537897cf4a2d6e2f90406a9b756add558|
|Scope ctor|68FDD0 / 144|c5c1e0e114b5af368b2105bdc1869a03ed6ddeeb72f1c6a8b99875227e513b88|
|TryBuildDeclaration|669F60 / 240|fbc25c8d8ef0c29fc035551ede59eaba6e44bff48691d66984a4c7e18a6faf71|
|InitStateSimulationData|5D02F0 / 512|e88b940978ef6b2749ccf46fba0f347bb4ec3e8347498c0dc683f7851077ea7d|
|UpdateStateData|5E0650 / 1664|c87c3505a663b4928c00ae5cf79280efbcbb313a18b051d7bb32abb2ad8833b7|
|WorldSettings cctor|6E2240 / 1552|6001d810782ae1857b0dde90c76230e45ac90f9a3530ba17cce9e3b63ad5874d|
|RandomDestiny|5D4560 / 256|e496c8f4e261345877602ef8a9d0b8d4ae3954e88a77ce691820ea48a23c4024|
|CreateStatesViaProvince|484F70 / 1968|1f33c9bd9cf1f79008d3d034288da25a3f2ac315fe01f42e88ee46c4aefcfe1c|
|CreateStates|485720 / 1456|afdd0adbb4d56ca640670fa781f4ee5c7364c363dad8fb55316b635b4f9ffe13|
|MathUtility.Rn|3EF650 / 128|9c57b77e940b17c912dc2304de8c24435867f392bdb8cff1cdca9f98ecb047e2|
|ToEven thunk|5FD0 / 96|936b0ff6c562eec2d5eabdd4153caf202f8335e754d22374023bd9631ca1bb7b|
|State param ctor|5E2F20 / 2704|faf5efcf5d998fa4c53dc4e7e27c052cc2db9bb4801636796b4bb077900fc1f6|
|State empty ctor|5E2510 / 2576|e664c6b01c48983c180cab5d495333fd64b541b15e7c582a8a5b21cd834c96fe|
|PlaceState|446B60 / 1488|4d5f224631b0248d3976620bd4e863f8161f87e2d282b45b6ac8c7f1f93a2de6|
|TryRebel|45C160 / 7104|8eedf027618297bd5750881fe267eda88a7f20529742abc7313fbe62e219f43a|
|UpdateNeighborState|5DECB0 / 2720|a56cea9000b45aeb366bfd6846e533a73e9910abafd30c884c3668645e877518|
|UpdateStateLandFeature|5E0CD0 / 528|a2b0767e757884607c9dfbfa8744f13539500d7ecc7ce3538e3772962b49cfa3|
|PostLoadSaveData|5D3B50 / 1504|2fc0da7b0039efbe0fe0eee66c9f99517c25713b3d28cb34cc876ec8e8f5632f|
|List get_Item|13E2D10 / 80|1ea465086cc83b21e9a4a9cf65817a8ed67cb496ec474c7d74006a36479a60c7|
|LoadTraitsFromJson|527F70 / 288|95b4e9a813f9a364cbe594c495d800305fb46ab00bdaffe4b8d0040079c3d75b|
|InitTrait|5D04F0 / 2112|db4b59b9ef3109efca83b750cd1e47ec7fb1dad4029c6e64e840935b274bc11a|
|GenerateStateProperties|3D2DA0 / 240|b3c07cd72c7b3a02d158c686073e2f1cec9bb84940499b38ac7627b866c00dfc|
|GenerateTraitsForState|3D2E90 / 1440|574de9d70132b6ea8c513fb98fc1ddcf36c2fa537bc3982c8a3c8d543f3616df|
|GetRandomUniqueTraits|5273F0 / 352|44eb5b696557d536f11b26c942882011da33efef4962780badef1a1aa9099078|
|GetTraitWeight|715580 / 144|41ad2a3f079d222a68abdf376d066b712b7d12de6d2e894963d92cb156b8cb65|
|ApplyTraitEffect|5BFFA0 / 480|3705d7634189d7bf591a811a788c0e9ab74221053c0bf3f2cd3cc4f381a0dd1b|
|Trait.ApplyEffect|528750 / 464|97734fb8a2ad7c1f302173c57a1dd97446c603d62b15a3675b33ef4013aaef7d|
|SetPropertyValue|5D86E0 / 592|e3c1d7a14de79dfc96539028adf561e8d85f3ad86fb95561d25cbd04670ef1b4|
|AddTrait|5BEBA0 / 240|46b6aca67a511cf5fb459f7ea0cac9f555fdd0219bffd0a0f862ebdbf69ab42c|
|RemoveTrait|5D6B30 / 240|a24b3e6c35c73d699737cfbe88a99a09f487eb454bc0f45399915530ec5b087b|

## 下一批直接生产桥接

不要重拆以上已核函数。先冻结现有v29和独立新版本，建立持久国家扩张/外交点数/双战史、关系、CB与完整目标字段；旧档通过明确副本才能升级，未知旧史保留unknown。复用当前实际文化/政体/人物数据，补真实水省图，区分原作海邻资格与可执行航路。替换新版本AI后，必须把理由/目标和实际战争结果接进Worker/UI，检查预览取消、保存刷新、冲突保护及固定海峡/岛屿场景。完整联盟、附庸/改宗、内战仍不能由本批片段宣告完成。WEB-03-06及新全项目审查继续按原队列。
