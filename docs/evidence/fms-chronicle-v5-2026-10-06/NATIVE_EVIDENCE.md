# 本轮原作只读证据与适配边界

范围：用户授权的 D:/steam/steamapps/common/FantasyMapSimulator；未启动原作、未写安装目录、未读认证/SDK/个人存档。安装对象为 Windows PE / Unity IL2CPP29。图片中的元数据→单函数恢复→编译→联调步骤按此格式适配，不宣称存在 ELF、DWARF 或 hk4e 服务。

## 君主任次

StateManager.AppointLeader RVA 0x506C10..0x508270，5728 字节，SHA256 `56057b62c51715af0341fdf0c6261bed001b24b520c61c1116e3fa5358f1f71c`。State.currentLeaderRecord 偏移 0x2F8、leaderHistory 0x2F0、LeaderHistoryRecord.leaderOrder 0x28。空历史写 1（0x507A19）；非空调用 Max（0x507AF5）后加 1（0x507AFA），在 0x507B1D 写新记录。选择器 0x5172D0 在 0x5172D9 读 order。未出现同名过滤；非 initial 继承创建 LeaderAscensionEvent 并 RecordEvent。

GetLeaderOrderSuffix 0x5CD7C0..0x5CD890，208 字节，SHA256 `e2149f9ac806c09e56c6bdfb398c10c1b37ee7f9b04b125f741c3eb062a21c31`。Federation/Republic 返回 Session，其余返回 Term。中文翻译和完整 UI 拼接未恢复，因此网页明确用“第 N 任”，不把总任次当作同名王号“几世”。restorationCount 是国家复国次数，未当成君主任次。

用户本轮明确选择“王号几世＋国家第几任”。网页在上述原生总任次基础上，另加独立的 regnalName/regnalOrdinal：本国首次使用一个王号从一世开始，沿用或复用旧王号接续其次数；其他国家单独计数，复国不清空本国王号历史。政治面板可自定义继任王号，前后君主的名字、两种编号与地点存入真实史书。此同王号计数是用户要求的扩展，不标作已从原作恢复。

## 人名数据

只提取 `FantasyMapSimulator_Data/StreamingAssets/Base/Culture/EasternFantasy/` 下三个 CSV 的 Key 和 Chinese 两列，输出 `src/fms/play/leader-names.json`；没有整包复制 CSV、多语言或原始分析 dump。CultureData 为 LastNameFirst。

| 文件 | 记录 | 原文件字节 | SHA256 |
|---|---:|---:|---|
| CharacterFirstNames_Male.csv | 90 | 9515 | cfe574ce71959e95a4ed3831549e4c4efa2e596660622afaa48bf4f3f0ff4544 |
| CharacterFirstNames_Female.csv | 90 | 9407 | 673fd7fa8eda430a9fc1f15e2985d6e4197028661c1729c55850626e94b2fb3f |
| CharacterLastNames.csv | 80 | 7155 | d31684ad538ac31c0481c49f150805e3ea8bc590a6285406e9ff99a962b1d24f |

使用依据为用户声明作品归属并授权复用；CSV 内无单独许可证，不声明公有领域。人物选名、12—25 年交接调度、保留家姓是网页适配，非完整原作家族、生死和继承公式。

## 消息与地方事件

MajorEventMessageUI 有普通/高优先 Queue<string>，HighPriorityDisplayTime=8、Normal=1；AddNormalMessage 0x3C9220、AddHighPriority 0x3C8F10、DisplayMessages 0x3C95C0。抢占、去重、暂停、定位语义未恢复。网页保留高优先队列，采用240ms淡入、支持减少动态；历史持久化独立于顶部限长队列。

原作叛乱常量含30/13阈值、.35基础概率、24月内战抑制、18月家族/.1率、36月战争上限、5个基础叛军、26月冷却、3月增援；检查间隔12/18/36。已知入口 ShouldCheckForRebellion 0x5D8EF0、Process 0x5D4130、TriggerProvincial 0x5D9C10、Province.TryRebel 0x45C160。完整条件组合未恢复，不以单个常量冒充复刻。

本轮有限玩法：上帝预览确认传位/地方起义/和平独立；自动起义只对持续被征服至少360日、压力100、月检及冷却/人口/国家与陆海合计军队上限均允许的地区触发。创建真实国家和城市首都、转移一块辖区、建立外交及账本、动员扣当地人口；完整附庸/家族内战/联盟不包含。覆亡按实际控制辖区归零记录；残余军团与历史城市保留。上述均为明确网页规则。

## 地理显示

每片实控连通领土分别标国名、失守/灭国取消有效首都标记、40面目标细辖区和一块一城来自本次用户要求及网页实现；未宣称恢复了原作完全相同的划区算法。海岸仍使用相同 Float32 h=20 裁切；不增删陆地、不把海峡接为陆路。原 Azgaar 相关可选生成链未当成默认原生算法。

此文件为原作分析范围和来源记录。实际单元/浏览器/性能检查另记，原作视觉、真机及全游戏等价均待验收。
