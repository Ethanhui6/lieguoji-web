# 列国纪 iOS 原生版 v5.7.0（Build 187）全仓深度代码审计报告与团队编码规范

> **审计日期**：2026-11-26  
> **目标版本**：`v5.7.0`（`MARKETING_VERSION = 5.7.0` / `CURRENT_PROJECT_VERSION = 187` / Server `v10` / Platform `v5.0`）  
> **审计范围**：主代码库渲染管线（`Render/`）、应用状态与界面层（`App/`）、跨平台核心模拟与服务器（`Core/Sources/LieguojiCore` & `LieguojiServer`）、云端行宫后端（`server-deploy/platform/server.py`）与 Cloudflare Pages 边缘分发节点（`functions/api/cdn/[[path]].ts`）。

---

## 一、审计范围与方法

### 1.1 审计模块覆盖矩阵

| 模块域 | 覆盖文件 | 审计重点 |
| :--- | :--- | :--- |
| **Metal 地图渲染管线** | `ios-native/Render/MapView.swift`、`MapRenderer.swift`、`MapEffects.swift`、`WeatherOverlay.swift`、`Energy.swift` | 主线程 GPU 阻塞、60/120fps 平移跟手、CALayer/UIView 级联重排、`CADisplayLink` 循环引用、缓冲区与边界防崩 |
| **网游持久连接与核心引擎** | `ios-native/App/NativeHost.swift`、`GameModel.swift`、`Feel.swift`、`Core/Sources/LieguojiCore/Service.swift`、`NativeView.swift`、`Core/Sources/LieguojiServer/main.swift` | 后台 5 秒冻结窗口断链、断线重连策略、`URLSession`/Socket 泄漏、锁序死锁、RPC 风暴、Linux/Windows 跨平台编译 |
| **国内多源并发下载与后端** | `ios-native/App/OnlinePlatform.swift`、`HotPackManager.swift`、`WorldArchive.swift`、`server-deploy/platform/server.py`、`functions/api/cdn/[[path]].ts` | 256 KB 吞吐实测择优、多源工作窃取分块、SQLite/FD/内存泄漏、慢速连接耗尽线程、Worker 响应流释放与路径穿越 |
| **SwiftUI 界面与生命周期** | `ios-native/App/GameView.swift`、`OnlineHubViews.swift`、`CloudUpdateView.swift`、`OnlineAuthViews.swift`、`TitleViews.swift`、`LieguojiApp.swift`、`OnlineAdminViews.swift` | 强制解包清零、未取消 `Task`/`DispatchWorkItem`、回调未解绑、主线程 `DateFormatter` 分配、表单校验与 `@MainActor` 严格隔离 |

### 1.2 审计方法与自动化验证

1. **逐路径根因追踪（Top-Down + Bottom-Up）**：结合真机卡顿/断联/下载限速实测现象，沿手势事件 → `CADisplayLink` → `MapRenderer.draw(in:)`、App 前后台切换 → `NativeHost` → `LieguojiServer`、测速探针 → 分块调度 → `server.py` / CF Edge 全链路逐行排查。
2. **静态并发与契约审计**：扫描全部修改 Swift 文件的词法界定符平衡、强制解包（`!` / `as!` / `try!`）、autoclosure 内 `await`（`??`/`&&`/`||`）、`nonisolated` / `@MainActor` / `deinit` 隔离边界、跨模块符号解析、嵌入 Metal 着色器抽取，以及 Linux（`Glibc` / Swift 5.10）与 Windows（`WinSDK` / Swift 6.1.2）条件编译守卫。
3. **本地自动化门禁**：执行 `npm run check`（ESLint + TypeScript `tsc --noEmit` + 巡览单测 + Vitest 全量单测）与 `npm run secret-scan`（全历史密钥与隐私路径扫描）。

---

## 二、发现并修复的隐蔽 Bug 清单

### 2.1 总览表

