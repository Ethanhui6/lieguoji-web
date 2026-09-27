# 列国纪当前续接

更新：2026-09-27T18:33:35.126Z。以本文件当前状态及实际终态为准；下方preview.16实证是已提交基线，不是preview.17结果。

## 当前状态

- 分支：codex/ph06-world-generation；实际HEAD a909afd76dbbd05755a12ed8922c09cf5fec1bf7。preview.16已本地提交；preview.17五目标及旧16真实历史已提升，尚未提交。
- 当前源码0.5.0-preview.17，真实dist 0.5.0-preview.16，build.json SHA256 967acb893a12067f6ebc434fbdf4fbff14576dcb1132ba522f529281b30d2499。root first 状态：root_failed_repair_required；证据 .autopilot/ph06/branching-relief-checks/first/verification.json。
- PH00—PH05保留既定工程状态；PH06-T3/T4仍in_progress。preview.17相关113/113与静态/构建通过，但实际数值图拒绝、未执行17产品浏览器；preview.16三端是独立旧基线。自然/用户视觉、真机、整体PH及性能均未通过。
- 新Atlas未实现国家、行政区、城市、首都、军队与战争。旧0.4工坊和测试战役仍独立保留，不能冒称新版接入。

## 已提交preview.16基线实证

[preview.16海岸尺度报告](evidence/2026-09-28-ph06-coast-scale.md)与[全部原件](evidence/ph06-coast-scale-2026-09-28/verification.json)。

| 浏览器 | 完整流程耗时 | 结果 |
|---|---:|---|
| desktop-chromium | 265.215 秒 | PASS，源码及产物稳定，450秒、零重试 |
| mobile-chromium | 252.788 秒 | PASS，源码及产物稳定，450秒、零重试 |
| tablet-chromium | 367.954 秒 | PASS，源码及产物稳定，450秒、零重试 |

以上耗时是完整功能测试，不是单次生成或性能验收；移动和平板为浏览器仿真。源码/dist/原测试预算均绑定，未改阈值换绿灯。实际岸线湾岬更多、近景大方格已改善；山包、平原空旷和自然层次仍不足。实际观察与截图SHA在归档中，不据数值凸包比例宣布自然。

## 已有功能与旧记录

- 真实绘制、自动生成候选、确认/取消、追加大陆、撤销、保存恢复、权威细海陆拾取。局部山地已有16×16/两点选区、真实细高程编辑，旧coarse/Hbase与海岸保护。
- 区域锁1/2/3可设置、单项解除、撤销及恢复；私有snapshot分批复制已接入。preview.14三锁→局部山地→混合撤销→恢复三端通过；平板接近450秒限，不能称流畅。[连续曲脊与复用报告](evidence/2026-09-28-ph06-continuous-relief.md)。
- preview.13移动/平板超时、公开原始snapshot长同步片段、preview.15拓扑首轮51/52和视觉拒绝均未删除：[区域保护](evidence/2026-09-28-ph06-lock-snapshot.md)、[中间岸线修复](evidence/2026-09-28-ph06-asymmetric-coast.md)。
- preview.15真实生成闭包原字节已归档；preview.16的11闭包/41源码/53原件已在v4-preview16-history-staging冻结，捕获时HEAD72fd765/sourceIsHead=false、桌面pending是历史事实，不改为后来通过。

## 下一批及明确所有权

1. preview.16已本地提交；preview.17已实际113/113与构建通过、数值图视觉拒绝，原类型失败和修复结果完整归档，本版不执行三端浏览器。先保存本地提交，再等隔离山带改良候选的真实数值预检。
2. 原主支山系已正式接入并检查；报告见evidence/2026-09-28-ph06-branching-relief.md。新改良候选在.autopilot/ph06/v4-orography-visual-fix-staging，仅staging；作者已获准进行有界数值预检，原阈值不变，不能冒充生产检查。
3. preview.17旧历史已冻结于v4-preview17-history-staging（11闭包、42源、73原件）；捕获时sourceIsHead=false和browserExecuted=false为真实历史，不能改写。后续地貌变更前必须核ready并保留这些原件；待候选数值图达标后与界面一起接入新版本再统一浏览器。
4. 界面候选在v4-map-chrome-staging，由game_ui仅写镜像/准备记录，生产未接入。缩放/绘制/状态排布保持可达，不能用隐藏功能或改相机假装放大世界。完成山系检查后再决定提升与受影响验证。

preview.16三端终态已核，preview.17仍须自己的实际证据；没有需要用户输入的登录或秘密。IAB最后实际枚举无标签，旧已存草稿链接和旧tab编号只作历史，不声称当前打开。不要改写或删除用户真实档；需要试玩只另建测试草稿。

## 不变边界

遵守AGENTS、V4、任务依赖及每批1—3项；不可代验的自然用户视觉、真机和正式核图保留待验，不伪造通过。所有新地理保持可编辑权威数据，旧生成器和旧引擎记录按真实指纹兼容。编辑与模拟隔离、存档未来锁写/多标签冲突/备份保护不得退化。

当前仓库Ethanhui6/lieguoji-web，Pages lieguoji-web；唯一Pages原生Git链，main生产、其他分支预览。旧站https://lieguoji-web.pages.dev/未更新。9月24一次试玩例外已消耗；全部PH和必要验收前禁止任何push、远程PR/Issue/Milestone、新预览或生产触发。不绕过pre-push、不另建部署链、只在本地工作。CI配置不等于真实云端CI通过。
