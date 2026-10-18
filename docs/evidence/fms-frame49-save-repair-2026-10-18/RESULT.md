# 方案 C 接续：帧循环版本的保存恢复验收补全

2026-10-18。接续 Claude 留下的移植路线与 frame49 方案 C；基线 fabb9811。仅修改三个浏览器测试，不更改生产模拟、引擎、地图或存档格式。

## 实际修复

- compat：当前新世界使用 generations-v1，冻结旧世界仍使用 zh-journal-v2。强制验证真实存档非空、完整槽位键值、四条初始化规则及精确追加动作。修复原先 undefined 对 undefined 的空比较漏洞。
- resume：记录真实 Worker 已确认日志，在注入故障后要求恢复 load 与完整日志相等；继续与暂停两条路径都保留原有时间推进断言。
- save-scope：验证全部六个存档库。旧 newworld-v3 与当前 generations-v1 分开，当前库未来格式阻止创建，其他旧库未来格式允许独立新世界但不许覆盖原值。

## 本次真实结果

三个文件 desktop-chromium 串行 **60/60 通过**，零跳过、零失败、零 flaky、零重试，400.623 秒。其中 42 项使用冻结旧引擎实际继续、保存、刷新恢复。之前六项失败及两项原先可能空比较的检查全部经过修正后通过。

ESLint（变更的三个文件）、全仓 TypeScript、git diff --check 通过。生产代码未改，复用已检查的 frame49 构建；本批没有重新构建，也没有重测吞吐。没有手机真机或视觉等价验收。

测试产物 `.autopilot/fms-frame49-checked`：build.json 绑定 8eb9f145eb40a55a4b955c3ce8498bf336d9aa0b，引擎 b28381cefe433e367967f088a429cd6969a3de011f630e1a7466ad43f9a5d7a2；测试同时比较在线 build.json 与本地产物。入口 http://127.0.0.1:5363/?fms=1，仅本机；本次确认监听 PID 28704，不保证跨会话存活。

机器结果见 verification.json；原始完整报告 `.autopilot/fms-frame49-save-repair/results.json`，日志 `.autopilot/fms-frame49-save-repair-browser.log`。这些是合成测试世界，未读取或覆盖玩家真实存档。

执行：设置 GAME_BASE_URL=http://127.0.0.1:5363、GAME_BUILD_DIR=.autopilot/fms-frame49-checked；运行 `npx playwright test tests/fms-culture47-compat.spec.ts tests/fms-culture47-resume.spec.ts tests/fms-culture47-save-scope.spec.ts --project=desktop-chromium --workers=1 --retries=0`。实际运行另设置输出目录与 JSON reporter，详见 verification.json。

## 接下来继续原计划

方案 C 的真实分批调度、原作进攻箭头和逐军 AI 尚未实现；本次没有把验收修复称作玩法变化。需要先把当前逐日全军 AI 拆成逐军消费，再接版本化的帧轮转；不能把每日经济结算改成每帧重复结算。旧帧循环 Worker 在规则变更前须按现有流程冻结，旧档不得自动迁移。

所有发布锁、正式站、真机和用户视觉门保持原状；无 push、上传或部署。