| 编号 | 类别 | 级别 | 核心源码位置（修复后定位） | 问题摘要 |
| :--- | :--- | :---: | :--- | :--- |
| **BUG-01** | 主线程 GPU 阻塞与掉帧 | **P0** | `MapView.swift:605,840-905`、`MapRenderer.swift:1325-1336` | 交互期开启 `presentsWithTransaction = true` 同步 `mtk.draw()` 触发 `waitUntilScheduled` 阻塞主线程 6–12ms |
| **BUG-02** | 主线程 GPU 阻塞与掉帧 | **P0** | `MapView.swift:455-485,865-935,1045-1065,2095-2185`、`MapRenderer.swift:1003-1042` | 平移每帧级联修改 `UIView.frame`、每 5 帧全量标签碰撞重排、每帧拷贝兵力字典与重算 Hermite 曲线 |
| **BUG-03** | 主线程 GPU 阻塞与掉帧 | **P1** | `MapEffects.swift:122,1100-1240`、`WeatherOverlay.swift:35,115-178`、`Energy.swift:38-65` | 平移每帧重建 `CGPath`、空天气区全量扫描与分配、`.fair`/`.serious` 温控过度锁死 15–30fps |
| **BUG-04** | 资源/Socket 强杀与断链 | **P0** | `NativeHost.swift:82-112,798-815`、`GameModel.swift:252-270,354-475` | 切后台 5 秒窗口内拉取 15MB 存档致 iOS 强杀 Socket；断线 6 次后静默踢回本地单机 |
| **BUG-05** | 死锁与锁序反转 | **P0** | `LieguojiServer/main.swift:1322-1335` | `handleLANClient` 持 `clientLock` 期间调用 `streamer.stopForIdle()`（取 `SimStreamer.cond`），锁序倒置可致死锁 |
| **BUG-06** | 死循环与无优雅退出 | **P1** | `LieguojiServer/main.swift:1010-1013,1151-1186,1338-1349` | UDP `recvfrom` / TCP `accept` 错误无退避空转 100% CPU；缺 `SIGTERM`/`SIGINT` 优雅落盘停机 |
| **BUG-07** | RPC 风暴与定时误杀 | **P1** | `GameModel.swift:595,2390-2435`、`NativeHost.swift:119-245` | `refreshArmies` 每步并发 `route` RPC（15次/秒）；`StreamFrameBuffer.nextFrame` 旧超时回调每 2.4s 误杀新等待 |
| **BUG-08** | 内存泄漏与循环引用 | **P0** | `NativeHost.swift:1242,1395-1460,1502`、`OnlinePlatform.swift:562-660,838`、`HotPackManager.swift:116-135,304` | 每 10s 新建未销毁 `RelayLink` `URLSession`；`OnlinePlatform` 重建下载 `URLSession` 未释放旧实例与代理 |
| **BUG-09** | 内存泄漏与循环引用 | **P1** | `MapView.swift:403-417,665,1246,1720`、`MapRenderer.swift:459-520,1552`、`MapEffects.swift:132,198-204,832`、`WeatherOverlay.swift:69` | `CADisplayLink` 强引用 `Coordinator`；离屏未停链路/粒子；Metal 完成回调强捕 `FrameProbe`；释放后后台写回 |
| **BUG-10** | 服务端内存泄漏 | **P0** | `server-deploy/platform/server.py:294-396` | `_rate_buckets` / `_login_failures` / `_blocked_ips` 只增不删，长时运行或遭扫描可耗尽内存 |
| **BUG-11** | DB/FD/连接耗尽与未闭库 | **P0** | `server-deploy/platform/server.py:400-445,1205,1429-1700,2195-2295,2536-2575` | SQLite 缺 `busy_timeout` 与停机 WAL 闭库；HTTP 无套接字超时可被慢连接耗尽线程/FD；大文件整读进内存 |
| **BUG-12** | 句柄泄漏与 Edge 槽位泄漏 | **P1** | `OnlinePlatform.swift:376-425`、`HotPackManager.swift:88-114,283-307`、`functions/api/cdn/[[path]].ts:48,125,185,205` | `ChunkFileWriter` 缺 `deinit` 与 `truncate` 失败清理；热更无原子写与孤儿清理；CF Edge 未取消未消费上游流 |
| **BUG-13** | 空指针与强制解包 | **P1** | `MapView.swift`、`MapRenderer.swift`、`MapEffects.swift`、`GameModel.swift`、`NativeHost.swift`、`NativeView.swift`、`HotPackManager.swift`、`GameView.swift`、`LieguojiServer/main.swift` | 全仓多处 `!` 强解包、越界数组下标、`NaN`/`Inf` 坐标与非正尺寸传入 Metal/`Int()` 触发 `SIGTRAP` |
| **BUG-14** | 大陆线路测速与分发缺陷 | **P0** | `OnlinePlatform.swift:1245-1695`、`HotPackManager.swift:69-76,406-660`、`server.py:133-148,698-715`、`WorldArchive.swift:44,247` | 1 字节 Ping 误选 3 Mbps 源站；CF 免费线路国内 0.13 MB/s；失效域残留；云档先覆盖本地再下载 |
| **BUG-15** | SwiftUI 生命周期与卡顿 | **P1** | `GameView.swift:130,276,406,2187,2302`、`OnlineHubViews.swift:37,1023`、`CloudUpdateView.swift:344`、`OnlineAuthViews.swift:367`、`TitleViews.swift:177,521,1160` | 未取消 `Task`/`asyncAfter` 竞态、`MapController` 回调未解绑、滚动期每行新建 `DateFormatter`、空白账号绕过校验 |
| **BUG-16** | 跨模块集成与构建门禁 | **P1** | `functions/api/cdn/[[path]].ts:32`、`GameModel.swift:182,686`、`Feel.swift:260`、`OnlineHubViews.swift:1029`、`OnlinePlatform.swift:799`、`HotPackManager.swift:286`、`LieguojiApp.swift:609` | ESLint `no-control-regex` 阻断构建；在线态调 `switchToOfflineLocal` 丢云端进度；`deinit`/`@MainActor` 严格并发隔离缺口 |

