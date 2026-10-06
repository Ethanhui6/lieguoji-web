# v18 多文化命名的生产合同与边界

2026-10-07；父提交 92b6309d7f4c5a2bed90ad27e30637b91156d4cd。根唯一写入，三代理只读。WEB-PH04 / WEB-04-13 与完整 Goal 继续。

## 已接入的原作合同

- 已授权安装包六文化、5085行、14语言词库来自上一提交。本版界面和实际命名使用 Chinese 列；保留 source key、baseCultureId、mapCultureId 和人物 first/storedLast。原数据与原独立核见 ../fms-culture17-v5-2026-10-07/NAMING_KERNEL_PROGRESS.md。
- 新局默认 Ciestundu / Leffathou / Oeczea / Wristhos；可选另外 EasternFantasy / WesternFantasy。国家文化种子采用无放回抽样，非种子按原 float32 最近首都采样距离分配。实际原作 burg.cell 在网页由首都行政中心最近的实际 f32 陆地样本代替；不是原作地理布局逐位等价。
- 建图国名、城名池依照恢复的 InitCultureNameSet：随机 value 稳定排序，国家池耗尽不重抽，城市溢出在全池有放回抽样；对应语言查名。先给实体命名，再生成常备军事件、初始君主、史书、人物和首次财政。
- 人物 first/last 的性别池抽样、家族姓氏与姓名顺序使用原独立函数。原始姓氏与有效家族姓氏分别保存；姓名在传位、复国或新国史书写入前决定。
- 六文化原族群权重真实参与新局与财政；族群编辑仍是已有上帝干预，不是文化同化系统。

## 明确的网页适配，不能宣称原作等价

- 地理种子和随机流来自网页可复现 seed；没有复刻 Unity 全局 RNG 消耗顺序。全部已启用文化都有稳定 map-ID，包括当前国家数量少于文化数时尚未使用的文化。原作只注册实际有效陆省的文化。
- 本批分裂新国仍沿父国文化并使用建图池产生国名。只读审计已确认原 State.RandomInit 0x5D4660 有不同路径，正在闭合 CreateRebelState 的后续覆盖；当前 newStateName 是暂时网页桥，不能标为原新国命名完成。
- 创建国家时建立最小家族姓名记录，传位保留现王朝，是现有网页王朝桥；没有原完整亲属树、候选继承、婚姻、年龄死亡。沿用旧12–25年任期及用户要求的王号几世/国家任次，不能称原生命周期恢复。
- 已有城市名保存创建时文化，不随征服改写；玩家改名将来源改为 custom/key:null，历史快照保持。旧版显式副本名称用 legacy/key:null，人物 first/gender 为 null，不伪造源词条。

## 保存与执行边界

- 先冻结原 v17 12源，旧指纹 a06cacce3adba1ef788ea87e7d11607f7e673141aab5b8e8648da4f699fa885f。v18 用独立 Store20 / lieguoji-fms-naming-v18，普通旧档继续旧规则，显式副本才改变 run ID。
- 普通命令降到 CampaignSession 后只调用新 naming18-politics，避免旧政治路径偷偷生成东方人名。Worker tick 必须含 naming/new-culture/people/finance/upper/chronicle/reorganization；缺失拒绝，不沿用陈旧状态。
- current/backup 任一未知字段或未来规则锁住整个目标库；已知损坏可从有效备份恢复。保存保留 chosen previous、完整 slots CAS、事务失败原子性和超时不迟到写入。
- 君主文化必须与所属国一致，分裂记录必须沿父国文化，城市不施加“跟随当前控制国”约束。
- 仅本地验证，无上传、push、main 或 Pages 触发；全部旧站、旧档和发布锁保留。移动仿真、静态反汇编与本机浏览器均不能代验真机/用户视觉/原作运行对照。

## 本批发现并修复

1. 分裂国的 naming 与 culture 可协同伪改到另一已启用文化，却留下原文化君主。增加所属国/君主和分裂父子交叉校验及明确回归。
2. 网页首都最近采样使用 double，实际网格为 float32；边界等距时可能选择另一点。先转实际 f32 再选最近点，增加稳定等距回归。
3. 初轮旧档副本测试误改共享测试 view，导致测试自己污染被保存对象；改用 clone 投影，保留完整比较。首轮报告不删除。
4. 新几何测试传 number[] 不符合 Int32Array 类型；类型检查真实失败后修正 fixture，未放宽源类型。
