# 第10步余项：自定义人口与自定义防御（2026-10-21）

## 原作依据
- `ShowSetCustomPopulationPanel` 确认（b__1）：当前/最大人口转为内部人口，province 写入锁定标志、最大人口、当前人口=min(当前,最大)；输入无效时显示 SetCustomPopulationInvalid 原文。
- `ShowSetCustomDefensePanel` 确认：当前/最大城市防御、主场作战效率（ClampCombatEfficiencyModifier），锁定最大城市防御/锁定主场作战效率；无效时 SetCustomDefenseInvalid 原文。提示文字均取 localization 原文。

## 网页实现
- `province` 命令新增 `population`（当前、最大）与 `defense`（主场作战效率1—10、锁定）。人口写入 statecraft 人口与 finance 最大人口；主场作战效率写入原生 storedDefense/locked：锁定时保留玩家值，未锁定时按地形、生态与要塞规则重算（与原作锁定说明一致）。
- 未还原并标明：锁定最大人口（网页推演中没有重算最大人口的流程，开关无实际作用，故禁用）；当前/最大城市防御与锁定最大城市防御（网页没有城市血量，围攻用抵抗值）。

## 验证
- 冻结 87f0 引擎；新引擎 ddc46c61…；发布审计通过。
- 单元 province-edit72 5/5；浏览器 fms-province72 桌面/手机/平板 6/6。
