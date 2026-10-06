# 下一批原作合同：文化族群与人物生命周期

2026-10-07，只读原 Windows IL2CPP GameAssembly.dll。SHA256 d42658a922155f6cc60295a64c02207e5eaa1d3a55fd5ed18dc8ecc562f9b82b。以下是静态恢复证据，尚未全部生产接线；v16仍只记录观察到的君主，不假定其出生、年龄或死亡。根唯一源码写入，代理按每批1—3函数只读。没有运行原作、读取私人档或认证配置。

## 文化族群抽样

- EnsureEthnicAttributeWeightsInitialized 712330：字典null在712625异常；非空早返7123E5–EC，不补部分键、不替换零/负值。只有空字典才Enum.GetValues(0..4)依次插入50f，712471常数/712556 Contains/71257A–F set。
- GenerateEthnicAttribute 3D2640：3D275F–278B复制权重字典，按原Keys枚举序筛严格正的f32权重；不排序。空候选3D293D调用整数Range(0,5)；非空3D2977调用加权助手，默认枚举Agriculture=1。
- 五枚举严格为FishAndHunting=0、Agriculture=1、Nomadic=2、Maritime=3、Commercial=4。原枚举无Other。
- 加权助手C52FF0：null/empty返回调用者默认。LINQ Float Sum使用double累加各float再转f32（共享C1A100→1B7E260）；选择器D63890在D63899读取weight+14。C531EF抽float Range(0,total)；累积每步f32，C53281–86用累计>=draw命中；均未命中则C53310–1E返回第一项，不是最后项。
- GenerateStateProperties 3D2DA0：依次Ensure政治712750、族群712330、特性712A50；生成政治→3D2E30生成族群并写State+D8→非Douyin生成特性→UpdatePoliticalSystemAttributes 5DF750。该路径未观察地形/人口/宗教/君主影响族群抽样。

实际原StreamingAssets/Base/Culture/<id>/CultureData.json使用字段EthnicAttributeProbabilities；六份权重如下。现有culture-content-pack未提取权重，不能据此声称原数据为空。此数据可直接复用；JSON到运行时Weights的装载桥仍在只读核实。

|文化|渔猎|农业|游牧|海洋|商业|
|---|---:|---:|---:|---:|---:|
|Ciestundu|40|50|5|0|50|
|EasternFantasy|50|50|50|50|50|
|Leffathou|90|40|10|0|60|
|Oeczea|70|20|0|100|100|
|WesternFantasy|50|50|50|50|50|
|Wristhos|40|10|100|0|65|

六文件SHA分别53d155d9030cece55630b463775bba07f00b2ce41500ea0f7f8c8539f063ea7e、d85915aac4dbdb5a49d43d491b5fc7f92de0c8c48f0eea06805e679e5bccb52d、d1417461a04b67bfcc79359112f5a3ec78807c7a00afea6a677b821e85a44173、053e091a9d83b86f1d963d5cb11c0658f15a3df25dbb8c2258da440cc12d7235、1b6f0123d551f974dce5a4b2f37b4beb2d7d90cbbe217627cb34f47db40a1cc7、36cc4c2fca2d464a7a2bd55704b5ef58bb022608f278720bf8a8784e082f1808，均与既有manifest相符。WorldII对应CultureData.json定点不存在，不能猜默认文化或扩大扫描。

## 月龄与自然死亡

AdvanceMonth836DC0–837180先取存活人物快照，每人再次检查alive，调用GetYearSince(birthTime)523680，83702B写age，再调用ProcessNaturalDeath839920。不是age每月加一。当前月为12才CleanupOldCharacters837F00；每月结束都会新建死亡统计。

CalculateNaturalDeathProbability837BC0–837CA0：每个SSE运算四舍五入f32，年龄int32减法后转float。a<40概率0；40..60为((a-40)/20)*.002+.0005；61..70为((a-60)/10)*.01+.0025；71..80为((a-70)/10)*.02+.0125；>80为min(.1,(a-80)*.003+.0325)。分段边界不自行平滑、无固定必死年龄。

ProcessNaturalDeath839920–839B80即使概率0仍抽一次Random.value；严格roll<probability命中。命中后总死亡数+1、记录f32年龄、更新年龄档，再调用Die83AEB0，返回true。存活校验在月调用者；此函数不自行检查alive，也不直接清人物。年龄档的具体字段合同仍须回原证据，不可先补猜统计。

GetYearSince523680–523720：start=GetDate(传入double)；end=GetDate(double(gameTime float))；NodaTime.Period.Between(start,end,Years=1).Years。不是固定360/365天除法。GetDate523400已识别：q=double(time)/double(secondsPerDay float)；NaN返回startDate，q<=INT_MIN返回最小支持日期，q>=INT_MAX返回最大支持日期；否则向零截断int后GetDateByDayCount522CC0。日期基准/加日/夹限依赖未闭合，不能将网页recordedDay转成原生日。

## 死亡与历史清理

Die83AEB0–83B880按序：isAlive=false；deathTime=double(gameTime float)；spouseId>0且对象存在则清对方spouseId，保留死者自己的配偶引用；缓存领导人关联国家（来自NationalLeaderRole.stateId，不是人物stateId）和是否族长；DismissAllForCharacter(character,"death")；若有领导人缓存且国家存在，取剩余领导角色的Role.startTime算reignYears，找不到则0，记录LeaderDeathEvent(...,"natural",...)到全局与国家史；剩余活动角色转PastRole(...,"death")并清空活动角色；最后TryResolve(state,deceased,"death")，再处理族长继承。