---

### 2.2 分域逐条详解

#### 一、内存泄漏与循环引用

1. **`RelayLink` 每 10 秒泄漏 `URLSession` 与线程池** — `P0` · `ios-native/App/NativeHost.swift:1395-1465`
   - **根因**：`RelayLink` 实例初始化时即创建独立 `URLSession`，而 `connectAuto()` / `reattachBest()` 周期性构造临时 `RelayLink(code:).status()` 探测后从未调用 `invalidateAndCancel()`，持续泄漏 `URLSession`、委托对象与底层连接线程。
   - **修复**：新增共享静态 `RelayLink.probeSession` 与 `RelayLink.probeStatus(code:)` 专供只读探测复用；实例 `_session` 改为懒加载，并在 `cancel()` 及 `deinit` 中幂等 `invalidateAndCancel()`；同步为 `RelayWSLink`（`:1242`）与 `RemoteLink`（`:1502`）补齐 `deinit { cancel() }`。

2. **`OnlinePlatform` 与 `HotPackManager` `URLSession` 生命周期泄漏** — `P0` · `ios-native/App/OnlinePlatform.swift:562-660,795-841`、`ios-native/App/HotPackManager.swift:116-135,284-307`
   - **根因**：`startSingleStreamIPADownload` 重建 `URLSession(configuration:delegate:)` 时未先释放旧 `downloadSession`（`URLSession` 强持有 `delegate` 形成泄漏）；`OnlinePlatform`、`HotPackManager` 与 `OnDemandFlightBox` 均缺少 `deinit` 会话与任务清理。
   - **修复**：引入 `NSLock` 保护的 `SessionLifecycleBox` 与 `HotTaskBox` 统一接管任务与会话替换/取消；在 `deinit` 中幂等调用 `invalidateAll()` / `cancel()` 与 `session.invalidateAndCancel()`；`IPADownloadDelegate` 增加 `finishLock` 单次交付防重入。

3. **`server.py` 安全限流与封禁字典无限增长** — `P0` · `server-deploy/platform/server.py:294-396`
   - **根因**：`_rate_buckets`、`_login_failures`、`_blocked_ips` 仅在同 IP 再次访问时清理，面对扫描器与随机 IP 流量字典体积单调递增直至 OOM。
   - **修复**：实现 `_prune_security_maps(now, force=False)`，在持 `_sec_lock` 下按 60 秒周期或条目超 2000 时自动驱逐过期键，并设 4000 条硬上限防洪峰打爆内存。

4. **`CADisplayLink` 强引用环、离屏空转与后台回调写回已释放渲染器** — `P1` · `ios-native/Render/MapView.swift:403-417,665,1246,1720`、`MapRenderer.swift:459-520,740-820,1270,1552`、`MapEffects.swift:132,198-204,832`、`WeatherOverlay.swift:69`
   - **根因**：`link` 与 `drift` 将 `Coordinator` 作为 `CADisplayLink` target 形成强引用闭环；`EffectsView.waveTimer` 未在 `self == nil` 时自毁；`MapRenderer` 后台队列闭包与 Metal `addCompletedHandler`/`addPresentedHandler` 强捕获 `FrameProbe` 或在 `releaseResources()` 后回写 GPU 缓冲。
   - **修复**：引入 `@MainActor WeakDisplayLinkProxy` 打破 `CADisplayLink` 强引用环；为 `MapContainerView` / `EffectsView` / `WeatherOverlayView` 补齐 `willMove(toWindow: nil)` 离屏停链停粒子；`MapRenderer` 新增 `released` 标记、`[weak self]` / `[weak probe]` 捕获并彻底清空军团样条缓存。

5. **SwiftUI 视图未取消 `Task`/`asyncAfter` 与 `MapController` 回调泄漏** — `P1` · `ios-native/App/GameView.swift:130,276,406,2187,2302`、`OnlineHubViews.swift:37,173`、`CloudUpdateView.swift:345`、`TitleViews.swift:89,177,521`、`GameModel.swift:657-728`
   - **根因**：`GameLifecycleModifier` 在 `.onAppear` 挂载 6 个 `MapController` 闭包却未在 `.onDisappear` 解绑；多处提示定时、截图、长按、双击开局与页签切换使用裸 `Task` / `DispatchQueue.main.asyncAfter` 造成竞态与内存滞留；`GameModel` 异步任务强捕获 `self` 且无 `deinit` 取消。
   - **修复**：在 `GameLifecycleModifier.teardownMapHandlers()` 解绑全部回调；以 `.task(id:)` 与显式 `@State Task` 取代裸异步延时并在 `.onDisappear` 取消；`GameModel` 引入 `LifecycleHandles` 在 `deinit` 安全取消全部 6 类任务并停止 `NetworkPathWatcher`。

