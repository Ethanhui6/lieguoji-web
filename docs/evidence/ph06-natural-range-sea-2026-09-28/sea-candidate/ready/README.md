# 海洋材质隔离候选

基线 HEAD：31e27620c816db33993a8ac419274c9a86c32624（preview21）。所有写入限本目录。候选仅三运行时文件 terrain-material / terrain-mesh / renderer；不改 shader、backend、生成、地理、拾取和存储。

## 有意的材质行为变化

- 深海 -12000 #10283f、-5000 #12354d 保留。海深 -2000 改 #1b4c61，-600 改 #29596a，-100 改 #51868a，近零改 #618d8b。
- 相比只读提案，-600/-100 的首版值调整为 #29596a/#51868a，保持旧测试要求的 -600..-100 至少61种真实高度颜色，不删该连续分辨能力断言；这些值仍低于旧青色亮度。尚未视觉验收。
- 海底原始坡光范围不变，LUT响应按0/600/5000米 .20/.35/.12连续衰减。陆地不衰减。CPU与LUT共用 atlasMaterialColor，海表零端点明确走海色。
- TERRAIN_MATERIAL_VERSION只进入共享LUT与terrain render target缓存，grid缓存不改。尺寸/采样器/页面/地理高度不改。
- 共享Atlas材质意味着旧Atlas海洋外观也会变化；旧世界的物理数据、规则和保存字节不变。没有加入假波纹/噪声/等深线，真实陆架扇形/斜向条纹未被宣称修好。

## 原固定期望的逐条变化

terrain-material.test.ts保留全部测试/断言，只改变4个海色数值：-2000 1b5269→1b4c61；-600 28798d→29596a；-100 4c97a8→51868a；-350插值3a889b→3d707a。-5000与全部陆色、颜色数量>60、边界钳制、坡光限值不变。

terrain-mesh.test.ts保留全部测试/断言，只改变两个海色RGB：-100 [76,151,168]→[81,134,138]；零边界 [121,186,192]→[97,141,139]。陆色、海陆分离、不透明、线性UV、尺寸/共享资源、创建销毁/Buffer等断言不变。

## 独立测试和生产提升边界

新增 ocean-material.test.ts：完整旧land LUT字节oracle、0..12000陆色扫面和真实CPU坡向与原源码一致；海端点/反向坡光独立数值；全海色表深度排序/连续/幅度；CPU与LUT一致。

新增 ocean-material-cache.test.ts：真实共享LUT缓存两份源的记账；对旧draft和v4 draft调用实际renderer缓存规格方法，版本、subcore、网格稳定、bounds和源数据保持。此CPU测试不声称GPU执行。

baseline/preview21-terrain-material.ts是实际基线原字节oracle。若生产提升，新测试必须改引用独立 src/world/test-fixtures/preview21-terrain-material.ts 原字节fixture，不可依赖.autopilot路径；renderer/mesh原文件备份仅审查，不作为运行时导入。

vitest.config.ts将实际生产imports叠加到三候选文件。旁边重导出仅作类型桥，37文件有效渲染闭包记录在ready-manifest.json。定向检查为5个staged测试+5个原样生产文件，单worker；不运行完整套件、build或GPU。check.mjs每轮先保存原字节、37渲染依赖与11生成器/engine实际闭包，再跑types/lint/unit；失败首轮保留。候选不属于任何生成器/engine闭包，实际值须前后核实，不能靠声明。

静态候选完成；CPU结果将另记 checks/<round>/verification.json。本文件不是CPU或视觉通过证明。
## 首轮真实失败与修复

checks/first 运行10文件140项：138通过、2失败。types/lint通过，候选/依赖原字节前后稳定，11生成器与engine实际闭包保持一致。首轮源码与日志完整保留。

- renderer.test.ts:541 有一个原 -100 海色固定值0x4c97a8；根明确授权必要第五测试文件，仅改该固定值为0x51868a，其他83项测试内容完整保留。
- ocean-material全深度全行扫描发现相邻海深颜色79→78。先舍入基色再乘随深度变化的gain会在基色平台处反转1byte。修复海域插值保持浮点到最后一次RGB舍入，陆地仍走原整数基色计算。保留单调、连续、原预算和陆地逐字节oracle所有断言；未提高阈值。

repair-1准备复测，尚不宣称通过。
## 最终候选状态

repair-1 types通过（3765ms）、lint通过（2179ms）、10文件140/140通过（unit命令102075ms）。sourceStable、dependenciesStable、11生成器/engine actual closure identitiesUnchanged均true；checks/first的138/140失败证据与原字节仍在。ready-manifest.json现为candidate-cpu-passed-awaiting-integration，包含精确候选/依赖/检查/9个提升目标指纹。

promote.mjs已准备但本代理未执行。根检查后可运行 `node .autopilot/ph06/ocean-material-staging/promote.mjs --apply`。它只写3运行时+5测试+1个preview21原字节fixture；在任何写入前先核对所有目标原字节或已应用结果，保留其他改动。没有把桥接文件、配置、检查脚本带入src。

CPU窗口已释放。生产未提升、没有build/GPU/browser、未提交或写云端；同存档同相机颜色比较、扇形海床条纹归因、实际三端/真机/视觉仍由后续统一检查分别处理。