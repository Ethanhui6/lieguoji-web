# ADR 0011 — 大陆生成、区域约束与显式草稿副本

状态：**已采纳，PH06 实施中**（2026-09-24）。PH05 已完成；首批大陆闭环通过功能验证，实际外观未通过。正在接入独立山系/盆地配方；本文是合同，不提供功能或性能通过证明。
范围：PH06-T1/T2 首批大陆与连续高程闭环，以及后续 T3/T4 必须遵守的格式、锁、局部生成和原子性边界。
任务与证据分别以 `plan/tasks.json`、`docs/AUTO_HANDOFF.md` 为准；PH00—PH35、真机和用户视觉门通过前保持本地发布锁。

## 1. 决策与首批范围

沿现有 TypeScript/React/PixiJS、Atlas Worker、共享地理与 IndexedDB 实现演进。使用 v2 manifest 封套，保留原四层 LGAB v1，不另建一套存储事务、Renderer 或 Studio。
首批闭环：新建 v2 空白草稿或明确复制选定 v1 时点 → 真实参数生成 → 实际候选地图预览 → 确认或取消 → 普通地理编辑与撤销 → 保存刷新恢复。
PH06-T2 的山系、盆地、岛链仍须独立实现和验收；连续高程的局部交付不能标记整个 T2 完成。T3 细海岸及 T4 局部生成/锁 UI 同样保留。
首批大陆配方为 `macro-landmass`，后续独立山系/盆地配方为 `landforms`；当前只开放 `world` 作用域。尚未实现的 recipe、局部操作及其按钮不得伪装可执行；增加能力前补齐严格格式、算法和验收。
社会模拟、国家、城市、家族、信仰不作为本批前置空结构。原 0.4 引擎、真实存档、正式 CANON 与测试大陆的区别保持不变。

## 2. 固定参数与独立地理判定

首版宏观大陆参数均为安全整数，固定以下设计范围；范围是输入合同，不是已测性能或每个组合必然可满足的承诺：

| 字段 | 范围 | 语义 |
| --- | --- | --- |
| `majorContinents` | 1—6 | 宏观配方输出的独立陆地连通分量数 |
| `landCoveragePermille` | 150—650‰ | 真实 quad 面积计量的目标陆地比例 |
| `coastWavelengthWorld` | 128—1024 世界单位 | 海岸连续变化的空间尺度参数 |
| `reliefMeters` | 200—6000 米 | 连续地貌起伏参数，不突破已有高程合法范围 |

海洋由最终权威高程 `<0` 判定，陆地为 `>=0`；不保留会与高程矛盾的第二份权威 land mask。
验收器从最终地块及真实共享边邻接独立遍历连通分量，不能采用生成器内部种子数、增长标签数或截图颜色数。
仅共享顶点的对角接触不算陆地连通，跨海距离接近也不算连接。首版宏观配方没有独立岛链例外，全部陆地分量都计数，结果必须等于 `majorContinents`。
不得忽略小孤岛、暗中填海连接大陆或修改声明数量来通过检查。后续岛链配方须先另行固定大陆/岛屿分类规则，不能反向重解释本配方。
面积由最终共享顶点计算的真实 quad 正面积求和；可用定点坐标的双倍面积整数，避免引入浮点容差。
令 `Aland` 为陆地面积和、`Aworld` 为全图面积和、`Amax` 为该图单个 quad 的最大面积，必须满足：
`abs(1000 × Aland - landCoveragePermille × Aworld) <= 1000 × Amax`。
即允许至多一个实际最大地块面积的离散误差，不用固定百分比、算法自报目标面积或事后加大的阈值替代。
参数、海峡、连通性、锁与面积目标无法同时满足时，返回可解释失败并保留基线。不得在失败后放宽范围、误差或质量判定。
海岸尺度必须作用于绝对世界坐标的连续场或连接骨架，不作为逐格随机颜色强度。地形变化先形成真实整数高程，颜色仅为显示派生。

## 3. manifest、配方与来源

v1 manifest 的 exact keys、规范字节和 hash 语义保持不变。v2 保留共有的身份、名称、seed、revision、spec、catalogs 和四层 blockRefs，新增且仅新增以下受保护字段：

| 字段 | 最小内容 |
| --- | --- |
| `origin` | null 或版本化副本来源：源格式、draftId、主/备槽、固定 manifest 摘要及修订、当时完整根摘要 |
| `constraints` | 已知格式/版本、`cell-lock-mask-v1`、规范有序 `{bx,by,hash}` 引用 |
| `generation` | 已知格式/版本、`lastApplied: null\|LastGeneration` |

