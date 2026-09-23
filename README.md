# 列国纪

原创二维架空世界模拟网页游戏。本版本为隔离的测试大陆技术预览，正式地图未提供、未核定。

Node 24.18.1，npm 锁文件安装：`npm ci`。启动：`npm run dev`。完整本地检查：`npm run check`（首次需 `npx playwright install chromium`）。Pages 构建：`npm run build:cf`，仅发布 `dist`。

游戏操作：选择烈军 → 在地图或目标列表选地 → 预览路线、粮耗和风险 → 确认命令 → 继续时间或逐日推进 → 查看战报原因 → 保存 → 刷新恢复。支持暂停、调速、撤退、导出和导入备份。

当前地图是可重复测试的手工大陆，不代表正式五国疆域。存档保存在当前网址的 IndexedDB；不同网址互不共享，跨网址应导出再导入。

续接先读 [docs/AUTO_HANDOFF.md](docs/AUTO_HANDOFF.md)，状态以 [plan/tasks.json](plan/tasks.json) 为准。CI 文件存在不代表云端 CI 已运行；已实现和待验收事项分别记录。
