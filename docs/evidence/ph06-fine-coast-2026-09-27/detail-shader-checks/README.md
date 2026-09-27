# v4 细地表 WebGL2 内核：有界验证

本目录记录 2026-09-27 的实际 CPU 与 GPU 检查。不是可玩 v4 地图、硬件/真机测试、整 PH 或性能通过证据。生产改动只有四个新 detail-terrain-pages/shader 文件；renderer/cache/Worker、现有 dist 未由本任务修改。

## 结果和原始证据

- `promoted.json`：提升前 staging 与目标 SHA。四个目标文件原来不存在。首次检查前，GLSL clip 去重已从 next 改为 previous，与当前权威 CPU 多边形 fan 顺序保持一致；没有修改 CPU。
- `cpu-first.{log,json,result.json}`：18/18 一次通过；Vitest 显示 1.27 s，命令墙钟 2454.8172 ms。
- `lint-first.{log,result.json}`：四文件 ESLint 一次通过，1604.9201 ms。
- `gpu-first.{log,json,png}`：真实 WebGL2 编译/link、625 组合、55,330 个探针、原始 RGBA、CPU 期望结果及 Pixi 工厂实际 RT 读回。最大高度差 0.0024232509786088485 m，分类全部一致。预设误差门 1/128 m，包含 1/256 m 诊断编码量化。
- `gpu-supplement.{log,json,png}`：仅 103 个专项探针，不重跑 625。覆盖内部 1.5Q→2Q 舍入及两侧、不同绘制原点同世界点、实际 WebGL1 拒绝和仅 aPosition 的 Pixi Geometry。包含重复的 81 个 Pixi 探针，不能把总执行数写成唯一探针数。
- `verification.json`：上述结果汇总、driver/capabilities、资源账、最终源码 SHA 和未完成范围。

实际 driver 是 Chromium ANGLE SwiftShader 软件 GPU。两次 vertex/fragment compile 和 link 均成功。readPixels 的同步 GPU-stall driver 提示保留在原始 console；它不构成性能结论。第一轮 MeshGeometry 自带 aUV 导致未使用 attribute 警告，专项换成仅 aPosition 的 Geometry 后消失；生产 shader 不需要 aUV。

## 重现

在项目根目录执行 `node .autopilot/ph06/detail-shader-checks/gpu-checks.mjs <新证据名> [supplement]`。使用已安装 Vite/Pixi/Playwright，独立 `configFile:false` server、随机空闲 localhost 端口，不启动游戏构建插件、应用状态或 Worker。每次退出都会关闭 server/browser。不要覆盖现有证据名。

## 下一步 renderer 接线

1. 以真实已接受快照创建 `DetailCoastField`；uniform/缺省节点的 `sampleBaseElevation` 应统一使用即将合并的 `createDetailShapeBaseSampler`，不另写显示插值。
2. 每批 `packDetailTerrainNodeRange` 最多 4096 节点；调用方负责 yield/取消、完整页覆盖和 snapshot 身份。五页必须同源且完整后才能显示。
3. 提前在同一原有 32Mi pixel 账本预留源纹理；五页 4,199,424 pixels / 16,797,696 bytes，含两张既有 LUT 共 4,278,690 pixels / 17,114,760 bytes。LUT 按实际对象身份计账，避免重复，也不能漏账。CPU 页内存、GPU 源、RT、geometry 分别如实核算。
4. 建立 nearest/no-premultiply/mip=1 节点源；factory 借用源、只拥有 shader/program。用仅 aPosition 的 `Geometry`、局部 world 坐标和与 `originQ` 对应的变换接入真实 RT。禁止老海岸后端回退。
5. 替换、取消、GPU loss、恢复和卸载由 renderer/cache 协调绑定和 source 寿命；本批只验证销毁 shader 不会销毁借入源。随后才做实际页面、视口/共享边、palette、性能和资源预算回归。
