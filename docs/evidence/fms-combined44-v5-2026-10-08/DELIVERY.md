# v44 海港封锁与陆战协同

已测源码 `e362d5423a212359fc5b07793021c042acecc0d2`；引擎 `ba4301c52eeacb31808d124ffadaaf8da5daa40d77242f52d3040d0b07ada7a1`。后续证据提交请核实Git HEAD。

- 海军夺港后，当地陆军对军伤害和抵抗削减×2；攻方不必是夺港国，守军修复不受益，途中/海战不借邻港加成。见[原作合同](CONTRACT.md)，依据为限定PE/IL2CPP静态分析。
- [本机试玩](http://127.0.0.1:5244/?fms=1)：Store46/独立库；旧v43/5242与43个旧构建文件哈希不变。复制保留实际港湾和舰队，不重建人口/粮食，不写旧库。该127.0.0.1不能在手机上直接使用。
- 11个实际Worker tick后，预设正在争夺的港口由海军夺下，陆地仍是原控制方；陆军贡献从19.3变为38.7，真实战损与抵抗结算同时推进。夹具起点是将失守港湾和已抵达舰队，不声称本批又验证了从母港航行。
- 本批55相关回归、全仓types/lint、39发布/计划保护、生产构建/43产物审查通过。真实Chromium取消/刷新/CAS/实时Worker和普通空海→地形→6国60城→日结保存恢复通过，无pageerror/console/HTTP错误；不是全仓全部单测。
- [同视角之前](production-before.png)、[夺港后围攻](production-combined-battle.png)、[港口详情](production-captured-port.png)、[竖屏](production-portrait.png)、[普通新局](production-newgame.png)。录像：`D:\游戏\架空地图模拟器\docs\evidence\fms-combined44-v5-2026-10-08\video\page@2ca8c51ce5c6190c9e933d5b7d3d0ce6.webm`。方形战役夹具不代表自然地图美术；428×926是桌面仿真。
- 主包3574655字节；包体积/Vite扩展名警告保留，不宣称性能达标。静态代码规则已对应，但没有原作实机/视频同步、全景4/16/40倍视觉或iPhone通过。完整WEB-04-37尚未完成。
- 首轮样例军粮超界、版本UI命名冲突均已修，原失败日志保留；未删检查或放宽存档保护。未push/Pages/main。

下一批：Continue WEB-04-37 from playable v44. Native captured-harbor blockade now doubles positive on-province land battle and siege damage, with shared UI contributions; road/sea/defender repair remain unchanged. Do not repeat v37-v44 recovered leaves. Remaining full land/sea coordination: original Army unified paths/crossing restriction lifecycle vs current fleet-transport adapter; military office/cooldown/internal-war rules and native supply/speed fidelity. State+0x310 is isLandArmySeaCrossingRestricted; a single reader is insufficient to invent its lifecycle. Then WEB-03-06, followed by queued official/video full-project audit/top10. Preserve v43/5242 and earlier saves/previews. No push/Pages/main.
