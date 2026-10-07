# v39海港争夺本地交付

已测源码 `282c76c22e09447d317bd67fdafbb90b71b8c62c`，engine `2e99729db51b4ea8bf23b8b1e80c45b364ecba2fe8bbd3bd8079f63ea0f7bb53`。功能提交16bb92b，生命周期修复636554b，实际宣战重载回归9160ab0，截图对比度修复282c76c；完整WEB-04-37仍进行。

- [本机试玩](http://127.0.0.1:5234/?fms=1)，PID32304，独立Store41；本机127.0.0.1不是手机地址。旧v38/5232保留，43个产物哈希不变。
- 绘图→进入世界→新局→选择沿海国家→海军→选择舰队→预览自主夺港→确认；须有真实敌对海港、未载军或交战且粮食足够。预览会明确缺失条件。占领控制与陆地归属分别显示。
- 62相关回归、全仓types/lint、39发布计划保护、生产构建及43产物审查通过。全仓全部单测未运行。
- 生产Chromium按真实UI取消/确认并经过22个海格，在第15日完成固定夹具夺港；陆地城市控制未变，前进据点记录保留；保存刷新、CAS和实时Worker增量9ticks通过。普通原作地形→6国60城→推进保存恢复另验通过。
- 浏览器无pageerror/HTTP失败；428×926无横向溢出，仅桌面仿真。生产截图/录像为固定军事夹具，方形大陆不是地图美术成果。
- [原作方法与适配差异](CONTRACT.md)详列秒数、港湾格数、舰体强度映射、网页海战与经济差异。没有原作运行/视频同步对照，没有iPhone、4/16/40倍视觉或完整原作等价通过。
- 首轮校验参数/类型、日历单位夹具和宣战夹具问题均修复，失败日志保留。开发服重启导航失败单列。占港后的守备速度和同run重载不触发错误停战结算已加回归。
- 游戏主包约2909kB minified，体积/Vite配置警告仍在；不宣称手机性能达标。
- 下一批：Continue WEB-04-37 from playable v39. Native sea-port independent control, attack/recovery, real assault route and forward-base record are integrated; do not recover those leaf methods again. Finish native navy attack/defend role allocation (0.35 ratio alone is not full evidence), multi-cell harbor/loiter, complete postwar return lifecycle, land/naval coordination and remaining military office/cooldown/internal-war rules. Then WEB-03-06, followed by queued official/video full audit/top10. Preserve v38/5232 and earlier saved worlds. No push/Pages/main changes.

未push、未Pages、未改main或任何发布门。
