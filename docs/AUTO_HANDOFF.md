# 自动接管检查点

更新时间：2026-09-23 14:27（Asia/Hong_Kong）。任务源：plan/tasks.json；验收证据：docs/evidence/2026-09-23-local-acceptance.md。

## 已核实状态

- 项目：列国纪 / 测试大陆。首次为空目录；指令来自用户明确附带文件；原 v2 包、100 项任务及原图未取得，未扫描其他目录。
- 游戏源码提交：4110c49df794840861f625d48f5b3a9ae7970193；分支 main。此文件是随后交接补记，续接用 git rev-parse HEAD 核对当前文档提交；本地 .autopilot/checkpoint.json 保存最终完整HEAD和构建信息。
- GitHub：没有 remote，未创建/复用仓库，实际账号未验证。旧 gh 授权401，官方设备授权尚未完成。Issue、M0—M6里程碑、远端CI、主分支保护均待真实登录后配置。
- Cloudflare：未创建Pages，未部署。CLI OAuth过期，官方控制台为登录页。项目ID/账户ID/线上URL均未知，未猜造。
- 部署模式：仍优先原生 Git 集成，未创建锁定类型；无自动生产链运行。CI配置只有检查job，未添加Direct Upload生产链。
- 本地生产预览：http://127.0.0.1:4173（仅本机，非HTTPS上线）。复跑先检查该地址的build.json是否属于本项目；端口被其他项目占用时不得终止陌生进程。

## 已完成与待验收

- M0-001/002/003：锁定工程、真实检查链、交互地图、Web Worker、桌面与触控基础通过本地验收。
- M1-001/002/003：路径预览确认、行军粮耗、真实战损、撤退/占领原因、版本存档和刷新恢复已走通；只代表本地测试大陆闭环。
- 59/59 单测、15/15 浏览器场景通过，无跳过；桌面/Pixel7/iPad7均为Chromium桌面或设备仿真。正式iPhone/Android真机待验收。
- 存档修复：多标签revision比较、原子备份、未来版本锁写、失败不报成功；保留损坏/升级原档。
- M0-004/005 阻塞于本人授权，M0整体仍部分完成。正式地图/完整产品验收未通过；完整策略AI、地图编辑、外交、皇室、历史回放、第一次长征、PWA尚未实现。
- 大包提示保留：入口约545KB原始/166KB gzip；未做低端真机或长时性能承诺。

## 授权与下一批

用户已授权普通工程、依赖安装、检查、提交、个人私有仓库创建、免费Pages配置与正常发布，无需重新询问普通步骤。
必须本人操作：GitHub设备登录、Cloudflare登录、目标仓库GitHub App授权；必要CI Secret仅官方安全界面输入。未请求或读取密码/令牌/认证配置。

1. 核对 git status、HEAD、tasks、源码及已运行本地预览；不从头重建。
2. 验证 gh auth status / gh api user；设备码失效则新发官方流程。查询当前个人账号下 lieguoji-web：同项目才复用，不相关则稳定短后缀，不强推、不覆写历史。审查后推送，按任务ID去重创建M0 Issue与M0—M6里程碑，记录对应号与远端CI结果。
3. 控制台核对账户/现有Pages类型；本人只授权目标仓库，其余自动配置 main / 根目录 / npm run build:cf / dist / Node24.18.1。先核实同提交CI和预览，再受控生产发布，线上测试JS/Worker/MIME/深链接/存档/构建SHA。
4. 取得原规划与地图后先差异合并，不覆盖当前代码；继续依赖满足的后续任务，正式核图保持人工待验。不得用临时15项表宣称原100项已完成。

## 运行与恢复

规则0.1.0 / schema1 / scenario=test-continent / mode=sandbox。npm ci；npm run dev；npm run check。npm run preview打开已构建dist。
只发布dist；docs/plan/references/saves/.autopilot/.env/.dev.vars/.wrangler等不进入公开产物。存档在当前浏览器源的IndexedDB，跨网址需导入导出。
会话结束后不承诺后台开发。服务器只是本地预览，后续开发/云端配置需本任务恢复运行。
