# PH04 storage 检查证据转录

证据性质：**tool-output transcript（工具输出转录），不是测试进程当时重定向生成的原始 stdout 文件。**

执行检查时没有单独落盘 stdout；本目录按当前会话中实际返回的命令、退出码和结果整理。为归档没有重跑任何测试。未记录或反推任何一轮源码 SHA。现有 `.autopilot/ph04/source-snapshots/` 由主代理维护，本目录不擅自声称某个快照对应某一轮检查。

- 工作目录：`D:\游戏\架空地图模拟器`
- Shell：PowerShell，`login: false`
- 会话日期环境：2026-09-24；时区环境：Asia/Hong_Kong。
- Vitest 只打印了 `HH:mm:ss`；下面保留其原样时间，不补造 UTC 时间或精确结束时刻。
- 时间未知的静态检查记为 `null`；退出码来自实际工具结果。

| 轮次 | 范围 | Vitest 打印开始时间 | 耗时 | 结果 | 退出码 |
| --- | --- | --- | --- | --- | --- |
| 01 | 第一版独立块/根存储 | 03:53:03 | 16.65 s | 24/24 | 0 |
| 02 | stage 未来版本锁写及主备计量修正 | 03:57:15 | 21.14 s | 26/26 | 0 |
| 03 | 第一批最终正确性版本，补并发损坏回执 | 03:59:01 | 21.11 s | 27/27 | 0 |
| 04 | 增量会话第一轮，原 27 项与新增 14 项 | 04:14:05 | 70.46 s | 40/41；1 项超时 | 1 |
| 05 | 仅调整单元 fixture 的显式调度器后 | 04:16:05 | 46.77 s | 41/41 | 0 |

每轮完整单元命令相同：

```powershell
.\node_modules\.bin\vitest.cmd run src/world/storage.test.ts
```

静态检查命令及结果见 `summary.json`。五轮自身 ESLint 均退出 0；前四轮自身定向 TypeScript 检查均退出 0。第五轮只修改 fixture helper 的已有函数实参，重新运行了该文件测试和三文件 ESLint，**没有再运行 TypeScript**，不能将前一轮类型检查写成第五轮新结果。

此前另有主代理统一 lint 报告：`src/world/storage.ts:100:68` 的 `no-unused-expressions`。本代理将 `absent ? resolve(null) : reject(...)` 改成明确 `if/else` 后，上述自身检查通过。这个初始 lint 失败来自主代理消息；本目录未持有其原命令、时间、stdout 或退出码，因此单独标注，未补造完整日志。

第四轮唯一失败是旧用例 `known damaged current content allows only explicit backup recovery, then independent fork preserves raw source` 在默认 5000 ms 预算内未结束，报告该项 5416 ms。失败摘要完整转录在 `04-incremental-first-failure.tool-output.txt`。

修正范围仅为单元 fixture helper：向 prepare、stage、commit、open/readPage 显式传入已有 `yieldTask: async () => {}`。这去掉了该单元合成流程反复完整恢复所累计的真实计时器等待；没有放大测试超时、删除断言、跳过 IDB 或减少规则校验。专门的取消、abort 和 late-cancel 用例继续使用它们自己的控制器与调度边界。生产协作 yield 未因此取消。

本目录证明的是上述定向正确性检查，**不是浏览器验收、完整 PH04 通过或局部编辑 250 ms 性能达标证据**。
