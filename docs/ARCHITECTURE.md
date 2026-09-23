# 架构

React 管理界面，PixiJS 8 负责二维地图；地图读取 World 快照而不自行模拟战争。
src/sim 为纯 TypeScript 确定性规则与测试大陆数据；sim.worker.ts 是浏览器 Web Worker，所有运行中命令/步进经带请求 ID 的消息执行。
useGame.ts 负责线程请求、超时、暂停调速和持久化接口；切页或卸载终止线程。预览调用同一 sim-core 规则，确认时由 Worker 再校验。
Province 分 legalOwner/controller；Nation 分 regimeId/dynastyId；City position/label 独立。没有首都失守即灭国规则。
IndexedDB 保存当前槽和前次有效备份。SHA-256 校验 JSON 世界对象；schemaVersion=1，rulesVersion=0.1.0。不进行破坏性迁移。
网页只包含应用、演示数据和必要静态资源；无 Cloudflare 后端循环，不使用 D1/R2/DO。