---

#### 二、空指针异常与强制解包风险

1. **渲染管线强制解包与 `NaN`/越界陷阱清零** — `P1` · `ios-native/Render/MapView.swift:441-446,1005,1175,2195`、`MapRenderer.swift:17,914,1075,1256,1410`、`MapEffects.swift:293`、`Energy.swift:27`
   - **根因**：存在 `container!`、`mtk!`、`labels!`、`best!.d`、`mapRect!`、`bar.sublayers![0/1]` 等强解包；`map.province[cell]`、`old[i]` 未判界；`MapLabelsView.cells(...)` 直接 `Int((b.x - r) / cell)` 遇 `NaN`/`Inf` 或极大坐标触发 Swift 致命异常或巨量数组分配；`MapBufferPool`/纹理/顶点绘制缺少正尺寸保护。
   - **修复**：5 个渲染文件清零全部 `!` 强解包；全部下标改用 `indices.contains`；`cells(...)` 坐标校验 `.isFinite` 并钳制于 `-64...64`；`MapBufferPool` 最小 16 字节、`MTLTexture`/`drawPrimitives`/`stride` 严格校验 `> 0`；`Energy.duty` 校验 `load.isFinite` 并钳制档位索引。

2. **应用、核心与服务端强解包及畸形输入崩溃清零** — `P1` · `ios-native/App/GameModel.swift:860,870,950,1371,2310,2450,2890`、`NativeHost.swift:1410-1495`、`GameView.swift:171,1260,2266,2280`、`HotPackManager.swift:62`、`NativeView.swift:8-85`、`LieguojiServer/main.swift:839,872,912`、`server.py:1066,1275,2126,2184`
   - **根因**：多处 `URL(string:)!`、`urls(...)[0]`、`model.map!`、`ahead!`、`state!.fleets![i]`、`labelGridCache!`、`randomElement()!`；`NativeView` 坐标除法未防 `scale == 0` 导致 JSON 编码产出非法浮点；`server.py` 直接 `int(...)` 解析请求头与字段易抛未捕获 `ValueError`。
   - **修复**：全仓修改 Swift 文件实现 **0 处代码强解包**；`NativeView` 增加 `safeScale` 与 `.isFinite` 守卫；`server.py` 引入 `_safe_int(value, default)` 并捕获 `Content-Length` `ValueError` 返回 HTTP 400。

---

#### 三、死锁、锁序反转、死循环与 RPC 风暴

1. **`LieguojiServer` `clientLock` ↔ `SimStreamer.cond` 锁序倒置死锁** — `P0` · `ios-native/Core/Sources/LieguojiServer/main.swift:1322-1335`
   - **根因**：推演线程在 `SimStreamer` 内以 `cond` →（释放后）→ `clientLock` 顺序访问活跃连接，而 `handleLANClient` 退出清理时持 `clientLock` 直接调用 `streamer.stopForIdle()`（内部再取 `cond`），高并发重连场景存在 AB-BA 死锁隐患。
   - **修复**：`handleLANClient` 先完成 `activeDirect` 判断与置空并立即释放 `clientLock`，再在锁外调用 `streamer.stopForIdle()`，全局统一锁层级。

2. **UDP/TCP `recvfrom`/`accept` 异常 100% CPU 死循环** — `P1` · `ios-native/Core/Sources/LieguojiServer/main.swift:1010-1013,1338-1349`
   - **根因**：`recvfrom` 返回 `< 0` 或 `accept` 返回 `invalidSocket`（如 FD 耗尽、套接字关闭）时直接 `continue` 零休眠空转，瞬间吃满单核 CPU。
   - **修复**：异常分支增加 50ms 退避，并在 `accept` 失败路径检查 `serverShuttingDown` 及时跳出主循环。

3. **`GameModel.refreshArmies` 每步并发 `route` RPC 风暴** — `P1` · `ios-native/App/GameModel.swift:595,2390-2435`
   - **根因**：选中行军中的军团/舰队时，每步推演均无去重、无取消地新建强引用 `Task` 请求 `native.route(...)`（最高 15 RPC/s），挤压业务通道并可能回写过期路线。
   - **修复**：新增按 `"\(worldEpoch):\(id):\(state.day)"` 去重的 `lastRouteQueryKey` 与可取消 `routeTask`，回包前二次校验 `!Task.isCancelled`、`worldEpoch` 与点坐标长度 `pt.count >= 2`。

4. **`StreamFrameBuffer.nextFrame` 旧超时定时器误杀新等待** — `P1` · `ios-native/App/NativeHost.swift:119-245`
   - **根因**：`nextFrame` 的 2.4s `asyncAfter` 超时闭包只比对 `epoch` 未绑定单次等待令牌；当旧帧正常唤醒后，2.4s 后旧定时器仍触发并把后续新 `waiter` 提前以 `nil` 唤醒，导致推流周期性空帧与多余 `streamConfig` RPC。
   - **修复**：引入单调递增 `waiterToken` 与可取消 `waiterWorkItem`，在 `reset` / `ingest` / 新 `nextFrame` 时立刻取消前序定时并严格校验 `waiterToken == myToken`。

