# Hbase 平面保持与粗中心坡度周期：窄诊断

日期：2026-09-28。范围：preview17 生产源码的只读检查，以及一次独立、有界 CPU 数学 probe。没有修改 src、tests、dist，没有运行全套、自然大陆生成器或浏览器，没有读取玩家存档。此结果不代表视觉或性能验收。

## 可以确定的结论

`createDetailShapeBaseSampler()` **不具备线性精确性**：即使输入恰好来自一个连续斜平面，也不会在重心以外精确重建该平面。规则 256 规格粗重心间隔为 16 世界单位时，高度误差及坡度变化在本合成内陆区域确实按 16 世界单位重复。这些变化经过当前真实节点打包路径后仍存在，并进入生产 CPU 光照 oracle；GLSL 使用同样的四邻高度差。

这是一项已复现的采样性质，不再只是“可能有粗格影响”的源码推测。但它**不是 preview16/17 原截图细纹根因的确证**：本 probe 使用合法规则四边形重心，未读取截图世界的实际抖动重心、高程、tile mode、镜头 density 或 GPU 像素。默认新建地理会扰动共享顶点，因此实际世界中的周期可被调制，不能直接说截图严格为16world。

仅为改变新生成地形写入的真实 sampled 高程，不一定需要新世界格式；但若要改变旧 uniform-land/缺省海节点的**权威 Hbase 解释**，必须有新的持久化地表语义和旧档分发。不能原地修改同名 sampler，让所有 v4 旧档刷新后改变高度。

## 单次实际运行

执行：`node .autopilot/ph06/height-plane-diagnostic/probe.mjs`，一次、exit 0。`first/` 已保留原始数据；脚本拒绝覆盖该目录，没有自动重试。

- 真平面：`h(x,y) = 512 + x + 0.5*y`，真梯度 `(1, 0.5)`，单位为米/世界单位。
- 规格256，世界4096，Q8；粗重心为合法规则共享quad的真实面积重心，间隔16world；细节点间隔2world。
- 所有粗重心的平面值均为整数，所有被测细节点的真值也为整数。输入高程量化误差和真平面整米取整误差均为0，不能把下列误差归给初始取整。
- 仅构造 sampler 接口要求的粗中心/高程数组，共786,432字节；没有调用 `createAtlasDraft` 或生成世界文档/存档。
- 观测区域为 `(1008..1072,1008..1072)`，33×33=1089个细节点。加四邻halo共1225节点，4个uniform-land owner tile。全部观测点及光照四邻均为陆地，没有海岸零点、异号剪裁或世界边界影响。
- 另用同一输入布局的2048米常量作为归一化控制；误差全为0。

执行链实际来自生产源码：

`createDetailShapeBaseSampler → sampleDetailCoastNode → packDetailTerrainNodeRange → readDetailTerrainSample → detailTerrainNodeLights`。

前四个模块原样转译到本目录，只调整Node ESM本地导入扩展名。光照只提取生产文件中的 `displayLight`、`SideLights`、`lightCrossing`、`detailTerrainNodeLights` 四个完整声明，保存原文起止offset和SHA，再转译执行。没有手写另一套IDW或光照公式，没有导入Pixi初始化或调用WebGL。完整 provenance 位于 `first/runtime-provenance.json` 和 `first/shader-cpu-extraction.json`。

## 数值结果

| 指标 | 真平面应有值 | 实测 |
| --- | --- | --- |
| raw Hbase 高度误差 | 0 m | −2.859673951..+2.859673951 m，RMS 1.384324087 m |
| 实际打包节点高度误差 | 0 m | −3..+3 m，RMS 1.491943470 m |
| raw x 导数（±1 Q8 中心差分） | 1 | 0.000000409..1.972834082 |
| raw y 导数（±1 Q8 中心差分） | 0.5 | 0.000000204..0.986417041 |
| 真实2world节点四邻 x 坡度 | 1 | 0..2 |
| 真实2world节点四邻 y 坡度 | 0.5 | 0..1 |
| 陆地节点光照 oracle | 恒1.0031020678408755 | 1..1.0051658163194406 |
| 16个被测粗重心高度误差 | 0 | 全部0 |
| 常量2048m高度误差 | 0 | 全部0 |

