# 首片自然大陆 @2 的固定区域海床

仅暂存；未改生产，未运行静态检查、单元、构建、浏览器或基准。

与 coast_design 已确认的唯一接口：

```ts
createNaturalOceanBase(
  { size, centersQ: ArrayBuffer, seed },
  control?: AtlasControl,
): Promise<Int32Array>
```

`NATURAL_OCEAN_BASE_PROFILE='natural-ocean-base-v1'`；固定种子域 `natural-ocean-base@1\0`。没有新增玩家参数。调用端先验证首片自然 @2 是合法 empty 世界，再用 `extractDetailCoastBase` 的真实 Q8 粗格面积重心调用本函数，将返回高度数组传入冻结自然内核的 private base。不要提前修改原 Atlas：最终改变块必须继续与原档比较、重算摘要并持久化。追加大陆不调用本函数，继续使用已存海床。

实现按绝对重心坐标采样 2048/1024 world 海盆与区域变化、768 world 海岭形态。它是可复现低频高程底场，不是板块运动模拟，不改变海陆，不创建 dense fine 数据。两遍 O(N)，每 1024 个真实样本调用现有 `yieldAtlas`，前后均检查 signal；不新增控制协议。

所有输入缓冲区在首次 await 前私有复制。返回 Int32 高程严格在 -6500 至 -1200 米；按本次粗样本分布中心化后必要时只缩小起伏，避免硬截断平台，样本均值为 -3800±0.5 米。这是空世界底场的样本均值，不是加上大陆/陆架后全海域的体积或面积加权均深。工作数组为 8N 字节重心副本+4N 字节输出，最大 512² 档为 3 MiB；首次独占复制同步完成，尚无性能通过声明。

新增测试 3 个，均未执行：真实生产粗格重心的负深度/均值/空间连续性和坐标依赖；确定性与首次 await 前输入接管；两遍工作中的取消及原输入不变。测试只生成 128² 粗格 fixture，不运行自然大陆内核。

`baseline-manifest.json` 记录新增目标原本不存在及直接依赖 SHA；`ready-manifest.json` 记录候选 SHA。提升由根代理统一控制，追加配方/旧世界语义保持不变，首片 @2 必须把本 helper 的真实源码纳入新生成器闭包指纹。
