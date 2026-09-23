# Cloudflare Pages 状态

实际项目：尚未核实/未创建。实际 URL：未部署。部署方式：计划原生 Git 集成，未锁定云端项目。
当前官方 CLI whoami 返回 OAuth 过期，控制台跳转登录页。身份与账户由成功授权后的实际响应确定，不沿用过期身份。

已准备的真实构建命令：npm run build:cf；输出 dist；生产分支 main；Node 24.18.1；根目录项目根。
build:cf 顺序为计划校验、lint、类型检查、单元测试、生产构建及产物检查。GitHub CI 另跑 Playwright E2E；只有通过检查的提交才进入生产分支。

发布后必须用平台实际返回的 HTTPS URL 验证资源/Worker MIME、交互、深链接刷新、控制台、版本 SHA 和保存恢复。未完成前不标记 M0 云端验收通过。
不得整包上传根目录。docs/plan/references/真实存档/认证资料不可进入 dist。不购买、不改 DNS、不重复创建项目。