Die入口无重复死亡保护；不删人物字典、不清亲属/国家字段、不改基础能力。角色筛选谓词84F9D0/84FA50/84FAD0、PastRole构造、家族继承仍未展开。不可把任期结束当死亡。

CleanupOldCharacters837F00–838530先取当前所有historicallyImportant人物的字典键（不论生死）；删除条件为已死、GetYearSince(deathTime)>=10、本人不重要、配偶/父/母正ID不在重要集合、children无重要ID。仅直接向外关系，不递归、不因普通存活亲属保护。收集后Remove(character.id)，不清其他反向引用、不重置ID。

## 生产前剩余依赖

DismissAllForCharacter8820D0遍历筛选国家，EnsureGovernmentOfficeData后取匹配assignments快照，再逐个DismissAssignment882810(reason)，返回成功数；本体不直接清角色。TryResolve891750先拒绝死亡/空白/不可征服国家；previousLeaderId取调用时state.leaderId；handler后changed=(leaderId>0&&leaderId!=oldId)。只有handlerTrue且changed返回true；handlerFalse但已changed保留新ID、返回false；未changed才警告并清leaderId。不能提前清旧leaderId，也不能false就清现任。具体handler、DismissAssignment、GetDateByDayCount仍待下一窄批。

下一实际开发先落独立族群抽样/死亡概率与清理纯函数；与v16生产指纹隔离。接线先冻结v16、新版本/明确副本，不把尚未闭合的继承和日历伪装成原作等价。

## 后续窄批已闭合的装载和文化身份

LoadCultureData71B700从dirPath/CultureData.json解析，目标是manager.culturesDictionary+20按cultureName取出的既有对象。71C207读取EthnicAttributeProbabilities；缺字段跳过，不清旧字典；属性依次Enum.TryParse（失败跳过）→ToObject<float>→setter715FF0。setter716023–38逐项夹0..100，NaN不改，不校验枚举、不归一化。当前六份数据经setter原值保留。

GetAllEthnicAttributeWeights713EE0在713F1C/3D返回新Dictionary(source+88)，不Ensure。CloneCultureData3CDC30先new CultureData(newName)，3CE0C0取此副本并按枚举序在3CE157逐项调用setter；非指针别名，无排序。MapCulture构造3D8F40先GetCultureData(referenceName)，缺则FindBestMatchingCulture3D2090后再取，仍缺new CultureData；最后依次Ensure特性/政体/族群/官称。CultureReferenceName+18此构造只写空，不自动持久传入的referenceName。未知基础文化构造初值/模糊匹配仍未闭合。

InitCultures3CBAD0清地图文化字典，按输入HashSet枚举各mapName；FindMatchingCultureReferenceName3CAEF0找到reference则构造(mapName,reference,true,true)，找不到则(mapName,mapName,true,true)，均Add(mapName,instance)，末尾updateIndex=0。

FindMatchingCultureReferenceName：先GetCultureData(mapName)非null就返回原串；否则按当前启用列表，对每个候选依次比当前语言GetMapCultureName、语言非English则比英语名、再比CultureNameID，均OrdinalIgnoreCase，首命中返回候选Key。启用列表无命中则对GetCultureNameID列表重复同规则，最后null。GetCultureData719B10只查基础manager字典TryGetValue，不筛enabled、不查独立mod表。GetCurrentEnabledCultureNames719CE0枚举基础字典，value.isCurrentEnabled+50真则加入Key；不排序/加权，不读modCultures。默认启用选择仍是外部输入，不声称六份默认全开。

GetRandomCulture71A000对上述当前启用列表非空时整数Range(0,count)逐项均匀抽样，空则null。State.RandomInit5D4660选文化后只有可用国名列表非空才把返回字符串写cultureName；列表空明确写空并直接InitTrait，不重试其他文化。InitTrait5D04F0仅按cultureName直接查地图字典，不能把baseKey自动映射另一个mapKey；不匹配会走无文化族群回退。网页若明确map/base配对后赋mapId，属于需标明的适配，两个ID必须分开。

## 后续窄批已闭合的日期与君主制流程

GetDateByDayCount522CC0调用startDate.PlusDays(dayCount)。只捕获ArgumentOutOfRangeException/OverflowException，按dayCount<0返回最小支持日，否则最大；其他异常重抛。startDate初始化、支持日期实际值和NodaTime日历实现仍需明确输入。不可用现有网页30日月替代原年龄历法。

DismissAssignment882810先Ensure→从国家任职表Remove（失败false）→MarkDirty→查holder（缺人物仍true）→OfType政府角色首匹配或CreateRoleMirror→PastRole按谓词去重并规范化时间→RemoveAll匹配角色，成功true。空原因改dismissed，death保留。本体不写leaderId，但Ensure/MarkDirty/角色匹配谓词仍需闭合副作用。

HandleMonarchySuccession88EB70：统治家族存在且previousLeader.familyId匹配，才FindSuccessor；返回null/旧人不匹配时SelectFamilyFallbackCandidate。候选非空但死者不会补本家fallback。活人AppointLeader(旧人有则hereditary，否则emergency_hereditary)，立即检查新正ID且不同，失败不换候选。无活人则其他家族按CalculateFamilyEmergencyScore降序首家族，先SetRulingFamily再取该家族fallback活人并任命emergency_dynasty；可能改家族后失败，无回滚。没有替代家族/候选为空死者才HandleDynastyChange。具体FindSuccessor860DE0、fallback890150、AppointLeader506C10、家族评分/王朝更替未展开，不补猜长子或能力继承。
