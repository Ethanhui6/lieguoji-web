# 本地验收证据：测试大陆 0.1.0

时间：2026-09-23（Asia/Hong_Kong）；不是正式地图、真机或云端验收。

## 工程

实际空目录创建，未发现可复用源码、Git历史、ZIP或参考图。只按明确附带文件路径读取 v3 指令并保存原文。
Node 24.18.1 / npm 11.16.0；TypeScript 6.0.3 / React 19.3.0 / Vite 8.3.0 / PixiJS 8.21.0。package-lock.json 固定依赖。
`npm run check` 于 14:23 执行成功：计划校验 15 项、ESLint、TypeScript、Vitest 59/59、真实生产构建、dist 白名单审查、Playwright 15/15。
Vitest：54 项 sim-core + 5 项保存层。没有跳过用例、无测试强制成功或 --if-present。
依赖审计：原 Wrangler 4.118.0 有4项高危传递依赖，升级项目依赖到4.136.3后完整 npm audit 为0；生产依赖 audit 同为0。
产物16个文件，仅HTML/JS/CSS/SVG/build.json/Pages静态配置；无docs/plan/references/真实存档/源映射。主入口压缩前约545KB、gzip166KB，Vite的大包提示保留，未以增大阈值掩盖；未作低端真机性能结论。

## 真实浏览器操作

Playwright 1.63.0，Chromium 153；production preview 应用与 Pages 相同 CSP 响应头，未放开 unsafe-eval。
15 个用例 = 桌面1440×960、Pixel7手机仿真、iPad7平板布局仿真 × 5场景。
报告统计：expected15 / unexpected0 / flaky0 / skipped0，运行42.14秒。原始结果位于本地忽略目录 test-results/results.json，截图与trace按用例保存。

1. 真实Worker创建与JS MIME；取消命令不会移动；预览显示3日/620守军；烈军行军3日接战；推进至18日，兵力从1250降至1017，测试中林实际控制转烈国、法理仍属明反；展开事件原因；保存并刷新后日期和兵力一致。
2. 接战后主动撤退，回到烈城；12×推进后暂停确实停止；导出下载；坏档拒绝且不显示成功；刷新原进度保留；重新导入有效导出文件恢复。
3. /campaign/test 深链接直入与刷新；build.json；放大125%与归位100%；桌面拖动、手机/平板CDP真实触摸序列完成单指拖动与双指缩放；地图截图状态变化，页面无横向溢出。
4. 未来版本current存档存在时，启动明确锁写，保存操作拒绝，存储内容字节级不变。
5. 两个标签同时打开；新标签保存新进度后，旧标签写入被revision比较拒绝；刷新恢复较新进度。

首个完整闭环分别在三个尺寸检查 console error/pageerror/requestfailed 均为空，地图与Worker加载正常。无外部图片或字体依赖。
手机仿真之外的独立手势观察：100%→236%，不误开抽屉；核心按钮44px，窗口不滚动，抽屉独立滚动。
以上均不等于 iPhone Safari、Android 真机、低端性能或长时间稳定性验收。

## 保存保护修复与复核

独立只读复查曾复现旧标签覆盖、新版存档覆盖、并发保存丢最近备份，现已修复并回归：
- current/revision 二次比较和 backup/current/revision 写入同一readwrite事务；过时写入拒绝且各槽不变。
- 同revision并发只允许一个成功；备份是实际上一有效状态。
- future主槽在任何备份回退前拒绝，旧客户端不能覆写；读取失败后hook持续锁写。
- 保存/导入/新局失败继续抛出给界面，不显示假成功。
- 已知坏主槽可回退上一有效备份并保留正确revision。

## 未通过 / 未执行

- GitHub真实账号未验证：旧授权401，发起的设备码因未完成授权超时。远端仓库/Issue/里程碑/保护规则/真实CI尚未创建或运行。
- Cloudflare CLI OAuth过期，官方控制台仍在登录页；未查询到账户/项目，未创建Pages、未部署，没有实际HTTPS网址。
- CI yml只代表检查链已实现，不能等同远端绿灯。官方Action完整SHA已通过GitHub REST核实，来源见GITHUB_WORKFLOW.md。
- 原v2包/100项计划/正式参考图缺失；正式核图、真机、M2-M6内容待后续，不伪造阶段通过。