---

#### 四、未关闭的数据库连接、文件句柄与 Socket FD

1. **后台 5 秒窗口拉取 15MB 存档致 iOS 强杀 Socket 与静默踢回单机** — `P0` · `ios-native/App/NativeHost.swift:82-112,576,798-815`、`GameModel.swift:252-475`、`LieguojiServer/main.swift:106-114,715-760`
   - **根因**：旧版 `parkForBackground()` 在 iOS 约 5 秒冻结窗口内调用 `save` 拉取 10–15MB 存档（3Mbps 需 ~35 秒），必然被系统强杀连接；且 `remoteLost()` 重试 6 次后自动 `fallbackLocal()` 静默降级单机。
   - **修复**：`parkForBackground()` 通过 `BackgroundTaskToken` 仅发 ~30 字节 `streamConfig(playing: false)` + `park`（30ms 内完成云端热备）；服务端升级 **v10** 新增 `resumeWorld(worldId:day:)`（内存 0ms / SSD `world-<id>.lgj` ~50ms，0 MB 上传恢复）与 `catalogs.json` 启动预热；客户端接入 `NWPathMonitor` 断网/切网秒连，改为可取消持久化抖动退避重连（`0.25s → 5s` ±15%），绝不自动切本地。

2. **`server.py` SQLite 未闭库、无忙等待、HTTP 无套接字超时与大文件整读 OOM** — `P0` · `server-deploy/platform/server.py:400-445,1205,1429-1700,2195-2295,2536-2575`
   - **根因**：SQLite 缺 `busy_timeout` 与停机 WAL checkpoint/close；`PlatformHandler` 未设 `socket.settimeout`，慢速/半开连接可永久挂死工作线程耗尽 FD；`handle_hotpack_file` 与 `handle_save_download` 调用 `read_bytes()` 一次性装入内存；上传共用固定 `.tmp` 且未校验实际读取长度。
   - **修复**：开启 `PRAGMA busy_timeout=5000` 与 `temp_store=MEMORY`，注册幂等 `close_db()`（含 `PRAGMA wal_checkpoint(TRUNCATE)`）与 `SIGINT`/`SIGTERM` 异步安全停机；`PlatformHTTPServer` 开启 `allow_reuse_address`、`PlatformHandler.setup()` 强设 `30.0s` 套接字超时；全部文件下载改为 `256 KB` 流式分块写出；上传与热更规则改用随机后缀原子临时文件并做长度校验与异常 `unlink`。

3. **客户端文件句柄与 Cloudflare Edge 响应流泄漏** — `P1` · `ios-native/App/OnlinePlatform.swift:376-425`、`HotPackManager.swift:88-114`、`functions/api/cdn/[[path]].ts:48,125,185,205`
   - **根因**：`ChunkFileWriter` 缺 `deinit`、无双关保护且 `truncate` 失败会泄漏 `FileHandle`；`HotPackManager` 直接覆写目标文件且中断后残留临时文件；CF Worker 对 `HEAD`/204/304/失败响应未 `cancel()` 上游 `Response.body` 占满出向连接槽，且 GitHub API 请求无超时、缺双编码路径穿越校验。
   - **修复**：`ChunkFileWriter` 增加 `isClosed` 锁守卫、`deinit { close() }` 及 `truncate` 失败清理；`HotPackManager` 实装 `atomicWrite` + `cleanupOrphanTempFiles()` + `updateGeneration` 防 `clearCache()` 竞态；CF Edge 增加 `cancelBodyQuietly()`、10s `AbortController` 超时、双编码（`%2e`/`%2f`/`%5c`）与资产来源白名单校验。

---

#### 五、主线程 GPU 阻塞与严重掉帧

1. **彻底移除交互期同步 Metal 上屏（`presentsWithTransaction` / `waitUntilScheduled`）** — `P0` · `ios-native/Render/MapView.swift:605,840-905`、`MapRenderer.swift:1325-1336`
   - **根因**：拖拽、捏合、惯性滑行与运镜每帧将 `mtk.presentsWithTransaction` 切为 `true` 并同步调用 `mtk.draw()`，迫使主线程在 `buffer.waitUntilScheduled()` 中每帧阻塞 6–12ms，导致 120Hz（8.3ms 预算）必然掉帧卡顿。
   - **修复**：永久保持 `mtk.presentsWithTransaction = false`，统一经 `mtk.setNeedsDisplay()` 异步提交 Metal 绘制，并由 `MapRenderer.draw(in:)` 自动消费并清理 `pinnedFrameTime`（>50ms 自动过期）。

