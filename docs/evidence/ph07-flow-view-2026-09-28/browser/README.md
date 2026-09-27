# PH07 流向真实浏览器候选

只准备，尚未运行浏览器。测试正式路径 `tests/atlas-hydrology.spec.ts`；root 统一生产检查/build 后决定 GPU 运行时机。

一条实际产品流程：原生 UI 新建 format4 / size128 → 8 点原生轮廓生成并保存 → 独立只读 LGDC 内容哈希和实际高点选取 → 原生点击地图 → 查看地形流向 → 现有 audit 读取当前实际显示的完整 trace → 保存高程逐节点证明相邻、不上坡且有有限终点 → 实际水文阶段已执行非零 operations 后点击取消 → 无显示结果且 root/revision/完整 DB 摘要不变 → 刷新、同点重算完整 trace 一致。手机使用原生 touch/tap；桌面使用 mouse。无地图、Worker 或模拟结果注入，无存储写入测试接口。

总超时保持 450 秒，零重试，失败日志/截图/trace 保留；成功截图和有界 JSON 证据保存到项目单轮目录，聊天不输出巨大字节。`physicalDevice:false`，只代表浏览器移动仿真。

root 获得真实通过的统一轮次后，在 GPU 空闲时逐个执行，例如：

```
node .autopilot/ph07/flow-browser/run.mjs desktop-first desktop-chromium <passed-flow-checks-round>
node .autopilot/ph07/flow-browser/run.mjs mobile-first mobile-chromium <passed-flow-checks-round>
node .autopilot/ph07/flow-browser/run.mjs tablet-first tablet-chromium <passed-flow-checks-round>
```

`<passed-flow-checks-round>` 是 `.autopilot/ph07/flow-checks/` 下实际 `verification.json` 通过的目录名，不是固定版本或预设哈希。wrapper 先核对统一轮次源后摘要、完整 dist 清单和实际 build.json SHA；任一变化拒绝启动。测试从真正服务 URL 读取 build.json，并比对该 SHA，防止误测旧预览服务器。每轮保存前后源/dist/runner 清单和完整先决验证；只允许一条指定项目测试、单次通过，不把空选择、跳过、重试或源变化记为成功。

本批不判断地貌自然视觉、完整水文/河网/湖水量、存档持久河流或整个 PH07。源仍可能存在真实交互问题，应保留实际失败并按原因修复，不能放宽阈值、改坐标逃避或增加超时。

首轮手机失败保留在 `mobile-first`。原 trace 显示确认按钮原生 tap 已在真实按钮 box 内完成，但测试当时只等一个在预览时已为真的 `ready` 状态，随后约 160ms 内读取 revision0 海洋并报缺少高地。截图仍是高程2155m的未保存预览，不能将其归因于生成没有高地，也不足以证明产品吞掉点击。修正版单次 tap 后等待实际 revision1、committed 和预览退出，再读保存值；流向显示与关闭也等待真实结果状态，不重复点击。root 新增显示路径取景后，测试同时将整个实际 path/coastpoint 映射到当前 camera，检查留出工具/反馈空间的 canvas 边界。高地300m、路径、海陆、持久只读、450秒及零重试合同未放宽。
