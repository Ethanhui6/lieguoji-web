# 行为65：原作国家行为与AI全局配置（2026-10-21）

原作复刻计划第2块第1步。用户2026-10-21强调：一切以原作为主，按原作做法还原。源码10e9daff，本机 http://127.0.0.1:5377/?fms=1 ，产物.autopilot/fms-actions65-checked（构建commit字段为基线912148aa）。culture47引擎49296436…；上一引擎a0a0原字节已冻结。无上传。

## 原作依据（只读，dump.cs与localization.csv）

- StateInfoUI（国家面板）按钮：PlaceArmy、MakeVassal、StartWar、StopWar、Annex、StartAlliance、ClickToExpand、AutoDiplomacy、RTSMode、FamilyDistribution；方法TryStartWar/TryStopWar/TryStartAlliance/ForceLeaveAlliance/TryAnnexState/TryMakeVassal/SetClickToGen。交互为先选行为、再点地图目标国家（StartWarTips“点击其他国家，发动战争”、AllianceTips“点击其他国家，缔结同盟”、ClickGenTips）。
- EditPanelUI“AI全局配置”（ApplyAIGlobalSettingsAndSaveIfNeeded）：9个开关（允许自主外交、允许叛乱、允许附庸叛乱、允许联盟、协助盟友占领土地、自动放弃孤立行省、允许内战、允许家族叛乱、开启附庸）与6个间隔滑条，另有重置选项/参数。
- 联盟文字：AllianceName“{0}-{1}联盟”、AllianceFormedBetweenStates“{0}与{1}结成联盟”、AllianceDisbandedByState。

## 修改

- 国家面板新增“国家行为”：宣战、停战、缔结盟约（ForceAlliance：结束两国相对战争后结盟/入盟/并盟）、退出同盟、点击扩张、本国自主外交；吞并/收为附庸显示为未还原。点盟友宣战、对非交战国停战等无效目标时提示原因并保留选择状态；手机端选择目标时收起面板，完成后回到面板。
- 顶栏“AI全局配置”：允许自主外交、允许联盟、常规战争最长持续时间已接真实规则；其余12项列出并标“尚未还原”。
- 自主结盟：原作nativeUpdateAlliance接入每月外交日程，受“允许联盟”控制；联盟逻辑绑定当前引擎外交上下文与战争结算（war46-alliance为冻结文件未改）。
- 全部为存档中的`global`世界指令，带校验戳由Worker复核；旧引擎按未来格式锁定。

## 实测

- 单测37/37（新增3项：结盟原名与结束两国战争、退盟解散、重放一致；各开关与过期/无变化拒绝；6年推演中允许联盟1个、关闭0个）。type、lint、构建与产物审查135项通过。
- 浏览器（种子421730，桌面/手机）：结盟→面板显示联盟信息；宣战→停战按钮可用；退出同盟；关闭允许联盟后保存刷新仍保持。回归领土64、布局63、手机详情通过；竖屏专用详情用例在桌面视口失败为旧问题，不计。
- 过程失败（均已修正后重测）：桌面宣战点到盟友被引擎拒绝后选择状态退出（改为本地提示并保留）；手机面板遮挡地图无法点目标（改为选择时收起面板）；受控勾选框测试写法。

截图：[桌面国家行为](desktop-nation-actions.png)、[手机AI全局配置](mobile-ai-global.png)。

## 未完成

吞并、收为附庸、解除附庸、叛乱/内战/家族叛乱及其开关与间隔、协助盟友占地、自动放弃孤立行省、放置军队、RTS模式均未还原。原作全局配置保存在游戏设置（跨存档），网页为保证重放记录在每个世界存档中。原作这些开关的默认值未核实。真机与视觉未验。