2. **平移热路径去级联重排、去全量标签碰撞、去字典拷贝、去 `CGPath` 重建** — `P0` · `ios-native/Render/MapView.swift:455-485,865-935,1045-1065,2095-2185`、`MapRenderer.swift:1003-1042`、`MapEffects.swift:1100-1240`、`WeatherOverlay.swift:115-178`
   - **根因**：平移每帧无条件修改 `overlayHost`/`overlayCanvas` frame 触发 5 个 autoresizing 子视图 `layoutSubviews`；每 5 帧重跑全图空间哈希/SAT 标签布局；松手转滑行瞬间触发一次全量非 `fastPan` 布局；每帧复制兵力三字典；`placedSprites()` 每帧为全部军团重算 Hermite 三次样条；`EffectsView` 每帧重建全部箭头/弧线 `CGPath`；`WeatherOverlayView` 在无天气区时仍全量扫描分配。
   - **修复**：去除覆盖层 `autoresizingMask` 并以 `> 0.25pt` 阈值在禁动画事务中最小化更新 frame；以 `troopsRevision` 门控兵力字典复制；平移/滑行全程走 O(visible) `repositionVisible` 缓存链表，停稳或缩放时一次性全量 `labels.update`；`handlePan(.ended)` 先判 `willFling` 再提交；`MapRenderer.placedSprites()` 缓存静止与同帧坐标；`EffectsView` 纯平移零 `CGPath` 重建仅更新 `.position`；`WeatherOverlayView` 增设 `isZonesEmpty` 与 `purePan` 快路径。

3. **温控帧率策略修复与列表主线程 `DateFormatter` 缓存** — `P1` · `ios-native/Render/Energy.swift:38-65`、`MapView.swift:1254-1315`、`OnlinePlatform.swift:208-250`、`OnlineHubViews.swift:1023-1031`
   - **根因**：原温控在 `.fair` 即把滑行降至 30fps、在 `.serious` 把交互压至 30fps 且 `minimum = f/2`（最低 15fps）；列表与公告每帧渲染均新建 `DateFormatter()`。
   - **修复**：`Energy` 新增 `mapFPS` / `glideFPS` / `effectFPS`（`.nominal` 60–120fps，`.fair` 保底 60fps，`.serious` 手势期 60fps / 静止 45fps，`.critical` 手势期 45fps / 静止 30fps），`pace(_:to:)` 实时同步 `CAFrameRateRange` 与 `mtk.preferredFramesPerSecond`；全面缓存线程安全 `SafeDateFormatter` 与 `@MainActor static let timestampFormatter`。

---

#### 六、中国大陆线路测速与分发缺陷

1. **1 字节 Ping 误选 3 Mbps 源站与国内满速多源并发重构** — `P0` · `ios-native/App/OnlinePlatform.swift:1245-1695`、`HotPackManager.swift:69-76,406-660`、`server-deploy/platform/server.py:133-148,698-715`
   - **根因**：旧版 IPA 与热更均以极小探针（1B / 1KB）按首包延迟排序，导致 25ms Ping 但带宽封顶 3 Mbps（0.37 MB/s）的腾讯云源站长期击败实测 5+ MB/s 的国内高速镜像；同时存在失效域名 `lieguoji-web.pages.dev` 与国内受阻的 `fastly.jsdelivr.net`，且单源轮询无法聚合多源带宽。
   - **修复**：全面切换 256 KB Range 持续吞吐测速（`Range: bytes=0-262143`，6s 超时，校验 HTTP 206 / `Content-Range` / ZIP 魔数），通过 `ProbeMetricsDelegate` 计算真实体传输速率，严格将高速外镜（≥ 0.15 MB/s）按 `MB/s` 降序排于 `111.230.153.235` 源站之前；IPA 启用 Top 3 加权 `WeightedMirrorPool` + 8 路动态工作窃取 2 MB 分块并发下载，热更启用 6 路实测国内 RAW 镜像 + Top 3 12 路跨镜分发与大文件 4 路 Range 分片，彻底移除/过滤失效域名。

2. **云端存档下载前误覆盖本地归档与 URL 编码缺失** — `P1` · `ios-native/App/WorldArchive.swift:44-50,247-265`
   - **根因**：`openCloudSave` 先暂停并归档本地世界再下载云档，断网失败即污染本地 `卷宗/`；`saveId` 与 `roomCode` 未做 URL Path 百分号编码。
   - **修复**：改为先下载并校验非空 JSON 头，确认完整后再暂停/归档/覆写；统一通过 `encodedSaveID(_:)` 与路径编码拼接请求 URL。

---

#### 七、Phase 2 跨模块集成与构建门禁补修（本轮审计直接修复）

1. **`functions/api/cdn/[[path]].ts:32` — ESLint `no-control-regex` 构建失败修复**
   - **问题**：正则 `/[\x00-\x1f\x7f]/` 触发 ESLint `no-control-regex` 错误，阻断 `npm run lint` 与 Cloudflare Pages `npm run build:cf`。
   - **修复**：替换为纯字符码循环 `hasControlChars(value: string): boolean`，零告警通过 `eslint` 与 `tsc --noEmit`。
