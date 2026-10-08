# v45 月度海军补建

已测源码 `c9c81f1f596e3244504516de45f071250cbcb135`；引擎 `3db316ba4f672dac0a0a64eb0fb4602f2074eaceed1833e36318f4c465ee1ab4`。后续证据提交核实Git HEAD。

- 原作受控港口数量决定自动配额；月度造船受族群、现任君主特性与失港影响。实际完工才在港口出现舰队，扣40船员和2400人日粮。见[原作合同与适配差距](CONTRACT.md)。
- [本机试玩](http://127.0.0.1:5246/?fms=1)：进入世界后开新局，或明确创建海军补建版副本；海军页可查看工期与等待原因。Store47/独立库；原v44/5244与43个旧构建文件哈希未变。该地址仅PC本机，手机不能直接使用PC的127.0.0.1。
- 真实Worker从合成二月日期边界推进120tick：港口出现一艘船、40船员、60日粮，累计下水1，存档刷新保持。合成夹具已有剩余1月船体，不声称连续观察六个月；六次更新工期用数值回归覆盖。
- 本批61相关回归、全仓types/lint、39发布/计划保护、生产构建/43产物审查通过；不是全仓全部单测。Chromium真实Worker/取消/刷新/CAS和普通空海→原作地形→6国60城→日结保存恢复通过，无pageerror/console/HTTP错误。
- [月度更新前](production-before.png)、[实际下水后定位舰队](production-launch.png)、[428×926竖屏](production-portrait.png)、[普通新局](production-newgame.png)。录像：`D:\游戏\架空地图模拟器\docs\evidence\fms-shipyard45-v5-2026-10-08\video\page@42b2ecd00874a3f4c45093f4f05110f3.webm`。固定造船夹具为方格地形，仅验功能；不作原作自然地图美术对照。
- 主包3715345字节；体积和Vite扩展名警告保留，未宣称性能达标。iPhone/原作视觉/4、16、40倍全套对照未过。
- 原作Trim超额裁舰尚未接，旧舰队、船员、运输陆军保留；下水受阻保留完成工期是网页政策；原作统一Army跨海路径仍需恢复。这些未完成项未标为等价。
- 首轮夹具陆地归属/派生政治数据不一致导致校验失败，已改为只设海港异主；失败证据保留，没有放宽校验。审查辅助命令一次引号错误，改用保存脚本完成。未push/Pages/main。

下一批：Continue WEB-04-37 from v45. Monthly native naval quota/build duration/queue now produce real browser fleets, using existing crew/grain and save protections. Cross-sea restriction normal native calculation returns false and UpdateNavy clears it; do not invent a threshold from its field name or repeat these recoveries. Remaining material gaps: original unified Army sea path versus browser transport mission capacity; native excess-fleet retirement versus retained crew/cargo; native speed/supply and military appointment/internal-war timing. Then WEB-03-06, followed by queued official/video full-project audit/top10. Preserve v44/5244 and older saved versions. No push/Pages/main.

应用内浏览器 tab17 已准备并保存另一份普通UI生成的新局（6国60城，第1日，暂停在海军页），可直接开始时间。此用户可见试玩与合成造船验收夹具不同；没有读取、搬迁或覆盖其他端口的旧档。
