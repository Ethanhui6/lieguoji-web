# Worker 真实任务调度候选

仅暂存，未提升；窄单元/静态和独立真实 Worker 机制探针已执行，实际游戏效果仍待主线复查。没有测得游戏延迟中 timer 的百分比，也不把已有 450 秒失败改为通过。

新增私有模块 `src/world/worker-yield.ts`，导出内部 `yieldAtlasWorkerTask()`。能力检测后，以正确 receiver 调用 `globalThis.scheduler.postTask(() => {}, {priority:'background'})`；不给 signal。缺少该方法时使用原 setTimeout(0) fallback。await 调度完成，错误原样传播，不吞错误、不另试 timer、不用 Promise 微任务伪装让出。

Worker 镜像仅导入 helper，并接入 `control`、`durableControl`、`preparationControl` 与 `persist` 原分页 checkpoint。控制层的原 signal、onProgress、timing、所有 checkpoint 次数与预算不变；durableControl 仍不带 signal，已持久后的迟到取消不让核验变成回滚。ACK 等待的 30 秒 timer 与协议、容量、codec、CAS 均未修改。

未改 model 或任何 generator/种子/旧历史闭包。helper 的依赖为空，仅被 Worker 控制层引用；此次不是生成器规则版本变更。

3 个定向测试覆盖：postTask receiver/background/异步完成及同步/异步错误传播；原生 setTimeout fallback 的真实 task 边界；实际 runtime 三种 control 的接线、原取消前后护栏、进度与已持久语义、ownedYield 记录。unit 的 scheduler 是受控模拟，不能单独证明实际浏览器支持或性能改善。

## 检查原始记录

- `checks/first`：首轮配置错误，mergeConfig 继承了根 test.include，意外扩入旧测试范围，立即停止确切 staging vitest 进程，退出 4294967295、35.541 秒，无完成单元报告、不计任何 PASS。窄类型 0 错误；测试中的 this alias 有一项 lint 错误。原日志/前后 SHA/静态诊断保留。
- 仅修 runner 为独立 include、测试改用直接 `expect(this)`；产品 helper/Worker 未因这两处修复改变。`checks/repair1`：只运行新 3 项，3/3、2053.7754 ms、exit 0；窄 overlay 类型 0 诊断、3 文件 lint 无错误/警告，观察源码前后稳定。没有再跑旧 48 项 Worker。
- `checks/browser-mechanism-first`：about:blank 的 Blob module Worker 启动即泛化 onerror，0 个 case、exit 1；没有据此判断 postTask 不支持，保留失败。
- 改探针为独立随机 localhost origin 提供同一实际 helper 模块后，`checks/browser-mechanism-repair1` 在 Headless Chromium 153.0.8010.12 的 Dedicated Worker 实际检测到 postTask。256 次原 timer yield 总计 1252.6 ms，256 次 helper/background postTask 总计 2.4 ms。第 64 次附近发送取消消息：timer 在 65 次终止，parent 回复间隔 4.2 ms；postTask 在 66 次终止，回复间隔 0.1 ms。4 个机制场景通过，exit 0，源码和观察的 dist/build.json SHA 前后稳定；逐次 span 在 JSON。

这些是一个独立 Worker 的单次调度机制证据，非完整游戏、设备吞吐、画面帧率、性能改善比例或原 450 秒流程 PASS。探针不读游戏存档、不改变 dist。没有放宽原游戏 deadline 或取消门。

提升前核对 `baseline-manifest.json` 的生产 Worker SHA；其他人修改时只合并上述控制层小段，禁止覆盖他人变更。`ready-manifest.json` 给出 3 个候选文件 SHA 与明确未检查状态。