`LastGeneration` 保存实际 recipe、实际 scope、baseManifestDigest、baseRootDigest、baseRevision、lockSetDigest、appliedRevision。
recipe 采用精确字段：格式/版本、已知 generator ID/version/fingerprint、独立 seed、上节四个参数。未知字段、版本和非法数值拒绝写入。
现有 manifest.seed 继续表示原共享网格抖动种子，不重新解释，也不塞 JSON；生成种子独立存于 recipe。
种子使用明确字符串编码，非空且有界；随机序列不依赖 UUID、墙钟、帧率或批次调度。不得悄悄改变已有种子的文本含义。
fingerprint 由实际算法、PRNG、参数规范及确定性依赖闭包生成并校验；静态注册已知实现，不接受存档指定脚本路径，不拿 Git 提交号或手写假常量代替。
新空白/显式副本的 lastApplied=null；确认生成后记录真实来源。之后手改保留该记录并说明已有后续编辑，不声称当前全图仍是原配方输出。
未应用的表单设置不是生成来源。最终 manifestDigest 不写入其自身，避免自引用 hash；确定性比较地理内容，不要求随机草稿或命令 ID 相同。
四层 blockRefs 仍为原顺序和 `4 × across²` 数量；锁不占 sim/admin membership。首批允许只改高程，细海岸移动留 T3，不能声称增加采样精度。

## 4. 区域锁与局部操作

锁为独立 `LGAL v1` 内容：精确已知头、块坐标和固定 1024 字节 Uint8Array；位 0 为海陆/海岸锁，位 1 为高程锁，未知位、保留字段或尾随字节拒绝。
lockRefs 按 by/bx 排序且唯一，只引用非零块；已知格式明确缺失坐标为全部未锁。缺少被引用块、坏 hash 或未知 codec 绝不能当作未锁。
海陆/海岸锁保留地块分类及相关共享边界顶点；高程锁保留准确整数米数。保护值就在权威地理块，不另存一套会过期的锁定地形。
共享顶点必须检查所有 incident cells，不能只检查 owner 块；普通手改和生成都遵守锁，修改受保护内容前先明确解锁事务。
lockSetDigest 覆盖已知 codec、规格身份和有序 refs 的规范编码，不取 Map 插入顺序或对象 identity。
后续局部 scope 先支持有界 cell rectangle 与明确 transitionCells；只有实现、校验并登记后才可执行，首批不能接受此尚未实现的分支。
局部使用同一绝对世界场，scope 外与锁内为固定边界。过渡带计入明确写范围；不得越界平滑、移动相邻岸线或重掷整图。
地貌操作默认保海陆；岸线或岛链改变分类必须明确说明。局部命令不能宣称满足全世界 N 大陆的目标。
未知 recipe/fingerprint/锁 codec，或主备中出现未来内容，都保持写保护。可读的已知地理只读查看不意味着可丢弃未知元数据后保存。

## 5. 封闭的 v1/v2 持久实例

同一事务机制采用两个静态已知格式实例，不开放任意 DB 名、领域或加载回调。旧导出 API 默认 v1，旧行为与旧 fixture 字节不变。

| 实例 | 数据库 | IDB schema | 领域 | 内容 |
| --- | --- | --- | --- | --- |
| v1 | lieguoji-atlas-drafts-v1 | 1 | atlas-draft-v1 | 原 manifest 1 / LGAB v1 |
| v2 | lieguoji-atlas-drafts-v2 | 1 | atlas-draft-v2 | manifest 2 / LGAB v1 / LGAL v1 |

v2 是新 DB，不升级、清空或重写旧 DB。保留 blocks/manifests/roots/preparations/receipts/meta 六个 store；锁 blob 使用独立已知 kind，不能伪装地理 block。
根结构可保持原字段和结构版本，以明确 domain 区分；recipe/锁由 manifest 摘要覆盖，不重复塞入根。所有记录的领域随已知实例绑定。
扩展完整内容枚举：readContent、主备核验、保护原像、分页、stage、final commit、引用量和容量账均包含锁，不仅写入入口包含锁。
复用 `prepare → stage → final CAS`。每片编码包含封套不超过 512 KiB；候选分段不等于分次生效，最终仍只在一个 readwrite 事务原子切 root/backup/revision/receipt。
最终事务重读完整根及主备/候选受保护原像、检查引用和容量；不在事务内 await WebCrypto，不凭事务前核验放过 CAS。
保留 128 MiB 独立库逻辑上限，未发布暂存计量、不自动清理未知引用。两个库不等于全应用只占 128 MiB，不为新库删旧存档。
普通编辑继续遵守 1024 cells / 4096 vertices / 128 KiB 预算；v2 local 路径增加锁与元数据保持核验，不能把所有小笔划退化成全图重算。
已提交但响应丢失通过原 commandId/receipt 查询，禁止新 ID 重试而重复轮换备份。迟到取消不能把持久成功报告为回滚。

