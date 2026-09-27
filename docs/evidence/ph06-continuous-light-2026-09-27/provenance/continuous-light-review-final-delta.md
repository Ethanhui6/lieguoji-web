# 连续光照初审后的增量复核

2026-09-27。保留 `continuous-light-review-first.md` 不变；本报告只追加最终 GPU harness 的 finite 与 seams 补强核验。只读已有源码/证据，未执行检查或浏览器，未修改生产/候选。

**确定结论：无阻断，可由根执行者按绑定 SHA 受控提升 shader 与新窄测试两个文件，再继续产品检查。** 这不是产品近岸截图或游戏性能验收结论。

## 最终字节绑定

- 生产提升前 shader：`ee95bb492ef441a9e52d6f2ec6660deea226c01c61b84df3340c88d5191c0f05`，本轮读取时未变。
- 候选 shader：`6dc8017930eac3fcbac210e5c025538a36c53b32878b594ef43f43b3a63209cb`，与初审相同。
- 候选 `detail-terrain-light.test.ts`：`5c7af39398d381926b9278ddc471443138e351e56242d893d635b404c74fc1d7`，与初审相同。
- 最终 `gpu-harness.ts`：`9c0d3cca060c42cc23dc861c9840859b49ce197fafd879858e544a446497ea5a`。

以上三份候选/工具重新散列，均匹配 ready-manifest；最终 `checks/gpu-finite/source-before.json` 的对应记录也匹配。源目录仍为 `.autopilot/ph06/v4-continuous-light-staging/`。

## 补强已准确落实

`colorAt()` 先把 LUT x/y 夹在 [0,1200]、[0,32]，再 floor/插值，避免下界浮点余差变成负索引。`probe()` 对 picked/decoded 高度、light、heightError、colorError、expected 和 actual 每一通道执行 `Number.isFinite`；非有限值直接计入 failures，不再依赖 NaN 与容差比较。

新增 seams 逐对实际 `draw(...,false)`→`readPixels`，并分别调用真实 CPU picking 确认两点属于同一海陆侧；实际最大通道差必须 ≤1 byte，非有限值拒绝，最后要求 `seams.length===5`。这些不是 CPU 自算差或硬编码 success。

两轮 `gpu-continuity/gpu-finite` 的原始五对均已逐项只读核对。最终 gpu-finite 的结果是：

| 场景与局部 Q8 位置 A→B | 两端归属 | 实际 A/B RGBA | 实际最大差 |
|---|---|---|---:|
| 曲面海，(511.5,256)→(512.5,256)，垂直格边 | 海/海 | 均 [49,130,150,255] | 0 |
| 曲面海，(256,511.5)→(256,512.5)，水平格边 | 海/海 | 均 [49,130,149,255] | 0 |
| 曲面海，(255.5,256.5)→(256.5,255.5)，NW–SE 对角线 | 海/海 | 均 [48,129,148,255] | 0 |
| 量化薄岸，(511.5,1)→(512.5,1)，同侧陆地格边 | 陆/陆 | 均 [157,165,119,255] | 0 |
| 量化岸外，(511.5,256)→(512.5,256)，同侧海面格边 | 海/海 | 均 [55,124,140,255] | 0 |

它们是有限整数 0，不是 null 被强转成 0；两端 alpha 均为 255。first 没有 seams，当前 ready 记 seams=0、seamDifferences=[]；旧摘要若曾出现 null，只代表未测，不能算差为 0 或通过。

## 证据计数与复用

只读 `checks/first/unit.raw.json` 确认 6 total/6 passed/0 failed，实际只运行一次。后续两轮 `unit=null`，`unitReuse.path` 指向原结果、`stableUnitInputs=true`；run 脚本对生产源码与这两个候选 runtime/test 的 hash 核对后才允许复用。

GPU 三轮各自重复同一套 316 点，不累加为 948 独立用例。最终还包括上述 5 对连续性检查。两轮新增证据均 `passed=true`、failures=0、exception=null；最终 316 点 light/expected/errors 全部有限，显示 colorError 最大 0，heightError 最大 0.001953125 米（原容差 1/128 米）。最终 verification 记录 lint/types/GPU/sourceStable 均通过；我没有再次执行这些检查。

初审的规范 crossing、zeroHit、单边差、海陆分离与 12 次实际节点 fetch 上界结论沿用未变 shader 字节。下一步仍需同一实际持久近岸地图和正常相机下的产品截图及适用绘制检查；本轮探针只证明显示内核的所测正确性。