2. **`ios-native/App/GameModel.swift:182` — 在线态手动切换离线丢失云端进度修复**
   - **问题**：从行宫点击「离线单机」调用 `switchToOfflineLocal()` 时，若当前仍在线（`remoteAddress != nil`），原实现直接调 `native.fallbackLocal()` 丢弃云端最新天数而非先拉取 `save`，且未立即终止在途推流循环。
   - **修复**：先判断 `wasConnected = (remoteAddress != nil)` 并立刻取消活跃推流 `loop`；若原在线则调用 `await self.native.disconnect()` 无损拉回云端最新存档，若原已断线再回落 `fallbackLocal()`。
3. **`ios-native/App/Feel.swift:260` — 设置页在重连态关闭云服未停重连任务修复**
   - **问题**：处于 `remoteReconnecting == true`（此时 `remoteAddress == nil`）时在设置页切回离线，旧代码仅判断 `remoteAddress != nil`，导致后台重连循环继续运行；同时界面残留 `v9` 文案。
   - **修复**：关闭开关且无活跃连接时调用 `model.switchToOfflineLocal()` 彻底停掉重连任务，并同步 `v10` 文案。
4. **Swift 5.10 / Xcode 26 严格并发隔离加固** — `OnlinePlatform.swift:799`、`HotPackManager.swift:286`、`GameModel.swift:686`、`OnlineHubViews.swift:1029`
   - 为 `@MainActor` 类中在 `nonisolated deinit` 内访问的 `session` / `lifecycle` 常量统一显式标注 `private nonisolated let`；为 `HubSavesTabView.formatTimestamp(_:)` 补齐 `@MainActor` 标注以匹配 `@MainActor private static let timestampFormatter`。
5. **版本元数据与更新志全仓对齐** — `LieguojiApp.swift:609`、`OnlineAdminViews.swift:36-37`
   - 在 `ReleaseNotesSheet.notes` 顶部补齐 `5.7.0` 完整更新志条目，同步管理台默认发布版本号至 `5.7.0 / 187`。

---

## 三、团队安全与高质量编码规范（强制准入红线）

### 3.1 Swift 并发与内存生命周期规范

1. **零强制解包铁律**：业务代码严禁出现 `expr!`、`as!`、`try!` 与未校验长度的 `[0]` 下标（`FileManager.urls(...)` 必须用 `.first ?? temporaryDirectory`）；所有可选值均须 `guard let` / `if let` / `compactMap` / 默认值处理。
2. **严禁 autoclosure 内 `await`**：禁止在 `??`、`&&`、`||`、`assert()`、`precondition()` 右侧直接写 `await` 表达式，必须先以局部常量 `let val = await ...` 求值后再参与短路运算。
3. **Actor 与 `deinit` 隔离规范**：
   - `@MainActor` 类中需在 `deinit` 清理的资源（`Task` 句柄盒、`URLSession`、`NWPathMonitor`），必须封装于 `@unchecked Sendable` + `NSLock` 的不可变 `private nonisolated let` 成员中。
   - **禁止**在非 Actor、非 `@MainActor` 的普通类/嵌套类（如 `OnDemandFlightBox`）上写 `nonisolated` 修饰符。
   - `@MainActor` 静态属性的所有直接调用函数必须显式标注 `@MainActor` 或改为线程安全锁封装（`SafeDateFormatter`）。
4. **杜绝一切循环引用与悬空异步任务**：
   - 严禁将 `self` 直接作为 `CADisplayLink` / `Timer` target，必须经 `WeakDisplayLinkProxy` 或在闭包内 `[weak self]` 并在 `self == nil` 时自动 `invalidate()`。
   - 所有 SwiftUI 定时/延迟动作必须使用 `.task(id:)` 或显式 `@State var xxxTask: Task<Void, Never>?`，在重入与 `.onDisappear` 时取消并校验 `guard !Task.isCancelled else { return }`。
   - 凡 `UIView` / `Coordinator` 在 `.onAppear` / `init` 挂载的外部闭包、定时器或粒子层，必须在 `.onDisappear` / `willMove(toWindow: nil)` / `stop()` 中对称解绑或暂停。
   - 任何独立创建的 `URLSession`（尤其是带 `delegate` 的会话）必须在完成、替换、取消和 `deinit` 中幂等调用 `invalidateAndCancel()`；只读短探针统一复用静态共享 `URLSession`。

### 3.2 Metal 渲染与主线程流畅度红线

1. **严禁交互期阻塞主线程等待 GPU**：地图 `MTKView` 永久保持 `presentsWithTransaction = false`，严禁在手势/惯性滑行回调中同步调用 `mtk.draw()` 或触发 `waitUntilScheduled()`。
2. **平移热路径零重排、零全量扫描、零 `CGPath` 重建**：
   - 覆盖层子视图禁止挂载 `autoresizingMask` 随父容器每帧级联触发 `layoutSubviews`，`frame` 变更须设置 `> 0.25pt` 阈值并包在 `CATransaction.setDisableActions(true)` 内。
   - 纯平移/滑行帧仅允许 O(visible) 更新 `.center` / `.position`，全量标签避让、字典复制、Hermite 样条重算与 `CGPath` 构建必须由修订号（`troopsRevision`/`armiesRevision`）或停稳/缩放事件门控。
