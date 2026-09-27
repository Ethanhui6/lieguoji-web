# Worker 完整暂存页修复候选

仅暂存，未提升、未运行检查。目标文件与 SHA 在 `ready-manifest.json`；生产基线首次捕获在 `baseline-manifest.json`。提升前必须核对生产 `atlas.worker.ts` 基线；若其他人已更新控制层，应合并 persist 的分页段，不能覆盖整文件。

生产改动限 `AtlasWorkerRuntime.persist`：将固定每 8 块暂存改为现有 512 KiB 按字节填充；算法与 `storage.stageAtlasBlocks` 一致，计入准备标识 UTF-8、每项真实 codec 编码长度、键名 UTF-8 与每项 128 bytes 封套。单项超过整页拒绝。打包每 16 项或提交一页后实际 setTimeout 让出并检查取消；页满后才 stage，最终未满页同样 stage。存储层仍独立重编码校验并保护主备/CAS，没有跳过验证或增加容量。

没有缓存编码字节跨页，临时编码仅用于精确计数。存储公共入口仍一次同步捕获整页，边界保持原 512 KiB；这不是每 16 项存储解码都新增 checkpoint 的声明。真实浏览器长任务与总耗时仍需后续检查。

新增 `atlas-worker-stage-pages.test.ts` 4 项，用真实 Worker persist 方法与 fake-indexeddb，合成 100 个 fine tiles（samples/uniform，含 33×33、33×32、32×32 owner）、coarse 和锁块，跳过自然生成内核：

1. 页上限、非末页装满、不丢不重、暂存期间旧根未变、发布后的备份关系。
2. 打包第 16 项后的真实 timer task 取消；未提交页、主备保持。
3. 第二页暂存失败；原主备保持、同 command 重试一次发布。
4. 已 durable 但返回丢失；按同 command 回执恢复，不重复发布。

这是持久分页定向检查，不能记为真实 Worker 二进制传输、浏览器性能或视觉通过。测试尚未执行，未制造空 PASS 日志。根统一提升后安排窄单元、lint/typecheck/build 和原 450 秒浏览器流程；已有第一次超时证据保留。

只读诊断：`../v4-confirm-latency-audit.md`。没有分项 profile 实测，暂存页数减少不能冒充旧 36 秒已准确归因或性能已通过。
