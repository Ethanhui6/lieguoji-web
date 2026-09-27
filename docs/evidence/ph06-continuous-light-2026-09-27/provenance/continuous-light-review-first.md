# 连续光照候选精确初审（首轮，保留原始结论）

2026-09-27。只读审查；未修改 production、staging 或任何测试，未运行检查/浏览器/基准。审查的是下面明确绑定的首轮字节；作者随后如补强 harness，本报告不覆盖，只另记增量复核。

## 读取绑定

| 文件 | 本次实际读取 SHA-256 |
|---|---|
| 生产 `src/world/detail-terrain-shader.ts` | `ee95bb492ef441a9e52d6f2ec6660deea226c01c61b84df3340c88d5191c0f05` |
| staging `src/world/detail-terrain-shader.ts` | `6dc8017930eac3fcbac210e5c025538a36c53b32878b594ef43f43b3a63209cb` |
| staging `src/world/detail-terrain-light.test.ts` | `5c7af39398d381926b9278ddc471443138e351e56242d893d635b404c74fc1d7` |
| staging `gpu-harness.ts` | `aaf644a409de41d00c3b57479de4827a29f941371b0ee36c4c5ee85dd7f58dd8` |

staging 根目录是 `.autopilot/ph06/v4-continuous-light-staging/`。三份候选在读后再次散列，仍与表内一致。另只读检查首轮 `checks/first/verification.json`、`gpu.raw.json` 和 `run.mjs`，没有执行它们。

## 结论

**未发现需要阻止此 shader 候选继续进入产品整合检查的源码缺陷。** 最小显示边界成立：共享节点/规范交点的同侧光照在原裁切片内插值，不改权威高度、海陆和 clip。实际 GPU 首轮不是空 success：执行候选 GLSL、绘制、readPixels，并与 CPU 连续光照和真实 LUT 结果比较。

这不是产品视觉或性能通过；尤其不能由 1×1 GPU 探针得出实际近岸约 22px 方格已经在普通画面消失，也不能由显存未增得出帧时间不增。

## 1. 共享值、规范 crossing 与 C0

候选 `nodeLight/nodeLights`（shader:187–197）仅用 node/neighbour 的真实高度和局部坐标。异侧邻居截到原 `crossing()` 的零高程/真实 Q8 距离，严格异侧高度没有进入当前侧坡度。只有节点所属域求有效光照；coverage=0 节点独立求 land、sea 两值。四节点按顺序赋 `.lights` 不引入顺序依赖，因为坡度计算没有读取邻居 light，只读取 q/height/coverage。

`crossing()`（:166–181）保留原端点排序、整数舍入、1..511 限制和零高度；新增的 light 分量分别继承该规范源边 land/sea 端点的共享值。两相邻 cell 即使局部原点不同，参与者仍是同一全局节点、同一边和同一 side，坐标差不变，端点光照一致。`triangleHit()`（:215–226）在原实际片内重心插值这些值，因此同侧共享边端点相同，边上插值也相同；内部 polygon fan 同理。两侧 LUT 本来不同，海陆界面不要求同色。

该推理说明固定地理下 C0，不说明 C1、更不说明自然景观视觉验收。坡度平滑后的亮度不再等于命中片解析坡度；候选明确把保留的 `detailTerrainPieceRelief()` 改注释为独立物理高度 oracle，显示身份更新为 `final-q8-pieces-gl2-shared-light-v2`，没有冒充两者相同。

## 2. zeroHit、海陆与边界

- `zeroHit()`（:239–250）已修原先中性 light=1 的问题：零点返回 `a.lights.x`，零边按轴向实际 t 插值 land light；不再制造与邻接 land 片不同的强制中性线。
- 与原实现一样，先完整 land，再零面积零边，再完整 sea。全零源三角只发 land，crossing 遇零端点直接复用原端点。这些分支未改地理判定。
- `neighbourAt()`（:154–157）在世界之外返回当前 boundary 节点本身，其坐标也保持当前坐标。差分分母使用实际端点 q 差（:191–192），所以得到完整单边坡度，没有重复 clamp 后还除固定 4 world 的减半问题。
- axis 两端坐标相同时显式取 0，不除零；坡度范围和 atan 后的光照约束保留，极窄 Q8 岸片也不使用片面积来放大 display gradient。
- 所有真实邻居仍按全局 `node.y*2049+node.x` 重新选择 page/address。无节点页 padding 读取或 texture 行 wrap。规范 crossing 仍只在 512-Q8 源边上执行；引入 [-512,1024] 的局部 stencil 坐标没有扩大原 clip 三角的面积中间值。

