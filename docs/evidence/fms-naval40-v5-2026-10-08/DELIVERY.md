# v40舰队自主分工本地交付

已测源码 `dbb2fac58e71b41a5cce7ed444838e1039b99670`，engine `dfc26e3d14a493aa64ca0a137d02f7ad6e5b5799a9991f382cb4cde13e18c0c4`。完整WEB-04-37仍进行；新官网/视频全审查按用户顺序继续排队。

- [本机试玩](http://127.0.0.1:5236/?fms=1)，PID24136，独立Store42/DB v40。旧v39/5234保留，43个产物哈希复核不变。不同端口存档不自动搬运，手机不能使用此127.0.0.1地址。
- 绘图→进入世界→新局→选择沿海国家→海军；战时开始时间后自主选择进攻舰队与目标，实际航行并夺取海港。列表显示自主进攻/海港守备；可手动军令接管，空闲后交回自主分工。无需逐舰手点夺港。
- 60相关回归、全仓types/lint、39发布计划保护、生产构建及43产物审查通过。完整全仓单测未运行。
- 生产Chromium未发送夺港命令，第1日已自主出航，尚余21个路线海格，第15日完成固定夹具夺港；陆地城市控制未变。保存刷新、CAS和实时Worker增量10ticks通过。普通原作地形→6国60城→推进保存恢复另验通过。
- 无pageerror/HTTP失败；428×926无横向溢出，是桌面仿真。截图录像采用军事方形夹具，不能代表自然大陆美术验收。
- [原作合同](CONTRACT.md)记录安装二进制与7个方法、ceil指令证据，列出时钟/舰体强度/ID/港湾等网页映射和未完成项。没有原作实机/视频同步对照，没有iPhone与4/16/40倍视觉通过。
- 首轮UI版本分支类型错误及绕过宣战的测试夹具错误已修复，失败日志保留。画面复核发现港口进度弧连至地图原点，dbb2fac增加显式起点，保留修复前截图并重跑生产浏览器；模拟指纹不变，60测试与全仓types/lint沿用44ae341，最终UI另做针对lint、构建与浏览器。主包大与Vite扩展名警告仍存在，无性能达标声明。
- 未push、Pages或main变更。

下一批：Continue WEB-04-37 from playable v40. Native navy attack/defense allocation (float32 ceil ratio, frontline/strength/ID sort, home/target overrides) now drives actual autonomous assaults. Do not repeat recovered role/port leaf functions. Complete multi-cell harbor and within-province loiter, full postwar return lifecycle, land/naval coordination and remaining military office/cooldown/internal-war rules. Then WEB-03-06, followed by queued official/video full audit/top10. Preserve v39/5234 and earlier saves/previews. No push/Pages/main changes.
