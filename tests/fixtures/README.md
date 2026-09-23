# 旧规则固定样本

这两个 JSON 是从已发布提交 `262bd7630344d2f0a68604485d7c4395375a291c` 的原始模拟与生成器源码生成的**合成测试数据**，不是用户真实存档或正式地图。

- legacy-demo-0.1.json：五国工程测试大陆，烈军行军三日后正在交战。
- legacy-custom-0.1.json：种子 M3-legacy-regression 的三国六城自建地图，推进七日，包含原版自主军令与真实在途状态。

两者保持原始 schema 1 / rules 0.1.0 / envelope 1 和正确 SHA-256。用于验证新版读取仍保持原规则、导入身份隔离及创建经营副本不写原库；不可用新版生成器重新生成并冒充旧样本。

生成源码的临时快照与脚本在忽略目录 .autopilot/legacy-fixture-source 和 .autopilot/generate-legacy-fixtures.mjs；样本不进入生产 dist。
