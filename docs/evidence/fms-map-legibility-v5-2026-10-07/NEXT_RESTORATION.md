# 已恢复复国领袖，下一批接真实省文化与国家身份

根唯一写入，代理只读核对原安装包既有分析材料。没有运行原作或读认证/SDK/个人存档。原DLL与完整dump不进入源码/产物。本批原函数模块无生产调用，不计作现有试玩已有完整家族。

## 已落代码

`src/fms/play/native-culture/restoration-leader.ts`、对应测试：

- 原 HandleRestorationRebellion 4559E0 保序查当前家族字典的首个同国统治家族，不使用历史家族字典。该家族无人不继续找第二家族。
- GetLivingMembers 84A9D0 按 memberIds 保序/保重复，保留存在、存活、当前 familyId 相同者。get_Patriarch 5E3B40 只按正ID查询，不加额外年龄/生死/同家族检查。
- 原族长活着直接任命；否则再查询一次活成员。Where462940 年龄16至60含边界；OrderByDescending462970 男性优先；ThenByDescending462990 按当前魅力→军事→行政getter依次取值，得 f32(Admin+f32(Military+Charisma))；ThenBy4629F0 按abs(age−35)升序，平局保成员顺序，无随机或女性继承开关。
- 保留第二次成员列表变空、原族长引用非空时仍任命该引用的原控制流。不把原有异常边缘“优化”为另一规则。
- 另选成功才更新族长ID，然后写国家leaderId；失败回调完整 InitStateSimulationData(true)，不误称仅创建一家族。

首轮13项通过后，只读审计提出每个getter返回值本身先按float32归一的边界：双精度1+2^-24参与加法会改变平局赢家。已修并增加明确回归，最终本模块14项，加原起义名字/身份25项共39项通过。原始13报告与最终39报告分开保留。有效能力深层来自已存在原人物能力核，当前模块使用显式getter接口；初始化深层、配偶/子女/贵族创建尚未接线。

## v19最小接线合同（继续执行，非另开计划）

1. 先冻结v18指纹闭包与原存储。新局/明确副本持久保存每省文化；从已保存城市命名文化初始化，不能占领后按controller重算。副本保留v18原六文化元数据，不再调用会清key/改东方文化的legacyNaming。
2. 原TryRebel命名只用于起义，和平独立另保网页合同。事务内临时命名对象决定新国或历史ID，然后分别提交；禁止先完整新建再只删world.nations导致侧表残留。省名兜底读取真正省名，不用城市名。用户改显示名不等于原自定义格式开关。
3. 历史ID保留国家/色彩/命名来源/君主历史/人物官职/政体/国运/财政账与第三国外交；任命与清ended只做一次，避免紧接reconcileSovereignty再任命。首都恢复方案需明确后才重算财政距离。
4. 现文化secession校验强制同父文化须仅在v19替换。原父军清理只限起义省，外地/运输军队不可误删；新叛军ID需避开存活/覆灭/运输记录。原精确上层生命周期尚未完全接入处继续标明网页适配。
5. 新v19/Store21独立库，旧命令交旧session；worker增量/client必需字段、gameStamp、combat-edit旁路、每tick context同对象更新、UI实际规则预览均要覆盖。保持双槽未来schema优先拒写、CAS和原子恢复。

定向回归覆盖：异文化占领/改省名后起义；新国表只增一次；历史复用零临时ID残留、历史/金币/第三国关系不覆盖、只一任君主；旧叛军在陆上/运输/覆灭的ID冲突；50国时可复国不可新建；自动/手动同入口；失败事务不改原run；v18原样与v19副本/双槽未来/CAS保护。

相关现入口：naming18-politics.ts:secede/reconcileSovereignty，naming18-session.ts:political/wrap/combat-edit，naming18-culture.ts:reconcileCultures/assertCulture，naming18-storage.ts。UI FmsGame和ChroniclePanel尚用旧previewPolitics，要按actual版本分派。不要重复恢复本页已闭合函数。
