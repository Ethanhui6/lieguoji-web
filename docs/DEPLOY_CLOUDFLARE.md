# Cloudflare Pages 状态

实际项目：控制台已查询，当前7个应用中无本项目，未创建。实际 URL：未部署。部署方式：计划原生 Git 集成，未锁定云端项目。
2026-09-23 本轮官方控制台登录已成功，账户ID由当前 Workers & Pages 页面核实为 `0dccd3742e707d4f6506f2de668e516e`。没有修改已有其他项目。CLI OAuth旧状态曾过期，本轮以原生控制台集成为优先，不读取认证配置或令牌。
GitHub浏览器已登录 Ethanhui6；CLI的独立设备授权仍待本人点击官方确认。仓库尚未就绪，因此未创建Pages或伪报部署成功；浏览器登录也不代表CI获得部署凭证。

已准备的真实构建命令：npm run build:cf；输出 dist；生产分支 main；Node 24.18.1；根目录项目根。
build:cf 顺序为计划校验、lint、类型检查、单元测试、生产构建及产物检查。GitHub CI 另跑 Playwright E2E；只有通过检查的提交才进入生产分支。

发布后必须用平台实际返回的 HTTPS URL 验证资源/Worker MIME、交互、深链接刷新、控制台、版本 SHA 和保存恢复。未完成前不标记 M0 云端验收通过。
当前0.2.0默认入口为世界工坊；线上验收应包含手画/生成→国家→首都→开始自建世界→保存刷新；旧战役入口 `/?demo=1` 继续回归。`build.json` 的 entry、scenarios、commit 对应真实构建，不能用本地URL替代HTTPS证据。
不得整包上传根目录。docs/plan/references/真实存档/认证资料不可进入 dist。不购买、不改 DNS、不重复创建项目。