粗重心处raw导数的数值近似最大为 `(4.0891e−7, 2.0460e−7)`，接近0而不是所输入的 `(1,0.5)`。这不表示函数不连续；它表示非零斜率在重心附近被压平。

对 x、y 各方向平移16world，分别核对825对实际样本：

- raw高度误差之差最大分别为 `1.81899e−12`、`1.59162e−12` 米。
- raw导数之差最大不超过 `3.49246e−10`。
- 打包整数高度误差、fine四邻坡度和CPU光照值之差均为**精确0**。

这里比较的是“误差重复”和“坡度重复”，没有错误地要求斜平面的高度本身平移16后相等。

例如 y=1016world、跨一个粗格周期的实际fine x坡度为：

| xworld | 相位 x mod16 | 整米高度误差 | fine x坡度 | fine y坡度 |
| --- | --- | --- | --- | --- |
| 1008 | 0 | 0 | 2 | 0.5 |
| 1010 | 2 | +2 | 1.75 | 0.25 |
| 1012 | 4 | +3 | 1 | 0.25 |
| 1014 | 6 | +2 | 0.25 | 0.25 |
| 1016 | 8（粗重心） | 0 | 0 | 0 |
| 1018 | 10 | −2 | 0.25 | 0.25 |
| 1020 | 12 | −3 | 1 | 0.25 |
| 1022 | 14 | −2 | 1.75 | 0.25 |

这是一个有起伏坡度的重建平面，而不是任意随机涂色或额外格纹图层。光照波幅约0.005166属于本斜率的合成结果，不能据此声称实际截图有相同像素亮度、可见度或纹理振幅。

## 原因与生产路径

`src/world/generation/detail-shape-height.ts:25–29` 的权重为 `w=(1−r²/R²)²/r²`，最终高度是归一化加权平均。权重和归一化能保持常数，但没有强制加权位置的一阶矩等于查询位置，因此不保证重建线性函数。

在某个重心附近，自身权重按 `1/r²` 发散，其他重心贡献有限。`H−h_center` 至多为 `O(r²)`，所以该重心处导数趋于0。规则平面与对称邻点还会抵消一阶偏差，但并不能恢复非零平面斜率。相同规则布局平移一个粗步长后，各权重的相对位置重复，从而产生本次观测的16world误差/坡度周期。

这不是已经证明的名义bucket边界断裂。该实现的bucket只查找候选，2.5粗步长紧支撑在边缘衰减；连续和保持重心值都可以成立，同时仍不保持平面及其斜率。

实际调用位置：

- `detail-coast-base.ts:12` / `generation/quality.ts:25,48` 从真实凸quad计算Q8面积重心与粗高程；本probe规则quad的中心正是其面积重心，未假称默认抖动布局。
- `detail-terrain-backend.ts:131–140` 从已验证世界取粗底场，直接建立该sampler；不存在按存档中 sampler version 选择算法的分支。
- `detail-coast-field.ts:9–18` 对显式samples读取持久高度；uniform-land/缺省sea用Hbase后整米取整并按海陆夹界。
- `detail-terrain-pages.ts:74` 将这些真实节点打包成GPU整数数据页。本probe保存了35条实打包row bytes，核对readback与生产节点值完全相同。
- `detail-terrain-shader.ts:22` 的生产CPU oracle以及 `:187` 的GLSL `nodeLight` 都用四邻高度差构建gx/gy；再经atan和幅度限制得到light。沿岸会截到规范零点，本次全内陆不会触发该分支。
- `generation/detail-shape-natural.ts:279–306` 先写粗高程、建同一个Hbase，沿岸sample高度还可与它混合；所以新生成的显式tile也可能携带此前产生的重建形态。但已保存的samples打开时直接读高度，不能把所有旧sample纹理都归给“加载时重新IDW”。

## 旧 v4 必须保持的接口边界

