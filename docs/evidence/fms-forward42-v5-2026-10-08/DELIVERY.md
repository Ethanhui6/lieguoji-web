# v42 前进据点与真实补给回航

源码 `3e976066005d912f062fd228954133c9c24fbfe3`，engine `adc39de810e018bc361afbc009be83330c0cc8d2e250ad00ef18164d873d333d`。WEB-04-37仍进行；WEB-03-06和用户排队的官网/视频全审查/前10差距未提前开展。

- [本机试玩](http://127.0.0.1:5240/?fms=1)，PID22828，Store44/独立DB。旧v41/5238及43个产物哈希未变；端口存档不自动搬运。手机不能使用PC的127.0.0.1地址。
- 从绘图进入世界→选择沿海国家→海军→开始时间。战时夺港后，防守舰队可在敌国土地旁的已占海港实际游弋；面板说明前进据点与无本地补给。已有驻地、当前港口均无效时才用前进据点作为权重偏好，不强制选中。
- 缺粮则暂缓新夺港，选择实际可达、具备余粮的本国港口；进入海段后失港不会瞬移。玩家军令、载兵和海战优先。补给后可继续原战略。
- 62项相关回归、全仓types/lint、39发布计划保护、生产构建/43产物审查通过；没有运行全仓全部单测。
- 生产Chromium验证敌方陆地上的夺港守备路线、保存刷新、跨标签CAS、连续293 Worker ticks、真实回港补给；普通界面空海生成地形→6国60城→推进→保存刷新另验。浏览器没有pageerror、console错误或HTTP失败。
- 补给样例第3日船粮由1080增至2360；逐日航程及抵港事件见browser-production.json。首轮整日采样错误要求停靠可见，漏掉同一天补给后再次出航，失败报告保留；修正验收为真实航路、抵港事件、粮食变化，单测另核本地扣粮。
- [同视角前](production-before.png) / [夺港守备](production-defender.png)、[选舰细节](production-detail.png)、[回航](production-resupply.png)、[补给后](production-replenished.png)、[普通新局](production-newgame.png)。录像路径在browser-production.json；合成方形军事地图不代表自然地图美术完成。
- 428×926是桌面仿真，iPhone、原作实机/视频同步对照、4/16/40倍视觉验收均未通过。主包约3.15MiB，包体/配置扩展名警告保留，不承诺帧率。
- [合同](CONTRACT.md)区分原作静态证据、网页补给/时钟/海图适配与已查明未移植的港湾几何规则。未push、Pages或main变化。

下一批：Continue WEB-04-37 from playable v42. Captured foreign-land harbors now support idle garrisons; saved forward base is a native fallback weighted preference; low food yields new attacks to real home resupply, with lost-port edge-safe return. Do not redo v41/v42 leaves. Next complete coherent native harbor geometry (capital-neighbor seeds, sea qualification, frontier-first anchor; static rules recovered in v42 CONTRACT), measuring mapping to actual web cities/sea cells before replacement; then land/naval coordination and remaining military office/cooldown/internal-war rules, native supply/speed fidelity. WEB-03-06 follows, then queued official/video full audit/top10. Preserve v41/5238 and older saves/previews. No push/Pages/main changes.
