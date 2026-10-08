# v43 地方城市港湾已接入可玩闭环

源码 `540af0a9416e84c8cd7cdb76f33563909602ed1a`，engine `68838b9ee0cf1f825be28be670c58238460f6c69ec3bb2800f9e9842f9706035`。WEB-04-37仍进行；WEB-03-06和排队的官网/视频全审查/前10差距未提前开展。

- [本机试玩](http://127.0.0.1:5242/?fms=1)，PID18624，Store45/独立DB。旧v42/5240及43个产物哈希未变，端口存档不自动搬运。手机不能使用PC的127.0.0.1。
- 新建世界→海军：可造船和停靠的港口根据地方城市实际邻海位置生成；沿海辖区里的内陆城市不会自动有港，封闭湖不开放海军港口。选港预览→取消或确认→实际航行抵港→编成新舰队。
- 锚点、五层湿格港湾范围和海路共享实际数据。新局舰队使用合格港口并保持人口+船员、粮仓+船粮守恒；旧档复制保留原布局、舰队和航路。主/备槽未来字段锁定，损坏恢复与CAS保留。
- 合成60城市样例从28个旧沿海辖区港口变为7个城市港口，城市坐标不动。生产浏览器验证取消不改舰队、海路逐日行进，第18日到达真实目标节点、现场造船，刷新和跨标签保护；连续267 Worker ticks后不可变布局仍相同。
- 62项相关回归、全仓类型检查/lint、39发布计划保护、生产构建和43产物审查通过；非全仓全部单测。普通界面空海→原作地形→6国60城→第1日→保存刷新另验；pageerror/console/HTTP错误均无。
- [全景港口](production-harbors.png)、[实际航路](production-route.png)、[舰队细节](production-detail.png)、[抵港造船](production-arrival-build.png)、[普通新局](production-newgame.png)。完整录屏见browser-production.json的video路径。方形军事夹具不代表自然地图美术；428×926不是iPhone。
- 静态原作方法对应与网页适配见[合同](CONTRACT.md)。first-seed是种子集合首格，不是第五层外圈；20湿三角形与原作20 Voronoi格空间尺度不等价。没有原作实机/视频同步或4/16/40倍视觉通过。
- 主包约3.28MiB；体积和Vite配置扩展名警告保留。不宣称性能达标或完整原作等价。首轮样例/测试/脚手架数值问题保留记录，使用修正后源码构建验证。未push/Pages/main。

下一批：Continue WEB-04-37 from playable v43. City-adjacent qualified harbors, stable first-seed anchor and five-layer real wet-cell area are integrated into new-world simulation/UI/save. Existing copied layouts stay preserved; do not repeat v37-v43 recovered leaves. Next close land/naval coordination and remaining military office/cooldown/internal-war rules, native supply/speed fidelity; keep triangle-vs-native-cell adapter explicit. WEB-03-06 follows, then queued official/video full audit/top10. Preserve v42/5240 and older saves/previews. No push/Pages/main changes. For future version scaffolds never replace bare digits inside constants; maintain uint32 bounds and compare frozen behavior.
