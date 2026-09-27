# 沿岸分区候选

状态：源码与测试候选，未运行 CPU 检查、未构建、未运行 GPU，未提升生产。所有文件位于本 staging 目录，不是产品发布。原方案见相邻 `../regional-coast-plan.md`。

只有两份代码用于后续审查/提升：

- `src/world/generation/detail-natural-outline.ts`：6—10 个不等长宽湾/窄岬/裂岸/低变化区段，当前同层事件和预算不变；新增只读复制诊断 regions、sampleDetail。
- `src/world/generation/detail-shape-natural.ts`：真实 design 岸场改用 sampleDetail。当前生产20的 `heightPlanning: 'fine-world'` 原样保留，其余地形写入/验证链不改。

该 staging 直接复用生产依赖。`vitest.config.ts` 把两个候选文件按 canonical source path 覆盖解析，其他依赖仍只读生产；指纹用相同有效两文件 overlay 独立计算，不能把候选事务结果标为生产生成器身份。只存在测试自己的 fake IndexedDB。`src` 内其余 proxy 与复制的现有测试均不得作为生产源文件覆盖。

## 8-world 分量的提前限制

原方案直接给默认 roughness=32 的 N8 分量 65% 权重，可造成约20 world法向位移，明显大于噪声自身尺度。候选将裂岸最终岸线上的每个频段贡献限为波长/4：N8最多2 world、N24最多6 world、N96最多24 world（含最终Q12取整时另有≤0.5 Q12的总场误差）。超出的权重逐级回到长波，仍多余则留空，不让24 world场承接后变成另一个深细针。裂岸的主要形态来自16—64 world、不等长且分簇的真实结构事件；短事件根据坡程限制深度。

周长<2048 world或structure=0完全沿用原结构计划与原48/12 world细节。故小岛不会被强塞大陆区段。长而狭窄的笔形仍由原相向岸caps保护；独立测试检查实际12-world海峡与陆颈，不能因它们变细而取消保护。噪声继续取原轮廓投影点，不在跨岸法向加噪声。

保留features48、bins128、references1024、每桶8候选和2-world固定采样。没有放大预算，没有新UI参数/高程schema，没有读取真实用户存档或任何云端操作。

## 等待统一 CPU 窗口的检查

三个新增测试文件分别覆盖：

1. `regional-coast-plan.test.ts`：3种子×2周长的真实偏移剖面差异；细分量实际幅度上限、区段接缝、ownership；与冻结旧版的低周长/zero-structure逐点一致。
2. `regional-coast-field.test.ts`：真实固定2-world细场的12-world通道/陆颈、总包络、海陆连通性、面积与codec恢复。
3. `regional-coast-storage.test.ts`：真实preview不写库→确认→保存恢复→实际规划中取消→追加后保留首大陆，指纹为本候选的有效运行源码。

还原样复制了 `detail-natural-coast-plan.test.ts`、`detail-natural-visual-repair.test.ts`、`detail-natural-writer.test.ts`、`detail-natural-integration.test.ts`，不降低任何旧断言。配置明确替换test.include，避免合并配置时意外运行整份生产测试。

待root批准CPU窗口后才执行，例如：

```powershell
node node_modules/typescript/bin/tsc -p .autopilot/ph06/regional-coast-staging/tsconfig.json
node node_modules/vitest/vitest.mjs run --config .autopilot/ph06/regional-coast-staging/vitest.config.ts
```

这些命令尚未运行。失败应保留第一次日志并据具体原因修复，不降低上述形态/连通性/保存断言。后续需真实渲染器同镜头比较，不能据数值图或CPU测试宣称达到用户的自然大陆感觉。

`baseline.json` 是复制时源码SHA；`ready-manifest.json` 是候选文件SHA与未执行状态。生产依赖若继续变化，应重新记录并审查实际候选环境，不能把先前指纹/结果当成新的证据。