## 6. 显式复制与格式路由

v1 只通过明确的“创建可生成独立副本”进入 v2。按现有固定读取句柄核验所选主档或备份，私有复制后在 v2 新 draftId、revision=0 上提交；来源不写。
origin 记录所选 manifest 的修订，不拿当前 root revision 冒充备份修订。沿已有 fork 保留 atlasId 与稳定地块/顶点 ID，新建地理才分配新 atlasId。
复制不是跨数据库原子迁移。源另标签变化时只能按已经钉住并验证的时点完成或明确拒绝，不能悄悄改抄新 current。
取消、失败及成功均保护源主备原像。未知 current 不得靠读取 backup 绕过写保护；副本也不得吞掉未知数据。
URL/目录携带已知格式，例如 atlas-format=2；旧链接缺失格式继续 v1，未知值拒绝，不靠 UUID 猜 DB 或读不到后轮询别的库。成功提交副本之后才切持久路由。

## 7. 真实候选、确认和取消

Worker 同时只持有一个私有生成候选。previewGeneration 绑定 commandId、expectedRevision、完整 expectedRoot、recipe、scope 和实际锁摘要。
预览回执包含 candidateId、基线身份、recipe/scope/lock 摘要、候选 manifest 摘要及真实变化统计；previewDigest 绑定这些字段，不是可随意复用的按钮令牌。
候选地理通过有界流式副本接收，bridge 独立验证所有格式、内容 refs/hash、基线和候选绑定；不能 detach Worker 权威缓冲区，也不能接受主线程提交“已算好的权威世界”。
流式头明确区分 durable 与 generation-preview。预览没有持久 root，不伪造；v1 地理块上限1024不变，v2 分别检查地理块与锁块，完整内容最多1280。
预览真实显示候选地图并可平移/缩放/点选检查，同时显示“尚未保存”和实际影响。AtlasClient.current/head、已保存 root、URL 与 committed acceptedRevision 保持基线。
Renderer 复用现有缓存/索引/绘制，显示来源显式为 committed 或 generation-preview。几何读取共享小型只读视图，完整 codec/hash/存储仍保留真实版本，禁止强转 v1 绕过验证。
Readonly 类型不代表 typed arrays 不可变；所有权、复制与摘要验证仍必须落实。诊断也区分预览与持久画面，不能拿预览 hash 当已保存结果。
confirmGeneration 再核验候选/基线/摘要，从 Worker 保留的候选走全量原子提交；期间其他写操作互斥，外部标签冲突仍由最终 CAS 拒绝。
运行中取消使用真实 AbortController；预览已完成后的取消使用明确 discardGeneration，并恢复原已保存画面，不能依赖无 pending 时不做事的 cancel。
确认成功顺序为 durable receipt → Worker publish → bridge 独立核验 → 正确画面 → 已保存状态。第 N 片失败、quota 或提交前取消不换根。
提交后画面接收/渲染失败保留持久结果、锁后续写入并提供同草稿恢复；不得退回旧画面后声称存储已撤销。
GPU 丢失/恢复保持同一显示来源，预览不能自动确认；候选过期或参数/锁/基线改变后不得继续确认旧结果。

## 8. 算法、撤销与接线

生成采用确定性连接骨架/连续势场、真实邻接增长、距岸场与整数高程；短批按实际工作报告进度、检查取消并让出 Worker，不以耗时决定输出。
临时距岸数组、队列和连通标签无需全部持久化；最终共享几何/高程及生成来源必须持久化，membership/目录与 scope 外内容保留。
大生成撤销是引用已核验旧内容的新全量事务，revision 递增；不得塞进超限 patch 或下降 revision。不能重新 open 会话后静默清空撤销栈并声称可撤销。
v2 撤销条目区分局部 inverse patch 与生成前内容引用，准确保留既有会话边界。完整记录上限 64 MiB，计入该记录的实际 manifest、全部四层块和锁附件编码字节；这是保留逻辑内容，不是进程内存承诺。超过预算的新增替换保持 head/候选/历史原样，释放记录的撤销仍可执行；最多 100 项混合会话记录。完整持久 undo/redo 体验仍按 PH08 独立验收。
接线顺序：exact 格式/已知存储实例 → 空白与明确副本恢复 → 纯生成和独立质量检查 → 候选流式核验/真实预览 → 取消 → 原子确认 → 普通编辑/生成撤销 → 刷新恢复。
每批推进 1—3 个既有子项，完成一批的功能后统一受影响检查；未实施的山系/岛链/局部能力不借第一批证据提前标 done。

