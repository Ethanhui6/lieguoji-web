# v41港湾游弋与停战驻防本地交付

已测源码 `2de4957d0ed10fc9ea1aac22f42551abd1460e8d`，engine `0ccebb5bb5216215be275b2e83af5a83ac937a3ccde7de60865a8d0ca4ce7d64`。完整WEB-04-37仍进行；按用户要求先完成旧任务，新资料全审查/前10差距继续排队。

- [本机试玩](http://127.0.0.1:5238/?fms=1)，PID24052，Store43/独立DB。旧v40/5236与43个产物哈希未变；不同端口存档不自动搬运，手机不能使用此127.0.0.1地址。
- 从绘图进入世界，选择沿海国家→海军→开始时间；选舰可见实际港湾范围与游弋路线。舰队低粮返回真实码头补给。战时出航后在政治面板讲和，可见舰队撤销旧攻击线路，在当前航段结束后重新驻防。
- 60相关回归、全仓types/lint、39发布计划保护、生产构建和43产物审查通过。完整全仓单测未运行。
- 生产Chromium实际港内移动、保存刷新、CAS、取消讲和/确认讲和、无瞬移撤回和再次分配驻地通过；实时Worker连续推进256ticks。普通地形生成→6国60城→推进→保存刷新另验通过。无pageerror/HTTP失败。
- [同视角初始](production-before.png) / [游弋后](production-loiter-overview.png)、[选舰细节](production-loiter.png)、[停战撤回](production-returning.png)、[普通新局](production-newgame.png)。录像见browser-production.json。军事固定样例是方形大陆，用于运动与路线回归，不能代表自然地图美术达标。
- 428×926是桌面仿真，不是iPhone。没有原作实机/视频同步对照、4/16/40倍视觉等价或性能达标声明。主包约3.02MiB，包体与Vite配置扩展名警告保留。
- [合同](CONTRACT.md)区分静态原作证据与网页网格/时钟/返航/补给适配。原作可原地停止，网页走完当前湿边段；原作港湾首府种子/资格与锚点规则未全部恢复。
- 首轮版本化别名错误、单测直接改时钟导致无关日历不一致、开发服监听前导航失败都留证。修复后重验，没有绕过检查或覆盖旧档。
- 未push、Pages或main变化。

下一批：Continue WEB-04-37 from playable v41. Real multi-cell harbor loiter, saved wait/PRNG, low-food dock return and final-war reset/redeployment are integrated. Do not repeat these recovered leaves. Remaining: native capital-neighbor harbor seed/qualification/anchor fidelity, forward-base preference and full native fleet supply/speed mapping, land/naval coordination, military office/cooldown/internal-war rules. Then WEB-03-06, followed by queued official/video full audit/top10. Preserve v40/5236 and earlier saves/previews. No push/Pages/main changes.