## 3. 12 次 fetch 与不变部分

`main()`（:279–290）实际只有四次直接 `nodeAt` 和八次 `neighbourAt`。每个有效 neighbour 只调用一次 `nodeAt`，每次仅一个 `fetchPage`，故内部真实节点 fetch 上界是 12；世界边缘更少。后续 nodeLight/crossing/pieceHit 无 texture fetch，未对各 clip/fan 尝试重复读邻域。最终命中仍取一次相应 LUT。

没有新增纹理、节点页、完整世界 light 数组、上传或 ledger 变更；七个 sampler 能力合同不变。代价是原四次节点读取增加至最多十二次，且每个角求侧向光照，**真实产品绘制成本仍需验证**。`nodeReadsPerInteriorCell:12` 是 harness 写入的源码预算说明，并非 GPU 硬件计数器。

精确 diff 可见：coverage/height 解码、crossing 的 q/coverage/height、clip 去重次序、fan、命中叉积、height 重心式、边界归最后格、无覆盖透明错误路径均保留。`writeResult` 的诊断 RGB24 编码和 alpha 原样；只替换后面的显示光照输入。CPU picking/面积与持久数据源码未改。

## 4. CPU 与实际 GPU 证据的范围

CPU 六项覆盖四世界角的单边平面、非平面跨 fine cell/owner 与 NW–SE fan 的等边值、规范量化 crossing 的共享值及异侧高度隔离、zero node/edge 两侧、12 个独立取样和输入不变、1-Q8 薄片的原高度/判定。不是仅检查函数存在或固定返回值。

首轮 GPU harness 的 `init/draw/probe` 实际编译候选 vertex/fragment，绑定五页 NEAREST packed 数据与两个 LINEAR LUT，在无混合/抖动条件下 draw/readPixels。每个点既读 diagnostic land/height，又读显示 RGBA；CPU 预期来自真实 clip/height + 新共享 light oracle + 同一 LUT 的 CPU bilinear。另对偏移 17/35 Q8 的 mesh 原点要求显示字节一致。run 脚本还将 console error/pageerror 计入 GPU 结果，并检查前后来源散列稳定。

本次只读已保存 first 数据：Chromium `153.0.8010.12`，**316 probes、0 failures、exception=null、全部 colorError=0**；逐项检查 light、expected RGBA、heightError、colorError 没有 null（含 NaN 序列化为 null 的情况）。`verification.json` 记录 unit/lint/types/GPU/sourceStable 全通过，scope 为 6 新 CPU 项与独立 GPU 探针。它们是作者执行后保存的结果，本审查没有重新执行。

## 5. 首轮发现的非产品阻断补强点

1. **harness:109–111 缺少显式有限值拒绝。** `heightError > tolerance || colorError > tolerance` 对 NaN 都为 false；`colorAt:101` 仅夹上界，浮点边界若产生负数组索引会给 undefined/NaN。建议对 picked/decoded/light/expected/actual/errors 加有限数值断言，CPU LUT 索引夹上下界。当前 316 个保存结果全部有限且颜色误差为 0，所以这是未来 fail-closed 隐患，不能倒称首轮已经出现假绿。
2. **首轮未显式断言相邻两侧实际像素的连续性。** CPU 已直接断言共享边/对角线相等；GPU 是对连续 oracle 的逐点显示比色，且包含 511.5 Q8 与 512 Q8 点，不是仅返回 success。但 GPU 还没有将一条同侧边 ±epsilon 两点作为 pair 并断言其合理小差异。建议对同一海面格边、对角线和薄岸同侧补有界 pair，保留逐点地理/颜色验证，不能把真实海陆颜色跳变误当不连续。

以上已先回传作者和根。作者随后告知添加了独立跨边 GPU 补强，并准备只改 harness 的有限值/夹边保护；**这些后续字节与结果尚不在本首轮结论里**。后续应另写增量复核，保留本次 first 源码 SHA 和原始结果，不覆盖或让新结果冒用旧指纹。