## 9. 验收与限制

必须保留旧 v1 字节/hash回归、未来主备/codec锁写、独立连通/面积检查、不同批次确定性、真实预览不写根、取消恢复、原子故障/双标签CAS和receipt恢复证据。
真实浏览器覆盖生成后手改、生成撤销、刷新、候选过期与 GPU 恢复；移动仿真和真机分别记录，性能沿原合同实测，不从复杂度推断通过。
本文固定设计和安全边界，不能代替任何实现、测试、用户视觉验收或正式地图核定；所有未完成工作继续保留在原任务范围内。

## 10. 独立山系与盆地配方（实施扩展）

`landforms` version 1 使用自身实际运行闭包指纹；精确参数 mountainRanges、basins 各为 0—8 的整数，合计 1—12，reliefMeters 为 200—6000。seed 与宏观配方一样明确编码并独立保存，未知 ID、字段、版本、指纹拒绝。

沿现有真实陆地共享边构造山脊，以连续距离场抬升并形成内陆低地；保留全部海陆分类、几何、membership 和准确高程锁，不能跨海桥接山脊。海岸锁不阻止安全的内陆高程变化，高程锁精确保留原值。请求数量无法完成时解释失败，不将部分结果记成全部完成。盆地是实际低地，尚不声称已计算水文或湖泊；这些依赖 PH07。

所有结果仍走同一预览绑定、候选流、原子提交、混合撤销和刷新恢复，界面显示真实生成数、升降地块数和保留海岸。未实现的局部/岛链不能借此扩展提前验收。

## 11. 岛链与真实海岸细化（实施扩展）

岛链配方 island-chains version 1：原样非空seed1—120字符，chainCount1—3、islandsPerChain2—6、radiusWorld64—128、reliefMeters200—3000均整数。原陆地、几何与归属不变，在未锁海洋中放置连续弯曲骨架上的独立多格岛，独立BFS核新增岛总数与原分量不合并；岛间与旧陆地之间至少隔真实海格。最粗128网格也要求每岛至少4连通格，空间不足整条失败，不减少请求岛数。最终majorComponentCount为全部真实陆地分量，不重新解释macro配方的大陆数。候选还会改变岛周海底，后续局部范围必须包括该过渡带。

海岸配方 coast-smoothing version 1 明确没有seed字段，精确参数 strengthPermille100—1000、iterations1—4整数。沿既有海陆共享边，degree2可动岸点读取同一旧轮后整体平滑，固定world边/端点/歧义/受锁incident点。强度为最大目标；若完整候选真实quad校验不通过，从同一旧轮整轮减半、最多8次，报告实际拒绝次数/采用位移除数。不能放宽严格凸性、唯一共享owner或原网格±step/4。全部高程和membership保持不变；不提高采样数、不新增暗中修改的陆格。无岸或稳态返回真实零变化，UI显示保持原图并禁确认。

两实现都以真实运行依赖闭包产生独立fingerprint，未知配方和指纹继续锁写。临时preview的recipeDigest统一使用已验证的规范精确配方JSON编码SHA256；它不是已持久化的历史字段，不改已有v1/v2 manifest规范字节语义。原始来源仍记录在lastApplied。全部新模块须接实际UI、完整原子保存/撤销和刷新后再验收，不能以纯函数单测标整项done。

## 12. 当前近景显示边界

实际960浏览器近景158%仍观察到像素台阶。当前renderer所有terrain/grid都是shared quad绘入RT再Sprite，256规格density上限为1；158%尚可能在medium（near需26px/cell，约162.5%）。即使放大进入near仍未直接矢量绘制，不能把LOD标签当足够几何显示品质证明。T3须在真实near/同相机/实际持久几何对比下验证，并审查受限高精度近景策略；不得仅抬RT/cache预算或降低原PH05性能门。
