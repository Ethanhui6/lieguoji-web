# 生产测试提升材料（未执行、未提升）

本目录只准备可审查文本和提升脚本。没有运行 CPU 单元/type/lint、build 或 GPU，没有修改 production、冻结 ready 或独立旧 oracle。候选 repair-2 的 27/27 仍只对应其已冻结来源；这里的正常 import 版本及七项更新尚须主线生产联合检查。

## 文件与用例数

| 目标 | 本目录审查副本 | 用例 |
| --- | --- | --- |
| 新 `src/world/generation/detail-natural-ranges.test.ts` | `files/src/world/generation/detail-natural-ranges.test.ts` | 10 |
| 新 `src/world/generation/detail-natural-ranges-writer.test.ts` | `files/src/world/generation/detail-natural-ranges-writer.test.ts` | 1 |
| 更新 `src/world/generation/detail-fine-world-relief.test.ts` | `files/src/world/generation/detail-fine-world-relief.test.ts` | 保持 7 |

合计新副本 18 项；连同不修改的 `detail-orography.test.ts` 16 项与 `detail-natural-writer.test.ts` 6 项为 40 项。这是预计用例数，不是已通过数。

两个新增测试只调整了正常相对 import、去掉 `afterAll`/`writeFileSync` 和对应测量记录临时变量、去掉 describe 中的 candidate 字样。没有减少 assertion、更换 shape/seed、修改 timeout 或降低物理阈值。writer 的 `zeroNodes` 原本仅用于文件测量，去掉计数后仍保留每个零岸节点 `elevationMeters === 0` 的断言。父根 ULP 上界和独立父高程对照保留。`oldRelief` 继续从生产测试目录内的独立 preview18 fixture 导入，不复制 oracle 到运行时。

## 既有七项逐项审查

| 既有项 | 原断言/行为 | 准备的新断言/行为 | 必要性与保留范围 |
| --- | --- | --- | --- |
| 1. 原小矩形密度 + 全支持 oracle | 精确 3 groups / 3 curves、rejectedBranches=0；1311 桶边/角 ±1 Q8 样点独立累加；192/262144 上限 | **这些断言全部原样保留。** 仅独立累加函数增加 `n.section` 分支，直接用左右 reach/shoulder 字段计算新实际截面；原 lee/valley 公式完整保留在 else | 严格矩形在候选中仍有 3 条实际链，因此没有改成更少的链。新数据截面变化，旧公式已不是新 field 的数学 oracle；新增公式不调用生产 contribution、union 或空间桶。原 seed、矩形、分辨率、1311 查询坐标、精度 7 和角点为零全部保留。 |
| 2. 128/256/512 物理尺度 | 椭圆每次 `ridgeGroups === 3`；允许不同锚点；半高宽/峰高比均 <1.25、宽 <60、峰 >1500、最大肩宽限制 | `ridgeGroups >=3` 且 `<= FINE_TREE_OROGRAPHY_LIMITS.chains`，`ridgeGroups === rangeTree.graph.length`，`rejectedBranches ===0`；新增三分辨率 graph **精确相同** | 固定旧“三链模板”已被最多五链脊树取代。仍至少有旧数目的实际山系，不允许丢弃已规划支臂；跨分辨率几何一致比旧“允许锚点差异”更强。全部原物理数值阈值、seed、椭圆、采样横截面位置算法原样保留。 |
| 3. 新真实高程相对 preview18 | 最大肩宽 <旧值×.8、半高宽 <旧值×.65、起伏 >1500；数组不同；固定 2048..2080×2200 的细高程种类 >4 | **完全不改** | 不因新树改变位置而提前放宽原物理检查或迁移样点。联合检查若失败，先看实际证据，不静默删断言。 |
| 4. 连续陆地、连接、海侧不变 | 所有分支 root 必须是 trunk.points 中的同坐标；rootPeak>0 且<parentHeight；脊间 >600、真陆地、海侧独立旧值相等、零岸线0 | 分支必须在 graph 中声明真实 `parentGroup`，该父 group 先于子；对应**实际父曲线**存在且包含 root 的相同坐标。其余原检查不改 | 新脊树允许二级支臂，因此所有根都限定在 group0 已不正确。新断言查对应实际父曲线，不能靠改名字或附到任意链通过；父高程独立支持累加在新增测试另行保留。 |
| 5. local 精确旧 oracle + 实际 land probing 取消 | summary/高程精确相等、原全部坐标、实际探针 done>0 后 AbortError | **完全不改** | 旧 local 路径、实际取消边界不退化。 |
| 6. unflagged world 精确旧 oracle + local misuse | summary/ridges/curves/高程精确相等、原坐标；local+fine 拒绝 | **完全不改** | 旧世界分支必须精确保持。 |
| 7. 手造 fine-world 跨海拒绝 + 限制 | 原 fine-world chain/seed/海口、拒绝一段、海口质量0、原 landProbe/ref caps，32world sampleStep 拒绝 | **完全不改** | 新树模块不能破坏仍受支持的旧 fine-world 截面合同。 |

旧文件原件保存为 `before/src/world/generation/detail-fine-world-relief.test.ts`，SHA-256 `dd0f064a2b5218c9f550db73a55acb98adc01f9a03fea304ead767b9917b2054`。具体文本差异可直接将 before 与 files 同名文件比较；只有上述 oracle、组数/跨分辨率图与真实父节点定位变化，加必要 import 和标题。

## 既有真实 writer 与锁区保护不动

`detail-natural-writer.test.ts` 全 6 项保留原字节，尤其：

- 真实全部正细节点、饱和内陆与独立目标岸距对照。
- codec 与旧 Hbase 同坐标恢复、原海源不改。
- 跨批次/调用者变更确定性，以及真实 expanded fine writer 取消不发布。
- 追加后旧锁定大陆的编码 SHA、旧 coarse controls、恢复后的实际高度不变。
- 实际锁定海域转陆地仍拒绝，源字节保持。

提升清单对该文件、16 项 orography 测试与独立 preview18 fixture 全部当前文件记录保护 SHA；脚本不会写这些文件。保护字节不符时要求重新审查，不替其他工作者恢复文件。

## 主线提升方式

先审查 `manifest.json`、三测试副本与 before 差异。主线安装完冻结三份 runtime 后，可执行：

```text
node .autopilot/ph06/natural-ranges-staging/production-tests/promote.mjs --plan
node .autopilot/ph06/natural-ranges-staging/production-tests/promote.mjs --apply
```

我没有执行这两个命令。默认或 `--plan` 只读，输出目标与守卫差异；`--apply` 要求三 runtime 等于冻结来源 SHA、三测试目标符合旧 SHA/尚不存在或已经同字节、所有保护源一致。它先把将覆盖的旧测试备份到本目录，再只写这三目标；每份写前还有并发 SHA 守卫。重复执行同字节结果不重复覆盖，不执行检查/构建/Git/云。

`prepare.mjs` 是生成本目录审查副本的静态文字脚本，已运行一次；它只向本目录写入，并拒绝覆盖已有审查副本。它不是核验脚本，也不应被当作生产检查结果。若主线改变三份 runtime，应先评审兼容测试与清单，而不是绕过 SHA 守卫。