3. **数值与 GPU 缓冲安全守卫**：凡传入 Metal、CoreAnimation、`UIGraphicsImageRenderer` 或 `Int(...)` 的尺寸、坐标、缩放比与时长，必须校验 `.isFinite` 与正范围；`MTLBuffer` 长度至少 `max(16, length)`，`drawPrimitives` 前必须确认 `vertexCount > 0`；列表渲染严禁每次 `body` 求值新建 `DateFormatter`。

### 3.3 网游长连接、重连与高速分发规范

1. **后台冻结窗口预算 ≤ 1 秒**：iOS 切后台（`parkForBackground`）严禁执行多 MB 存档拉取或重型 I/O，必须借 `UIBackgroundTaskIdentifier` 仅发送轻量控制帧（< 1 KB），状态持久化交由服务端热保留与异步双写磁盘。
2. **断线永不静默降级**：在线模式遇断链或网络切换，必须通过 `NWPathMonitor` + 可取消抖动指数退避持续重连，并优先走 `worldId` 感知秒级热续连（0 MB 上传）；仅当用户显式点击「离线单机」时才切换本地，且若当前在线须先 `disconnect()` 无损同步云端进度。
3. **锁序与跨平台铁律**：服务端严格遵守单一锁层级（绝不在持 `clientLock` 时获取 `SimStreamer.cond` 或 `engineLock`）；所有阻塞系统调用（`accept`/`recvfrom`）失败必须退避防 CPU 100%；`LieguojiCore`/`LieguojiServer` 须同时守住 Linux（`Glibc` / Swift 5.10）与 Windows（`WinSDK` / Swift 6.1.2）条件编译，且 `NSNumber` 解包必须附 `?? (v as? Int/Bool)` 兼容 Linux Foundation。
4. **国内加速线路必须实测吞吐**：严禁以 1 字节 Ping/TTFB 作为大文件下载源排名依据；必须采用 ≥ 256 KB Range 实测 `MB/s` 降序排位、校验 HTTP 206 + `Content-Range` + 文件魔数，源站严格置尾兜底，并彻底剔除不可用或被墙域名。

### 3.4 Python / SQLite 后端与 Edge Worker 资源规范

1. **数据库连接与停机**：SQLite 必须开启 `WAL` + `busy_timeout=5000` + `temp_store=MEMORY`；服务端必须捕获 `SIGTERM`/`SIGINT`，异步 `server.shutdown()` 后执行 `PRAGMA wal_checkpoint(TRUNCATE)` 并幂等 `close_db()`。
2. **内存有界与套接字防挂死**：所有内存限流/缓存字典必须带周期性 TTL 裁剪与硬上限；HTTP Handler 必须设置套接字读写超时（≤ 30s）；多 MB 文件响应一律按 256 KB 分块流式读写，严禁 `read_bytes()` 整读；写文件统一使用随机 `.tmp` + 原子 `replace` + 异常 `unlink`。
3. **Edge Worker 安全与流释放**：未直接透传给客户端的上游 `Response.body`（如 `HEAD`/204/304/错误响应）必须调用 `body.cancel()` 释放出向连接；外部请求必须配 `AbortController` 超时；路径参数必须同时校验单/双编码穿越（`..`、`\`、`%2e`/`%2f`/`%5c`）与控制字符（使用字符码检查而非控制字符正则）。

### 3.5 CI 与发布门禁清单（合入 `main` 前必过）

| 检查项 | 执行命令 / 机制 | 通过标准 |
| :--- | :--- | :--- |
| 前端 & Edge Lint + 类型 + 单测 | `npm run check`（`eslint` + `tsc --noEmit` + `node --test` + `vitest run`） | 0 error、0 warning、全量单测绿灯 |
| 密钥与隐私路径扫描 | `npm run secret-scan` | 0 泄露命中 |
| Swift 静态合同核验 | 界定符平衡、0 强解包 `!`、0 autoclosure `await`、`nonisolated`/`@MainActor` 边界、Metal 着色器抽取 | 全部通过 |
| 版本元数据四端一致 | `ios-native/project.yml`、`CHANGELOG.md`、`LieguojiApp.swift`、`server-deploy/platform/server.py`、`functions/api/cdn/[[path]].ts` | 版本 `5.7.0` / Build `187` 完全对齐 |
| 远端 GitHub Actions | `core-linux`（Swift 5.10 测试与 `LieguojiServer` 构建）+ `archive`（macOS 26 Metal 校验 + 无签名 IPA 归档） | 全绿并发布 Release |