当前v4并未把 `DETAIL_SHAPE_BASE_SAMPLER='centroid-compact-idw-v1'` 持久化。该常量在运行时生产代码中只有声明；旧档恢复没有根据它或生成历史作分发。

`model.ts:36` 与 `generation-contract.ts:129` 的surface是精确四字段 `{kind:'sparse-coast-field-v1',coordinateScale:256,stepWorld:2,tileCells:32}`。`generation-format.ts:9–28` 精确验证字段和surface；`atlas-format.ts:17–41` 只派发1/2/3/4。`storage.ts:136` 的每个实例固定manifest版本，`:831–854` 使用独立v1/v2/v3/v4数据库。

所以只改 sampler 函数体而保持v4 bytes不变，会使旧uniform-land和缺省sea在下一次重建时改变；manifest和块SHA仍相同，摘要不能检测到代码语义变化。已有高程锁也不会自动防住这种升级：`detail-coast-locks.ts:116–121` 对前后文档均用**当前**sampler构建场，二者同时变解释可能被认为一致。不能将此当作“锁验证还通过，所以旧高度未变”。

此外，`generation-locks.ts:98–103` 禁止普通编辑改变细海岸surface，`:118` 禁止切换格式；`atlas-format.ts:55–58` 当前明确拒绝v4副本/跨格式转换，v4 origin固定null。旧图迁移路径尚不存在，不能报告为已支持。

若确需更换**隐式权威采样规则**：

1. 保留旧sampler实现和旧v4路由；新增持久化的地表语义/采样器版本，让renderer、拾取、生成保护、锁、保存/备份恢复对同一文档选择同一语义。
2. 当前架构最清楚的路线是独立新版Atlas格式/库和明确新建；这不是本报告擅自批准或实现v5。技术上也可以设计同外层版本但新surface kind的严格分发，但那仍是新持久格式语义，必须同时证明未知解释锁写、双槽保护和旧客户端行为，不能只添加一个可选字段或改默认值。
3. 若以后提供旧图副本，必须先用旧sampler核验/读取原图，再明确选择保形物化或重建后的新解释，并绑定来源、新身份和锁的处理。不得静默迁移、改旧块或让旧保护字段失效。当前存储读取甚至显式backup也会先验证current，不能绕未来surface/codec保护；此机制应保留。

若仅改善**新生成地形**，则有一条不必改v4解释的边界：保留旧Hbase算法，给新增/明确编辑范围写入现有`mode:samples`允许的真实细高程，以版本化配方和实际指纹记录来源；旧implicit与旧sample不动。它仍需实际高度连续、owner边界、非选区/锁保护、容量及取消检查，不能通过生成shader-only高度或填满全图数组跳过预算。本报告只说明这一格式能力，不代表已经决定或实现哪一种修复。

## 证据与未获结论

- `first/result.json`：汇总、参数和完整比较统计；SHA-256 `7fb7574af8680e6d32dd07a82c3a31110fa18fbdf5d7966d38fbff93264647fb`。
- `first/fine-node-grid.raw.json`：1089点的真值、raw/整米误差、导数、四邻坡度、light、真实owner身份。
- `first/continuous-x-profile.raw.json`：y=1016的129点连续采样剖面。
- `first/centers-q8.bin`、`plane-elevations-meters.bin`、`row-*.bin`：实际输入和实际节点编码字节；没有真实存档。
- `first/source-before.json`、`source-after.json`：19项读取来源和probe文件前后SHA完全一致。核心sampler SHA `90c432089810b0a5f2a07e2eb6e1f7e716bd8f23fc2132fe5a88781e5904623d`；shader SHA `6dc8017930eac3fcbac210e5c025538a36c53b32878b594ef43f43b3a63209cb`。
- 原 `preview16-ridge-grid-observation.md` 保持原样。新增证据只把“IDW能否自行产生周期坡度”从推断推进到合成复现，未关闭该报告中的实际截图对应、输出缩放/采样和用户视觉未通过项。

没有计算或声称性能结果，没有把工具耗时作为基准。没有自然世界生成、GPU调用、浏览器重测、产品截图、PH状态或发布状态变更。
